import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useStore, getTypeMeta } from "@/store";
import { measureHeight, FONTS } from "@/lib/pretext";

/* ────── relative-time helper ────── */
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

/* ────── Virtual item with pre-computed height ────── */
interface VItem {
  idx: number;
  offset: number;
  height: number;
}

/* ────── Constants for height calculation ────── */
const CARD_PAD_V = 30;       // 15px top + 15px bottom
const TITLE_LH = 21;         // line height for title
const TAGS_ROW_H = 24;       // tags row height
const SNIPPET_H = 42;        // estimated snippet height (2 lines)
const GAP = 10;              // gap between cards
const CARD_CONTENT_W = 848;  // 880 max - 32 padding for title measurement
const TITLE_FONT = FONTS.heading(16, 500);

export default function BrowseView() {
  const captures = useStore((s) => s.captures);
  const browseFilter = useStore((s) => s.browseFilter);
  const openDetail = useStore((s) => s.openDetail);
  const bookmark = useStore((s) => s.bookmark);
  const deleteCapture = useStore((s) => s.deleteCapture);
  const setMainMode = useStore((s) => s.setMainMode);
  const openNew = useStore((s) => s.openNew);
  const captureCache = useStore((s) => s.captureCache);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredBack, setHoveredBack] = useState(false);
  const [hoveredNew, setHoveredNew] = useState(false);
  const [activeNew, setActiveNew] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [hoveredDel, setHoveredDel] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter captures
  const filtered = useMemo(() => {
    if (browseFilter.kind === "all") return captures;
    return captures.filter((c) => {
      switch (browseFilter.kind) {
        case "tag": {
          const filterTags = browseFilter.value!.split(",");
          return filterTags.every((ft) => c.tags.includes(ft));
        }
        case "type": return c.capture_type === browseFilter.value;
        case "space": return c.space === browseFilter.value;
        case "project": return c.projects.includes(browseFilter.value!);
        default: return true;
      }
    });
  }, [captures, browseFilter]);

  // Pre-compute heights using Pretext (no DOM reflow!)
  const virtualItems = useMemo((): VItem[] => {
    let offset = 0;
    return filtered.map((c, idx) => {
      // Measure title height with Pretext
      const titleMeasure = measureHeight(c.title, TITLE_FONT, CARD_CONTENT_W, TITLE_LH);
      const titleH = Math.max(titleMeasure.lineCount, 1) * TITLE_LH;

      // Has snippet? (from cache)
      const cached = captureCache[c.id];
      const hasSnippet = cached?.body_text && cached.body_text.trim().length > 0;

      const height = CARD_PAD_V + titleH + TAGS_ROW_H + (hasSnippet ? SNIPPET_H : 0);
      const item: VItem = { idx, offset, height };
      offset += height + GAP;
      return item;
    });
  }, [filtered, captureCache]);

  const totalHeight = virtualItems.length > 0
    ? virtualItems[virtualItems.length - 1].offset + virtualItems[virtualItems.length - 1].height
    : 0;

  // Determine visible range (with overscan)
  const OVERSCAN = 5;
  const { startIdx, endIdx } = useMemo(() => {
    if (virtualItems.length === 0) return { startIdx: 0, endIdx: 0 };

    // Binary search for first visible
    let lo = 0, hi = virtualItems.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (virtualItems[mid].offset + virtualItems[mid].height < scrollTop) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - OVERSCAN);

    // Find last visible
    let end = lo;
    const bottom = scrollTop + viewportH;
    while (end < virtualItems.length && virtualItems[end].offset < bottom) end++;
    end = Math.min(virtualItems.length, end + OVERSCAN);

    return { startIdx: start, endIdx: end };
  }, [virtualItems, scrollTop, viewportH]);

  // Scroll handler
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  // Measure viewport on mount & resize
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

  const browseLabel = browseFilter.label;
  const browseCount = `${filtered.length} captures`;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "16px 28px 14px", borderBottom: "1px solid #E9E5DC" }}>
        <button
          onClick={() => setMainMode("home")}
          onMouseEnter={() => setHoveredBack(true)}
          onMouseLeave={() => setHoveredBack(false)}
          style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: hoveredBack ? "#4A463E" : "#9A968B", fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="14" y1="9" x2="4" y2="9" /><polyline points="8,5 4,9 8,13" />
          </svg>
          Home
        </button>

        <h2 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: 20, color: "#21201C" }}>{browseLabel}</h2>
        <span style={{ fontSize: 12, color: "#B0A99C", fontFamily: "ui-monospace, Menlo, monospace" }}>{browseCount}</span>
        <div style={{ flex: 1 }} />

        <button
          onClick={() => openNew()}
          onMouseEnter={() => setHoveredNew(true)}
          onMouseLeave={() => { setHoveredNew(false); setActiveNew(false); }}
          onMouseDown={() => setActiveNew(true)}
          onMouseUp={() => setActiveNew(false)}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            border: hoveredNew ? "1px solid #C99A82" : "1px solid #D8C2B6",
            background: hoveredNew ? "#F6E9E1" : "#FBF3EE",
            color: "#9A4F30", borderRadius: 9, padding: "7px 13px", fontSize: 13, fontWeight: 500,
            cursor: "pointer", transition: "all .12s ease",
            transform: activeNew ? "translateY(0) scale(0.97)" : hoveredNew ? "translateY(-1px)" : "none",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7">
            <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
          </svg>
          New capture
        </button>
      </div>

      {/* Virtualized list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", padding: "18px 28px 32px" }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", position: "relative", height: totalHeight }}>
          {filtered.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#B0A99C" }}>
              No captures match this filter.
            </div>
          )}

          {virtualItems.slice(startIdx, endIdx).map((vi) => {
            const capture = filtered[vi.idx];
            const meta = getTypeMeta(capture.capture_type);
            const isHovered = hoveredId === capture.id;
            const cached = captureCache[capture.id];
            const snippet = cached?.body_text
              ? cached.body_text
                  .replace(/^#.*$/gm, "")
                  .replace(/```[\s\S]*?```/g, "")
                  .replace(/\n+/g, " ")
                  .trim()
                  .slice(0, 120)
              : "";
            const time = relativeTime(capture.date);

            return (
              <div
                key={capture.id}
                onClick={() => openDetail(capture.id)}
                onMouseEnter={() => setHoveredId(capture.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: "absolute",
                  top: vi.offset,
                  left: 0,
                  right: 0,
                  height: vi.height,
                  background: "#FFFFFF",
                  border: "1px solid " + (isHovered ? "#E0D8C8" : "#ECE7DC"),
                  borderRadius: 13,
                  padding: "15px 16px",
                  cursor: "pointer",
                  transition: "box-shadow .15s ease, border-color .15s ease",
                  boxShadow: isHovered ? "0 6px 18px rgba(40,36,28,.07)" : "none",
                  boxSizing: "border-box",
                }}
              >
                {/* Title row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: meta.dot }} />
                  <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 16, fontWeight: 500, color: "#21201C", flex: 1 }}>
                    {capture.title}
                  </span>

                  {/* Bookmark */}
                  <button
                    onClick={(e) => { e.stopPropagation(); bookmark(capture.id); }}
                    onMouseEnter={() => setHoveredPin(capture.id)}
                    onMouseLeave={() => setHoveredPin(null)}
                    title="Bookmark"
                    style={{ display: "flex", border: "none", background: hoveredPin === capture.id ? "#F6E9E1" : "transparent", color: hoveredPin === capture.id ? "#9A4F30" : "#B3AE9F", cursor: "pointer", padding: 4, borderRadius: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3.5 2h7v10l-3.5-2.4L3.5 12Z" /></svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCapture(capture.id); }}
                    onMouseEnter={() => setHoveredDel(capture.id)}
                    onMouseLeave={() => setHoveredDel(null)}
                    title="Delete"
                    style={{ display: "flex", border: "none", background: hoveredDel === capture.id ? "#F3E2DB" : "transparent", color: hoveredDel === capture.id ? "#8A4A38" : "#B3AE9F", cursor: "pointer", padding: 4, borderRadius: 6 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
                  </button>
                </div>

                {/* Tags + meta */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "8px 0 8px 18px", flexWrap: "wrap" }}>
                  {capture.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 11, color: "#7C7468", background: "#F2EDE3", borderRadius: 5, padding: "2px 6px", fontFamily: "ui-monospace, Menlo, monospace" }}>{tag}</span>
                  ))}
                  <span style={{ fontSize: 11.5, color: "#B0A99C" }}>&middot; {capture.space} &middot; {time}</span>
                </div>

                {/* Snippet */}
                {snippet && (
                  <p style={{ margin: "0 0 0 18px", fontSize: 13.5, lineHeight: 1.55, color: "#6B6459" }}>{snippet}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
