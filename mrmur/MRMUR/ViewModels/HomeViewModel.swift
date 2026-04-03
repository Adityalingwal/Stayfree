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
        // Sort by most recent timestamp in each group (descending)
        return grouped
            .sorted { lhs, rhs in
                guard let lhsDate = lhs.value.first?.timestamp,
                      let rhsDate = rhs.value.first?.timestamp else { return false }
                return lhsDate > rhsDate
            }
            .map { (label: $0.key, entries: $0.value) }
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
