/**
 * CanvasMarkdown — renders parsed markdown blocks as DOM elements.
 *
 * Supports optional search highlighting: pass `highlightQuery` + `targetLineText`
 * to highlight matching keywords and mark the target block with a left-border indicator.
 */

import React from "react";

/* ── Block types (same shape as DetailPanel's parseBody) ── */
export interface MdBlock {
  kind: "heading" | "paragraph" | "code";
  content: string;
  lang?: string;
}

/* ── Component ── */
interface Props {
  blocks: MdBlock[];
  width?: number;  // kept for API compat but not used
  large?: boolean;
  style?: React.CSSProperties;
  /** Search query to highlight across all blocks */
  highlightQuery?: string;
  /** Raw line text from body_text to identify the target block */
  targetLineText?: string;
  /** Case-sensitive matching for highlights */
  caseSensitive?: boolean;
}

export default function CanvasMarkdown({
  blocks, large, style,
  highlightQuery, targetLineText, caseSensitive,
}: Props) {
  if (!blocks.length) return null;

  const scale = large ? 1.15 : 1;
  const hl = highlightQuery?.trim() || "";

  // Determine which block is the "target" (the one user clicked in search results)
  let targetIdx = -1;
  if (targetLineText) {
    const cleaned = targetLineText.replace(/^#{1,4}\s+/, "").trim();
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].content.includes(cleaned) || blocks[i].content.includes(targetLineText)) {
        targetIdx = i;
        break;
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      {blocks.map((block, i) => {
        const isTarget = i === targetIdx;

        // Target block wrapper styling — amber left border + tinted background
        const targetWrap: React.CSSProperties = isTarget
          ? {
              borderLeft: "3px solid var(--highlight)",
              paddingLeft: 12,
              marginLeft: -15,
              background: "var(--highlight-bg)",
              borderRadius: 4,
              transition: "background 0.3s ease",
            }
          : {};

        if (block.kind === "heading") {
          return (
            <h3
              key={i}
              data-block-idx={i}
              {...(isTarget ? { "data-search-target": "true" } : {})}
              style={{
                fontFamily: "'Newsreader', Georgia, serif",
                fontSize: Math.round(20 * scale),
                fontWeight: 600,
                lineHeight: 1.35,
                color: "var(--text-primary)",
                margin: i > 0 ? "6px 0 0" : 0,
                ...targetWrap,
              }}
            >
              {hl ? highlightText(block.content, hl, caseSensitive) : block.content}
            </h3>
          );
        }

        if (block.kind === "code") {
          return (
            <pre
              key={i}
              data-block-idx={i}
              {...(isTarget ? { "data-search-target": "true" } : {})}
              style={{
                background: "var(--tooltip-bg)",
                color: "var(--editor-text)",
                fontFamily: "ui-monospace, Menlo, 'Cascadia Code', monospace",
                fontSize: Math.round(13 * scale),
                lineHeight: 1.55,
                padding: "14px 16px",
                borderRadius: 10,
                margin: 0,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...(isTarget
                  ? { borderLeft: "3px solid var(--highlight)", boxShadow: "inset 3px 0 0 0 var(--highlight-glow)" }
                  : {}),
              }}
            >
              {block.lang && (
                <span style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}>
                  {block.lang}
                </span>
              )}
              <code>
                {hl ? highlightCode(block.content, hl, caseSensitive) : block.content}
              </code>
            </pre>
          );
        }

        // paragraph — handle inline formatting + optional highlighting
        return (
          <p
            key={i}
            data-block-idx={i}
            {...(isTarget ? { "data-search-target": "true" } : {})}
            style={{
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              fontSize: Math.round(15 * scale),
              lineHeight: 1.6,
              color: "var(--text-heading)",
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              ...targetWrap,
            }}
          >
            {renderInline(block.content, hl, caseSensitive)}
          </p>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Highlighting helpers
   ═══════════════════════════════════════════════════════════════ */

/** Mark style for normal text (paragraphs, headings) */
const MARK_STYLE: React.CSSProperties = {
  background: "var(--highlight)",
  color: "var(--text-primary)",
  borderRadius: 2,
  padding: "1px 2px",
  fontWeight: 600,
  boxDecorationBreak: "clone" as any,
};

/** Mark style for code blocks — more subtle, no bold */
const CODE_MARK_STYLE: React.CSSProperties = {
  background: "var(--highlight-badge-bg)",
  color: "var(--match-text)",
  borderRadius: 2,
  padding: "0 2px",
};

/**
 * Highlight plain text: split by query matches and wrap in <mark>.
 * Used for headings (which have no inline markdown).
 */
function highlightText(
  text: string,
  query: string,
  caseSensitive?: boolean,
): React.ReactNode[] {
  if (!query) return [text];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, caseSensitive ? "g" : "gi");
  const parts = text.split(re);
  if (parts.length === 1) return [text];

  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Matched part
      return <mark key={i} style={MARK_STYLE}>{part}</mark>;
    }
    return part || null;
  }).filter(Boolean) as React.ReactNode[];
}

/**
 * Highlight code text — preserves whitespace and uses subtle styling.
 */
function highlightCode(
  code: string,
  query: string,
  caseSensitive?: boolean,
): React.ReactNode[] {
  if (!query) return [code];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, caseSensitive ? "g" : "gi");
  const parts = code.split(re);
  if (parts.length === 1) return [code];

  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <mark key={i} style={CODE_MARK_STYLE}>{part}</mark>;
    }
    return part || null;
  }).filter(Boolean) as React.ReactNode[];
}

