import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store";

/* ════════════════════════════════════════════════════════════════
   GlobalSearch — Left dock search panel (input + controls only).
   Results render in the center pane via SearchResultsView.
   ════════════════════════════════════════════════════════════════ */

export default function GlobalSearch() {
  const query = useStore((s) => s.globalSearchQuery);
  const setQuery = useStore((s) => s.setGlobalSearchQuery);
  const caseSensitive = useStore((s) => s.globalSearchCaseSensitive);
  const toggleCase = useStore((s) => s.toggleGlobalSearchCase);
  const wholeWord = useStore((s) => s.globalSearchWholeWord);
  const toggleWholeWord = useStore((s) => s.toggleGlobalSearchWholeWord);
  const useRegex = useStore((s) => s.globalSearchRegex);
  const toggleRegex = useStore((s) => s.toggleGlobalSearchRegex);
  const results = useStore((s) => s.globalSearchResults);
  const searching = useStore((s) => s.globalSearching);
  const runSearch = useStore((s) => s.runGlobalSearch);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleChange = useCallback((val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runSearch(); }, 300);
  }, [setQuery, runSearch]);

  // Re-run when toggles change
  useEffect(() => {
    if (query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { runSearch(); }, 200);
    }
  }, [caseSensitive, wholeWord, useRegex]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalMatches = results.reduce((a, r) => a + r.matchCount, 0);

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>Search</span>
      </div>

      {/* Search input row with inline toggles */}
      <div style={S.inputArea}>
        <div style={S.inputRow}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="4.5" /><line x1="10.2" y1="10.2" x2="14" y2="14" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search all captures…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            style={S.input}
          />
          {/* Inline toggle buttons */}
          <div style={S.inlineToggles}>
            <InlineToggle label="Aa" title="Match Case" active={caseSensitive} onClick={toggleCase} />
            <InlineToggle label="wd" title="Match Whole Word" active={wholeWord} onClick={toggleWholeWord} />
            <InlineToggle label=".*" title="Use Regular Expression" active={useRegex} onClick={toggleRegex} />
          </div>
        </div>

        {/* Result count */}
        {query.trim() && (
          <div style={S.countRow}>
            <span style={S.countText}>
              {searching
                ? "Searching…"
                : results.length > 0
                  ? `${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${results.length} file${results.length !== 1 ? "s" : ""}`
                  : "No results found"
              }
            </span>
            {query && (
              <button onClick={() => { setQuery(""); useStore.setState({ globalSearchResults: [] }); }} style={S.clearAll} title="Clear search">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Compact file list (clickable to jump in center results) */}
      {results.length > 0 && (
        <div style={S.fileList}>
          {results.map((match) => (
            <FileEntry key={match.captureId} match={match} />
          ))}
        </div>
      )}

      {/* Hints when empty */}
      {!query.trim() && !searching && <EmptyState />}
    </div>
  );
}

/* ── Compact file entry in sidebar ── */
function FileEntry({ match }: { match: { captureId: string; title: string; matchCount: number; icon?: string | null } }) {
  const [hovered, setHovered] = useState(false);
  const openDetail = useStore((s) => s.openDetail);

  return (
    <button
      onClick={() => openDetail(match.captureId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        width: "100%", border: "none",
        background: hovered ? "var(--bg-hover)" : "transparent",
        borderRadius: 4, padding: "4px 8px",
        cursor: "pointer", textAlign: "left",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        transition: "background .06s",
      }}
    >
      <span style={{ fontSize: 12, flexShrink: 0 }}>{match.icon || "📄"}</span>
      <span style={{ fontSize: 12, color: "var(--text-heading)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {match.title}
      </span>
      <span style={{
        fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
        fontFamily: "ui-monospace, Menlo, monospace",
        background: "var(--bg-badge)", borderRadius: 8, padding: "1px 6px", flexShrink: 0,
      }}>
        {match.matchCount}
      </span>
    </button>
  );
}

/* ── Inline toggle button (Aa / wd / .*) ── */
function InlineToggle({ label, title, active, onClick }: {
  label: string; title: string; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "var(--accent-bg)" : (hovered ? "var(--bg-hover)" : "transparent"),
        color: active ? "var(--accent-text)" : "var(--text-muted)",
        borderRadius: 3,
        padding: "1px 4px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "ui-monospace, Menlo, monospace",
        cursor: "pointer",
        transition: "all .08s",
        lineHeight: 1.3,
        height: 20,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {label}
    </button>
  );
}

/* ── Empty state ── */
function EmptyState() {
  return (
    <div style={S.emptyState}>
      <div style={S.emptyIcon}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--text-ghost)" strokeWidth="1.2">
          <circle cx="14" cy="14" r="8" />
          <line x1="19.5" y1="19.5" x2="27" y2="27" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Search All Captures</div>
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.5, maxWidth: 200, textAlign: "center" as const }}>
        Type to search. Results appear in the center pane.
      </div>
      <div style={S.hintGrid}>
        <HintRow icon="Aa" label="Match case" />
        <HintRow icon="wd" label="Match whole words" />
        <HintRow icon=".*" label="Match with regex" />
      </div>
    </div>
  );
}

function HintRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontSize: 10, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace",
        color: "var(--text-muted)", background: "var(--bg-badge)", borderRadius: 3,
        padding: "1px 5px", minWidth: 20, textAlign: "center" as const,
      }}>{icon}</span>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

/* ── Styles ── */
const S: Record<string, React.CSSProperties> = {
  root: {
    width: "100%", height: "100%", background: "var(--bg-surface)",
    display: "flex", flexDirection: "column",
    boxSizing: "border-box",
  },
  header: {
    padding: "12px 12px 0",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
  },
  inputArea: {
    padding: "8px 10px 0",
    flexShrink: 0,
  },
  inputRow: {
    display: "flex", alignItems: "center", gap: 6,
    background: "var(--bg-input)", border: "1px solid var(--border-subtle)",
    borderRadius: 6, padding: "4px 6px 4px 8px",
  },
  input: {
    border: "none", outline: "none", background: "transparent",
    fontSize: 12, color: "var(--text-primary)", flex: 1, minWidth: 0,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    height: 22,
  } as React.CSSProperties,
  inlineToggles: {
    display: "flex", alignItems: "center", gap: 2,
    flexShrink: 0,
  },
  countRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "6px 2px 6px",
  },
  countText: {
    fontSize: 11, color: "var(--text-muted)",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },
  clearAll: {
    display: "flex", border: "none", background: "transparent",
    color: "var(--text-dimmed)", cursor: "pointer", padding: 3,
    borderRadius: 4,
  },
  fileList: {
    flex: 1, overflowY: "auto" as const,
    borderTop: "1px solid var(--border)",
    padding: "4px 4px",
  },
  emptyState: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    gap: 10, paddingTop: 60, flex: 1,
  },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 14,
    background: "var(--bg-input)", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  hintGrid: {
    display: "flex", flexDirection: "column" as const,
    gap: 6, marginTop: 8,
  },
};
