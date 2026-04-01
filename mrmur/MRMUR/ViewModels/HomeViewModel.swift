import Foundation

/// Transcription history display. Grouped by date. Cap 100 entries.
@Observable
final class HomeViewModel {
    private(set) var entries: [TranscriptionEntry] = []

    /// Entries grouped by date label ("Today", "Yesterday", "March 31, 2026", etc).
    var groupedEntries: [(label: String, entries: [TranscriptionEntry])] {
        let grouped = Dictionary(grouping: entries) { entry in
            dateLabel(for: entry.timestamp)
        }
        // Sort groups: most recent date first
        return grouped
            .sorted { $0.key > $1.key }
            .map { (label: dateLabel(for: $0.value.first!.timestamp), entries: $0.value) }
    }

    var totalWords: Int {
        entries.reduce(0) { $0 + $1.text.split(separator: " ").count }
    }

    var totalTranscriptions: Int {
        entries.count
    }

    init() {
        reload()
    }

    func reload() {
        entries = TranscriptionEntry.loadAll()
    }

    func clearHistory() {
        TranscriptionEntry.clearAll()
        entries = []
    }

    // MARK: - Date Formatting

    private func dateLabel(for date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d, yyyy"
        return formatter.string(from: date)
    }
}
