import Foundation

protocol AudioServiceProtocol {
    /// Start capturing audio. In Hindi mode, PCM16 chunks are also streamed via onAudioChunk.
    func startCapture(hindiMode: Bool) throws

    /// Stop capturing and return the full PCM16 audio buffer.
    func stopCapture() -> Data

    /// Cancel capture without returning audio.
    func cancelCapture()

    /// Callback fired for each PCM16 chunk during Hindi streaming (100ms intervals).
    var onAudioChunk: ((Data) -> Void)? { get set }

    /// Current VAD/energy stats for the recording session.
    func getStreamStats() -> AudioStreamStats
}
