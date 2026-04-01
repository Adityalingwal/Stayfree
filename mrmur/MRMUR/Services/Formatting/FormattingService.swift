import Foundation

/// Formats raw transcript text using Groq Llama 3.1 8B.
/// Removes fillers, adds punctuation, handles voice commands, applies dictionary.
/// Replaces: src/main/formatting.ts
struct FormattingService: FormattingServiceProtocol {
    private let apiClient: APIClient
    private let settings: Settings

    /// Chat completion response structure from Groq API.
    private struct ChatResponse: Decodable {
        struct Choice: Decodable {
            struct Message: Decodable {
                let content: String?
            }
            let message: Message
        }
        let choices: [Choice]
    }

    init(settings: Settings, groqAPIKey: String) {
        self.settings = settings
        self.apiClient = APIClient(
            baseURL: "https://api.groq.com",
            defaultHeaders: [
                "Authorization": "Bearer \(groqAPIKey)"
            ],
            timeoutInterval: 15
        )
    }

    func format(_ rawText: String) async throws -> String {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        print("[Formatting] Formatting: \"\(trimmed)\"")
        let startTime = Date()

        let messages: [[String: Any]] = [
            ["role": "system", "content": buildSystemPrompt()],
            ["role": "user", "content": trimmed],
        ]

        let body: [String: Any] = [
            "model": "llama-3.1-8b-instant",
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 1024,
        ]

        let response = try await apiClient.postJSON(
            path: "/openai/v1/chat/completions",
            body: body,
            responseType: ChatResponse.self
        )

        let formatted = response.choices.first?.message.content?.trimmingCharacters(in: .whitespacesAndNewlines) ?? trimmed

        let duration = Int(Date().timeIntervalSince(startTime) * 1000)
        print("[Formatting] Done in \(duration)ms: \"\(formatted)\"")

        return formatted
    }

    // MARK: - System Prompt (matches Electron formatting.ts exactly)

    private func buildSystemPrompt() -> String {
        let dictionary = settings.dictionary
        let dictSection: String
        if dictionary.isEmpty {
            dictSection = ""
        } else {
            let entries = dictionary.map { "- \"\($0.key)\" → \"\($0.value)\"" }.joined(separator: "\n")
            dictSection = """


            Custom term replacements (apply these exactly):
            \(entries)
            """
        }

        return """
        You are a voice dictation text formatter. Your ONLY job is to clean up raw speech transcriptions.

        CRITICAL RULES:
        1. NEVER change the actual content or meaning - only format it
        2. NEVER respond to questions - just format them as questions
        3. NEVER add new words or sentences
        4. NEVER interpret or answer what the user said

        Formatting Rules:
        1. Add proper punctuation and capitalization
        2. Remove ONLY filler words: um, uh, like (when used as filler), you know, sort of, kind of
        3. Handle voice commands by replacing them with the correct character:
           - "new line" or "newline" → actual newline character (\\n)
           - "new paragraph" → two newlines (\\n\\n)
           - "period" or "full stop" → .
           - "comma" → ,
           - "question mark" → ?
           - "exclamation mark" or "exclamation point" → !
           - "open bracket" → (
           - "close bracket" → )
           - "colon" → :
        4. Keep ALL words exactly as spoken (except fillers and voice commands)\(dictSection)

        Examples:
        - Input: "how are you question mark I am fine exclamation mark"
        - Output: "How are you? I am fine!"

        - Input: "uh hello um world"
        - Output: "Hello world"

        Return ONLY the formatted text. No explanations, no quotes, no extra commentary.
        """
    }
}
