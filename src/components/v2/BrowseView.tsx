import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useStore, getColorMeta } from "@/store";
import type { CaptureOverview } from "@/lib/ipc";
import MarqueeTitle from "./MarqueeTitle";
import ConfirmDialog from "./ConfirmDialog";

/* ────── Relative time helper ────── */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return dateStr;
  const diff = now - then;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/* ────── Types ────── */
type ViewMode = "list" | "grid";
type SortField = "date" | "title" | "space";
type SortDir = "asc" | "desc";

/* ────── Persisted preferences ────── */
function loadViewMode(): ViewMode {
  try { return (localStorage.getItem("brainos_browse_view") as ViewMode) || "list"; } catch { return "list"; }
}

/* ────── List row constants ────── */
const ROW_H = 52;
const ROW_GAP = 0;
const OVERSCAN = 8;

/* ────── Sort comparator ────── */
function sortCaptures(list: CaptureOverview[], field: SortField, dir: SortDir): CaptureOverview[] {
  const sorted = [...list];
  const m = dir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (field) {
      case "date": return m * (new Date(a.date).getTime() - new Date(b.date).getTime());
      case "title": return m * a.title.localeCompare(b.title);
      case "space": return m * a.space.localeCompare(b.space);
      default: return 0;
    }
  });
  return sorted;
}

/* ════════════════════════════════════════════════════════════════
   BrowseView — Advanced data table with list / grid toggle
   ════════════════════════════════════════════════════════════════ */
