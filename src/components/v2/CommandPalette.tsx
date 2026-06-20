import React, { useState, useEffect, useRef, useCallback } from "react";
import { useStore, getTypeMeta } from "@/store";
import type { CaptureOverview } from "@/lib/ipc";

/* ────── Helpers ────── */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (isNaN(then)) return "";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/** Highlight query terms in text — returns React nodes with <mark> spans */
function highlightMatches(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [text];

  // Build regex that matches any term
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);

  return parts.map((part, i) => {
    if (re.test(part)) {
      return (
        <mark key={i} style={{
          background: "#F3E0D4", color: "#7A4A30", borderRadius: 2,
          padding: "0 1px", fontWeight: 600,
        }}>{part}</mark>
      );
    }
    // Reset regex lastIndex after test
    re.lastIndex = 0;
    return part;
  });
}

/* ── Unified result item (works for both local filter & backend search) ── */
interface ResultItem {
  capture: CaptureOverview;
  snippet?: string;
  score?: number;
}

/* ────── CommandPalette (⌘K) — Cursor-style with snippets ────── */

export default function CommandPalette() {
  const paletteOpen = useStore((s) => s.paletteOpen);
  const closePalette = useStore((s) => s.closePalette);
  const openDetail = useStore((s) => s.openDetail);
  const openNew = useStore((s) => s.openNew);
  const setMainMode = useStore((s) => s.setMainMode);
  const captures = useStore((s) => s.captures);
  const searchCaptures = useStore((s) => s.searchCaptures);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setActiveIdx(0);
      setResults(captures.slice(0, 20).map((c) => ({ capture: c })));
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen, captures]);

  // Search with debounce
  useEffect(() => {
    if (!paletteOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(captures.slice(0, 20).map((c) => ({ capture: c })));
      setActiveIdx(0);
      return;
    }
    if (trimmed.length < 3) {
      const lower = trimmed.toLowerCase();
      const filtered = captures.filter(
        (c) =>
          c.title.toLowerCase().includes(lower) ||
          c.tags.some((t) => t.toLowerCase().includes(lower)),
      );
      setResults(filtered.slice(0, 30).map((c) => ({ capture: c })));
      setActiveIdx(0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const sr = await searchCaptures(trimmed);
      setResults(sr.map((r) => ({ capture: r.capture, snippet: r.snippet, score: r.score })));
      setActiveIdx(0);
    }, 150);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, paletteOpen, captures, searchCaptures]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Keyboard nav
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closePalette(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[activeIdx];
        if (item) { openDetail(item.capture.id); closePalette(); }
      }
    },
    [results, activeIdx, closePalette, openDetail],
  );

  if (!paletteOpen) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 60,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh",
        animation: "fadeIn 0.1s ease",
      }}
      onClick={closePalette}
    >
      <div
        style={{
          width: 620, maxHeight: 520, background: "#FFFFFF", borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,.22)", display: "flex", flexDirection: "column",
          overflow: "hidden", animation: "scaleIn 0.15s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* ── Search input ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "0 18px",
          borderBottom: "1px solid #E9E5DC", flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9A958A" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captures…"
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 15, fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              color: "#21201C", padding: "16px 0",
            }}
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

        {/* ── Results list ── */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {results.length === 0 && (
            <div style={{
              padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ marginBottom: 10, opacity: 0.45 }}>
                <circle cx="16" cy="16" r="10" stroke="#C8C2B6" strokeWidth="1.8" />
                <line x1="23" y1="23" x2="31" y2="31" stroke="#C8C2B6" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div style={{ fontSize: 14, color: "#56524A", fontWeight: 500, marginBottom: 3 }}>No results</div>
              <div style={{ fontSize: 12.5, color: "#A8A194" }}>Try a different keyword</div>
            </div>
          )}

          {results.map((item, idx) => {
            const tm = getTypeMeta(item.capture.capture_type);
            const active = idx === activeIdx;
            const hasSnippet = hasQuery && item.snippet && item.snippet.length > 0;

            return (
              <button
                key={item.capture.id}
                style={{
                  display: "flex", flexDirection: "column", gap: hasSnippet ? 4 : 0,
                  padding: hasSnippet ? "10px 18px 10px 20px" : "10px 18px 10px 20px",
                  border: "none", width: "100%", textAlign: "left",
                  cursor: "pointer", fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                  color: "#21201C",
                  background: active ? "#F5F3ED" : "transparent",
                  borderLeft: active ? "2px solid #BD6A47" : "2px solid transparent",
                  transition: "background 0.06s",
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => { openDetail(item.capture.id); closePalette(); }}
              >
                {/* Row 1: dot + title + type badge + time */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: tm.dot }} />
                  <span style={{
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: 13.5, fontWeight: 500,
                  }}>
                    {hasQuery ? highlightMatches(item.capture.title, query) : item.capture.title}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "2px 6px", flexShrink: 0,
                    textTransform: "capitalize", letterSpacing: ".02em", background: tm.bg, color: tm.fg,
                  }}>{item.capture.capture_type}</span>
                  {item.capture.date && (
                    <span style={{ fontSize: 11, color: "#A8A194", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {relativeTime(item.capture.date)}
                    </span>
                  )}
                </div>

                {/* Row 2: snippet with highlighted matches */}
                {hasSnippet && (
                  <div style={{
                    fontSize: 12, lineHeight: 1.45, color: "#7C7468",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    paddingLeft: 17, // align with title (past dot)
                  }}>
                    {highlightMatches(item.snippet!, query)}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Footer: actions + keyboard hints ── */}
        <div style={{
          display: "flex", alignItems: "center", padding: "6px 14px",
          borderTop: "1px solid #E9E5DC", background: "#FAFAF5", flexShrink: 0, gap: 4,
        }}>
          <button
            onClick={() => { openNew(); closePalette(); }}
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent",
              cursor: "pointer", fontSize: 12, color: "#56524A", padding: "5px 8px", borderRadius: 6,
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#EFEAE0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7">
              <line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" />
            </svg>
            New
          </button>
          <button
            onClick={() => { setMainMode("settings"); closePalette(); }}
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent",
              cursor: "pointer", fontSize: 12, color: "#56524A", padding: "5px 8px", borderRadius: 6,
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#EFEAE0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="6" x2="15" y2="6" /><line x1="3" y1="12" x2="15" y2="12" />
              <circle cx="11" cy="6" r="2" fill="#FAFAF5" /><circle cx="7" cy="12" r="2" fill="#FAFAF5" />
            </svg>
            Settings
          </button>

          <div style={{ flex: 1 }} />

          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10.5, color: "#7A7568", background: "#EEEAE2", borderRadius: 4, padding: "1px 5px" }}>&uarr;&darr;</span>
            <span style={{ fontSize: 11, color: "#A8A194" }}>Navigate</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 10 }}>
            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10.5, color: "#7A7568", background: "#EEEAE2", borderRadius: 4, padding: "1px 5px" }}>&crarr;</span>
            <span style={{ fontSize: 11, color: "#A8A194" }}>Open</span>
          </span>
        </div>
      </div>
    </div>
  );
}