/* ═══════════════════════════════════════════════════════════════
   Inline formatting (with optional highlight)
   ═══════════════════════════════════════════════════════════════ */

function renderInline(
  text: string,
  highlight?: string,
  caseSensitive?: boolean,
): React.ReactNode[] {
  // Handle **bold**, *italic*, `code`, and [links](url)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyBase = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      const raw = text.slice(lastIndex, match.index);
      if (highlight) {
        parts.push(...highlightText(raw, highlight, caseSensitive).map(
          (n, j) => typeof n === "string" ? n : React.cloneElement(n as React.ReactElement, { key: `pre-${keyBase}-${j}` })
        ));
      } else {
        parts.push(raw);
      }
    }

    if (match[1]) {
      // **bold**
      const inner = match[2];
      parts.push(
        <strong key={`b-${match.index}`} style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {highlight ? highlightText(inner, highlight, caseSensitive) : inner}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      const inner = match[4];
      parts.push(
        <em key={`i-${match.index}`} style={{ fontStyle: "italic" }}>
          {highlight ? highlightText(inner, highlight, caseSensitive) : inner}
        </em>
      );
    } else if (match[5]) {
      // `inline code`
      const inner = match[6];
      parts.push(
        <code key={`c-${match.index}`} style={{
          background: "var(--bg-hover)",
          padding: "1px 5px",
          borderRadius: 4,
          fontSize: "0.9em",
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "var(--text-secondary)",
        }}>
          {highlight ? highlightText(inner, highlight, caseSensitive) : inner}
        </code>
      );
    } else if (match[7]) {
      // [link](url)
      const inner = match[8];
      parts.push(
        <a key={`a-${match.index}`} href={match[9]} style={{ color: "var(--accent)", textDecoration: "underline" }}>
          {highlight ? highlightText(inner, highlight, caseSensitive) : inner}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
    keyBase++;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (highlight) {
      parts.push(...highlightText(remaining, highlight, caseSensitive).map(
        (n, j) => typeof n === "string" ? n : React.cloneElement(n as React.ReactElement, { key: `end-${j}` })
      ));
    } else {
      parts.push(remaining);
    }
  }

  return parts.length > 0 ? parts : [text];
}
