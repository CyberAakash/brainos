import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useStore, getTypeMeta } from "@/store";
import type { CaptureOverview } from "@/lib/ipc";
import MarqueeTitle from "./MarqueeTitle";

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

/* ────── Type icon for thumbnails ────── */
function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  const s = size;
  switch (type) {
    case "learning":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M2 3h10a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V3z"/><path d="M14 6h2v7a2 2 0 01-2 2"/><line x1="5" y1="7" x2="11" y2="7"/><line x1="5" y1="10" x2="9" y2="10"/></svg>;
    case "debugging":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="9" cy="10" r="4"/><path d="M9 6V3M5.5 7.5L3 5.5M12.5 7.5L15 5.5M5 10H2M13 10h3M5.5 12.5L3 14.5M12.5 12.5L15 14.5"/></svg>;
    case "fix":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M11.5 2.5l4 4M3 13l8-8M3 13l-1 3 3-1"/></svg>;
    case "insight":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M9 2a5 5 0 00-2 9.6V14h4v-2.4A5 5 0 009 2z"/><line x1="7" y1="16" x2="11" y2="16"/></svg>;
    case "decision":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M9 2v6M9 8l-5 5M9 8l5 5"/><circle cx="4" cy="14" r="1.5"/><circle cx="14" cy="14" r="1.5"/></svg>;
    case "architecture":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="11" y="2" width="5" height="5" rx="1"/><rect x="6.5" y="11" width="5" height="5" rx="1"/><line x1="4.5" y1="7" x2="9" y2="11"/><line x1="13.5" y1="7" x2="9" y2="11"/></svg>;
    case "pattern":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 9a6 6 0 0112 0"/><path d="M6 9a3 3 0 016 0"/><circle cx="9" cy="9" r="1"/><line x1="9" y1="10" x2="9" y2="15"/></svg>;
    case "reference":
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 2h4l2 2h6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V2z"/><line x1="7" y1="9" x2="13" y2="9"/><line x1="7" y1="12" x2="11" y2="12"/></svg>;
    default:
      return <svg width={s} height={s} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="3" y="2" width="12" height="14" rx="1.5"/><line x1="6" y1="6" x2="12" y2="6"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="12" x2="10" y2="12"/></svg>;
  }
}

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
  const [showFavOnly, setShowFavOnly] = useState(false);

  // Explorer state from store (tags multi-select + search)
  const selectedTags = useStore((s) => s.selectedTags);
  const explorerSearch = useStore((s) => s.explorerSearch);

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
  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortDir(field === "title" ? "asc" : "desc");
      return field;
    });
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
    // Apply favorites filter
    if (showFavOnly) list = list.filter((c) => favorites.includes(c.id));
    // Apply sidebar browseFilter (space / project)
    if (browseFilter.kind === "space" && browseFilter.value) list = list.filter((c) => c.space === browseFilter.value);
    if (browseFilter.kind === "project" && browseFilter.value) list = list.filter((c) => c.projects.includes(browseFilter.value!));
    // Apply multi-select tags from explorer
    if (selectedTags.length > 0) list = list.filter((c) => selectedTags.every((t) => c.tags.includes(t)));
    // Apply explorer search
    if (explorerSearch.trim()) {
      const eq = explorerSearch.toLowerCase();
      list = list.filter((c) =>
        c.title.toLowerCase().includes(eq) ||
        c.tags.some((t) => t.toLowerCase().includes(eq)) ||
        c.space.toLowerCase().includes(eq)
      );
    }
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
  }, [captures, browseFilter, selectedTags, explorerSearch, sortField, sortDir, quickFilter, showFavOnly, favorites]);

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
  }, [browseFilter, selectedTags, explorerSearch, sortField, sortDir, quickFilter]);

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
      circle.style.background = "rgba(255,255,255,0.3)";
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#B0A99C" strokeWidth="1.5" style={{ flexShrink: 0 }}>
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
        <SortDropdown field={sortField} dir={sortDir} onSort={toggleSort} />

        {/* Favorites toggle */}
        <button
          onClick={() => setShowFavOnly((p) => !p)}
          title={showFavOnly ? "Show all captures" : "Show favorites only"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30,
            border: `1px solid ${showFavOnly ? "#E0C4B5" : "#E5E0D6"}`,
            background: showFavOnly ? "#FBF3EE" : "#FDFCF9",
            borderRadius: 7, cursor: "pointer",
            transition: "all .15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14"
            fill={showFavOnly ? "#BD6A47" : "none"}
            stroke={showFavOnly ? "none" : "#9A968B"}
            strokeWidth="1.2"
          >
            <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" />
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
          onCopy={handleCopy}
          onEdit={handleEdit}
          onAddToChat={handleAddToChat}
          sortField={sortField}
          sortDir={sortDir}
          toggleSort={toggleSort}
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
          onCopy={handleCopy}
          onEdit={handleEdit}
          onAddToChat={handleAddToChat}
          captureCache={captureCache}
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
  onCopy: (id: string) => void;
  onEdit: (id: string) => void;
  onAddToChat: (id: string) => void;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
}

