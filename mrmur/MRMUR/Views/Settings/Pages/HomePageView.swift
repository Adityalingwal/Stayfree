import SwiftUI

/// Transcription history: date-grouped entries with copy, stats summary.
struct HomePageView: View {
    @State private var homeVM = HomeViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Home")
                    .font(.system(size: 22, weight: .heavy))
                    .tracking(-0.5)
                Text("Your transcription history")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }

            // Stats row
            HStack(spacing: 24) {
                StatCard(label: "Transcriptions", value: "\(homeVM.totalTranscriptions)")
                StatCard(label: "Total Words", value: "\(homeVM.totalWords)")
            }

            // History
            if homeVM.entries.isEmpty {
                emptyState
            } else {
                historyList
            }
        }
    }

    // MARK: - History List

    private var historyList: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("History")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Button("Clear All") {
                    homeVM.clearHistory()
                }
                .font(.system(size: 12))
                .foregroundStyle(.red)
                .buttonStyle(.plain)
            }

            ForEach(homeVM.groupedEntries, id: \.label) { group in
                VStack(alignment: .leading, spacing: 8) {
                    Text(group.label)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                        .tracking(0.5)

                    ForEach(group.entries) { entry in
                        TranscriptionRow(entry: entry)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text("No transcriptions yet")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Text("Hold Left Option and speak to start dictating")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}

// MARK: - Transcription Row

private struct TranscriptionRow: View {
    let entry: TranscriptionEntry
    @State private var copied = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.text)
                    .font(.system(size: 13))
                    .lineLimit(3)

                HStack(spacing: 8) {
                    Text(timeString)
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                    if entry.durationMs > 0 {
                        Text("\(entry.durationMs)ms")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(entry.text, forType: .string)
                copied = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 12))
                    .foregroundStyle(copied ? .green : .secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }

    private var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: entry.timestamp)
    }
}

// MARK: - Stat Card

private struct StatCard: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 24, weight: .bold))
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }
}
