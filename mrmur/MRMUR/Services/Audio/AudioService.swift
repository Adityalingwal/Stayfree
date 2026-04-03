import AVFoundation
import Accelerate

/// Captures microphone audio via AVAudioEngine at 16kHz PCM16.
/// Single capture path (unlike Electron's dual MediaRecorder + AudioWorklet).
/// 1600 samples per tap buffer = 100ms chunks, matching Electron behavior.
final class AudioService: AudioServiceProtocol {
    var onAudioChunk: ((Data) -> Void)?

    private var engine: AVAudioEngine?
    /// Serial queue protecting all mutable state accessed from the audio render thread.
    private let audioQueue = DispatchQueue(label: "com.mrmur.audioservice")
    private var pcmBuffer = Data()
    private var isCapturing = false
    private var hindiMode = false
    private var recordingStartTime: Date?

    // VAD / Energy tracking (mirrors Electron recorder.ts)
    private var chunkCount = 0
    private var pcmBytes = 0
    private var rmsSum: Float = 0
    private var rmsMax: Float = 0
    private var rmsCount: Int = 0
    private var baselineRmsSum: Float = 0
    private var baselineRmsCount: Int = 0
    private var voicedMs: Double = 0

    private let targetSampleRate: Double = 16000
    private let bufferSize: AVAudioFrameCount = 1600 // 100ms at 16kHz

    func startCapture(hindiMode: Bool) throws {
        guard !isCapturing else { return }

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        // Create output format at 16kHz mono PCM16
        guard let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: true
        ) else {
            throw PipelineError.transcriptionFailed("Failed to create audio format")
        }

        // Sample rate converter: input (usually 44.1/48kHz) → 16kHz
        guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
            throw PipelineError.transcriptionFailed("Failed to create audio converter")
        }

        // Reset state
        self.pcmBuffer = Data()
        self.hindiMode = hindiMode
        self.recordingStartTime = Date()
        resetStreamingStats()

        // Install tap on input node — callback runs on audio render thread,
        // so dispatch to our serial queue to protect shared state.
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            self.audioQueue.sync {
                guard self.isCapturing else { return }
                self.processAudioBuffer(buffer, converter: converter, outputFormat: outputFormat)
            }
        }

        try engine.start()
        self.engine = engine
        self.isCapturing = true
        print("[Audio] Capture started (16kHz PCM16, hindi=\(hindiMode))")
    }

    func stopCapture() -> Data {
        return audioQueue.sync {
            guard isCapturing else { return Data() }
            teardownEngine()
            let result = pcmBuffer
            print("[Audio] Capture stopped — \(result.count) bytes")
            return result
        }
    }

    func cancelCapture() {
        audioQueue.sync {
            guard isCapturing else { return }
            teardownEngine()
            pcmBuffer = Data()
            print("[Audio] Capture cancelled")
        }
    }

    func getStreamStats() -> AudioStreamStats {
        return audioQueue.sync {
            let avgRms = rmsCount > 0 ? rmsSum / Float(rmsCount) : 0
            let baselineRms = baselineRmsCount > 0 ? baselineRmsSum / Float(baselineRmsCount) : 0
            let hasSpeech = voicedMs >= AudioStreamStats.minVoicedMs
            let isBorderline = !hasSpeech && voicedMs > 0

            return AudioStreamStats(
                chunkCount: chunkCount,
                pcmBytes: pcmBytes,
                avgRms: avgRms,
                maxRms: rmsMax,
                baselineRms: baselineRms,
                voicedMs: voicedMs,
                hasSpeech: hasSpeech,
                isBorderlineSpeech: isBorderline
            )
        }
    }

    // MARK: - Private

    private func teardownEngine() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        isCapturing = false
    }

    private func resetStreamingStats() {
        chunkCount = 0
        pcmBytes = 0
        rmsSum = 0
        rmsMax = 0
        rmsCount = 0
        baselineRmsSum = 0
        baselineRmsCount = 0
        voicedMs = 0
    }

    private func processAudioBuffer(
        _ inputBuffer: AVAudioPCMBuffer,
        converter: AVAudioConverter,
        outputFormat: AVAudioFormat
    ) {
        // Calculate output frame capacity based on input
        let ratio = targetSampleRate / inputBuffer.format.sampleRate
        let outputFrameCount = AVAudioFrameCount(Double(inputBuffer.frameLength) * ratio)
        guard outputFrameCount > 0 else { return }

        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: outputFrameCount) else { return }

        var error: NSError?
        var inputConsumed = false
        converter.convert(to: outputBuffer, error: &error) { _, outStatus in
            if inputConsumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            inputConsumed = true
            outStatus.pointee = .haveData
            return inputBuffer
        }

        if let error {
            print("[Audio] Conversion error: \(error)")
            return
        }

        guard outputBuffer.frameLength > 0 else { return }

        // Extract PCM16 data
        let byteCount = Int(outputBuffer.frameLength) * 2 // Int16 = 2 bytes
        guard let int16Ptr = outputBuffer.int16ChannelData?[0] else { return }
        let chunkData = Data(bytes: int16Ptr, count: byteCount)

        // Accumulate full buffer
        pcmBuffer.append(chunkData)
        chunkCount += 1
        pcmBytes += byteCount

        // Track energy for VAD
        trackAudioEnergy(int16Ptr, frameCount: Int(outputBuffer.frameLength))

        // Stream chunks to Sarvam in Hindi mode
        if hindiMode {
            onAudioChunk?(chunkData)
        }
    }

    private func trackAudioEnergy(_ samples: UnsafePointer<Int16>, frameCount: Int) {
        // Compute RMS
        let rms = computeRMS(samples, count: frameCount)
        rmsSum += rms
        rmsCount += 1
        rmsMax = max(rmsMax, rms)

        guard let startTime = recordingStartTime else { return }
        let elapsed = Date().timeIntervalSince(startTime) * 1000

        // Build baseline from first 300ms
        if elapsed <= AudioStreamStats.baselineWindowMs {
            baselineRmsSum += rms
            baselineRmsCount += 1
            return
        }

        // After baseline: check if this chunk is "voiced"
        let baseline = baselineRmsCount > 0 ? baselineRmsSum / Float(baselineRmsCount) : 0.001
        let threshold = max(
            baseline * AudioStreamStats.baselineMultiplier,
            baseline + AudioStreamStats.minDelta
        )
        if rms >= threshold {
            voicedMs += AudioStreamStats.chunkDurationMs
        }
    }

    private func computeRMS(_ samples: UnsafePointer<Int16>, count: Int) -> Float {
        guard count > 0 else { return 0 }
        // Convert Int16 to Float, then compute RMS via vDSP
        var floats = [Float](repeating: 0, count: count)
        for i in 0..<count {
            floats[i] = Float(samples[i]) / 32768.0
        }
        var rms: Float = 0
        vDSP_rmsqv(floats, 1, &rms, vDSP_Length(count))
        return rms
    }
}
