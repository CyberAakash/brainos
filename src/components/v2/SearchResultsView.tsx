import { useState } from "react";
import { useStore, getColorMeta, type GlobalSearchMatch } from "@/store";

/* ════════════════════════════════════════════════════════════════
   SearchResultsView — Zed-style multibuffer search results
   Renders in the center pane when search has results.
   File-grouped results with context lines, highlighted matches,
   and click-to-open-detail behavior.
   ════════════════════════════════════════════════════════════════ */

export default function SearchResultsView() {
  const results = useStore((s) => s.globalSearchResults);
  const query = useStore((s) => s.globalSearchQuery);
  const searching = useStore((s) => s.globalSearching);
  const openDetail = useStore((s) => s.openDetail);

  const totalMatches = results.reduce((a, r) => a + r.matchCount, 0);

  if (searching) {
    return (
      <div style={S.root}>
        <div style={S.emptyCenter}>
          <div style={S.spinner} />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Searching…</span>
        </div>
      </div>
    );
  }

  if (!query.trim()) {
    return (
      <div style={S.root}>
        <div style={S.emptyCenter}>
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none" stroke="var(--text-ghost)" strokeWidth="1.2">
            <circle cx="14" cy="14" r="8" />
            <line x1="19.5" y1="19.5" x2="27" y2="27" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Type to search across all captures</span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Results will appear here</span>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={S.root}>
        <div style={S.emptyCenter}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>No results found</span>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            No matches for "{query}"
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* Sticky header with summary */}
      <div style={S.header}>
        <span style={S.headerTitle}>
          {totalMatches} result{totalMatches !== 1 ? "s" : ""} in {results.length} file{results.length !== 1 ? "s" : ""}
        </span>
        <span style={S.headerQuery}>"{query}"</span>
      </div>

      {/* Results list */}
      <div style={S.scrollArea}>
        {results.map((match) => (
          <FileMatchGroup
            key={match.captureId}
            match={match}
            onOpen={(lineNum?: number) => openDetail(match.captureId, lineNum)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── File match group (one capture) ── */
function FileMatchGroup({ match, onOpen }: { match: GlobalSearchMatch; onOpen: (lineNum?: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [headerHovered, setHeaderHovered] = useState(false);
  const color = getColorMeta(match.color);

  // Group consecutive lines into "chunks" separated by gaps
  const chunks: GlobalSearchMatch["lines"][] = [];
  let currentChunk: GlobalSearchMatch["lines"] = [];
  for (let i = 0; i < match.lines.length; i++) {
    if (currentChunk.length > 0) {
      const prevLine = currentChunk[currentChunk.length - 1].lineNum;
      if (match.lines[i].lineNum > prevLine + 1) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }
    currentChunk.push(match.lines[i]);
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  return (
    <div style={{ marginBottom: 2 }}>
      {/* File header */}
      <button
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", border: "none",
          background: headerHovered ? "var(--bg-hover)" : "var(--bg-elevated)",
          borderRadius: 0, padding: "7px 16px",
          cursor: "pointer", textAlign: "left",
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          transition: "background .06s",
          position: "sticky" as const, top: 0, zIndex: 1,
        }}
      >
        {/* Chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round"
          style={{ flexShrink: 0, transition: "transform .1s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <polyline points="3,2 7,5 3,8" />
        </svg>

        {/* File icon */}
        {match.icon ? (
          <span style={{ fontSize: 14, flexShrink: 0 }}>{match.icon}</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color.dot} strokeWidth="1.2" style={{ flexShrink: 0 }}>
            <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" />
            <path d="M9 2v4h4" />
          </svg>
        )}

        {/* Title + path */}
        <span style={{
          flex: 1, minWidth: 0, overflow: "hidden",
          display: "flex", alignItems: "baseline", gap: 8,
        }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-heading)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {match.title}
          </span>
          <span style={{
            fontSize: 11.5, color: "var(--text-dimmed)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            flexShrink: 10,
          }}>
            {match.space} / {match.captureType}
          </span>
        </span>

        {/* Match count badge */}
        <span style={{
          fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600,
          fontFamily: "ui-monospace, Menlo, monospace",
          background: headerHovered ? "var(--bg-badge)" : "var(--bg-hover)",
          borderRadius: 8, padding: "2px 8px", flexShrink: 0,
          transition: "background .06s",
        }}>
          {match.matchCount}
        </span>

        {/* Open file link */}
        {headerHovered && (
          <span
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            style={{
              fontSize: 11.5, color: "var(--accent)", fontWeight: 500,
              whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
            }}
          >
            Open
          </span>
        )}
      </button>

      {/* Matching lines grouped into chunks */}
      {expanded && (
        <div style={{ fontFamily: "ui-monospace, Menlo, Monaco, 'Cascadia Code', monospace" }}>
          {chunks.map((chunk, ci) => (
            <div key={ci}>
              {ci > 0 && <div style={S.chunkSep} />}
              {chunk.map((line, li) => (
                <MatchLine key={li} line={line} onClick={() => onOpen(line.lineNum)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Single line (match or context) ── */
function MatchLine({ line, onClick }: {
  line: GlobalSearchMatch["lines"][0];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isContext = line.isContext;

  // Build highlighted spans
  const parts: { text: string; highlight: boolean }[] = [];
  if (!isContext && line.matchRanges.length > 0) {
    let lastEnd = 0;
    for (const [start, end] of line.matchRanges) {
      if (start > lastEnd) parts.push({ text: line.text.slice(lastEnd, start), highlight: false });
      parts.push({ text: line.text.slice(start, end), highlight: true });
      lastEnd = end;
    }
    if (lastEnd < line.text.length) parts.push({ text: line.text.slice(lastEnd), highlight: false });
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start",
        padding: "0 16px 0 0",
        background: hovered
          ? (isContext ? "var(--bg-elevated)" : "var(--match-row-hover)")
          : (isContext ? "transparent" : "var(--match-row)"),
        cursor: "pointer",
        transition: "background .04s",
        minHeight: 22,
      }}
    >
      {/* Line number gutter */}
      <span style={{
        width: 56, flexShrink: 0,
        textAlign: "right",
        fontSize: 12, lineHeight: "22px",
        color: isContext ? "var(--text-ghost)" : "var(--text-faint)",
        paddingRight: 14,
        userSelect: "none" as const,
      }}>
        {line.lineNum}
      </span>
      {/* Line content */}
      <span style={{
        fontSize: 12.5, lineHeight: "22px",
        color: isContext ? "var(--text-faint)" : "var(--text-heading)",
        overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "pre" as const, flex: 1, minWidth: 0,
      }}>
        {isContext || parts.length === 0 ? (
          line.text || " "
        ) : (
          parts.map((p, i) =>
            p.highlight ? (
              <span key={i} style={{
                background: "var(--match-bg)",
                color: "var(--match-text)",
                borderRadius: 2,
                padding: "1px 2px",
                fontWeight: 600,
              }}>{p.text}</span>
            ) : (
              <span key={i}>{p.text}</span>
            )
          )
        )}
      </span>
    </div>
  );
}

/* ── Styles ── */
const S: Record<string, React.CSSProperties> = {
  root: {
    width: "100%", height: "100%", background: "var(--bg-surface)",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },
  headerQuery: {
    fontSize: 12, color: "var(--text-faint)",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    fontStyle: "italic",
  },
  scrollArea: {
    flex: 1, overflowY: "auto" as const,
  },
  chunkSep: {
    height: 1, background: "var(--border-chunk)",
    margin: "0 16px 0 56px",
  },
  emptyCenter: {
    flex: 1, display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    gap: 8,
  },
  spinner: {
    width: 24, height: 24,
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
};
