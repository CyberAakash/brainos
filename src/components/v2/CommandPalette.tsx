import React, { useState, useEffect, useRef, useCallback } from "react";
import { Command } from "cmdk";
import { useStore, getTypeMeta } from "@/store";
import type { CaptureOverview } from "@/lib/ipc";

/* ────── Helpers ────── */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "";
  const diff = now - then;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/** Highlight query terms inside text */
function highlightMatches(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) => {
    if (re.test(part)) {
      re.lastIndex = 0;
      return (
        <mark key={i} style={{
          background: "#F3E0D4", color: "#7A4A30", borderRadius: 2,
          padding: "0 1px", fontWeight: 600,
        }}>{part}</mark>
      );
    }
    re.lastIndex = 0;
    return part;
  });
}

/* ────── Recent captures (localStorage) ────── */

const RECENT_KEY = "brainos_recent_captures";
const MAX_RECENT = 8;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushRecent(id: string) {
  try {
    const list = loadRecents().filter((x) => x !== id);
    list.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* */ }
}

/* ────── Result item shape ────── */
interface ResultItem {
  capture: CaptureOverview;
  snippet?: string;
  score?: number;
}

/* ════════════════════════════════════════════════════════════════
   CommandPalette (⌘K) — powered by cmdk
   ════════════════════════════════════════════════════════════════ */
export default function CommandPalette() {
  const paletteOpen = useStore((s) => s.paletteOpen);
  const paletteMode = useStore((s) => s.paletteMode);
  const closePalette = useStore((s) => s.closePalette);
  const openDetail = useStore((s) => s.openDetail);
  const openNew = useStore((s) => s.openNew);
  const openSettings = useStore((s) => s.openSettings);
  const goBrowse = useStore((s) => s.goBrowse);
  const attach = useStore((s) => s.attach);
  const showToast = useStore((s) => s.showToast);
  const captures = useStore((s) => s.captures);
  const searchCaptures = useStore((s) => s.searchCaptures);
  const isAttachMode = paletteMode === "attach";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recent captures resolved against current captures list
  const recents = React.useMemo(() => {
    if (query.trim()) return [];
    const ids = loadRecents();
    return ids
      .map((id) => captures.find((c) => c.id === id))
      .filter(Boolean) as CaptureOverview[];
  }, [captures, query]);

  // Default items when no query
  const defaultItems = React.useMemo(
    () => captures.slice(0, 15).map((c) => ({ capture: c })),
    [captures],
  );

  // Reset on open
  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [paletteOpen]);

  // Debounced search
  useEffect(() => {
    if (!paletteOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Short queries: local filter only
    if (trimmed.length < 3) {
      const lower = trimmed.toLowerCase();
      const filtered = captures.filter(
        (c) =>
          c.title.toLowerCase().includes(lower) ||
          c.tags.some((t) => t.toLowerCase().includes(lower)),
      );
      setResults(filtered.slice(0, 30).map((c) => ({ capture: c })));
      setLoading(false);
      return;
    }

    // Longer queries: backend search with debounce
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const sr = await searchCaptures(trimmed);
      setResults(sr.map((r) => ({ capture: r.capture, snippet: r.snippet, score: r.score })));
      setLoading(false);
    }, 150);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, paletteOpen, captures, searchCaptures]);

  // Select handler — attach mode attaches, search mode opens detail
  const handleSelect = useCallback(
    (value: string) => {
      if (value === "action:new") {
        openNew();
        closePalette();
      } else if (value === "action:settings") {
        openSettings();
        closePalette();
      } else if (value === "action:browse") {
        goBrowse("all", null, "All captures");
        closePalette();
      } else if (isAttachMode) {
        // Attach mode — one-click attach to chat context
        attach(value);
        showToast("Attached to context");
        closePalette();
      } else {
        // Search mode — open detail panel
        pushRecent(value);
        openDetail(value);
        closePalette();
      }
    },
    [openDetail, openNew, openSettings, goBrowse, closePalette, isAttachMode, attach, showToast],
  );

  const hasQuery = query.trim().length > 0;
  const showRecents = !hasQuery && recents.length > 0;
  const items = hasQuery ? results : defaultItems;

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={(open) => { if (!open) closePalette(); }}
      label="Command palette"
      shouldFilter={false}
      loop
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); closePalette(); }
      }}
      overlayClassName=""
      contentClassName=""
    >
      {/* ── Search input row ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "0 18px",
        borderBottom: "1px solid #E9E5DC", flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9A958A" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={isAttachMode ? "Search captures to attach…" : "Search captures…"}
        />
        {hasQuery && (
          <span style={{ fontSize: 11, color: "#A8A194", flexShrink: 0 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{
          fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "#A8A194",
          background: "#F0EBE1", borderRadius: 5, padding: "2px 6px",
        }}>esc</span>
      </div>

      {/* ── Results ── */}
      <Command.List>
        {loading && (
          <Command.Loading>
            <div style={{ padding: "12px 20px", fontSize: 12, color: "#A8A194" }}>
              Searching…
            </div>
          </Command.Loading>
        )}

        <Command.Empty>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ marginBottom: 10, opacity: 0.45 }}>
            <circle cx="16" cy="16" r="10" stroke="#C8C2B6" strokeWidth="1.8" />
            <line x1="23" y1="23" x2="31" y2="31" stroke="#C8C2B6" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 14, color: "#56524A", fontWeight: 500, marginBottom: 3 }}>No results</div>
          <div style={{ fontSize: 12.5, color: "#A8A194" }}>Try a different keyword</div>
        </Command.Empty>

        {/* Recent captures */}
        {showRecents && (
          <Command.Group heading="Recent">
            {recents.map((c) => (
              <CaptureItem key={`r-${c.id}`} capture={c} query="" onSelect={handleSelect} />
            ))}
          </Command.Group>
        )}

        {/* Search results or all captures */}
        {items.length > 0 && (
          <Command.Group heading={hasQuery ? "Results" : "All captures"}>
            {items.map((item) => (
              <CaptureItem
                key={item.capture.id}
                capture={item.capture}
                snippet={"snippet" in item ? (item as ResultItem).snippet : undefined}
                query={query}
                onSelect={handleSelect}
              />
            ))}
          </Command.Group>
        )}

        {/* Quick actions (hidden in attach mode) */}
        {!hasQuery && !isAttachMode && (
          <>
            <Command.Separator />
            <Command.Group heading="Actions">
              <Command.Item value="action:new" onSelect={handleSelect} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9A4F30" strokeWidth="1.7" style={{ flexShrink: 0 }}>
                  <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
                </svg>
                <span style={{ fontWeight: 500 }}>New capture</span>
              </Command.Item>
              <Command.Item value="action:browse" onSelect={handleSelect} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5C584E" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                  <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
                  <line x1="1.5" y1="5" x2="12.5" y2="5" /><line x1="5" y1="5" x2="5" y2="12.5" />
                </svg>
                <span style={{ fontWeight: 500 }}>Browse all captures</span>
              </Command.Item>
              <Command.Item value="action:settings" onSelect={handleSelect} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="#5C584E" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                  <line x1="3" y1="6" x2="15" y2="6" /><line x1="3" y1="12" x2="15" y2="12" />
                  <circle cx="11" cy="6" r="2" fill="#FFFFFF" /><circle cx="7" cy="12" r="2" fill="#FFFFFF" />
                </svg>
                <span style={{ fontWeight: 500 }}>Settings</span>
              </Command.Item>
            </Command.Group>
          </>
        )}
      </Command.List>

      {/* ── Footer ── */}
      <div style={{
        display: "flex", alignItems: "center", padding: "6px 14px",
        borderTop: "1px solid #E9E5DC", background: "#FAFAF5", flexShrink: 0, gap: 10,
      }}>
        <div style={{ flex: 1 }} />
        <KbdHint keys="↑↓" label="Navigate" />
        <KbdHint keys="↵" label={isAttachMode ? "Attach" : "Open"} />
      </div>
    </Command.Dialog>
  );
}

