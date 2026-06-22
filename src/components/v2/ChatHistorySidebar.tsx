import { useState, useCallback, useRef, useEffect } from "react";
import { useStore, type Conversation } from "../../store";
import MarqueeTitle from "./MarqueeTitle";

/* ── helpers ── */
function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function groupConversations(convos: Conversation[]) {
  const now = Date.now();
  const pinned: Conversation[] = [];
  const today: Conversation[] = [];
  const week: Conversation[] = [];
  const older: Conversation[] = [];

  for (const c of convos) {
    if (c.pinned) { pinned.push(c); continue; }
    const age = now - c.updatedAt;
    if (age < 86_400_000) today.push(c);
    else if (age < 604_800_000) week.push(c);
    else older.push(c);
  }
  return { pinned, today, week, older };
}

/* ── Confirmation dialog ── */
function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.15)", zIndex: 999 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "#FFFFFF", border: "1px solid #E0DAD0", borderRadius: 14,
        padding: "20px 24px", zIndex: 1000, minWidth: 280, maxWidth: 360,
        boxShadow: "0 12px 40px rgba(40,36,28,.15)", fontFamily: "inherit",
      }}>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: "#3F3B33", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "7px 16px", borderRadius: 8, border: "1px solid #E0DAD0",
            background: "#FFFFFF", color: "#56524A", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: "#C75A3A", color: "#FFFFFF", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Confirm</button>
        </div>
      </div>
    </>
  );
}

