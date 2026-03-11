import React, { useState, useEffect, useCallback, useRef } from "react";

type NoteSource = "voice" | "text" | "clipboard" | "transcription";

interface Note {
  id: string;
  title: string;
  content: string;
  rawContent: string;
  createdAt: number;
  updatedAt: number;
  source: NoteSource;
  pinned: boolean;
  archived: boolean;
  tags: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sourceIcon(source: NoteSource): React.ReactNode {
  switch (source) {
    case "voice":
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      );
    case "clipboard":
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      );
    case "transcription":
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    default:
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="17" y1="10" x2="3" y2="10" />
          <line x1="21" y1="6" x2="3" y2="6" />
          <line x1="21" y1="14" x2="3" y2="14" />
          <line x1="17" y1="18" x2="3" y2="18" />
        </svg>
      );
  }
}

// ─── NoteInput ────────────────────────────────────────────────────────────────

function NoteInput({ onCreated }: { onCreated: () => void }) {
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const text = value.trim();
    if (!text || creating) return;
    setCreating(true);
    try {
      await window.electron.createNote({ content: text });
      setValue("");
      onCreated();
    } finally {
      setCreating(false);
    }
  }, [value, creating, onCreated]);

  return (
    <div style={{ display: "flex", gap: "8px", marginBottom: "28px" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
        placeholder="Type a quick note..."
        style={{
          flex: 1,
          height: "40px",
          padding: "0 14px",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          fontSize: "14px",
          color: "#0f172a",
          outline: "none",
          fontFamily: "inherit",
          backgroundColor: "#fafbfc",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#94a3b8"; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#e2e8f0"; }}
      />
      <button
        onClick={handleCreate}
        disabled={!value.trim() || creating}
        title="Add note"
        style={{
          width: "40px",
          height: "40px",
          border: "none",
          borderRadius: "10px",
          backgroundColor: value.trim() ? "#0f172a" : "#e2e8f0",
          color: value.trim() ? "#fff" : "#94a3b8",
          cursor: value.trim() ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background-color 0.15s",
          fontSize: "20px",
          fontWeight: 300,
          lineHeight: 1,
        }}
      >
        +
      </button>
    </div>
  );
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onUpdate,
  onDelete,
  onClick,
}: {
  note: Note;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClick: (note: Note) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onClick(note)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: "#fff",
        border: "1px solid #f1f5f9",
        borderRadius: "12px",
        padding: "14px 16px",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        borderColor: hovered ? "#e2e8f0" : "#f1f5f9",
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* Title */}
      <p style={{
        fontSize: "13px",
        fontWeight: 600,
        color: "#0f172a",
        margin: "0 0 5px 0",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        paddingRight: hovered ? "72px" : "0",
      }}>
        {note.title || "Untitled"}
      </p>

      {/* Content preview */}
      <p style={{
        fontSize: "12px",
        color: "#64748b",
        margin: "0 0 10px 0",
        lineHeight: "1.5",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      } as React.CSSProperties}>
        {note.content}
      </p>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ color: "#94a3b8", display: "flex", alignItems: "center" }}>
          {sourceIcon(note.source)}
        </span>
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
          {formatRelativeTime(note.updatedAt)}
        </span>
        {note.pinned && (
          <span style={{ fontSize: "11px", color: "#7c3aed", fontWeight: 600 }}>· pinned</span>
        )}
      </div>

      {/* Hover actions */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            display: "flex",
            gap: "4px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn
            title={note.pinned ? "Unpin" : "Pin"}
            color={note.pinned ? "#7c3aed" : "#94a3b8"}
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={note.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </ActionBtn>
          <ActionBtn title="Archive" color="#94a3b8" onClick={() => onUpdate(note.id, { archived: true })}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </ActionBtn>
          <ActionBtn title="Delete" color="#94a3b8" hoverColor="#ef4444" onClick={() => onDelete(note.id)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </ActionBtn>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  title,
  color,
  hoverColor,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  color: string;
  hoverColor?: string;
  onClick: () => void;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: h && hoverColor ? hoverColor : color,
        padding: "4px",
        borderRadius: "5px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── NoteDetailModal ──────────────────────────────────────────────────────────

function NoteDetailModal({
  note,
  onClose,
  onUpdate,
  onDelete,
}: {
  note: Note;
  onClose: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const handleSave = useCallback(() => {
    if (title !== note.title || content !== note.content) {
      onUpdate(note.id, { title, content });
    }
  }, [note, title, content, onUpdate]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleDelete = () => {
    onDelete(note.id);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#fff",
          borderRadius: "16px",
          width: "560px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px 0",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            placeholder="Untitled"
            style={{
              flex: 1,
              fontSize: "17px",
              fontWeight: 700,
              color: "#0f172a",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
              backgroundColor: "transparent",
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Metadata */}
        <div style={{ padding: "6px 24px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#94a3b8", display: "flex", alignItems: "center" }}>
            {sourceIcon(note.source)}
          </span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            {new Date(note.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div style={{ width: "100%", height: "1px", backgroundColor: "#f1f5f9" }} />

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleSave}
            style={{
              width: "100%",
              minHeight: "120px",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: "14px",
              lineHeight: "1.7",
              color: "#334155",
              fontFamily: "inherit",
              backgroundColor: "transparent",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ width: "100%", height: "1px", backgroundColor: "#f1f5f9" }} />

        {/* Footer actions */}
        <div style={{ padding: "14px 24px", display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={handleCopy}
            style={{
              padding: "8px 14px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              color: copied ? "#16a34a" : "#64748b",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "color 0.15s",
              fontFamily: "inherit",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => { onUpdate(note.id, { pinned: !note.pinned }); onClose(); }}
            style={{
              padding: "8px 14px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              color: note.pinned ? "#7c3aed" : "#64748b",
              fontFamily: "inherit",
            }}
          >
            {note.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => { onUpdate(note.id, { archived: true }); onClose(); }}
            style={{
              padding: "8px 14px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              color: "#64748b",
              fontFamily: "inherit",
            }}
          >
            Archive
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleDelete}
            style={{
              padding: "8px 14px",
              border: "1px solid #fee2e2",
              borderRadius: "8px",
              backgroundColor: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              color: "#ef4444",
              fontFamily: "inherit",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

function SearchBar({
  onResults,
  onClear,
}: {
  onResults: (results: Note[]) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      onClear();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await window.electron.searchNotes(q);
      onResults(results);
    }, 300);
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Search notes..."
        style={{
          height: "34px",
          padding: "0 12px 0 32px",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          fontSize: "13px",
          color: "#0f172a",
          outline: "none",
          fontFamily: "inherit",
          backgroundColor: "#fafbfc",
          width: "180px",
          transition: "border-color 0.15s, width 0.2s",
        }}
        onFocus={(e) => {
          (e.target as HTMLInputElement).style.borderColor = "#94a3b8";
          (e.target as HTMLInputElement).style.width = "220px";
        }}
        onBlur={(e) => {
          (e.target as HTMLInputElement).style.borderColor = "#e2e8f0";
          (e.target as HTMLInputElement).style.width = "180px";
        }}
      />
    </div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: "11px",
      fontWeight: 700,
      color: "#94a3b8",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      margin: "0 0 12px 0",
    }}>
      {children}
    </h3>
  );
}

// ─── NotesGrid ────────────────────────────────────────────────────────────────

function NotesGrid({
  notes,
  onUpdate,
  onDelete,
  onNoteClick,
  viewMode,
}: {
  notes: Note[];
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onNoteClick: (note: Note) => void;
  viewMode: "grid" | "list";
}) {
  if (viewMode === "list") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", border: "1px solid #f1f5f9", borderRadius: "12px", overflow: "hidden" }}>
        {notes.map((note, i) => (
          <NoteCard key={note.id} note={note} onUpdate={onUpdate} onDelete={onDelete} onClick={onNoteClick} />
        ))}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: "10px",
    }}>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onUpdate={onUpdate} onDelete={onDelete} onClick={onNoteClick} />
      ))}
    </div>
  );
}

// ─── Main NotesPage ───────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchResults, setSearchResults] = useState<Note[] | null>(null);

  const refreshNotes = useCallback(async () => {
    const data = await window.electron.getNotes();
    setNotes(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshNotes();
    const cleanup = window.electron.onNotesUpdated?.(() => {
      refreshNotes();
    });
    return () => cleanup?.();
  }, [refreshNotes]);

  const handleUpdate = useCallback(async (id: string, updates: Record<string, unknown>) => {
    await window.electron.updateNote(id, updates);
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } as Note : n));
    setSelectedNote((prev) => prev?.id === id ? { ...prev, ...updates, updatedAt: Date.now() } as Note : prev);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await window.electron.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setSelectedNote((prev) => prev?.id === id ? null : prev);
  }, []);

  const displayNotes = searchResults ?? notes;
  const pinned = displayNotes.filter((n) => n.pinned);
  const recents = displayNotes.filter((n) => !n.pinned);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{
          fontSize: "30px",
          fontWeight: 700,
          color: "#0f172a",
          margin: "0 0 6px 0",
          letterSpacing: "-0.03em",
          lineHeight: 1.2,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}>
          Notes
        </h1>
        <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
          For quick thoughts you want to come back to later.
        </p>
      </div>

      {/* Note Input */}
      <NoteInput onCreated={refreshNotes} />

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={{
            width: "28px",
            height: "28px",
            border: "3px solid #e2e8f0",
            borderTopColor: "#0f172a",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }} />
        </div>
      ) : displayNotes.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 0",
          border: "1px dashed #e2e8f0",
          borderRadius: "14px",
        }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
            {searchResults !== null ? "No matching notes" : "No notes yet"}
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0, maxWidth: "280px", marginLeft: "auto", marginRight: "auto" }}>
            {searchResults !== null
              ? "Try a different search term."
              : "Hold Right Option and say \"save to notes\" to create your first voice note, or type one above."}
          </p>
        </div>
      ) : (
        <div>
          {/* Pinned section */}
          {pinned.length > 0 && (
            <div style={{ marginBottom: "28px" }}>
              <SectionLabel>Pinned</SectionLabel>
              <NotesGrid notes={pinned} onUpdate={handleUpdate} onDelete={handleDelete} onNoteClick={setSelectedNote} viewMode={viewMode} />
            </div>
          )}

          {/* Recents section */}
          {recents.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <SectionLabel>Recents</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <SearchBar
                    onResults={setSearchResults}
                    onClear={() => setSearchResults(null)}
                  />
                  {/* View toggle */}
                  <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: "7px", overflow: "hidden" }}>
                    <ViewToggleBtn active={viewMode === "grid"} onClick={() => setViewMode("grid")} title="Grid view">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                      </svg>
                    </ViewToggleBtn>
                    <ViewToggleBtn active={viewMode === "list"} onClick={() => setViewMode("list")} title="List view">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                    </ViewToggleBtn>
                  </div>
                </div>
              </div>
              <NotesGrid notes={recents} onUpdate={handleUpdate} onDelete={handleDelete} onNoteClick={setSelectedNote} viewMode={viewMode} />
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedNote && (
        <NoteDetailModal
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ViewToggleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        border: "none",
        borderRadius: 0,
        padding: "5px 9px",
        cursor: "pointer",
        backgroundColor: active ? "#f1f5f9" : "#fff",
        color: active ? "#0f172a" : "#94a3b8",
        display: "flex",
        alignItems: "center",
        transition: "background-color 0.15s",
      }}
    >
      {children}
    </button>
  );
}
