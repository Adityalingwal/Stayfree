import Foundation

/// Routes transcription to the correct backend based on language preference.
/// English → Groq Whisper. Hindi → Sarvam (wired in Phase 5).
struct TranscriptionRouter: TranscriptionServiceProtocol {
    private let settings: Settings
    private let groqService: GroqTranscriptionService

    init(settings: Settings, groqAPIKey: String) {
        self.settings = settings
        self.groqService = GroqTranscriptionService(apiKey: groqAPIKey)
    }

    func transcribe(audio: Data) async throws -> String {
        switch settings.language {
        case .english:
            print("[Router] Using Groq Whisper for English")
            return try await groqService.transcribe(audio: audio)

        case .hindi:
            // Sarvam streaming handles Hindi transcription separately in the pipeline.
            // This REST fallback path is for non-streaming scenarios.
            // Will be wired in Phase 5 with SarvamStreamingService.
            print("[Router] Hindi REST fallback — not yet implemented")
            throw PipelineError.transcriptionFailed("Hindi transcription not yet implemented")
        }
    }
}
