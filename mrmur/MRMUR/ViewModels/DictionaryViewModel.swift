import Foundation

/// Dictionary term CRUD: add/remove entries in Settings.dictionary.
@Observable
final class DictionaryViewModel {
    let settings: Settings

    /// Current entries as array for display.
    var entries: [(term: String, replacement: String)] = []

    /// Input fields for new entry.
    var newTerm: String = ""
    var newReplacement: String = ""

    init(settings: Settings) {
        self.settings = settings
        reloadEntries()
    }

    // MARK: - CRUD

    func addEntry() {
        let term = newTerm.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return }
        var dict = settings.dictionary
        dict[term] = newReplacement
        settings.dictionary = dict
        newTerm = ""
        newReplacement = ""
        reloadEntries()
    }

    func removeEntry(at index: Int) {
        guard entries.indices.contains(index) else { return }
        let term = entries[index].term
        var dict = settings.dictionary
        dict.removeValue(forKey: term)
        settings.dictionary = dict
        reloadEntries()
    }

    // MARK: - Private

    private func reloadEntries() {
        entries = settings.dictionary
            .sorted { $0.key < $1.key }
            .map { (term: $0.key, replacement: $0.value) }
    }
}
