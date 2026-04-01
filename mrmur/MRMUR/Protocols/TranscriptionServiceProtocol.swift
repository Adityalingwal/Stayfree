import Foundation

protocol TranscriptionServiceProtocol {
    /// Transcribe audio data to text.
    func transcribe(audio: Data) async throws -> String
}
