import Foundation

/// Routes transcription to the correct backend based on language preference.
/// English → Groq Whisper (REST, sends full audio after recording).
/// Hindi → Sarvam Streaming (WebSocket, streams chunks during recording, flush on stop).
struct TranscriptionRouter: TranscriptionServiceProtocol {
    private let settings: Settings
    private let groqService: GroqTranscriptionService
    let sarvamService: SarvamStreamingService?

    init(settings: Settings, groqAPIKey: String, sarvamAPIKey: String?) {
        self.settings = settings
        self.groqService = GroqTranscriptionService(apiKey: groqAPIKey)
        if let sarvamKey = sarvamAPIKey, !sarvamKey.isEmpty {
            self.sarvamService = SarvamStreamingService(apiKey: sarvamKey)
        } else {
            self.sarvamService = nil
        }
    }

    func transcribe(audio: Data) async throws -> String {
        switch settings.language {
        case .english:
            print("[Router] Using Groq Whisper for English")
            return try await groqService.transcribe(audio: audio)

        case .hindi:
            // Hindi uses Sarvam streaming — audio chunks were already sent via WebSocket
            // DURING recording (AppViewModel.onAudioChunk → sarvam.sendChunk).
            // The `audio` parameter is intentionally unused here — we only call flush()
            // to retrieve the final transcript from the server.
            guard let sarvam = sarvamService else {
                throw PipelineError.transcriptionFailed("Sarvam API key not configured")
            }
            print("[Router] Using Sarvam streaming flush for Hindi")
            return try await sarvam.flush()
        }
    }
}