function ListView({
  items, scrollRef, onScroll, totalHeight, startIdx, endIdx,
  menuOpenId, setMenuOpenId,
  openDetail, favorites, favorite, unfavorite, deleteCapture,
  onCopy, onEdit, onAddToChat,
}: ListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedId = useStore((s) => s.selectedId);
  const detailOpen = useStore((s) => s.detailOpen);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Rows — no column headers */}
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative", height: totalHeight }}>
          {items.length === 0 && (
            <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "#B0A99C" }}>
              No captures match this filter.
            </div>
          )}
          {items.slice(startIdx, endIdx).map((c, i) => {
            const idx = startIdx + i;
            const meta = getTypeMeta(c.capture_type);
            const isHovered = hoveredId === c.id;
            const isMenuOpen = menuOpenId === c.id;
            const isFav = favorites.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => {
                  if (menuOpenId) { setMenuOpenId(null); return; }
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
                  background: isHovered || isMenuOpen ? "#FAF7F2" : "transparent",
                  borderBottom: "1px solid #F0EBE2",
                  transition: "background .1s",
                  gap: 12,
                }}
              >
                {/* Thumbnail / type icon */}
                <div style={{
                  width: 40, height: 32, flexShrink: 0,
                  background: meta.bg, borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: meta.fg,
                }}>
                  <TypeIcon type={c.capture_type} size={16} />
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
                      fontSize: 13.5, fontWeight: 500, color: "#21201C",
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
                        <span style={{ ...S.tag, color: "#B0A99C", background: "transparent" }}>+{c.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Date */}
                <div style={{
                  flexShrink: 0, fontSize: 12, color: "#B0A99C",
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
                    background: "#BD6A47", color: "#FFF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600,
                  }}>A</div>
                  <span style={{ fontSize: 12, color: "#7C7468" }}>You</span>
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
                      border: "none", background: "transparent", color: "#9A968B",
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
                    onFavorite={() => { favorite(c.id); setMenuOpenId(null); }}
                    onUnfavorite={() => { unfavorite(c.id); setMenuOpenId(null); }}
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
                      color: isFav ? "#BD6A47" : "#9A968B",
                      borderRadius: 5, cursor: "pointer",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14"
                      fill={isFav ? "#BD6A47" : "none"}
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
  onCopy: (id: string) => void;
  onEdit: (id: string) => void;
  onAddToChat: (id: string) => void;
  captureCache: Record<string, unknown>;
}

function GridView({
  items, menuOpenId, setMenuOpenId,
  openDetail, favorites, favorite, unfavorite, deleteCapture,
  onCopy, onEdit, onAddToChat,
}: GridProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedId = useStore((s) => s.selectedId);
  const detailOpen = useStore((s) => s.detailOpen);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>
      {items.length === 0 && (
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "#B0A99C" }}>
          No captures match this filter.
        </div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
        gap: 12,
      }}>
        {items.map((c) => {
          const meta = getTypeMeta(c.capture_type);
          const isHovered = hoveredId === c.id;
          const isMenuOpen = menuOpenId === c.id;
          const isFav = favorites.includes(c.id);

          return (
            <div
              key={c.id}
              onClick={() => {
                if (menuOpenId) { setMenuOpenId(null); return; }
                openDetail(c.id);
              }}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: "#FFFFFF",
                border: `1px solid ${isHovered ? "#E0D8C8" : "#ECE7DC"}`,
                borderRadius: 12,
                overflow: "hidden",
                cursor: "pointer",
                transition: "box-shadow .15s, border-color .15s, transform .15s",
                boxShadow: isHovered ? "0 6px 18px rgba(40,36,28,.07)" : "none",
                transform: isHovered ? "translateY(-2px)" : "none",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {/* Preview area with type icon */}
              <div style={{
                height: 120, background: meta.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", color: meta.fg,
              }}>
                <TypeIcon type={c.capture_type} size={32} />

                {/* Hover-revealed action buttons */}
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  display: "flex", gap: 4,
                  opacity: isHovered || isMenuOpen ? 1 : 0,
                  transition: "opacity .12s",
                }}>
                  <CaptureMenu
                    isOpen={isMenuOpen}
                    onToggle={() => setMenuOpenId(isMenuOpen ? null : c.id)}
                    isFavorited={isFav}
                    onFavorite={() => { favorite(c.id); setMenuOpenId(null); }}
                    onUnfavorite={() => { unfavorite(c.id); setMenuOpenId(null); }}
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
                      border: "none", background: "rgba(255,255,255,.85)", backdropFilter: "blur(4px)",
                      color: isFav ? "#BD6A47" : "#7C7468",
                      borderRadius: 6, cursor: "pointer",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14"
                      fill={isFav ? "#BD6A47" : "none"}
                      stroke={isFav ? "none" : "currentColor"}
                      strokeWidth="1.3"
                    >
                      <path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Title + meta */}
              <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                <MarqueeTitle
                  text={c.title}
                  externalHover={isHovered}
                  always={detailOpen && selectedId === c.id}
                  style={{
                    fontSize: 14, fontWeight: 500, color: "#21201C",
                    lineHeight: 1.3,
                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#BD6A47", color: "#FFF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 600, flexShrink: 0,
                  }}>A</div>
                  <span style={{ fontSize: 11.5, color: "#7C7468" }}>You</span>
                  <span style={{ fontSize: 11, color: "#D4CFC4" }}>·</span>
                  <span style={{ fontSize: 11.5, color: "#B0A99C" }}>{relativeTime(c.date)}</span>
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
  onSort: (f: SortField) => void;
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
          border: "1px solid #E5E0D6", background: "#FDFCF9",
          borderRadius: 7, padding: "5px 10px", fontSize: 12,
          color: "#5C584E", cursor: "pointer",
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
          background: "#FFFFFF", border: "1px solid #E5E0D6", borderRadius: 10,
          boxShadow: "0 8px 28px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06)",
          padding: 4, zIndex: 50, minWidth: 160,
          animation: "scaleIn .12s ease-out",
        }}>
          {SORT_OPTIONS.map((opt) => {
            const active = opt.field === field && opt.dir === dir;
            return (
              <button
                key={`${opt.field}-${opt.dir}`}
                onClick={() => {
                  if (opt.field !== field) {
                    onSort(opt.field);
                    // If switching fields, we might need a second toggle for dir
                  } else if (opt.dir !== dir) {
                    onSort(opt.field); // toggles direction
                  }
                  setOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  border: "none", background: active ? "#F5F2EC" : "transparent",
                  borderRadius: 7, padding: "7px 10px", fontSize: 12.5,
                  color: active ? "#21201C" : "#56524A",
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                  transition: "background .1s",
                }}
              >
                <span style={{ width: 14, fontSize: 11, color: "#BD6A47" }}>
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
function CaptureMenu({ isOpen, onToggle, isFavorited, onFavorite, onUnfavorite, onCopy, onEdit, onAddToChat, onDelete }: {
  isOpen: boolean;
  onToggle: () => void;
  isFavorited: boolean;
  onFavorite: () => void;
  onUnfavorite: () => void;
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
          background: isOpen ? "#F0EBE2" : "transparent",
          color: "#7C7468", cursor: "pointer", padding: 0,
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
            background: "#FFFFFF", border: "1px solid #E5E0D6", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06)",
            padding: 4, zIndex: 50, minWidth: 160,
            animation: "scaleIn .12s ease-out",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Favorite / Unfavorite */}
          <MenuItem
            icon={
              isFavorited
                ? <svg width="14" height="14" viewBox="0 0 14 14" fill="#BD6A47" stroke="none"><path d="M7 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L7 10.43l-3.52 1.92.67-3.93L1.3 5.64l3.94-.57Z" /></svg>
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
          <div style={{ height: 1, background: "#E9E5DC", margin: "4px 6px" }} />

          {/* Delete */}
          {!deleteConfirm ? (
            <MenuItem
              icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M5 4.5l.5 8.5h5l.5-8.5" /></svg>}
              label="Delete"
              destructive
              hovered={hovered === "del"}
              onHover={() => setHovered("del")}
              onLeave={() => setHovered(null)}
              onClick={() => setDeleteConfirm(true)}
            />
          ) : (
            <MenuItem
              icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#C0392B" strokeWidth="1.6" strokeLinecap="round"><path d="M4 8h8" /><circle cx="8" cy="8" r="6" /></svg>}
              label="Confirm delete?"
              destructive
              hovered={hovered === "confirm"}
              onHover={() => setHovered("confirm")}
              onLeave={() => setHovered(null)}
              onClick={onDelete}
            />
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
    ? (hovered ? "#C0392B" : "#D4574A")
    : (hovered ? "#21201C" : "#56524A");
  const bg = hovered
    ? (destructive ? "#FDF2F0" : "#F5F2EC")
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
        color: isActive ? "#4A463E" : "#9A968B",
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
    <div style={{ display: "flex", gap: 2, background: "#F0EBE2", borderRadius: 7, padding: 2 }}>
      <button
        onClick={() => onChange("list")}
        title="List view"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 26, border: "none", borderRadius: 5,
          background: mode === "list" ? "#FFFFFF" : "transparent",
          color: mode === "list" ? "#21201C" : "#9A968B",
          boxShadow: mode === "list" ? "0 1px 3px rgba(0,0,0,.08)" : "none",
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
          background: mode === "grid" ? "#FFFFFF" : "transparent",
          color: mode === "grid" ? "#21201C" : "#9A968B",
          boxShadow: mode === "grid" ? "0 1px 3px rgba(0,0,0,.08)" : "none",
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
    fontWeight: 500, fontSize: 20, color: "#21201C",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  count: {
    fontSize: 12, color: "#B0A99C",
    fontFamily: "ui-monospace, Menlo, monospace",
  },
  newBtn: {
    display: "flex", alignItems: "center", gap: 7,
    border: "1px solid #D8C2B6", background: "#BD6A47",
    color: "#FFFFFF", borderRadius: 9, padding: "7px 13px",
    fontSize: 13, fontWeight: 500, cursor: "pointer",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    transition: "all .15s ease",
    position: "relative" as const,
    overflow: "hidden" as const,
    boxShadow: "0 1px 3px rgba(120,60,30,.25)",
  },
  toolbar: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 24px 8px", flexShrink: 0,
    flexWrap: "wrap" as const,
  },
  filterWrap: {
    display: "flex", alignItems: "center", gap: 7,
    background: "#FFFFFF", border: "1px solid #E5E0D6",
    borderRadius: 8, padding: "5px 10px",
    flex: 1, minWidth: 140,
  },
  filterInput: {
    border: "none", outline: "none", background: "transparent",
    fontSize: 13, color: "#21201C", flex: 1, minWidth: 0,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },
  clearBtn: {
    display: "flex", border: "none", background: "transparent",
    color: "#B0A99C", cursor: "pointer", padding: 2,
  },
  colHeader: {
    display: "flex", alignItems: "center", padding: "6px 20px",
    borderBottom: "1px solid #E5E0D6", flexShrink: 0,
    background: "#FDFCF9",
  }, // kept for ColumnHead if ever needed
  tag: {
    fontSize: 10, color: "#7C7468", background: "#F2EDE3",
    borderRadius: 4, padding: "1px 5px",
    fontFamily: "ui-monospace, Menlo, monospace",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
    flexShrink: 0,
  },
  // filterHeading moved inline into FilterSection component
};
