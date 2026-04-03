import SwiftUI

/// Dictionary CRUD: two-column table (term | replacement), add/delete rows.
struct DictionaryPageView: View {
    @Environment(Settings.self) private var settings
    @State private var dictVM: DictionaryViewModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Dictionary")
                    .font(.system(size: 22, weight: .heavy))
                    .tracking(-0.5)
                Text("Custom word replacements applied after transcription")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }

            if let vm = dictVM {
                // Add new entry
                addEntrySection(vm)

                // Entries table
                if vm.entries.isEmpty {
                    emptyState
                } else {
                    entriesTable(vm)
                }
            }
        }
        .onAppear {
            if dictVM == nil {
                dictVM = DictionaryViewModel(settings: settings)
            }
        }
    }

    // MARK: - Add Entry

    private func addEntrySection(_ vm: DictionaryViewModel) -> some View {
        @Bindable var vm = vm
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("When AI writes...")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("e.g. stayfree", text: $vm.newTerm)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))
                    .onSubmit { vm.addEntry() }
            }

            Image(systemName: "arrow.right")
                .foregroundStyle(.tertiary)
                .padding(.top, 16)

            VStack(alignment: .leading, spacing: 4) {
                Text("Replace with...")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("e.g. StayFree", text: $vm.newReplacement)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 13))
                    .onSubmit { vm.addEntry() }
            }

            Button("Add") {
                vm.addEntry()
            }
            .disabled(vm.newTerm.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.top, 16)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }

    // MARK: - Entries Table

    private func entriesTable(_ vm: DictionaryViewModel) -> some View {
        VStack(spacing: 0) {
            // Header row
            HStack {
                Text("TERM")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("REPLACEMENT")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer().frame(width: 32)
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.secondary)
            .tracking(0.8)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(NSColor.controlBackgroundColor))

            Divider()

            // Rows
            ForEach(Array(vm.entries.enumerated()), id: \.offset) { index, entry in
                HStack {
                    Text(entry.term)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(entry.replacement)
                        .font(.system(size: 13))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        vm.removeEntry(at: index)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                    .frame(width: 32)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                if index < vm.entries.count - 1 {
                    Divider().padding(.leading, 16)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Text("No dictionary entries yet")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Text("Add terms above to customize your transcriptions")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}
