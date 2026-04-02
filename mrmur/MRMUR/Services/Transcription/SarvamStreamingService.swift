import Foundation

/// Sarvam AI Streaming Transcription via WebSocket.
///
/// Architecture: PERSISTENT CONNECTION
/// A single WebSocket is established on app launch (when language=Hindi) and kept alive
/// via 30s keepalive pings. Between recordings only transcript state is reset.
///
/// Protocol (sarvamai SDK v0.1.25):
///   URL: wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=translit&flush_signal=true
///   Header: "api-subscription-key": "<key>" — LOWERCASE, case-sensitive gateway
///   Audio: { "audio": { "data": "<base64 WAV>", "sample_rate": 16000, "encoding": "audio/wav" } }
///   Flush: { "type": "flush" }
///   Response: { "type": "data", "data": { "transcript": "...", ... } }
///
/// flush_signal=true suppresses VAD auto-close — server holds connection until our explicit flush.
actor SarvamStreamingService {

    // MARK: - Constants

    private static let wsURL = "wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=translit&flush_signal=true"
    private static let keepaliveIntervalSeconds: TimeInterval = 30
    private static let reconnectDelayBase: TimeInterval = 1.0
    private static let maxReconnectAttempts = 2
    private static let defaultFlushTimeoutSeconds: TimeInterval = 1.5

    // MARK: - State

    private let apiKey: String
    private var wsTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?

    /// Transcript segments accumulated during a recording (VAD interim + flush response).
    private var transcriptSegments: [String] = []

    /// Continuation for the pending flush() call.
    private var flushContinuation: CheckedContinuation<String, Error>?

    /// Keepalive timer — sends silent audio every 30s.
    private var keepaliveTask: Task<Void, Never>?

    /// Auto-reconnect state.
    private var reconnectAttempts = 0
    private var reconnectTask: Task<Void, Never>?
    private var intentionalClose = false

    /// Connection-in-progress guard.
    private var isConnecting = false

    /// Pre-computed silent keepalive chunk (100ms silence at 16kHz mono).
    private let silentKeepAlivePayload: String

    // MARK: - Init

    init(apiKey: String) {
        self.apiKey = apiKey

        // Pre-compute silent WAV chunk for keepalive
        let silentPCM = Data(count: 3200) // 100ms at 16kHz, 16-bit mono = 3200 bytes of zeros
        let wav = WAVEncoder.encode(pcm16: silentPCM)
        let audioFrame: [String: Any] = [
            "audio": [
                "data": wav.base64EncodedString(),
                "sample_rate": 16000,
                "encoding": "audio/wav"
            ]
        ]
        self.silentKeepAlivePayload = String(data: try! JSONSerialization.data(withJSONObject: audioFrame), encoding: .utf8)!
    }

    // MARK: - Connection

    /// Connect to Sarvam WebSocket. Safe to call multiple times:
    /// - If OPEN: reuses existing connection
    /// - If CONNECTING: waits for in-flight connection
    /// - If CLOSED/nil: creates new connection
    func connect() async throws {
        // Reuse existing open connection
        if let ws = wsTask, ws.state == .running {
            print("[Sarvam] Reusing warm connection")
            return
        }

        // If already connecting, wait briefly and check again
        guard !isConnecting else {
            print("[Sarvam] Waiting for in-flight connection...")
            try await Task.sleep(for: .milliseconds(500))
            if wsTask?.state == .running { return }
            throw PipelineError.transcriptionFailed("Sarvam connection in progress but not ready")
        }

        cancelReconnect()
        cleanupSocket()

        isConnecting = true
        defer { isConnecting = false }

        let connectStart = Date()
        intentionalClose = false

        guard var urlComponents = URLComponents(string: Self.wsURL) else {
            throw PipelineError.transcriptionFailed("Invalid Sarvam WebSocket URL")
        }

        guard let url = urlComponents.url else {
            throw PipelineError.transcriptionFailed("Invalid Sarvam WebSocket URL")
        }

        var request = URLRequest(url: url)
        // Header MUST be lowercase — Sarvam gateway is case-sensitive (403 if capitalized)
        request.setValue(apiKey, forHTTPHeaderField: "api-subscription-key")

        let session = URLSession(configuration: .default)
        let ws = session.webSocketTask(with: request)

        self.urlSession = session
        self.wsTask = ws
        ws.resume()

        // Wait for connection by attempting a receive — if the server rejects, this throws
        // We start the receive loop which also validates the connection
        startReceiveLoop()

        let elapsed = Int(Date().timeIntervalSince(connectStart) * 1000)
        print("[Sarvam] Connected (\(elapsed)ms)")
        reconnectAttempts = 0
        startKeepalive()
    }

    // MARK: - Audio Sending

    /// Send a PCM16 audio chunk wrapped in WAV to the server.
    func sendChunk(_ pcm16Data: Data) {
        guard let ws = wsTask, ws.state == .running else { return }

        let wav = WAVEncoder.encode(pcm16: pcm16Data)
        let audioFrame: [String: Any] = [
            "audio": [
                "data": wav.base64EncodedString(),
                "sample_rate": 16000,
                "encoding": "audio/wav"
            ]
        ]

        guard let json = try? JSONSerialization.data(withJSONObject: audioFrame),
              let str = String(data: json, encoding: .utf8) else { return }

        ws.send(.string(str)) { error in
            if let error {
                print("[Sarvam] Send chunk error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Flush (end of recording → get transcript)

    /// Send flush signal and wait for the final transcript.
    /// Accumulates any VAD interim segments with the flush response.
    ///
    /// IMPORTANT: Continuation is set BEFORE sending flush to avoid race condition
    /// where server responds before continuation is registered (causing missed response → timeout).
    func flush(timeoutSeconds: TimeInterval = defaultFlushTimeoutSeconds) async throws -> String {
        guard let ws = wsTask, ws.state == .running else {
            throw PipelineError.transcriptionFailed("Sarvam not connected")
        }

        // Wait for transcript response with timeout
        return try await withThrowingTimeout(seconds: timeoutSeconds) { [self] in
            try await withCheckedThrowingContinuation { continuation in
                // Step 1: Register continuation FIRST so handleMessage can resolve it
                self.flushContinuation?.resume(throwing: PipelineError.cancelled)
                self.flushContinuation = continuation

                // Step 2: NOW send flush signal — any response will find the continuation ready
                let flushJSON = #"{"type":"flush"}"#
                ws.send(.string(flushJSON)) { error in
                    if let error {
                        print("[Sarvam] Flush send error: \(error.localizedDescription)")
                        Task { await self.cancelFlushContinuation(with: error) }
                    } else {
                        print("[Sarvam] Flush sent (timeout=\(timeoutSeconds)s)")
                    }
                }
            }
        }
    }

    /// Cancel pending flush continuation with an error (e.g., send failure).
    private func cancelFlushContinuation(with error: Error) {
        guard let cont = flushContinuation else { return }
        flushContinuation = nil
        cont.resume(throwing: PipelineError.transcriptionFailed("Failed to send flush: \(error.localizedDescription)"))
    }

    // MARK: - Recording Lifecycle

    /// Call when recording starts — resets transcript segments for new recording.
    func markRecordingStart() {
        transcriptSegments = []
    }

    /// Reset per-recording state. Connection stays alive.
    func resetSession() {
        transcriptSegments = []
        if let cont = flushContinuation {
            cont.resume(returning: "")
            flushContinuation = nil
        }
    }

    // MARK: - Receive Loop

    private func startReceiveLoop() {
        guard let ws = wsTask else { return }

        Task { [weak self] in
            do {
                while let self = self, ws.state == .running {
                    let message = try await ws.receive()
                    await self.handleMessage(message)
                }
            } catch {
                guard let self = self else { return }
                await self.handleConnectionLost(error: error)
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let rawString: String
        switch message {
        case .string(let str):
            rawString = str
        case .data(let data):
            rawString = String(data: data, encoding: .utf8) ?? ""
        @unknown default:
            return
        }

        guard !rawString.isEmpty,
              let jsonData = rawString.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            print("[Sarvam] Non-JSON message: \(rawString.prefix(100))")
            return
        }

        let type = parsed["type"] as? String

        if type == "data", let data = parsed["data"] as? [String: Any] {
            let transcript = (data["transcript"] as? String) ?? ""

            if let cont = flushContinuation {
                // This is the response to our flush signal
                if !transcript.isEmpty { transcriptSegments.append(transcript) }
                let fullTranscript = transcriptSegments.joined(separator: " ").trimmingCharacters(in: .whitespaces)
                print("[Sarvam] Transcript: \"\(fullTranscript)\"")
                flushContinuation = nil
                cont.resume(returning: fullTranscript)
            } else {
                // VAD interim segment — accumulate for join on flush
                if !transcript.isEmpty {
                    transcriptSegments.append(transcript)
                    print("[Sarvam] Segment: \"\(transcript)\"")
                }
            }
        } else if type == "error" {
            let errMsg = String(describing: parsed["data"] ?? parsed)
            print("[Sarvam] Server error: \(errMsg)")
            if let cont = flushContinuation {
                flushContinuation = nil
                cont.resume(throwing: PipelineError.transcriptionFailed("Sarvam server error: \(errMsg)"))
            }
        }
    }

    private func handleConnectionLost(error: Error) {
        print("[Sarvam] Connection lost: \(error.localizedDescription)")
        stopKeepalive()
        cleanupSocket()

        // Reject any pending flush
        if let cont = flushContinuation {
            flushContinuation = nil
            cont.resume(throwing: PipelineError.wsClosed)
        }

        // Auto-reconnect if not intentional
        if !intentionalClose {
            scheduleReconnect()
        }
    }

    // MARK: - Keepalive

    private func startKeepalive() {
        stopKeepalive()
        let payload = silentKeepAlivePayload

        keepaliveTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.keepaliveIntervalSeconds))
                guard !Task.isCancelled else { break }
                guard let self = self else { break }
                guard let ws = await self.wsTask, ws.state == .running else { break }

                ws.send(.string(payload)) { error in
                    if let error {
                        print("[Sarvam] Keepalive send error: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private func stopKeepalive() {
        keepaliveTask?.cancel()
        keepaliveTask = nil
    }

    // MARK: - Auto-Reconnect

    private func scheduleReconnect() {
        guard !intentionalClose else { return }
        guard reconnectTask == nil else { return }

        reconnectAttempts += 1
        if reconnectAttempts > Self.maxReconnectAttempts {
            print("[Sarvam] Max reconnect attempts (\(Self.maxReconnectAttempts)) reached — will retry on next recording")
            reconnectAttempts = 0
            return
        }

        // Exponential backoff: 1s, 2s
        let delay = Self.reconnectDelayBase * pow(2.0, Double(reconnectAttempts - 1))
        print("[Sarvam] Auto-reconnect \(reconnectAttempts)/\(Self.maxReconnectAttempts) in \(delay)s...")

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self = self, !Task.isCancelled else { return }
            do {
                try await self.connect()
                print("[Sarvam] Auto-reconnect successful")
            } catch {
                print("[Sarvam] Auto-reconnect failed: \(error.localizedDescription)")
            }
            await self.clearReconnectTask()
        }
    }

    private func clearReconnectTask() {
        reconnectTask = nil
    }

    private func cancelReconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        reconnectAttempts = 0
    }

    // MARK: - Force Reconnect

    /// Force a fresh connection — used when flush timed out and server may have stale audio.
    func reconnect() async throws {
        resetSession()
        cancelReconnect()
        stopKeepalive()
        cleanupSocket()
        try await connect()
    }

    // MARK: - Shutdown

    /// Clean shutdown — no auto-reconnect. Call on app quit or language switch away from Hindi.
    func shutdown() {
        intentionalClose = true
        cancelReconnect()
        stopKeepalive()
        resetSession()
        cleanupSocket()
        print("[Sarvam] Shut down (intentional)")
    }

    // MARK: - State Queries

    var isConnected: Bool {
        wsTask?.state == .running
    }

    // MARK: - Socket Cleanup

    private func cleanupSocket() {
        wsTask?.cancel(with: .goingAway, reason: nil)
        wsTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
    }
}
