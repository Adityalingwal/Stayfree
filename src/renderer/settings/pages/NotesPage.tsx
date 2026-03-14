import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

type NoteSource = "voice" | "text" | "clipboard" | "transcription";
type StylePreset = "default" | "bullets" | "action-items" | "casual-memo" | "formal-doc" | "tweet-thread" | "my-style";

interface ExtractedTask {
  person: string;
  action: string;
  deadline: string;
}

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
  // Phase 2
  cleanContent: string;
  aiProcessed: boolean;
  aiProcessing: boolean;
  stylePreset: StylePreset;
  styledContent: string;
  suggestedTags: string[];
  tasks: ExtractedTask[];
}

interface LocalCollection {
  id: string;
  name: string;
  description: string;
  noteIds: string[];
  suggested: boolean;
  dismissed: boolean;
}

const STYLE_OPTIONS: { value: StylePreset; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "bullets", label: "Bullets" },
  { value: "action-items", label: "Actions" },
  { value: "casual-memo", label: "Casual" },
  { value: "formal-doc", label: "Formal" },
  { value: "tweet-thread", label: "Thread" },
];

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
    <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
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

// ─── ActionBtn ────────────────────────────────────────────────────────────────

function ActionBtn({
  children, title, color, hoverColor, onClick,
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
        background: "none", border: "none", cursor: "pointer",
        color: h && hoverColor ? hoverColor : color,
        padding: "4px", borderRadius: "5px",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note, onUpdate, onDelete, onClick,
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
      {/* AI processing dot */}
      {note.aiProcessing && (
        <div style={{
          position: "absolute", top: "12px", left: "12px",
          width: "6px", height: "6px", borderRadius: "50%",
          backgroundColor: "#7c3aed",
          animation: "pulse 1.5s ease-in-out infinite",
        }} />
      )}

      {/* Title */}
      <p style={{
        fontSize: "13px", fontWeight: 600, color: "#0f172a",
        margin: "0 0 5px 0",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        paddingRight: hovered ? "72px" : "0",
        paddingLeft: note.aiProcessing ? "14px" : "0",
      }}>
        {note.title || "Untitled"}
      </p>

      {/* Content preview */}
      <p style={{
        fontSize: "12px", color: "#64748b", margin: "0 0 10px 0",
        lineHeight: "1.5",
        display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      } as React.CSSProperties}>
        {note.cleanContent || note.content}
      </p>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span style={{ color: "#94a3b8", display: "flex", alignItems: "center" }}>
          {sourceIcon(note.source)}
        </span>
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
          {formatRelativeTime(note.updatedAt)}
        </span>
        {note.pinned && (
          <span style={{ fontSize: "11px", color: "#7c3aed", fontWeight: 600 }}>· pinned</span>
        )}
        {note.tasks?.length > 0 && (
          <span style={{ fontSize: "10px", color: "#0284c7", fontWeight: 600 }}>
            · {note.tasks.length} task{note.tasks.length !== 1 ? "s" : ""}
          </span>
        )}
        {/* Tags */}
        {note.tags.slice(0, 3).map((tag) => (
          <span key={tag} style={{
            fontSize: "10px", padding: "1px 6px",
            backgroundColor: "#f1f5f9", borderRadius: "4px",
            color: "#64748b", fontWeight: 500,
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Hover actions */}
      {hovered && (
        <div
          style={{ position: "absolute", top: "12px", right: "12px", display: "flex", gap: "4px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn title={note.pinned ? "Unpin" : "Pin"} color={note.pinned ? "#7c3aed" : "#94a3b8"}
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={note.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
          </ActionBtn>
          <ActionBtn title="Archive" color="#94a3b8" onClick={() => onUpdate(note.id, { archived: true })}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
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

// ─── NoteDetailModal ──────────────────────────────────────────────────────────

function NoteDetailModal({
  note, onClose, onUpdate, onDelete, onNoteClick,
}: {
  note: Note;
  onClose: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onNoteClick?: (note: Note) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [viewMode, setViewMode] = useState<"raw" | "clean">(
    note.aiProcessed && note.cleanContent ? "clean" : "raw"
  );
  const [restyling, setRestyling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([]);
  const [hasMyStyle, setHasMyStyle] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch related notes and style config on mount
  useEffect(() => {
    window.electron.getRelatedNotes(note.id).then((related) => {
      setRelatedNotes(related as Note[]);
    }).catch(() => {});
    window.electron.getStyleConfig().then((config) => {
      setHasMyStyle(!!config.prompt);
    }).catch(() => {});
  }, [note.id]);

  // Sync state when note updates (e.g., AI finishes)
  useEffect(() => {
    if (note.aiProcessed && note.cleanContent && viewMode === "raw") {
      // Don't auto-switch — let user stay where they are
    }
  }, [note.aiProcessed]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const displayContent = viewMode === "raw"
    ? note.rawContent
    : (note.styledContent || note.cleanContent || note.content);

  const handleSave = useCallback(() => {
    const updates: Record<string, unknown> = {};
    if (title !== note.title) updates.title = title;
    if (content !== note.content && viewMode === "raw") updates.content = content;
    if (Object.keys(updates).length > 0) onUpdate(note.id, updates);
  }, [note, title, content, viewMode, onUpdate]);

  const handleCopy = useCallback(async () => {
    const text = displayContent;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayContent]);

  const handleRestyle = async (style: StylePreset) => {
    if (restyling) return;
    setRestyling(true);
    try {
      const updated = await window.electron.restyleNote(note.id, style);
      if (updated) {
        onUpdate(note.id, { stylePreset: style, styledContent: updated.styledContent });
        setViewMode("clean");
      }
    } finally {
      setRestyling(false);
    }
  };

  const handleApproveTag = async (tag: string) => {
    await window.electron.approveTag(note.id, tag);
  };

  const handleRemoveSuggestedTag = async (tag: string) => {
    await window.electron.removeSuggestedTag(note.id, tag);
  };

  const handleRemoveApprovedTag = async (tag: string) => {
    const tags = note.tags.filter((t) => t !== tag);
    onUpdate(note.id, { tags });
  };

  const handleAddTag = async () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    const tags = [...new Set([...note.tags, tag])];
    onUpdate(note.id, { tags });
    setNewTag("");
    setAddingTag(false);
  };

  const handleReprocess = async () => {
    await window.electron.reprocessNote(note.id);
  };

  const showToggle = note.aiProcessed || note.aiProcessing;
  const showStyles = note.aiProcessed;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#fff", borderRadius: "16px",
          width: "600px", maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="text" value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            placeholder="Untitled"
            style={{
              flex: 1, fontSize: "17px", fontWeight: 700, color: "#0f172a",
              border: "none", outline: "none", fontFamily: "inherit", backgroundColor: "transparent",
            }}
          />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", display: "flex", alignItems: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Metadata + AI status */}
        <div style={{ padding: "6px 24px 10px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#94a3b8", display: "flex", alignItems: "center" }}>{sourceIcon(note.source)}</span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          {note.aiProcessing && (
            <span style={{ fontSize: "11px", color: "#7c3aed", display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.5px solid #7c3aed", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              AI processing...
            </span>
          )}
          {note.aiProcessed && !note.aiProcessing && (
            <button
              onClick={handleReprocess}
              title="Re-run AI"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#94a3b8", padding: "0 4px" }}
            >
              ↻ AI
            </button>
          )}
        </div>

        {/* Raw / Clean toggle */}
        {showToggle && (
          <div style={{ padding: "0 24px 10px" }}>
            <div style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
              {(["raw", "clean"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  disabled={mode === "clean" && note.aiProcessing && !note.aiProcessed}
                  style={{
                    padding: "5px 14px", border: "none", cursor: "pointer",
                    fontSize: "12px", fontWeight: 500,
                    backgroundColor: viewMode === mode ? "#0f172a" : "#fff",
                    color: viewMode === mode ? "#fff" : "#64748b",
                    fontFamily: "inherit",
                    transition: "background-color 0.15s",
                  }}
                >
                  {mode === "raw" ? "Raw" : note.aiProcessing ? "Cleaning..." : "Clean"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Style preset selector */}
        {showStyles && viewMode === "clean" && (
          <div style={{ padding: "0 24px 10px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[...STYLE_OPTIONS, ...(hasMyStyle ? [{ value: "my-style" as StylePreset, label: "My Style" }] : [])].map(({ value, label }) => {
              const isActive = note.stylePreset === value;
              return (
                <button
                  key={value}
                  onClick={() => handleRestyle(value)}
                  disabled={restyling}
                  style={{
                    padding: "4px 10px", border: `1px solid ${isActive ? "#0f172a" : "#e2e8f0"}`,
                    borderRadius: "6px", cursor: restyling ? "wait" : "pointer",
                    fontSize: "11px", fontWeight: 500,
                    backgroundColor: isActive ? "#0f172a" : "#fff",
                    color: isActive ? "#fff" : "#64748b",
                    fontFamily: "inherit", transition: "all 0.15s",
                    opacity: restyling && !isActive ? 0.5 : 1,
                  }}
                >
                  {restyling && isActive ? "..." : label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ width: "100%", height: "1px", backgroundColor: "#f1f5f9" }} />

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {/* Content textarea — editable only in raw mode */}
          <textarea
            ref={textareaRef}
            value={viewMode === "raw" ? content : displayContent}
            onChange={(e) => {
              if (viewMode === "raw") setContent(e.target.value);
            }}
            readOnly={viewMode === "clean"}
            onBlur={() => { if (viewMode === "raw") handleSave(); }}
            style={{
              width: "100%", minHeight: "100px", border: "none", outline: "none",
              resize: "none", fontSize: "14px", lineHeight: "1.7",
              color: "#334155", fontFamily: "inherit", backgroundColor: "transparent",
              boxSizing: "border-box",
              opacity: viewMode === "clean" ? 0.9 : 1,
            }}
          />

          {/* Tags section */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
              {/* Approved tags */}
              {note.tags.map((tag) => (
                <span key={tag} style={{
                  display: "inline-flex", alignItems: "center", gap: "4px",
                  fontSize: "11px", padding: "3px 8px",
                  backgroundColor: "#f1f5f9", borderRadius: "6px",
                  color: "#334155", fontWeight: 500,
                }}>
                  {tag}
                  <button onClick={() => handleRemoveApprovedTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "0", lineHeight: 1, fontSize: "12px" }}>×</button>
                </span>
              ))}

              {/* Suggested tags */}
              {note.suggestedTags?.map((tag) => (
                <span key={tag} style={{
                  display: "inline-flex", alignItems: "center", gap: "4px",
                  fontSize: "11px", padding: "3px 8px",
                  backgroundColor: "transparent",
                  border: "1px dashed #c4b5fd", borderRadius: "6px",
                  color: "#7c3aed", fontWeight: 500,
                }}>
                  {tag}
                  <button onClick={() => handleApproveTag(tag)} title="Approve" style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", padding: "0", lineHeight: 1, fontSize: "11px" }}>✓</button>
                  <button onClick={() => handleRemoveSuggestedTag(tag)} title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "0", lineHeight: 1, fontSize: "12px" }}>×</button>
                </span>
              ))}

              {/* Add tag */}
              {addingTag ? (
                <input
                  autoFocus
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); if (e.key === "Escape") { setAddingTag(false); setNewTag(""); } }}
                  onBlur={handleAddTag}
                  placeholder="tag name"
                  style={{
                    fontSize: "11px", padding: "3px 8px", border: "1px solid #94a3b8",
                    borderRadius: "6px", outline: "none", fontFamily: "inherit", width: "80px",
                  }}
                />
              ) : (
                <button onClick={() => setAddingTag(true)} style={{
                  fontSize: "11px", padding: "3px 8px", border: "1px dashed #e2e8f0",
                  borderRadius: "6px", background: "none", cursor: "pointer", color: "#94a3b8",
                }}>
                  + tag
                </button>
              )}
            </div>
          </div>

          {/* Tasks section */}
          {note.tasks?.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px 0" }}>Tasks</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {note.tasks.map((task, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "13px" }}>
                    <span style={{ color: "#334155", fontWeight: 600, minWidth: "40px" }}>{task.person}</span>
                    <span style={{ color: "#94a3b8" }}>—</span>
                    <span style={{ color: "#475569", flex: 1 }}>{task.action}</span>
                    {task.deadline !== "unspecified" && (
                      <>
                        <span style={{ color: "#94a3b8" }}>—</span>
                        <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "12px" }}>{task.deadline}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Notes section */}
          {relatedNotes.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px 0" }}>Related Notes</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {relatedNotes.slice(0, 5).map((related) => (
                  <div
                    key={related.id}
                    onClick={() => onNoteClick?.(related)}
                    style={{
                      padding: "8px 12px", borderRadius: "8px",
                      border: "1px solid #f1f5f9", cursor: "pointer",
                      transition: "border-color 0.15s, background-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#e2e8f0";
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = "#fafbfc";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#f1f5f9";
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "#334155", margin: "0 0 2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {related.title || "Untitled"}
                    </p>
                    <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {(related.cleanContent || related.content).slice(0, 80)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ width: "100%", height: "1px", backgroundColor: "#f1f5f9" }} />

        {/* Footer actions */}
        <div style={{ padding: "14px 24px", display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={handleCopy}
            style={{
              padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
              backgroundColor: "#fff", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              color: copied ? "#16a34a" : "#64748b", fontFamily: "inherit",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => { onUpdate(note.id, { pinned: !note.pinned }); onClose(); }}
            style={{
              padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
              backgroundColor: "#fff", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              color: note.pinned ? "#7c3aed" : "#64748b", fontFamily: "inherit",
            }}
          >
            {note.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => { onUpdate(note.id, { archived: true }); onClose(); }}
            style={{
              padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
              backgroundColor: "#fff", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              color: "#64748b", fontFamily: "inherit",
            }}
          >
            Archive
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { onDelete(note.id); onClose(); }}
            style={{
              padding: "8px 14px", border: "1px solid #fee2e2", borderRadius: "8px",
              backgroundColor: "#fff", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              color: "#ef4444", fontFamily: "inherit",
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

function SearchBar({ onResults, onClear }: { onResults: (r: Note[]) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { onClear(); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await window.electron.searchNotes(q);
      onResults(results as Note[]);
    }, 300);
  };

  return (
    <div style={{ position: "relative" }}>
      <svg style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text" value={query} onChange={handleChange}
        placeholder="Search notes..."
        style={{
          height: "34px", padding: "0 12px 0 32px",
          border: "1px solid #e2e8f0", borderRadius: "8px",
          fontSize: "13px", color: "#0f172a", outline: "none",
          fontFamily: "inherit", backgroundColor: "#fafbfc", width: "180px",
          transition: "border-color 0.15s, width 0.2s",
        }}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#94a3b8"; (e.target as HTMLInputElement).style.width = "220px"; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#e2e8f0"; (e.target as HTMLInputElement).style.width = "180px"; }}
      />
    </div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px 0" }}>
      {children}
    </h3>
  );
}

// ─── NotesGrid ────────────────────────────────────────────────────────────────

function NotesGrid({ notes, onUpdate, onDelete, onNoteClick, viewMode }: {
  notes: Note[];
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onNoteClick: (note: Note) => void;
  viewMode: "grid" | "list";
}) {
  if (viewMode === "list") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", border: "1px solid #f1f5f9", borderRadius: "12px", overflow: "hidden" }}>
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} onUpdate={onUpdate} onDelete={onDelete} onClick={onNoteClick} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onUpdate={onUpdate} onDelete={onDelete} onClick={onNoteClick} />
      ))}
    </div>
  );
}

// ─── ViewToggleBtn ────────────────────────────────────────────────────────────

function ViewToggleBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      border: "none", borderRadius: 0, padding: "5px 9px", cursor: "pointer",
      backgroundColor: active ? "#f1f5f9" : "#fff",
      color: active ? "#0f172a" : "#94a3b8",
      display: "flex", alignItems: "center", transition: "background-color 0.15s",
    }}>
      {children}
    </button>
  );
}

// ─── ChatMessage type (local) ────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  citedNoteIds?: string[];
}

// ─── ChatDrawer ──────────────────────────────────────────────────────────────

function ChatDrawer({ onNoteClick }: { onNoteClick: (noteId: string) => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electron.getChatHistory().then((history) => {
      setMessages(history as ChatMsg[]);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await window.electron.chatQuery(question);
      setMessages((prev) => [...prev.filter((m) => m.id !== userMsg.id), userMsg, response as ChatMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: "Something went wrong. Please try again.", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    window.electron.clearChatHistory();
    setMessages([]);
  };

  const EXAMPLE_QUERIES = [
    "What are my recent action items?",
    "Summarize my notes about work",
    "What did I capture about ideas?",
  ];

  return (
    <div style={{
      width: "350px", height: "100%", display: "flex", flexDirection: "column",
      borderLeft: "1px solid #e2e8f0", backgroundColor: "#fafbfc",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #f1f5f9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Ask StayFree</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            title="Clear conversation"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", display: "flex" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: "40px" }}>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px 0" }}>
              Ask me anything about your notes
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  style={{
                    padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px",
                    backgroundColor: "#fff", cursor: "pointer", fontSize: "12px",
                    color: "#64748b", fontFamily: "inherit", textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px", borderRadius: "12px",
                  fontSize: "13px", lineHeight: "1.5",
                  backgroundColor: msg.role === "user" ? "#0f172a" : "#fff",
                  color: msg.role === "user" ? "#fff" : "#334155",
                  border: msg.role === "assistant" ? "1px solid #e2e8f0" : "none",
                }}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                  {/* Cited notes */}
                  {msg.citedNoteIds && msg.citedNoteIds.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {msg.citedNoteIds.map((id) => (
                        <button
                          key={id}
                          onClick={() => onNoteClick(id)}
                          style={{
                            padding: "2px 8px", borderRadius: "4px",
                            backgroundColor: "#f1f5f9", border: "none",
                            cursor: "pointer", fontSize: "10px", color: "#7c3aed",
                            fontWeight: 600, fontFamily: "inherit",
                          }}
                        >
                          Open note
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "8px 12px", borderRadius: "12px", backgroundColor: "#fff",
                  border: "1px solid #e2e8f0", fontSize: "13px", color: "#94a3b8",
                  display: "flex", alignItems: "center", gap: "6px",
                }}>
                  <div style={{ width: "12px", height: "12px", border: "2px solid #e2e8f0", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Ask about your notes..."
            disabled={loading}
            style={{
              flex: 1, height: "36px", padding: "0 12px",
              border: "1px solid #e2e8f0", borderRadius: "8px",
              fontSize: "13px", color: "#0f172a", outline: "none",
              fontFamily: "inherit", backgroundColor: "#fff",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: "36px", height: "36px", border: "none", borderRadius: "8px",
              backgroundColor: input.trim() && !loading ? "#7c3aed" : "#e2e8f0",
              color: input.trim() && !loading ? "#fff" : "#94a3b8",
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
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
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [collections, setCollections] = useState<LocalCollection[]>([]);
  const [activeCollectionFilter, setActiveCollectionFilter] = useState<string | null>(null);

  const refreshCollections = useCallback(async () => {
    try {
      const data = await window.electron.getCollections();
      setCollections(data as LocalCollection[]);
    } catch {}
  }, []);

  const refreshNotes = useCallback(async () => {
    const data = await window.electron.getNotes();
    setNotes(data as Note[]);
    setLoading(false);
    // If a note is open in modal, update it too
    setSelectedNote((prev) => {
      if (!prev) return null;
      const updated = (data as Note[]).find((n) => n.id === prev.id);
      return updated ?? null;
    });
  }, []);

  useEffect(() => {
    refreshNotes();
    refreshCollections();
    const cleanup = window.electron.onNotesUpdated?.(() => {
      refreshNotes();
    });
    return () => cleanup?.();
  }, [refreshNotes, refreshCollections]);

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

  // Compute all unique tags across notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  const displayNotes = searchResults ?? notes;
  const activeCollection = activeCollectionFilter
    ? collections.find((c) => c.id === activeCollectionFilter) : null;
  const collectionFiltered = activeCollection
    ? displayNotes.filter((n) => activeCollection.noteIds.includes(n.id))
    : displayNotes;
  const filteredNotes = activeTagFilter
    ? collectionFiltered.filter((n) => n.tags.includes(activeTagFilter))
    : collectionFiltered;

  const pinned = filteredNotes.filter((n) => n.pinned);
  const recents = filteredNotes.filter((n) => !n.pinned);

  const handleChatNoteClick = useCallback((noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) setSelectedNote(note);
  }, [notes]);

  return (
    <div style={{ display: "flex", height: "100%" }}>
    <div style={{ flex: 1, overflow: "auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{
            fontSize: "30px", fontWeight: 700, color: "#0f172a",
            margin: "0 0 6px 0", letterSpacing: "-0.03em", lineHeight: 1.2,
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}>Notes</h1>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
            For quick thoughts you want to come back to later.
          </p>
        </div>
        <button
          onClick={() => setChatOpen(!chatOpen)}
          title={chatOpen ? "Close chat" : "Ask StayFree"}
          style={{
            padding: "8px 14px", border: "1px solid",
            borderColor: chatOpen ? "#7c3aed" : "#e2e8f0",
            borderRadius: "8px", cursor: "pointer",
            backgroundColor: chatOpen ? "#7c3aed" : "#fff",
            color: chatOpen ? "#fff" : "#64748b",
            fontSize: "13px", fontWeight: 500, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: "6px",
            transition: "all 0.15s", flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Brain
        </button>
      </div>

      {/* Note Input */}
      <NoteInput onCreated={refreshNotes} />

      {/* Collection filter bar */}
      {collections.length > 0 && (
        <div style={{
          display: "flex", gap: "6px", flexWrap: "wrap",
          marginBottom: "10px",
        }}>
          {collections.map((col) => (
            <button
              key={col.id}
              onClick={() => setActiveCollectionFilter(activeCollectionFilter === col.id ? null : col.id)}
              style={{
                padding: "4px 12px", border: "1px solid",
                borderColor: activeCollectionFilter === col.id ? "#7c3aed" : "#e2e8f0",
                borderRadius: "20px", cursor: "pointer", fontSize: "12px", fontWeight: 500,
                backgroundColor: activeCollectionFilter === col.id ? "#7c3aed" : "#fff",
                color: activeCollectionFilter === col.id ? "#fff" : "#64748b",
                fontFamily: "inherit", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              {col.name}
              <span style={{
                fontSize: "10px", fontWeight: 600, opacity: 0.7,
              }}>
                {col.noteIds.length}
              </span>
              {col.suggested && (
                <span style={{
                  fontSize: "9px", padding: "1px 4px",
                  backgroundColor: activeCollectionFilter === col.id ? "rgba(255,255,255,0.2)" : "#f5f3ff",
                  borderRadius: "3px", color: activeCollectionFilter === col.id ? "#fff" : "#7c3aed",
                }}>
                  AI
                </span>
              )}
            </button>
          ))}
          {activeCollectionFilter && (
            <button
              onClick={() => setActiveCollectionFilter(null)}
              style={{
                padding: "4px 10px", border: "1px solid #e2e8f0", borderRadius: "20px",
                cursor: "pointer", fontSize: "12px", color: "#94a3b8",
                backgroundColor: "#fff", fontFamily: "inherit",
              }}
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div style={{
          display: "flex", gap: "6px", flexWrap: "wrap",
          marginBottom: "16px", paddingBottom: "8px",
        }}>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              style={{
                padding: "3px 10px", border: "1px solid",
                borderColor: activeTagFilter === tag ? "#0f172a" : "#e2e8f0",
                borderRadius: "20px", cursor: "pointer", fontSize: "12px", fontWeight: 500,
                backgroundColor: activeTagFilter === tag ? "#0f172a" : "#fff",
                color: activeTagFilter === tag ? "#fff" : "#64748b",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              {tag}
            </button>
          ))}
          {activeTagFilter && (
            <button
              onClick={() => setActiveTagFilter(null)}
              style={{
                padding: "3px 10px", border: "1px solid #e2e8f0", borderRadius: "20px",
                cursor: "pointer", fontSize: "12px", color: "#94a3b8",
                backgroundColor: "#fff", fontFamily: "inherit",
              }}
            >
              clear ×
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={{ width: "28px", height: "28px", border: "3px solid #e2e8f0", borderTopColor: "#0f172a", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", border: "1px dashed #e2e8f0", borderRadius: "14px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
            {searchResults !== null || activeTagFilter ? "No matching notes" : "No notes yet"}
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "13px", margin: "0 auto", maxWidth: "280px" }}>
            {searchResults !== null || activeTagFilter
              ? "Try a different search or filter."
              : "Hold Right Option and say \"save to notes\" to create your first voice note, or type one above."}
          </p>
        </div>
      ) : (
        <div>
          {pinned.length > 0 && (
            <div style={{ marginBottom: "28px" }}>
              <SectionLabel>Pinned</SectionLabel>
              <NotesGrid notes={pinned} onUpdate={handleUpdate} onDelete={handleDelete} onNoteClick={setSelectedNote} viewMode={viewMode} />
            </div>
          )}
          {recents.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <SectionLabel>Recents</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <SearchBar onResults={(r) => setSearchResults(r)} onClear={() => setSearchResults(null)} />
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
          onNoteClick={setSelectedNote}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>

    {/* Chat Drawer */}
    {chatOpen && (
      <ChatDrawer onNoteClick={handleChatNoteClick} />
    )}
    </div>
  );
}