/* ────── Capture item ────── */
function CaptureItem({ capture, snippet, query, onSelect }: {
  capture: CaptureOverview;
  snippet?: string;
  query: string;
  onSelect: (id: string) => void;
}) {
  const tm = getTypeMeta(capture.capture_type);
  const hasQuery = query.trim().length > 0;
  const hasSnippet = hasQuery && snippet && snippet.length > 0;

  return (
    <Command.Item
      value={capture.id}
      onSelect={onSelect}
      keywords={[capture.title, ...capture.tags, capture.capture_type]}
      style={{ gap: hasSnippet ? 4 : 0 }}
    >
      {/* Row 1: dot + title + type badge + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: tm.dot }} />
        <span style={{
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontWeight: 500,
        }}>
          {hasQuery ? highlightMatches(capture.title, query) : capture.title}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "2px 6px", flexShrink: 0,
          textTransform: "capitalize", letterSpacing: ".02em", background: tm.bg, color: tm.fg,
        }}>{capture.capture_type}</span>
        {capture.date && (
          <span style={{ fontSize: 11, color: "#A8A194", flexShrink: 0, whiteSpace: "nowrap" }}>
            {relativeTime(capture.date)}
          </span>
        )}
      </div>

      {/* Row 2: snippet with highlights */}
      {hasSnippet && (
        <div style={{
          fontSize: 12, lineHeight: 1.45, color: "#7C7468",
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
          paddingLeft: 17,
        }}>
          {highlightMatches(snippet!, query)}
        </div>
      )}
    </Command.Item>
  );
}

/* ────── Keyboard hint ────── */
function KbdHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{
        fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10.5, color: "#7A7568",
        background: "#EEEAE2", borderRadius: 4, padding: "1px 5px",
      }}>{keys}</span>
      <span style={{ fontSize: 11, color: "#A8A194" }}>{label}</span>
    </span>
  );
}
