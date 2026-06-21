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
        boxShadow: "0 12px 40px rgba(40,36,28,.15)",
        fontFamily: "inherit",
      }}>
        <p style={{ margin: "0 0 18px", fontSize: 14, color: "#3F3B33", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "1px solid #E0DAD0",
              background: "#FFFFFF", color: "#56524A", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: "#C75A3A", color: "#FFFFFF", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Confirm</button>
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
          <input
            ref={renameRef}
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameDraft.trim()) {
                renameConversation(convo.id, renameDraft.trim());
                showToast("Chat renamed");
                onClose();
              }
              if (e.key === "Escape") onClose();
            }}
            style={{
              width: "100%", border: "1px solid #E0DAD0", borderRadius: 6, padding: "5px 8px",
              fontSize: 13, fontFamily: "inherit", outline: "none", color: "#21201C",
              boxSizing: "border-box",
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
          <button
            key={i}
            onClick={item.action}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", border: "none", background: "transparent",
              cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", textAlign: "left",
              color: item.danger ? "#C75A3A" : "#4A463E",
              transition: "background .08s",
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

/* ════════════════════════════════════════════════════════════════
   ChatHistorySidebar — Pinned, Grouped, Archived, Multi-select
   ════════════════════════════════════════════════════════════════ */
export default function ChatHistorySidebar() {
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.activeConversationId);
  const newConversation = useStore((s) => s.newConversation);
  const switchConversation = useStore((s) => s.switchConversation);
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
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; convo: Conversation } | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "unarchive" | "delete" | null>(null);

  const multiSelectActive = selectedIds.length > 0;

  // Filter by active/archived and search
  const visibleConvos = conversations.filter((c) =>
    c.archived === showArchived &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  );

  const archivedCount = conversations.filter((c) => c.archived).length;
  const groups = showArchived ? null : groupConversations(visibleConvos);

  const handleContextMenu = useCallback((e: React.MouseEvent, convo: Conversation) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, convo });
  }, []);

  const handleSelectAll = () => {
    selectAllConvos(visibleConvos.map((c) => c.id));
  };

  // Batch confirm handlers
  if (confirm === "archive") {
    return <ConfirmDialog
      message={`Archive ${selectedIds.length} chat${selectedIds.length > 1 ? "s" : ""}?`}
      onConfirm={() => { archiveSelectedConvos(); showToast(`${selectedIds.length} chat(s) archived`); setConfirm(null); }}
      onCancel={() => setConfirm(null)}
    />;
  }
  if (confirm === "unarchive") {
    return <ConfirmDialog
      message={`Restore ${selectedIds.length} chat${selectedIds.length > 1 ? "s" : ""} from archive?`}
      onConfirm={() => { unarchiveSelectedConvos(); showToast(`${selectedIds.length} chat(s) restored`); setConfirm(null); }}
      onCancel={() => setConfirm(null)}
    />;
  }
  if (confirm === "delete") {
    return <ConfirmDialog
      message={`Permanently delete ${selectedIds.length} chat${selectedIds.length > 1 ? "s" : ""}? This cannot be undone.`}
      onConfirm={() => { deleteSelectedConvos(); showToast(`${selectedIds.length} chat(s) deleted`); setConfirm(null); }}
      onCancel={() => setConfirm(null)}
    />;
  }

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "#FAF8F3", borderRight: "1px solid #ECE7DC",
      fontFamily: "inherit", overflow: "hidden", userSelect: "none",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 10,
        borderBottom: "1px solid #ECE7DC",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#9A958A", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {showArchived ? "Archived" : "Chats"}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {!showArchived && (
              <button
                onClick={() => newConversation()}
                title="New chat"
                style={{
                  width: 26, height: 26, borderRadius: 7,
                  border: "1px solid #E0DAD0", background: "transparent",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#8A8578", transition: "all .15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F0EDE6"; e.currentTarget.style.borderColor = "#BD6A47"; e.currentTarget.style.color = "#BD6A47"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#E0DAD0"; e.currentTarget.style.color = "#8A8578"; }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#B0A99C" strokeWidth="1.6" strokeLinecap="round"
            style={{ position: "absolute", left: 8, top: 7, pointerEvents: "none" }}>
            <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={showArchived ? "Search archived…" : "Search chats…"}
            style={{
              width: "100%", height: 28, borderRadius: 7,
              border: "1px solid #ECE7DC", background: "#FFFFFF",
              paddingLeft: 28, paddingRight: 8, fontSize: 12, color: "#21201C",
              outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#BD6A47"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#ECE7DC"; }}
          />
        </div>
      </div>

      {/* Multi-select toolbar */}
      {multiSelectActive && (
        <div style={{
          padding: "6px 10px", borderBottom: "1px solid #ECE7DC",
          display: "flex", alignItems: "center", gap: 6, background: "#F5F0E8",
        }}>
          <span style={{ fontSize: 11, color: "#7C7468", flex: 1 }}>
            {selectedIds.length} selected
          </span>
          <button onClick={handleSelectAll} title="Select all"
            style={batchBtnStyle}>All</button>
          <button onClick={clearConvoSelection} title="Clear selection"
            style={batchBtnStyle}>Clear</button>
          {!showArchived && (
            <button onClick={() => setConfirm("archive")} title="Archive selected"
              style={batchBtnStyle}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
                <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M6.5 9h3" />
              </svg>
            </button>
          )}
          {showArchived && (
            <>
              <button onClick={() => setConfirm("unarchive")} title="Restore selected"
                style={batchBtnStyle}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#8A8578" strokeWidth="1.4" strokeLinecap="round">
                  <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M8 9V12M6.5 10.5L8 12l1.5-1.5" />
                </svg>
              </button>
              <button onClick={() => setConfirm("delete")} title="Delete selected"
                style={{ ...batchBtnStyle, color: "#C75A3A" }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#C75A3A" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M3 4h10M5.5 4V3h5v1M5 4v8.5h6V4" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {visibleConvos.length === 0 && (
          <div style={{ padding: "32px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#B0A99C", marginBottom: 6 }}>
              {showArchived ? "No archived chats" : search ? `No matches for "${search}"` : "No conversations yet"}
            </div>
            {!showArchived && !search && (
              <div style={{ fontSize: 11.5, color: "#C4BEB2" }}>Start chatting from the home screen</div>
            )}
          </div>
        )}

        {showArchived ? (
          /* Archived: flat list, no time groups */
          visibleConvos.map((c) => (
            <ConvoRow key={c.id} convo={c} isActive={c.id === activeId} isHovered={c.id === hoveredId}
              isSelected={selectedIds.includes(c.id)} multiSelectActive={multiSelectActive} isArchiveView
              onHover={setHoveredId} onSwitch={switchConversation}
              onToggleSelect={() => toggleSelectConvo(c.id)}
              onContextMenu={(e) => handleContextMenu(e, c)} />
          ))
        ) : groups && (
          <>
            <ConvoGroup label="Pinned" items={groups.pinned} icon="pin" activeId={activeId} hoveredId={hoveredId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={setHoveredId} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu} />
            <ConvoGroup label="Today" items={groups.today} activeId={activeId} hoveredId={hoveredId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={setHoveredId} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu} />
            <ConvoGroup label="This week" items={groups.week} activeId={activeId} hoveredId={hoveredId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={setHoveredId} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu} />
            <ConvoGroup label="Older" items={groups.older} activeId={activeId} hoveredId={hoveredId}
              selectedIds={selectedIds} multiSelectActive={multiSelectActive}
              onHover={setHoveredId} onSwitch={switchConversation}
              onToggleSelect={(id) => toggleSelectConvo(id)}
              onContextMenu={handleContextMenu} />
          </>
        )}
      </div>

      {/* Footer — Archive toggle */}
      <button
        onClick={toggleShowArchived}
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderTop: "1px solid #ECE7DC",
          border: "none", borderTopStyle: "solid", borderTopWidth: 1, borderTopColor: "#ECE7DC",
          background: "transparent", cursor: "pointer", fontFamily: "inherit",
          fontSize: 12, color: "#9A958A", width: "100%", textAlign: "left",
          transition: "background .1s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#F0EDE6"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          {showArchived ? (
            <><line x1="14" y1="8" x2="4" y2="8" /><polyline points="8,4.5 4,8 8,11.5" /></>
          ) : (
            <><rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M6.5 9h3" /></>
          )}
        </svg>
        {showArchived ? "Back to chats" : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}`}
      </button>

      {/* Context menu portal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          convo={contextMenu.convo}
          isArchiveView={showArchived}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

/* ── batch action button style ── */
const batchBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "1px solid #E0DAD0", background: "#FFFFFF", borderRadius: 6,
  padding: "3px 8px", fontSize: 11, color: "#7C7468", cursor: "pointer",
  fontFamily: "inherit", gap: 4,
};

/* ── Group section ── */
function ConvoGroup({ label, items, icon, activeId, hoveredId, selectedIds, multiSelectActive, onHover, onSwitch, onToggleSelect, onContextMenu }: {
  label: string;
  items: Conversation[];
  icon?: string;
  activeId: string | null;
  hoveredId: string | null;
  selectedIds: string[];
  multiSelectActive: boolean;
  onHover: (id: string | null) => void;
  onSwitch: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, convo: Conversation) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, color: "#B0A99C", textTransform: "uppercase",
        letterSpacing: "0.05em", padding: "8px 6px 4px",
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
        <ConvoRow key={c.id} convo={c} isActive={c.id === activeId} isHovered={c.id === hoveredId}
          isSelected={selectedIds.includes(c.id)} multiSelectActive={multiSelectActive}
          onHover={onHover} onSwitch={onSwitch}
          onToggleSelect={() => onToggleSelect(c.id)}
          onContextMenu={(e) => onContextMenu(e, c)} />
      ))}
    </div>
  );
}

/* ── Single conversation row ── */
function ConvoRow({ convo, isActive, isHovered, isSelected, multiSelectActive, isArchiveView, onHover, onSwitch, onToggleSelect, onContextMenu }: {
  convo: Conversation;
  isActive: boolean;
  isHovered: boolean;
  isSelected: boolean;
  multiSelectActive: boolean;
  isArchiveView?: boolean;
  onHover: (id: string | null) => void;
  onSwitch: (id: string) => void;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const msgCount = convo.messages.length;
  const preview = convo.messages.find((m) => m.isUser)?.text || "";

  const handleClick = () => {
    if (multiSelectActive) {
      onToggleSelect();
    } else {
      onSwitch(convo.id);
    }
  };

  const bg = isSelected ? "#EDE6DA" : isActive ? "#F0EDE6" : isHovered ? "#F5F3ED" : "transparent";

  return (
    <button
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => onHover(convo.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        width: "100%", display: "flex", flexDirection: "column", gap: 2,
        padding: "8px 10px", borderRadius: 9,
        border: isSelected ? "1px solid #D4C9B8" : "1px solid transparent",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        background: bg, transition: "background .12s ease",
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        {/* Checkbox on hover or in multi-select; chat icon otherwise */}
        {(multiSelectActive || isSelected || isHovered) ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            style={{
              width: 14, height: 14, borderRadius: 4, flexShrink: 0,
              border: isSelected ? "none" : "1.5px solid #C4BEB2",
              background: isSelected ? "#BD6A47" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2.5,6 5,8.5 9.5,3.5" />
              </svg>
            )}
          </span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={isActive ? "#BD6A47" : "#A8A194"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M2 3h12v8H5l-3 3V3z" />
          </svg>
        )}
        {/* Pin indicator */}
        {convo.pinned && !isArchiveView && (
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#BD6A47" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginLeft: -2 }}>
            <path d="M5.5 2.5L10.5 2.5L11.5 7L9 9.5V12.5L7 14.5L7 9.5L4.5 7Z" />
          </svg>
        )}
        <MarqueeTitle
          text={convo.title}
          always={isActive}
          style={{
            fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "#21201C" : "#4A4640",
            flex: 1, minWidth: 0,
          }}
        />
        {/* 3-dot menu on hover */}
        {isHovered && !multiSelectActive && (
          <span
            onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
            title="More"
            style={{
              width: 20, height: 20, borderRadius: 5,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#B0A99C", cursor: "pointer", flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#7C7468"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#B0A99C"; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="4" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12" cy="8" r="1.3" />
            </svg>
          </span>
        )}
      </div>
      {/* Preview + meta */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, paddingLeft: multiSelectActive ? 20 : 18,
      }}>
        {preview && (
          <span style={{
            fontSize: 11, color: "#A8A194", flex: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{preview.slice(0, 80)}</span>
        )}
        <span style={{ fontSize: 10, color: "#C4BEB2", flexShrink: 0 }}>
          {msgCount > 0 && `${msgCount} · `}{relativeTime(convo.updatedAt)}
        </span>
      </div>
    </button>
  );
}