/* ── Context menu ── */
function ContextMenu({ x, y, convo, isArchiveView, onClose }: {
  x: number; y: number; convo: Conversation; isArchiveView: boolean; onClose: () => void;
}) {
  const renameConversation = useStore((s) => s.renameConversation);
  const pinConversation = useStore((s) => s.pinConversation);
  const unpinConversation = useStore((s) => s.unpinConversation);
  const archiveConversation = useStore((s) => s.archiveConversation);
  const unarchiveConversation = useStore((s) => s.unarchiveConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const showToast = useStore((s) => s.showToast);

  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(convo.title);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renaming) renameRef.current?.focus(); }, [renaming]);

  if (confirm === "archive") {
    return <ConfirmDialog message={`Archive "${convo.title}"?`}
      onConfirm={() => { archiveConversation(convo.id); showToast("Chat archived"); onClose(); }}
      onCancel={() => setConfirm(null)} />;
  }
  if (confirm === "delete") {
    return <ConfirmDialog message={`Permanently delete "${convo.title}"? This cannot be undone.`}
      onConfirm={() => { deleteConversation(convo.id); showToast("Chat deleted"); onClose(); }}
      onCancel={() => setConfirm(null)} />;
  }
  if (renaming) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
        <div style={{
          position: "fixed", top: y, left: x, zIndex: 1000,
          background: "#FFFFFF", border: "1px solid #E0DAD0", borderRadius: 10,
          padding: 8, boxShadow: "0 6px 20px rgba(40,36,28,.12)", minWidth: 200,
        }}>
          <input ref={renameRef} value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameDraft.trim()) {
                renameConversation(convo.id, renameDraft.trim());
                showToast("Chat renamed"); onClose();
              }
              if (e.key === "Escape") onClose();
            }}
            style={{
              width: "100%", border: "1px solid #E0DAD0", borderRadius: 6, padding: "5px 8px",
              fontSize: 13, fontFamily: "inherit", outline: "none", color: "#21201C", boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#BD6A47"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#E0DAD0"; }}
          />
        </div>
      </>
    );
  }

  const items: { label: string; icon: string; action: () => void; danger?: boolean }[] = [];
  items.push({ label: "Rename", icon: "edit", action: () => setRenaming(true) });
  if (isArchiveView) {
    items.push({ label: "Unarchive", icon: "unarchive", action: () => { unarchiveConversation(convo.id); showToast("Chat restored"); onClose(); } });
    items.push({ label: "Delete permanently", icon: "trash", action: () => setConfirm("delete"), danger: true });
  } else {
    if (convo.pinned) {
      items.push({ label: "Unpin", icon: "unpin", action: () => { unpinConversation(convo.id); showToast("Chat unpinned"); onClose(); } });
    } else {
      items.push({ label: "Pin", icon: "pin", action: () => { pinConversation(convo.id); showToast("Chat pinned"); onClose(); } });
    }
    items.push({ label: "Archive", icon: "archive", action: () => setConfirm("archive") });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
      <div style={{
        position: "fixed", top: y, left: x, zIndex: 1000,
        background: "#FFFFFF", border: "1px solid #E0DAD0", borderRadius: 10,
        boxShadow: "0 6px 20px rgba(40,36,28,.12)", overflow: "hidden", minWidth: 170,
      }}>
        {items.map((item, i) => (
          <button key={i} onClick={item.action} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", border: "none", background: "transparent",
            cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", textAlign: "left",
            color: item.danger ? "#C75A3A" : "#4A463E", transition: "background .08s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? "#FEF3F0" : "#FAF8F3"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <MenuIcon name={item.icon} danger={item.danger} />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── SVG icons for context menu ── */
function MenuIcon({ name, danger }: { name: string; danger?: boolean }) {
  const stroke = danger ? "#C75A3A" : "#8A8578";
  const s = { width: 14, height: 14, flexShrink: 0 as const };
  switch (name) {
    case "edit": return <svg {...s} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"><path d="M10 3l3 3L6 13H3v-3z" /></svg>;
    case "pin": return <svg {...s} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"><path d="M5.5 2.5L10.5 2.5L11.5 7L9 9.5V12.5L7 14.5L7 9.5L4.5 7Z" /></svg>;
    case "unpin": return <svg {...s} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"><path d="M5.5 2.5L10.5 2.5L11.5 7L9 9.5V12.5L7 14.5L7 9.5L4.5 7Z" /><line x1="2" y1="14" x2="14" y2="2" /></svg>;
    case "archive": return <svg {...s} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M6.5 9h3" /></svg>;
    case "unarchive": return <svg {...s} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M8 9V12M6.5 10.5L8 12l1.5-1.5" /></svg>;
    case "trash": return <svg {...s} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"><path d="M3 4h10M5.5 4V3h5v1M5 4v8.5h6V4" /></svg>;
    default: return null;
  }
}

/* ── Hover popover (detail card) ── */
function HoverPopover({ convo, anchorRect }: { convo: Conversation; anchorRect: DOMRect }) {
  const captures = useStore((s) => s.captures);
  const userMsgs = convo.messages.filter((m) => m.isUser).length;
  const aiMsgs = convo.messages.filter((m) => !m.isUser).length;
  const firstUserMsg = convo.messages.find((m) => m.isUser)?.text || "";
  const attachedCaptures = convo.attached
    .map((id) => captures.find((c) => c.id === id))
    .filter(Boolean);

  // Position: to the right of the sidebar, vertically aligned with the row
  const top = Math.min(anchorRect.top, window.innerHeight - 240);
  const left = anchorRect.right + 8;

  return (
    <div style={{
      position: "fixed", top, left, zIndex: 800, pointerEvents: "none",
      width: 280, background: "#FFFFFF",
      border: "1px solid #E7E1D6", borderRadius: 12,
      boxShadow: "0 8px 30px rgba(40,36,28,.12), 0 1px 3px rgba(40,36,28,.06)",
      padding: "14px 16px", fontFamily: "inherit",
      animation: "fadeIn .12s ease",
    }}>
      {/* Title */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: "#21201C", marginBottom: 10,
        overflow: "hidden", textOverflow: "ellipsis",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        lineHeight: 1.4,
      }}>{convo.title}</div>

      {/* Meta rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Branch-style row: message count */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#A8A194" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M2 3h12v8H5l-3 3V3z" />
          </svg>
          <span style={{ fontSize: 12, color: "#7C7468" }}>
            {userMsgs} message{userMsgs !== 1 ? "s" : ""} · {aiMsgs} response{aiMsgs !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Time row */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#A8A194" strokeWidth="1.4" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="6" /><path d="M8 5v3.5l2.5 1.5" />
          </svg>
          <span style={{ fontSize: 12, color: "#7C7468" }}>{formatDate(convo.createdAt)}</span>
        </div>

        {/* Attached captures */}
        {attachedCaptures.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#A8A194" strokeWidth="1.4" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" />
              <path d="M9 2v4h4" />
            </svg>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {attachedCaptures.slice(0, 3).map((c) => (
                <span key={c!.id} style={{
                  fontSize: 11, color: "#9A4F30", background: "#F8EDE6",
                  borderRadius: 4, padding: "1px 6px", maxWidth: 120,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{c!.title}</span>
              ))}
              {attachedCaptures.length > 3 && (
                <span style={{ fontSize: 11, color: "#A8A194" }}>+{attachedCaptures.length - 3}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* First message preview */}
      {firstUserMsg && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0EDE6",
          fontSize: 12, color: "#A8A194", lineHeight: 1.45,
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const,
        }}>{firstUserMsg}</div>
      )}

      {/* Stats badge (like +12277 -67) — show message/context counts */}
      <div style={{
        display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 6,
      }}>
        {convo.pinned && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: "#BD6A47", background: "#F8EDE6",
            borderRadius: 4, padding: "2px 6px",
          }}>Pinned</span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 600, color: "#6B8F71", background: "#EDF5EE",
          borderRadius: 4, padding: "2px 6px",
        }}>+{convo.messages.length}</span>
        {convo.attached.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: "#7A6F62", background: "#F0EDE6",
            borderRadius: 4, padding: "2px 6px",
          }}>{convo.attached.length} ctx</span>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ChatHistorySidebar — Claude Code tabs style
   ════════════════════════════════════════════════════════════════ */
export default function ChatHistorySidebar() {
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.activeConversationId);
  const newConversation = useStore((s) => s.newConversation);
  const switchConversation = useStore((s) => s.switchConversation);
  const archiveConversation = useStore((s) => s.archiveConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const showArchived = useStore((s) => s.showArchived);
  const toggleShowArchived = useStore((s) => s.toggleShowArchived);
  const selectedIds = useStore((s) => s.selectedConvoIds);
  const toggleSelectConvo = useStore((s) => s.toggleSelectConvo);
  const selectAllConvos = useStore((s) => s.selectAllConvos);
  const clearConvoSelection = useStore((s) => s.clearConvoSelection);
  const archiveSelectedConvos = useStore((s) => s.archiveSelectedConvos);
  const unarchiveSelectedConvos = useStore((s) => s.unarchiveSelectedConvos);
  const deleteSelectedConvos = useStore((s) => s.deleteSelectedConvos);
  const showToast = useStore((s) => s.showToast);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; convo: Conversation } | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "unarchive" | "delete" | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const multiSelectActive = selectedIds.length > 0;

  const visibleConvos = conversations.filter((c) =>
    c.archived === showArchived &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  );

  const archivedCount = conversations.filter((c) => c.archived).length;
  const groups = showArchived ? null : groupConversations(visibleConvos);

  const hoveredConvo = hoveredId ? conversations.find((c) => c.id === hoveredId) : null;

  const handleContextMenu = useCallback((e: React.MouseEvent, convo: Conversation) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, convo });
  }, []);

  const handleRowHover = useCallback((id: string | null, rect?: DOMRect) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (id && rect) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredId(id);
        setHoveredRect(rect);
      }, 400); // delay before popover appears
    } else {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredId(null);
        setHoveredRect(null);
      }, 150);
    }
  }, []);

  const handleSelectAll = () => selectAllConvos(visibleConvos.map((c) => c.id));

  // Batch confirm
  if (confirm === "archive") {
    return <ConfirmDialog message={`Archive ${selectedIds.length} chat${selectedIds.length > 1 ? "s" : ""}?`}
      onConfirm={() => { archiveSelectedConvos(); showToast(`${selectedIds.length} chat(s) archived`); setConfirm(null); }}
      onCancel={() => setConfirm(null)} />;
  }
  if (confirm === "unarchive") {
    return <ConfirmDialog message={`Restore ${selectedIds.length} chat${selectedIds.length > 1 ? "s" : ""} from archive?`}
      onConfirm={() => { unarchiveSelectedConvos(); showToast(`${selectedIds.length} chat(s) restored`); setConfirm(null); }}
      onCancel={() => setConfirm(null)} />;
  }
  if (confirm === "delete") {
    return <ConfirmDialog message={`Permanently delete ${selectedIds.length} chat${selectedIds.length > 1 ? "s" : ""}? This cannot be undone.`}
      onConfirm={() => { deleteSelectedConvos(); showToast(`${selectedIds.length} chat(s) deleted`); setConfirm(null); }}
      onCancel={() => setConfirm(null)} />;
  }

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "#FAF8F3", borderRight: "1px solid #ECE7DC",
      fontFamily: "inherit", overflow: "hidden", userSelect: "none",
    }}>
      {/* ── Header: Search + controls ── */}
      <div style={{ padding: "12px 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Search row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#B0A99C" strokeWidth="1.6" strokeLinecap="round"
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={showArchived ? "Search archived…" : "Search chats…"}
              style={{
                width: "100%", height: 30, borderRadius: 8,
                border: "1px solid #ECE7DC", background: "#FFFFFF",
                paddingLeft: 28, paddingRight: 8, fontSize: 12.5, color: "#21201C",
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                transition: "border-color .15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#BD6A47"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#ECE7DC"; }}
            />
          </div>
          {/* Filter/archive toggle button */}
          <IconButton
            title={showArchived ? "Back to chats" : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}`}
            onClick={toggleShowArchived}
          >
            {showArchived ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="13" y1="8" x2="5" y2="8" /><polyline points="8,4.5 5,8 8,11.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M6.5 9h3" />
              </svg>
            )}
          </IconButton>
          {/* New chat button */}
          {!showArchived && (
            <IconButton title="New chat" onClick={() => newConversation()} accent>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </IconButton>
          )}
        </div>
      </div>

      {/* ── Multi-select toolbar — icon-only ── */}
      {multiSelectActive && (
        <div style={{
          padding: "4px 10px", borderTop: "1px solid #ECE7DC", borderBottom: "1px solid #ECE7DC",
          display: "flex", alignItems: "center", gap: 4, background: "#F5F0E8",
        }}>
          <span style={{ fontSize: 11, color: "#7C7468", flex: 1, fontWeight: 500 }}>{selectedIds.length} selected</span>
          {/* Select all */}
          <SmallBtn onClick={handleSelectAll} title="Select all">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" /><polyline points="5,8 7,10 11,6" />
            </svg>
          </SmallBtn>
          {/* Deselect all */}
          <SmallBtn onClick={clearConvoSelection} title="Deselect all">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
              <rect x="2" y="2" width="12" height="12" rx="2" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
            </svg>
          </SmallBtn>
          {!showArchived && (
            <SmallBtn onClick={() => setConfirm("archive")} title="Archive selected">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
                <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M6.5 9h3" />
              </svg>
            </SmallBtn>
          )}
          {showArchived && (
            <>
              <SmallBtn onClick={() => setConfirm("unarchive")} title="Restore selected">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
                  <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M8 9V12M6.5 10.5L8 12l1.5-1.5" />
                </svg>
              </SmallBtn>
              <SmallBtn onClick={() => setConfirm("delete")} title="Delete selected" danger>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#C75A3A" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M3 4h10M5.5 4V3h5v1M5 4v8.5h6V4" />
                </svg>
              </SmallBtn>
            </>
          )}
        </div>
      )}

      {/* ── Conversation list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {visibleConvos.length === 0 && (
          <div style={{ padding: "36px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#B0A99C", marginBottom: 6 }}>
              {showArchived ? "No archived chats" : search ? `No matches for "${search}"` : "No conversations yet"}
            </div>
            {!showArchived && !search && (
              <div style={{ fontSize: 11.5, color: "#C4BEB2" }}>Start chatting from the home screen</div>
            )}
          </div>
        )}

        {showArchived ? (
          visibleConvos.map((c) => (
            <ConvoRow key={c.id} convo={c} isActive={c.id === activeId}
              isSelected={selectedIds.includes(c.id)} multiSelectActive={multiSelectActive} isArchiveView
              onHover={handleRowHover} onSwitch={switchConversation}
              onToggleSelect={() => toggleSelectConvo(c.id)}
              onContextMenu={(e) => handleContextMenu(e, c)}
              onClose={(id) => { deleteConversation(id); showToast("Chat deleted"); }}
            />
          ))
        ) : groups && (
          <>
            <ConvoGroup label="Pinned" items={groups.pinned} icon="pin" activeId={activeId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={handleRowHover} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu}
              onClose={(id) => { archiveConversation(id); showToast("Chat archived"); }}
            />
            <ConvoGroup label="Today" items={groups.today} activeId={activeId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={handleRowHover} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu}
              onClose={(id) => { archiveConversation(id); showToast("Chat archived"); }}
            />
            <ConvoGroup label="This week" items={groups.week} activeId={activeId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={handleRowHover} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu}
              onClose={(id) => { archiveConversation(id); showToast("Chat archived"); }}
            />
            <ConvoGroup label="Older" items={groups.older} activeId={activeId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={handleRowHover} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu}
              onClose={(id) => { archiveConversation(id); showToast("Chat archived"); }}
            />
          </>
        )}
      </div>

      {/* ── Context menu portal ── */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} convo={contextMenu.convo}
          isArchiveView={showArchived} onClose={() => setContextMenu(null)} />
      )}

      {/* ── Hover popover ── */}
      {hoveredConvo && hoveredRect && !contextMenu && !multiSelectActive && (
        <HoverPopover convo={hoveredConvo} anchorRect={hoveredRect} />
      )}
    </div>
  );
}

/* ── Icon button (header) ── */
function IconButton({ children, onClick, title, accent }: {
  children: React.ReactNode; onClick: () => void; title: string; accent?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        border: `1px solid ${hovered ? (accent ? "#BD6A47" : "#D4C9B8") : "#ECE7DC"}`,
        background: hovered ? (accent ? "#FDF5F0" : "#F0EDE6") : "transparent",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: hovered ? (accent ? "#BD6A47" : "#7C7468") : "#A8A194",
        transition: "all .15s ease",
      }}
    >{children}</button>
  );
}

/* ── Small batch action button (icon-only) ── */
function SmallBtn({ children, onClick, title, danger }: {
  children: React.ReactNode; onClick: () => void; title?: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 24, height: 24, border: "1px solid #E0DAD0", background: "#FFFFFF",
      borderRadius: 6, padding: 0, color: danger ? "#C75A3A" : "#7C7468",
      cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
    }}>{children}</button>
  );
}

/* ── Group section ── */
function ConvoGroup({ label, items, icon, activeId, selectedIds, multiSelectActive, onHover, onSwitch, onToggleSelect, onContextMenu, onClose }: {
  label: string;
  items: Conversation[];
  icon?: string;
  activeId: string | null;
  selectedIds: string[];
  multiSelectActive: boolean;
  onHover: (id: string | null, rect?: DOMRect) => void;
  onSwitch: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, convo: Conversation) => void;
  onClose: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, color: "#B0A99C", textTransform: "uppercase",
        letterSpacing: "0.05em", padding: "10px 8px 4px",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        {icon === "pin" && (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#B0A99C" strokeWidth="1.5" strokeLinecap="round">
            <path d="M5.5 2.5L10.5 2.5L11.5 7L9 9.5V12.5L7 14.5L7 9.5L4.5 7Z" />
          </svg>
        )}
        {label}
      </div>
      {items.map((c) => (
        <ConvoRow key={c.id} convo={c} isActive={c.id === activeId}
          isSelected={selectedIds.includes(c.id)} multiSelectActive={multiSelectActive}
          onHover={onHover} onSwitch={onSwitch}
          onToggleSelect={() => onToggleSelect(c.id)}
          onContextMenu={(e) => onContextMenu(e, c)}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

/* ── Single conversation row — Claude Code tabs style ── */
function ConvoRow({ convo, isActive, isSelected, multiSelectActive, isArchiveView, onHover, onSwitch, onToggleSelect, onContextMenu, onClose }: {
  convo: Conversation;
  isActive: boolean;
  isSelected: boolean;
  multiSelectActive: boolean;
  isArchiveView?: boolean;
  onHover: (id: string | null, rect?: DOMRect) => void;
  onSwitch: (id: string) => void;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClose: (id: string) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const msgCount = convo.messages.length;
  const lastUserMsg = convo.messages.filter((m) => m.isUser).pop()?.text || "";
  const subtitle = lastUserMsg
    ? lastUserMsg.slice(0, 60) + (lastUserMsg.length > 60 ? "…" : "")
    : `${msgCount} message${msgCount !== 1 ? "s" : ""}`;

  const handleClick = () => {
    if (multiSelectActive) onToggleSelect();
    else onSwitch(convo.id);
  };

  const handleMouseEnter = () => {
    setHovered(true);
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) onHover(convo.id, rect);
  };
  const handleMouseLeave = () => {
    setHovered(false);
    onHover(null);
  };

  const bg = isSelected ? "#EDE6DA"
    : isActive ? "#F0EDE6"
    : hovered ? "#F7F5F0"
    : "transparent";

  return (
    <button
      ref={rowRef}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "6px 6px 6px 8px", borderRadius: 8,
        border: isSelected ? "1px solid #D4C9B8" : isActive ? "1px solid #ECE7DC" : "1px solid transparent",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        background: bg, transition: "all .1s ease", position: "relative", overflow: "visible",
      }}
    >
      {/* Left icon: checkbox on hover / multi-select, terminal icon otherwise */}
      <div style={{ flexShrink: 0 }}>
        {(multiSelectActive || isSelected || hovered) ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            style={{
              width: 26, height: 26, borderRadius: 6, display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
              boxSizing: "border-box" as const,
              background: isSelected ? "#BD6A47" : hovered ? "#F0EDE6" : "transparent",
              border: isSelected ? "1.5px solid #BD6A47" : "1.5px solid #C4BEB2",
              transition: "all .1s",
            }}
          >
            {isSelected ? (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2.5,6 5,8.5 9.5,3.5" />
              </svg>
            ) : (
              /* Empty checkbox hint */
              null
            )}
          </span>
        ) : (
          /* Terminal-style icon ">_" */
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: isActive ? "#F3E9E1" : "#F5F3ED",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background .1s",
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
              stroke={isActive ? "#BD6A47" : "#A8A194"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5l3 3-3 3" /><path d="M9 11h3" />
            </svg>
          </div>
        )}
      </div>

      {/* Title + subtitle */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 4, height: 18,
        }}>
          {convo.pinned && !isArchiveView && (
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#BD6A47" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M5.5 2.5L10.5 2.5L11.5 7L9 9.5V12.5L7 14.5L7 9.5L4.5 7Z" />
            </svg>
          )}
          <MarqueeTitle
            text={convo.title}
            always={isActive}
            externalHover={hovered}
            style={{
              fontSize: 13, lineHeight: "18px", fontWeight: isActive ? 600 : 500, color: isActive ? "#21201C" : "#4A4640",
              flex: 1, minWidth: 0,
            }}
          />
        </div>
        <div style={{
          fontSize: 11.5, color: "#A8A194", marginTop: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {/* Branch-style icon before subtitle */}
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#C4BEB2" strokeWidth="1.4" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="4" cy="4" r="1.5" /><circle cx="12" cy="12" r="1.5" /><path d="M4 5.5v3c0 2 2 3.5 4 3.5h2.5" />
          </svg>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</span>
        </div>
      </div>

      {/* Right: timestamp (always visible, fades on hover) */}
      <div style={{ flexShrink: 0, opacity: hovered && !multiSelectActive ? 0 : 1, transition: "opacity .1s" }}>
        <span style={{ fontSize: 10, color: "#C4BEB2", whiteSpace: "nowrap" }}>
          {relativeTime(convo.updatedAt)}
        </span>
      </div>

      {/* Floating clip — 3-dot + X at top-right corner, overlapping card edge */}
      {hovered && !multiSelectActive && (
        <div style={{
          position: "absolute", top: -6, right: -4, zIndex: 2,
          display: "flex", alignItems: "center", gap: 1,
          background: "#FFFFFF", border: "1px solid #E0DAD0", borderRadius: 6,
          padding: "2px 3px",
          boxShadow: "0 2px 8px rgba(40,36,28,.1)",
        }}>
          {/* 3-dot menu */}
          <span
            onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
            title="More"
            style={{
              width: 20, height: 20, borderRadius: 4,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#B0A99C", transition: "all .1s",
            }}
            onMouseEnter={(e) => { const t = e.currentTarget as HTMLElement; t.style.color = "#7C7468"; t.style.background = "#F0EDE6"; }}
            onMouseLeave={(e) => { const t = e.currentTarget as HTMLElement; t.style.color = "#B0A99C"; t.style.background = "transparent"; }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="4" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12" cy="8" r="1.3" />
            </svg>
          </span>
          {/* X close button */}
          <span
            onClick={(e) => { e.stopPropagation(); onClose(convo.id); }}
            title={isArchiveView ? "Delete" : "Archive"}
            style={{
              width: 20, height: 20, borderRadius: 4,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#C4BEB2", transition: "all .1s",
            }}
            onMouseEnter={(e) => { const t = e.currentTarget as HTMLElement; t.style.color = "#C75A3A"; t.style.background = "#FEF3F0"; }}
            onMouseLeave={(e) => { const t = e.currentTarget as HTMLElement; t.style.color = "#C4BEB2"; t.style.background = "transparent"; }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </span>
        </div>
      )}
    </button>
  );
}
