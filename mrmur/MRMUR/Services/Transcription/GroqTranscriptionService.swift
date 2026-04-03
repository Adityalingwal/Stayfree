import Foundation

/// Groq Whisper large-v3-turbo transcription (English).
/// Sends PCM16 audio as WAV via multipart upload to Groq REST API.
/// Replaces: src/main/transcription-groq.ts + groq-sdk npm package.
struct GroqTranscriptionService: TranscriptionServiceProtocol {
    private let apiClient: APIClient

    init(apiKey: String) {
        self.apiClient = APIClient(
            baseURL: "https://api.groq.com",
            defaultHeaders: [
                "Authorization": "Bearer \(apiKey)"
            ],
            timeoutInterval: 30
        )
    }

    func transcribe(audio pcm16Data: Data) async throws -> String {
        guard !pcm16Data.isEmpty else {
            throw PipelineError.noAudio
        }

        // Wrap PCM16 in WAV container (Groq accepts WAV)
        let wavData = WAVEncoder.encode(pcm16: pcm16Data)

        print("[Groq] Starting transcription (\(wavData.count) bytes WAV)...")
        let startTime = Date()

        let text = try await apiClient.postMultipartText(
            path: "/openai/v1/audio/transcriptions",
            fields: [
                (name: "model", value: "whisper-large-v3-turbo"),
                (name: "response_format", value: "text"),
                (name: "language", value: "en"),
            ],
            fileField: "file",
            fileData: wavData,
            fileName: "audio.wav",
            mimeType: "audio/wav"
        )

        let duration = Int(Date().timeIntervalSince(startTime) * 1000)
        print("[Groq] Transcribed in \(duration)ms: \"\(text)\"")

        guard !text.isEmpty else {
            throw PipelineError.noAudio
        }

        return text
    }
}
