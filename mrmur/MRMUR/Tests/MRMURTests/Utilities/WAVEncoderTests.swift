import XCTest
@testable import MRMUR

final class WAVEncoderTests: XCTestCase {

    func testHeaderSize() {
        let pcm = Data(repeating: 0, count: 100)
        let wav = WAVEncoder.encode(pcm16: pcm)
        // 44 byte header + pcm data
        XCTAssertEqual(wav.count, 44 + 100)
    }

    func testRIFFMarker() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32))
        let riff = String(data: wav[0..<4], encoding: .ascii)
        XCTAssertEqual(riff, "RIFF")
    }

    func testWAVEMarker() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32))
        let wave = String(data: wav[8..<12], encoding: .ascii)
        XCTAssertEqual(wave, "WAVE")
    }

    func testFmtMarker() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32))
        let fmt = String(data: wav[12..<16], encoding: .ascii)
        XCTAssertEqual(fmt, "fmt ")
    }

    func testDataMarker() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32))
        let dataMarker = String(data: wav[36..<40], encoding: .ascii)
        XCTAssertEqual(dataMarker, "data")
    }

    func testSampleRate16kHz() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32), sampleRate: 16000)
        // Sample rate is at bytes 24-27 (little-endian UInt32)
        let rate = wav[24...27].withUnsafeBytes { $0.load(as: UInt32.self).littleEndian }
        XCTAssertEqual(rate, 16000)
    }

    func testMonoChannel() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32), channels: 1)
        // Channels at bytes 22-23 (little-endian UInt16)
        let channels = wav[22...23].withUnsafeBytes { $0.load(as: UInt16.self).littleEndian }
        XCTAssertEqual(channels, 1)
    }

    func testPCMFormat() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32))
        // Audio format at bytes 20-21 (1 = PCM)
        let format = wav[20...21].withUnsafeBytes { $0.load(as: UInt16.self).littleEndian }
        XCTAssertEqual(format, 1)
    }

    func testDataSizeField() {
        let pcm = Data(repeating: 0, count: 3200) // 100ms at 16kHz mono
        let wav = WAVEncoder.encode(pcm16: pcm)
        // Data size at bytes 40-43
        let dataSize = wav[40...43].withUnsafeBytes { $0.load(as: UInt32.self).littleEndian }
        XCTAssertEqual(dataSize, 3200)
    }

    func testEmptyInput() {
        let wav = WAVEncoder.encode(pcm16: Data())
        XCTAssertEqual(wav.count, 44) // Header only
        let dataSize = wav[40...43].withUnsafeBytes { $0.load(as: UInt32.self).littleEndian }
        XCTAssertEqual(dataSize, 0)
    }

    func testFileSizeField() {
        let pcm = Data(repeating: 0, count: 1000)
        let wav = WAVEncoder.encode(pcm16: pcm)
        // File size at bytes 4-7 = total - 8 (RIFF + size field)
        let fileSize = wav[4...7].withUnsafeBytes { $0.load(as: UInt32.self).littleEndian }
        XCTAssertEqual(fileSize, UInt32(36 + 1000))
    }

    func testBitsPerSample16() {
        let wav = WAVEncoder.encode(pcm16: Data(repeating: 0, count: 32))
        // Bits per sample at bytes 34-35
        let bits = wav[34...35].withUnsafeBytes { $0.load(as: UInt16.self).littleEndian }
        XCTAssertEqual(bits, 16)
    }

    func testPCMDataPreserved() {
        // Create known PCM16 data
        var pcm = Data()
        let samples: [Int16] = [100, -200, 32767, -32768, 0]
        for sample in samples {
            var s = sample.littleEndian
            pcm.append(Data(bytes: &s, count: 2))
        }

        let wav = WAVEncoder.encode(pcm16: pcm)
        let extractedPCM = wav[44...]
        XCTAssertEqual(extractedPCM, pcm)
    }
}
