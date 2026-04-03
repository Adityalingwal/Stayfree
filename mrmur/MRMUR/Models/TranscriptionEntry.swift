import Foundation

struct TranscriptionEntry: Codable, Identifiable {
    let id: UUID
    let text: String
    let rawText: String
    let timestamp: Date
    let durationMs: Int
    var audioFilePath: String?

    init(text: String, rawText: String, durationMs: Int, audioFilePath: String? = nil) {
        self.id = UUID()
        self.text = text
        self.rawText = rawText
        self.timestamp = Date()
        self.durationMs = durationMs
        self.audioFilePath = audioFilePath
    }
}

// MARK: - History Persistence (UserDefaults, capped at 100)

extension TranscriptionEntry {
    private static let storageKey = "transcriptionHistory"
    private static let maxEntries = 100

    static func loadAll() -> [TranscriptionEntry] {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let entries = try? JSONDecoder().decode([TranscriptionEntry].self, from: data)
        else { return [] }
        return entries
    }

    static func saveAll(_ entries: [TranscriptionEntry]) {
        let capped = Array(entries.prefix(maxEntries))
        if let data = try? JSONEncoder().encode(capped) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    static func append(_ entry: TranscriptionEntry) {
        var entries = loadAll()
        entries.insert(entry, at: 0)
        saveAll(entries)
    }

    static func clearAll() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }
}