export default function BrowseView() {
  const captures = useStore((s) => s.captures);
  const browseFilter = useStore((s) => s.browseFilter);
  const openDetail = useStore((s) => s.openDetail);
  const favorites = useStore((s) => s.favorites);
  const favorite = useStore((s) => s.favorite);
  const unfavorite = useStore((s) => s.unfavorite);
  const deleteCapture = useStore((s) => s.deleteCapture);
  const openNew = useStore((s) => s.openNew);
  const captureCache = useStore((s) => s.captureCache);
  const attach = useStore((s) => s.attach);
  const showToast = useStore((s) => s.showToast);
  const loadCapture = useStore((s) => s.loadCapture);

  // ── Local state ──
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [quickFilter, setQuickFilter] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [browseMode, setBrowseMode] = useState<"active" | "favorites" | "archived">("active");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<"archive" | "unarchive" | "delete" | null>(null);
  const archiveCapture = useStore((s) => s.archiveCapture);
  const unarchiveCapture = useStore((s) => s.unarchiveCapture);

  // Multi-select helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Explorer state from store (tags multi-select + search)
  const selectedTags = useStore((s) => s.selectedTags);


  // Virtualization (list mode)
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist view mode
  const changeView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem("brainos_browse_view", mode); } catch { /* */ }
  }, []);

  // Toggle sort column
  const setSort = useCallback((field: SortField, dir: SortDir) => {
    setSortField(field);
    setSortDir(dir);
  }, []);

  // Close menu on any outside click (global)
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    // Use setTimeout so the click that opened the menu doesn't immediately close it
    const id = setTimeout(() => {
      document.addEventListener("click", handler);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", handler);
    };
  }, [menuOpenId]);

  // ── Filtered → sorted data ──
  const filtered = useMemo(() => {
    let list = captures;
    // Mode filter: active / favorites / archived (mutually exclusive)
    if (browseMode === "archived") {
      list = list.filter((c) => c.status === "archived");
    } else if (browseMode === "favorites") {
      list = list.filter((c) => c.status !== "archived" && favorites.includes(c.id));
    } else {
      list = list.filter((c) => c.status !== "archived");
    }
    // Apply sidebar browseFilter (space / project)
    if (browseFilter.kind === "space" && browseFilter.value) list = list.filter((c) => c.space === browseFilter.value);
    if (browseFilter.kind === "project" && browseFilter.value) list = list.filter((c) => c.projects.includes(browseFilter.value!));
    // Apply multi-select tags from explorer
    if (selectedTags.length > 0) list = list.filter((c) => selectedTags.every((t) => c.tags.includes(t)));
    // Apply toolbar quick filter
    if (quickFilter.trim()) {
      const q = quickFilter.toLowerCase();
      list = list.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.space.toLowerCase().includes(q)
      );
    }
    return sortCaptures(list, sortField, sortDir);
  }, [captures, browseFilter, selectedTags, sortField, sortDir, quickFilter, browseMode, favorites]);

  // selectAll + bulk actions (need `filtered` in scope)
  const selectAll = useCallback(() => {
    const allIds = new Set(filtered.map((c) => c.id));
    const allSelected = allIds.size > 0 && allIds.size === selectedIds.size && [...allIds].every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : allIds);
  }, [filtered, selectedIds]);
  const bulkArchive = useCallback(async () => {
    for (const id of selectedIds) await archiveCapture(id);
    setSelectedIds(new Set());
    setConfirmAction(null);
  }, [selectedIds, archiveCapture]);
  const bulkUnarchive = useCallback(async () => {
    for (const id of selectedIds) await unarchiveCapture(id);
    setSelectedIds(new Set());
    setConfirmAction(null);
  }, [selectedIds, unarchiveCapture]);
  const bulkDelete = useCallback(async () => {
    for (const id of selectedIds) await deleteCapture(id);
    setSelectedIds(new Set());
    setConfirmAction(null);
  }, [selectedIds, deleteCapture]);

  // Clear selection when filters change
  useEffect(() => { setSelectedIds(new Set()); }, [browseMode, browseFilter, selectedTags]);

  // ── Virtualization helpers ──
  const totalHeight = filtered.length * (ROW_H + ROW_GAP);
  const { startIdx, endIdx } = useMemo(() => {
    if (filtered.length === 0) return { startIdx: 0, endIdx: 0 };
    const start = Math.max(0, Math.floor(scrollTop / (ROW_H + ROW_GAP)) - OVERSCAN);
    const visibleCount = Math.ceil(viewportH / (ROW_H + ROW_GAP));
    const end = Math.min(filtered.length, start + visibleCount + OVERSCAN * 2);
    return { startIdx: start, endIdx: end };
  }, [filtered.length, scrollTop, viewportH]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setViewportH(e.contentRect.height);
    });
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    setScrollTop(0);
  }, [browseFilter, selectedTags, sortField, sortDir, quickFilter]);

  const count = filtered.length;
  const countLabel = `${count} capture${count !== 1 ? "s" : ""}`;

  // Ripple handler for New capture button
  const newBtnRef = useRef<HTMLButtonElement>(null);
  const handleNewClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = newBtnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 2;
      const circle = document.createElement("span");
      circle.className = "ripple-circle";
      circle.style.width = `${size}px`;
      circle.style.height = `${size}px`;
      circle.style.left = `${x - size / 2}px`;
      circle.style.top = `${y - size / 2}px`;
      circle.style.background = "var(--bg-card-soft)";
      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    }
    openNew();
  }, [openNew]);

  // Quick action handlers for capture menu
  const handleCopy = useCallback(async (id: string) => {
    try {
      const capture = await loadCapture(id);
      if (capture) {
        const text = (capture as { body_text?: string }).body_text || "";
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard");
      }
    } catch { showToast("Failed to copy"); }
  }, [loadCapture, showToast]);

  const handleEdit = useCallback((id: string) => {
    openDetail(id);
  }, [openDetail]);

  const handleAddToChat = useCallback((id: string) => {
    attach(id);
    showToast("Added to chat context");
  }, [attach, showToast]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {/* ── Header ── */}
      <div style={{
        flex: "none", display: "flex", alignItems: "center", gap: 14,
        padding: "16px 24px 0",
      }}>
        <h2 style={S.heading}>{browseFilter.label}</h2>
        <span style={S.count}>{countLabel}</span>
      </div>

      {/* ── Toolbar: Search (flex) → Filter → List/Grid → New ── */}
      <div style={S.toolbar}>
        {/* Search — takes remaining space */}
        <div style={S.filterWrap}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-dimmed)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="4.5" /><line x1="10.2" y1="10.2" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            placeholder="Search captures…"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            style={S.filterInput}
          />
          {quickFilter && (
            <button onClick={() => setQuickFilter("")} style={S.clearBtn}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <SortDropdown field={sortField} dir={sortDir} onSort={setSort} />

        {/* Mode toggles — mutually exclusive: Active / Favorites / Archived */}
        <button
          onClick={() => setBrowseMode((p) => p === "favorites" ? "active" : "favorites")}
          title={browseMode === "favorites" ? "Show all captures" : "Show favorites only"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30,
            border: `1px solid ${browseMode === "favorites" ? "var(--border-subtle)" : "var(--border)"}`,
            background: browseMode === "favorites" ? "var(--accent-bg)" : "var(--bg-surface)",
            borderRadius: 7, cursor: "pointer",
            transition: "all .15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14"
            fill={browseMode === "favorites" ? "var(--accent)" : "none"}
            stroke={browseMode === "favorites" ? "none" : "var(--text-faint)"}
            strokeWidth="1.2"
          >
            <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" />
          </svg>
        </button>

        <button
          onClick={() => setBrowseMode((p) => p === "archived" ? "active" : "archived")}
          title={browseMode === "archived" ? "Show active captures" : "Show archived captures"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30,
            border: `1px solid ${browseMode === "archived" ? "var(--border-subtle)" : "var(--border)"}`,
            background: browseMode === "archived" ? "var(--bg-elevated)" : "var(--bg-surface)",
            borderRadius: 7, cursor: "pointer",
            transition: "all .15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16"
            fill="none"
            stroke={browseMode === "archived" ? "var(--accent-text)" : "var(--text-faint)"}
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="12" height="4" rx="1" />
            <path d="M3 7v5a1 1 0 001 1h8a1 1 0 001-1V7" />
            <line x1="6.5" y1="10" x2="9.5" y2="10" />
          </svg>
        </button>

        <ViewToggle mode={viewMode} onChange={changeView} />

        <button
          ref={newBtnRef}
          onClick={handleNewClick}
          className="ripple-container"
          style={S.newBtn}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7">
            <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
          </svg>
          New
        </button>
      </div>

      {/* ── Bulk action bar — icon-only, matches sidebar style ── */}
      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 24px", flexShrink: 0,
          background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            fontSize: 11, fontWeight: 500, color: "var(--text-muted)", flex: 1,
            fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          }}>
            {selectedIds.size} selected
          </span>
          {/* Select all */}
          <button onClick={selectAll} style={S.bulkIconBtn} title="Select all">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" /><polyline points="5,8 7,10 11,6" />
            </svg>
          </button>
          {/* Deselect all */}
          <button onClick={clearSelection} style={S.bulkIconBtn} title="Deselect all">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round">
              <rect x="2" y="2" width="12" height="12" rx="2" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
            </svg>
          </button>
          {browseMode !== "archived" && (
            <button onClick={() => setConfirmAction("archive")} style={S.bulkIconBtn} title="Archive selected">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round">
                <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M6.5 9h3" />
              </svg>
            </button>
          )}
          {browseMode === "archived" && (
            <>
              <button onClick={() => setConfirmAction("unarchive")} style={S.bulkIconBtn} title="Restore selected">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round">
                  <rect x="2" y="2" width="12" height="4" rx="1" /><path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" /><path d="M8 9V12M6.5 10.5L8 12l1.5-1.5" />
                </svg>
              </button>
              <button onClick={() => setConfirmAction("delete")} style={{ ...S.bulkIconBtn, }} title="Delete selected">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--danger)" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M3 4h10M5.5 4V3h5v1M5 4v8.5h6V4" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirmAction === "archive" && (
        <ConfirmDialog variant="archive" title={`Archive ${selectedIds.size} capture${selectedIds.size > 1 ? "s" : ""}?`}
          onConfirm={() => { bulkArchive(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)} />
      )}
      {confirmAction === "unarchive" && (
        <ConfirmDialog variant="restore" title={`Restore ${selectedIds.size} capture${selectedIds.size > 1 ? "s" : ""} from archive?`}
          onConfirm={() => { bulkUnarchive(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)} />
      )}
      {confirmAction === "delete" && (
        <ConfirmDialog variant="delete" title={`Delete ${selectedIds.size} capture${selectedIds.size > 1 ? "s" : ""}?`}
          onConfirm={() => { bulkDelete(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)} />
      )}

      {/* ── Content ── */}
      {viewMode === "list" ? (
        <ListView
          items={filtered}
          scrollRef={scrollRef}
          onScroll={handleScroll}
          totalHeight={totalHeight}
          startIdx={startIdx}
          endIdx={endIdx}
          menuOpenId={menuOpenId}
          setMenuOpenId={setMenuOpenId}
          openDetail={openDetail}
          favorites={favorites}
          favorite={favorite}
          unfavorite={unfavorite}
          deleteCapture={deleteCapture}
          archiveCapture={archiveCapture}
          unarchiveCapture={unarchiveCapture}
          isArchiveView={browseMode === "archived"}
          onCopy={handleCopy}
          onEdit={handleEdit}
          onAddToChat={handleAddToChat}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
        />
      ) : (
        <GridView
          items={filtered}
          menuOpenId={menuOpenId}
          setMenuOpenId={setMenuOpenId}
          openDetail={openDetail}
          favorites={favorites}
          favorite={favorite}
          unfavorite={unfavorite}
          deleteCapture={deleteCapture}
          archiveCapture={archiveCapture}
          unarchiveCapture={unarchiveCapture}
          isArchiveView={browseMode === "archived"}
          onCopy={handleCopy}
          onEdit={handleEdit}
          onAddToChat={handleAddToChat}
          captureCache={captureCache}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
        />
      )}

    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   List View — Notion-style rows with thumbnail, avatar, actions
   ════════════════════════════════════════════════════════════════ */
interface ListProps {
  items: CaptureOverview[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  totalHeight: number;
  startIdx: number;
  endIdx: number;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  openDetail: (id: string) => void;
  favorites: string[];
  favorite: (id: string) => void;
  unfavorite: (id: string) => void;
  deleteCapture: (id: string) => Promise<void>;
  archiveCapture: (id: string) => Promise<void>;
  unarchiveCapture: (id: string) => Promise<void>;
  isArchiveView: boolean;
  onCopy: (id: string) => void;
  onEdit: (id: string) => void;
  onAddToChat: (id: string) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
}

function ListView({
  items, scrollRef, onScroll, totalHeight, startIdx, endIdx,
  menuOpenId, setMenuOpenId,
  openDetail, favorites, favorite, unfavorite, deleteCapture,
  archiveCapture, unarchiveCapture, isArchiveView,
  onCopy, onEdit, onAddToChat,
  selectedIds, toggleSelect,
}: ListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedId = useStore((s) => s.selectedId);
  const detailOpen = useStore((s) => s.detailOpen);
  const anySelected = selectedIds.size > 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Rows — no column headers */}
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: totalHeight }}>
          {items.length === 0 && (
            <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-dimmed)" }}>
              No captures match this filter.
            </div>
          )}
          {items.slice(startIdx, endIdx).map((c, i) => {
            const idx = startIdx + i;
            const isHovered = hoveredId === c.id;
            const isMenuOpen = menuOpenId === c.id;
            const isFav = favorites.includes(c.id);
            const isSelected = selectedIds.has(c.id);
            const showCheckbox = anySelected || isHovered;
            return (
              <div
                key={c.id}
                onClick={() => {
                  if (menuOpenId) { setMenuOpenId(null); return; }
                  if (anySelected) { toggleSelect(c.id); return; }
                  openDetail(c.id);
                }}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: "absolute",
                  top: idx * (ROW_H + ROW_GAP),
                  left: 0, right: 0,
                  height: ROW_H,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 24px",
                  cursor: "pointer",
                  background: isSelected ? "var(--accent-bg)" : (isHovered || isMenuOpen ? "var(--bg-surface)" : "transparent"),
                  borderBottom: "1px solid var(--bg-hover)",
                  transition: "background .1s",
                  gap: 12,
                }}
              >
                {/* Selection checkbox */}
                <div
                  onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                  style={{
                    width: 18, height: 18, flexShrink: 0,
                    borderRadius: 4,
                    border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--text-ghost)"}`,
                    background: isSelected ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    opacity: showCheckbox ? 1 : 0,
                    transition: "opacity .12s, background .12s, border-color .12s",
                    marginRight: -4,
                  }}
                >
                  {isSelected && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--bg-card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5,6 5,8.5 9.5,3.5" />
                    </svg>
                  )}
                </div>

                {/* Thumbnail / doc icon */}
                <div style={{
                  width: 40, height: 32, flexShrink: 0,
                  background: getColorMeta(c.color).bg, borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-muted)",
                }}>
                  {c.icon ? (
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{c.icon}</span>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
                    </svg>
                  )}
                </div>

                {/* Title + tag pills */}
                <div style={{
                  flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
                  justifyContent: "center", gap: 2,
                }}>
                  <MarqueeTitle
                    text={c.title}
                    externalHover={isHovered}
                    always={detailOpen && selectedId === c.id}
                    style={{
                      fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)",
                      lineHeight: 1.3,
                      fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                    }}
                  />
                  {c.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 3, overflow: "hidden", height: 16 }}>
                      {c.tags.slice(0, 2).map((tag) => (
                        <span key={tag} style={S.tag}>{tag}</span>
                      ))}
                      {c.tags.length > 2 && (
                        <span style={{ ...S.tag, color: "var(--text-dimmed)", background: "transparent" }}>+{c.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Date */}
                <div style={{
                  flexShrink: 0, fontSize: 12, color: "var(--text-dimmed)",
                  whiteSpace: "nowrap", minWidth: 56, textAlign: "right",
                }}>
                  {relativeTime(c.date)}
                </div>

                {/* Avatar + name */}
                <div style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "var(--accent)", color: "var(--bg-card)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600,
                  }}>A</div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>You</span>
                </div>

                {/* Action buttons — visible on hover */}
                <div style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 2,
                  opacity: isHovered || isMenuOpen ? 1 : 0,
                  transition: "opacity .12s",
                }}>
                  {/* Copy link */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onCopy(c.id); }}
                    title="Copy"
                    style={{
                      width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                      border: "none", background: "transparent", color: "var(--text-faint)",
                      borderRadius: 5, cursor: "pointer",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-6A1.5 1.5 0 013.5 2h6A1.5 1.5 0 0111 3.5V5"/>
                    </svg>
                  </button>

                  {/* 3-dot menu */}
                  <CaptureMenu
                    isOpen={isMenuOpen}
                    onToggle={() => setMenuOpenId(isMenuOpen ? null : c.id)}
                    isFavorited={isFav}
                    isArchived={c.status === "archived"}
                    isArchiveView={isArchiveView}
                    onFavorite={() => { favorite(c.id); setMenuOpenId(null); }}
                    onUnfavorite={() => { unfavorite(c.id); setMenuOpenId(null); }}
                    onArchive={() => { archiveCapture(c.id); setMenuOpenId(null); }}
                    onUnarchive={() => { unarchiveCapture(c.id); setMenuOpenId(null); }}
                    onCopy={() => { onCopy(c.id); setMenuOpenId(null); }}
                    onEdit={() => { onEdit(c.id); setMenuOpenId(null); }}
                    onAddToChat={() => { onAddToChat(c.id); setMenuOpenId(null); }}
                    onDelete={() => { deleteCapture(c.id); setMenuOpenId(null); }}
                  />

                  {/* Star */}
                  <button
                    onClick={(e) => { e.stopPropagation(); isFav ? unfavorite(c.id) : favorite(c.id); }}
                    title={isFav ? "Unfavorite" : "Favorite"}
                    style={{
                      width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                      border: "none", background: "transparent",
                      color: isFav ? "var(--accent)" : "var(--text-faint)",
                      borderRadius: 5, cursor: "pointer",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14"
                      fill={isFav ? "var(--accent)" : "none"}
                      stroke={isFav ? "none" : "currentColor"}
                      strokeWidth="1.2"
                    >
                      <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Grid View — responsive card grid
   ════════════════════════════════════════════════════════════════ */
interface GridProps {
  items: CaptureOverview[];
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  openDetail: (id: string) => void;
  favorites: string[];
  favorite: (id: string) => void;
  unfavorite: (id: string) => void;
  deleteCapture: (id: string) => Promise<void>;
  archiveCapture: (id: string) => Promise<void>;
  unarchiveCapture: (id: string) => Promise<void>;
  isArchiveView: boolean;
  onCopy: (id: string) => void;
  onEdit: (id: string) => void;
  onAddToChat: (id: string) => void;
  captureCache: Record<string, unknown>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
}

function GridView({
  items, menuOpenId, setMenuOpenId,
  openDetail, favorites, favorite, unfavorite, deleteCapture,
  archiveCapture, unarchiveCapture, isArchiveView,
  onCopy, onEdit, onAddToChat,
  selectedIds, toggleSelect,
}: GridProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedId = useStore((s) => s.selectedId);
  const detailOpen = useStore((s) => s.detailOpen);
  const anySelected = selectedIds.size > 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>
      {items.length === 0 && (
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--text-dimmed)" }}>
          No captures match this filter.
        </div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
        gap: 14,
      }}>
        {items.map((c) => {
          const isHovered = hoveredId === c.id;
          const isMenuOpen = menuOpenId === c.id;
          const isFav = favorites.includes(c.id);
          const snippet = c.summary || "";
          const isSelected = selectedIds.has(c.id);
          const showCheckbox = anySelected || isHovered;

          return (
            <div
              key={c.id}
              onClick={() => {
                if (menuOpenId) { setMenuOpenId(null); return; }
                if (anySelected) { toggleSelect(c.id); return; }
                openDetail(c.id);
              }}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${isSelected ? "var(--border-subtle)" : (isHovered ? "var(--border-subtle)" : "var(--border)")}`,
                borderRadius: 14,
                cursor: "pointer",
                transition: "box-shadow .2s, border-color .2s, transform .2s",
                boxShadow: isSelected ? "0 0 0 2px rgba(var(--shadow-accent), .15)" : (isHovered ? "0 8px 28px rgba(var(--shadow-color), .09)" : "none"),
                transform: isHovered && !isSelected ? "translateY(-3px)" : "none",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {/* Selection checkbox — top-left of card */}
              <div
                onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                style={{
                  position: "absolute", top: 8, left: 8, zIndex: 10,
                  width: 20, height: 20, borderRadius: 5,
                  border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  background: isSelected ? "var(--accent)" : "var(--bg-card-translucent)",
                  backdropFilter: "blur(4px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                  opacity: showCheckbox ? 1 : 0,
                  transition: "opacity .12s, background .12s, border-color .12s",
                }}
              >
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--bg-card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2.5,6 5,8.5 9.5,3.5" />
                  </svg>
                )}
              </div>

              {/* Preview area — neutral warm with doc text preview */}
              <div style={{
                height: 170, background: getColorMeta(c.color).bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "14px 14px 0 0", overflow: "hidden",
                position: "relative",
              }}>
                {/* Faded text preview */}
                {snippet ? (
                  <div style={{
                    position: "absolute", inset: 16, top: 18,
                    fontSize: 10, lineHeight: "15px", color: "var(--text-muted)",
                    opacity: 0.3, overflow: "hidden",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    wordBreak: "break-word",
                    WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 95%)",
                    maskImage: "linear-gradient(to bottom, black 40%, transparent 95%)",
                  }}>
                    {snippet.slice(0, 400)}
                  </div>
                ) : null}
                {/* Centered document icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: "var(--bg-card-soft)",
                  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-muted)", zIndex: 1,
                }}>
                  {c.icon ? (
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{c.icon}</span>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
                    </svg>
                  )}
                </div>
              </div>

              {/* Hover-revealed action buttons — on card wrapper so dropdown isn't clipped */}
              <div style={{
                position: "absolute", top: 8, right: 8,
                display: "flex", gap: 4, zIndex: 10,
                opacity: isHovered || isMenuOpen ? 1 : 0,
                transition: "opacity .12s",
              }}>
                <CaptureMenu
                  isOpen={isMenuOpen}
                  onToggle={() => setMenuOpenId(isMenuOpen ? null : c.id)}
                  isFavorited={isFav}
                  isArchived={c.status === "archived"}
                  isArchiveView={isArchiveView}
                  onFavorite={() => { favorite(c.id); setMenuOpenId(null); }}
                  onUnfavorite={() => { unfavorite(c.id); setMenuOpenId(null); }}
                  onArchive={() => { archiveCapture(c.id); setMenuOpenId(null); }}
                  onUnarchive={() => { unarchiveCapture(c.id); setMenuOpenId(null); }}
                  onCopy={() => { onCopy(c.id); setMenuOpenId(null); }}
                  onEdit={() => { onEdit(c.id); setMenuOpenId(null); }}
                  onAddToChat={() => { onAddToChat(c.id); setMenuOpenId(null); }}
                  onDelete={() => { deleteCapture(c.id); setMenuOpenId(null); }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); isFav ? unfavorite(c.id) : favorite(c.id); }}
                  title={isFav ? "Unfavorite" : "Favorite"}
                  style={{
                    width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", background: "var(--bg-card-translucent)", backdropFilter: "blur(4px)",
                    color: isFav ? "var(--accent)" : "var(--text-muted)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14"
                    fill={isFav ? "var(--accent)" : "none"}
                    stroke={isFav ? "none" : "currentColor"}
                    strokeWidth="1.3"
                  >
                    <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z"/>
                  </svg>
                </button>
              </div>

              {/* Card body — title, snippet, tags, metadata */}
              <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <MarqueeTitle
                  text={c.title}
                  externalHover={isHovered}
                  always={detailOpen && selectedId === c.id}
                  style={{
                    fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)",
                    lineHeight: "20px",
                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                  }}
                />

                {/* Snippet */}
                {snippet && (
                  <span style={{
                    fontSize: 12, lineHeight: "17px", color: "var(--text-muted)",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>{snippet}</span>
                )}

                {/* Tags */}
                {c.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                    {c.tags.slice(0, 3).map((tag) => (
                      <span key={tag} style={{
                        fontSize: 10, color: "var(--text-faint)", background: "var(--bg-elevated)",
                        borderRadius: 4, padding: "1px 6px", fontWeight: 500,
                      }}>#{tag}</span>
                    ))}
                    {c.tags.length > 3 && (
                      <span style={{ fontSize: 10, color: "var(--text-dimmed)" }}>+{c.tags.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Avatar + date */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "var(--bg-badge)", color: "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 600, flexShrink: 0,
                  }}>Y</div>
                  <span style={{ fontSize: 11.5, color: "var(--text-dimmed)", fontWeight: 450 }}>You</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-ghost)" }}>·</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-dimmed)" }}>{relativeTime(c.date)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SortDropdown — compact sort selector for toolbar
   ════════════════════════════════════════════════════════════════ */
const SORT_OPTIONS: { field: SortField; dir: SortDir; label: string }[] = [
  { field: "date", dir: "desc", label: "Date (newest)" },
  { field: "date", dir: "asc", label: "Date (oldest)" },
  { field: "title", dir: "asc", label: "Title (A → Z)" },
  { field: "title", dir: "desc", label: "Title (Z → A)" },
];

function SortDropdown({ field, dir, onSort }: {
  field: SortField; dir: SortDir;
  onSort: (f: SortField, d: SortDir) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("click", handler); };
  }, [open]);

  const current = SORT_OPTIONS.find((o) => o.field === field && o.dir === dir)
    || SORT_OPTIONS[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          border: "1px solid var(--border)", background: "var(--bg-surface)",
          borderRadius: 7, padding: "5px 10px", fontSize: 12,
          color: "var(--text-secondary)", cursor: "pointer",
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          transition: "all .15s",
          whiteSpace: "nowrap" as const,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 3v10M4 13l-2.5-2.5M4 13l2.5-2.5M12 13V3M12 3l-2.5 2.5M12 3l2.5 2.5" />
        </svg>
        {current.label}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1.5 3L4 5.5L6.5 3" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 28px rgba(var(--shadow-color), .12), 0 2px 8px rgba(var(--shadow-color), .06)",
          padding: 4, zIndex: 50, minWidth: 160,
          animation: "scaleIn .12s ease-out",
        }}>
          {SORT_OPTIONS.map((opt) => {
            const active = opt.field === field && opt.dir === dir;
            return (
              <button
                key={`${opt.field}-${opt.dir}`}
                onClick={() => {
                  onSort(opt.field, opt.dir);
                  setOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  border: "none", background: active ? "var(--bg-elevated)" : "transparent",
                  borderRadius: 7, padding: "7px 10px", fontSize: 12.5,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                  transition: "background .1s",
                }}
              >
                <span style={{ width: 14, fontSize: 11, color: "var(--accent)" }}>
                  {active ? "✓" : ""}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CaptureMenu — 3-dot dropdown with quick actions
   ════════════════════════════════════════════════════════════════ */
function CaptureMenu({ isOpen, onToggle, isFavorited, isArchived, isArchiveView, onFavorite, onUnfavorite, onArchive, onUnarchive, onCopy, onEdit, onAddToChat, onDelete }: {
  isOpen: boolean;
  onToggle: () => void;
  isFavorited: boolean;
  isArchived: boolean;
  isArchiveView: boolean;
  onFavorite: () => void;
  onUnfavorite: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onAddToChat: () => void;
  onDelete: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  // Reset confirm state when menu closes
  useEffect(() => {
    if (!isOpen) setDeleteConfirm(false);
  }, [isOpen]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, border: "none", borderRadius: 7,
          background: isOpen ? "var(--bg-hover)" : "transparent",
          color: "var(--text-muted)", cursor: "pointer", padding: 0,
          transition: "background .12s",
        }}
        title="Actions"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="4" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="12" cy="8" r="1.5" />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(var(--shadow-color), .12), 0 2px 8px rgba(var(--shadow-color), .06)",
            padding: 4, zIndex: 50, minWidth: 160,
            animation: "scaleIn .12s ease-out",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Favorite / Unfavorite */}
          <MenuItem
            icon={
              isFavorited
                ? <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--accent)" stroke="none"><path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" /></svg>
                : <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" /></svg>
            }
            label={isFavorited ? "Unfavorite" : "Favorite"}
            hovered={hovered === "fav"}
            onHover={() => setHovered("fav")}
            onLeave={() => setHovered(null)}
            onClick={isFavorited ? onUnfavorite : onFavorite}
          />

          {/* Copy */}
          <MenuItem
            icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" /></svg>}
            label="Copy"
            hovered={hovered === "copy"}
            onHover={() => setHovered("copy")}
            onLeave={() => setHovered(null)}
            onClick={onCopy}
          />

          {/* Edit */}
          <MenuItem
            icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M11 2l3 3-8 8H3v-3z" /><line x1="9" y1="4" x2="12" y2="7" /></svg>}
            label="Edit"
            hovered={hovered === "edit"}
            onHover={() => setHovered("edit")}
            onLeave={() => setHovered(null)}
            onClick={onEdit}
          />

          {/* Add to chat */}
          <MenuItem
            icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 12V5a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H5l-3 3z" /></svg>}
            label="Add to chat"
            hovered={hovered === "chat"}
            onHover={() => setHovered("chat")}
            onLeave={() => setHovered(null)}
            onClick={onAddToChat}
          />

          {/* Separator */}
          <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />

          {/* Archive / Unarchive */}
          {isArchived ? (
            <MenuItem
              icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v5a1 1 0 001 1h8a1 1 0 001-1V7" /><polyline points="6 9 8 7 10 9" /><rect x="2" y="3" width="12" height="4" rx="1" /></svg>}
              label="Restore"
              hovered={hovered === "unarchive"}
              onHover={() => setHovered("unarchive")}
              onLeave={() => setHovered(null)}
              onClick={onUnarchive}
            />
          ) : (
            <MenuItem
              icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="4" rx="1" /><path d="M3 7v5a1 1 0 001 1h8a1 1 0 001-1V7" /><line x1="6.5" y1="10" x2="9.5" y2="10" /></svg>}
              label="Archive"
              hovered={hovered === "archive"}
              onHover={() => setHovered("archive")}
              onLeave={() => setHovered(null)}
              onClick={onArchive}
            />
          )}

          {/* Permanent delete — only in archive view */}
          {isArchiveView && (
            !deleteConfirm ? (
              <MenuItem
                icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M5 4.5l.5 8.5h5l.5-8.5" /></svg>}
                label="Delete permanently"
                destructive
                hovered={hovered === "del"}
                onHover={() => setHovered("del")}
                onLeave={() => setHovered(null)}
                onClick={() => setDeleteConfirm(true)}
              />
            ) : (
              <MenuItem
                icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--danger-text)" strokeWidth="1.6" strokeLinecap="round"><path d="M4 8h8" /><circle cx="8" cy="8" r="6" /></svg>}
                label="Confirm delete?"
                destructive
                hovered={hovered === "confirm"}
                onHover={() => setHovered("confirm")}
                onLeave={() => setHovered(null)}
                onClick={onDelete}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/* Menu item inside CaptureMenu */
function MenuItem({ icon, label, destructive, hovered, onHover, onLeave, onClick }: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const color = destructive
    ? (hovered ? "var(--danger-text)" : "var(--danger)")
    : (hovered ? "var(--text-primary)" : "var(--text-secondary)");
  const bg = hovered
    ? (destructive ? "var(--danger-bg)" : "var(--bg-elevated)")
    : "transparent";

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        border: "none", background: bg,
        borderRadius: 7, padding: "7px 10px", fontSize: 13,
        color, fontWeight: destructive ? 500 : 400,
        cursor: "pointer", textAlign: "left",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        transition: "all .1s",
      }}
    >
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════ */

/* Column header (sortable) — kept for potential future use */
function _ColumnHead({ label, field, active, dir, onToggle, flex, width, align }: {
  label: string; field: SortField; active: SortField; dir: SortDir;
  onToggle: (f: SortField) => void; flex?: boolean; width?: number; align?: "left" | "right";
}) {
  const isActive = active === field;
  return (
    <button
      onClick={() => onToggle(field)}
      style={{
        ...(flex ? { flex: 1, minWidth: 0 } : { width, flexShrink: 0 }),
        display: "flex", alignItems: "center", gap: 4,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        border: "none", background: "transparent", padding: 0,
        cursor: "pointer", fontSize: 11, fontWeight: 600,
        color: isActive ? "var(--text-heading)" : "var(--text-faint)",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        textAlign: "left",
        transition: "color .12s",
      }}
    >
      {label}
      {isActive && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {dir === "asc"
            ? <polyline points="2,6 5,3 8,6" />
            : <polyline points="2,4 5,7 8,4" />
          }
        </svg>
      )}
    </button>
  );
}
void _ColumnHead; // suppress unused warning

/* View toggle (list / grid icons) */
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--bg-hover)", borderRadius: 7, padding: 2 }}>
      <button
        onClick={() => onChange("list")}
        title="List view"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 26, border: "none", borderRadius: 5,
          background: mode === "list" ? "var(--bg-card)" : "transparent",
          color: mode === "list" ? "var(--text-primary)" : "var(--text-faint)",
          boxShadow: mode === "list" ? "0 1px 3px rgba(var(--shadow-color), .08)" : "none",
          cursor: "pointer", transition: "all .12s",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="1" y1="3" x2="13" y2="3" /><line x1="1" y1="7" x2="13" y2="7" /><line x1="1" y1="11" x2="13" y2="11" />
        </svg>
      </button>
      <button
        onClick={() => onChange("grid")}
        title="Grid view"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 26, border: "none", borderRadius: 5,
          background: mode === "grid" ? "var(--bg-card)" : "transparent",
          color: mode === "grid" ? "var(--text-primary)" : "var(--text-faint)",
          boxShadow: mode === "grid" ? "0 1px 3px rgba(var(--shadow-color), .08)" : "none",
          cursor: "pointer", transition: "all .12s",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="1" y="1" width="5" height="5" rx="1" /><rect x="8" y="1" width="5" height="5" rx="1" />
          <rect x="1" y="8" width="5" height="5" rx="1" /><rect x="8" y="8" width="5" height="5" rx="1" />
        </svg>
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Static styles
   ════════════════════════════════════════════════════════════════ */
const S: Record<string, React.CSSProperties> = {
  heading: {
    margin: 0, fontFamily: "'Newsreader', Georgia, serif",
    fontWeight: 500, fontSize: 20, color: "var(--text-primary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  count: {
    fontSize: 12, color: "var(--text-dimmed)",
    fontFamily: "ui-monospace, Menlo, monospace",
  },
  newBtn: {
    display: "flex", alignItems: "center", gap: 7,
    border: "1px solid var(--border-subtle)", background: "var(--accent)",
    color: "var(--bg-card)", borderRadius: 9, padding: "7px 13px",
    fontSize: 13, fontWeight: 500, cursor: "pointer",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    transition: "all .15s ease",
    position: "relative" as const,
    overflow: "hidden" as const,
    boxShadow: "0 1px 3px rgba(var(--shadow-accent), .25)",
  },
  toolbar: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 24px 8px", flexShrink: 0,
    flexWrap: "wrap" as const,
  },
  filterWrap: {
    display: "flex", alignItems: "center", gap: 7,
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: 8, padding: "5px 10px",
    flex: 1, minWidth: 140,
  },
  filterInput: {
    border: "none", outline: "none", background: "transparent",
    fontSize: 13, color: "var(--text-primary)", flex: 1, minWidth: 0,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },
  clearBtn: {
    display: "flex", border: "none", background: "transparent",
    color: "var(--text-dimmed)", cursor: "pointer", padding: 2,
  },
  colHeader: {
    display: "flex", alignItems: "center", padding: "6px 20px",
    borderBottom: "1px solid var(--border)", flexShrink: 0,
    background: "var(--bg-surface)",
  }, // kept for ColumnHead if ever needed
  tag: {
    fontSize: 10, color: "var(--text-muted)", background: "var(--bg-hover)",
    borderRadius: 4, padding: "1px 5px",
    fontFamily: "ui-monospace, Menlo, monospace",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
    flexShrink: 0,
  },
  bulkIconBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26,
    border: "1px solid var(--border-subtle)", background: "var(--bg-card)",
    borderRadius: 6, cursor: "pointer",
    transition: "all .12s",
  } as React.CSSProperties,
  // filterHeading moved inline into FilterSection component
};
