import React, { useState, useEffect } from "react";

interface DictEntry {
  term: string;
  replacement: string;
}

export default function DictionaryPage() {
  const [entries, setEntries] = useState<DictEntry[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electron.getDictionary().then((dict) => {
      const list = Object.entries(dict).map(([term, replacement]) => ({
        term,
        replacement,
      }));
      setEntries(list);
      setLoading(false);
    });
  }, []);

  const save = (updated: DictEntry[]) => {
    setEntries(updated);
    const dict: Record<string, string> = {};
    for (const e of updated) {
      if (e.term.trim()) {
        dict[e.term.trim()] = e.replacement;
      }
    }
    window.electron.saveDictionary(dict);
  };

  const addEntry = () => {
    if (!newTerm.trim()) return;
    const updated = [...entries, { term: newTerm.trim(), replacement: newReplacement }];
    save(updated);
    setNewTerm("");
    setNewReplacement("");
  };

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    save(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEntry();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dictionary</h1>
      <p className="text-gray-500 text-sm mb-6">
        Custom word replacements applied after transcription. Useful for brand
        names, technical terms, or common corrections.
      </p>

      {/* Add New Entry */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              When AI writes...
            </label>
            <input
              type="text"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. stayfree"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="text-gray-400 pb-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Replace with...
            </label>
            <input
              type="text"
              value={newReplacement}
              onChange={(e) => setNewReplacement(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. StayFree"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={addEntry}
            disabled={!newTerm.trim()}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Add
          </button>
        </div>
      </div>

      {/* Entries Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No dictionary entries yet.</p>
          <p className="text-gray-300 text-xs mt-1">
            Add terms above to customize your transcriptions.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="flex-1">Term</div>
            <div className="flex-1">Replacement</div>
            <div className="w-10" />
          </div>

          {/* Rows */}
          {entries.map((entry, i) => (
            <div
              key={`${entry.term}-${i}`}
              className="flex items-center px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 text-sm text-gray-700 font-mono">
                {entry.term}
              </div>
              <div className="flex-1 text-sm text-gray-900">
                {entry.replacement}
              </div>
              <button
                onClick={() => removeEntry(i)}
                className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
