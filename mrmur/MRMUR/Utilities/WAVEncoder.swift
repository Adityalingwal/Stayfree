import Foundation

/// Wraps raw PCM16 data in a WAV container (44-byte header).
/// Reused by AudioService (for Groq Whisper upload) and SarvamStreamingService (for WebSocket chunks).
enum WAVEncoder {
    /// Wrap PCM16 mono 16kHz data in a standard WAV file.
    static func encode(pcm16: Data, sampleRate: UInt32 = 16000, channels: UInt16 = 1) -> Data {
        let bitsPerSample: UInt16 = 16
        let byteRate = sampleRate * UInt32(channels) * UInt32(bitsPerSample) / 8
        let blockAlign = channels * bitsPerSample / 8
        let dataSize = UInt32(pcm16.count)
        let fileSize = 36 + dataSize

        var header = Data(capacity: 44)

        // RIFF header
        header.append(contentsOf: "RIFF".utf8)
        header.append(littleEndian: fileSize)
        header.append(contentsOf: "WAVE".utf8)

        // fmt sub-chunk
        header.append(contentsOf: "fmt ".utf8)
        header.append(littleEndian: UInt32(16))      // sub-chunk size
        header.append(littleEndian: UInt16(1))        // PCM format
        header.append(littleEndian: channels)
        header.append(littleEndian: sampleRate)
        header.append(littleEndian: byteRate)
        header.append(littleEndian: blockAlign)
        header.append(littleEndian: bitsPerSample)

        // data sub-chunk
        header.append(contentsOf: "data".utf8)
        header.append(littleEndian: dataSize)

        return header + pcm16
    }
}

// MARK: - Data extension for little-endian writes

private extension Data {
    mutating func append(littleEndian value: UInt16) {
        var v = value.littleEndian
        append(Data(bytes: &v, count: 2))
    }

    mutating func append(littleEndian value: UInt32) {
        var v = value.littleEndian
        append(Data(bytes: &v, count: 4))
    }
}
