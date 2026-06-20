/**
 * CanvasMarkdown — renders parsed markdown blocks as DOM elements.
 *
 * Previously used canvas rendering via Pretext, but that was fragile
 * (ResizeObserver issues in fullscreen, silent failures). DOM rendering
 * is simpler and handles layout naturally.
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
}

export default function CanvasMarkdown({ blocks, large, style }: Props) {
  if (!blocks.length) return null;

  const scale = large ? 1.15 : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <h3 key={i} style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: Math.round(20 * scale),
              fontWeight: 600,
              lineHeight: 1.35,
              color: "#21201C",
              margin: i > 0 ? "6px 0 0" : 0,
            }}>
              {block.content}
            </h3>
          );
        }

        if (block.kind === "code") {
          return (
            <pre key={i} style={{
              background: "#2B2823",
              color: "#E8E4DB",
              fontFamily: "ui-monospace, Menlo, 'Cascadia Code', monospace",
              fontSize: Math.round(13 * scale),
              lineHeight: 1.55,
              padding: "14px 16px",
              borderRadius: 10,
              margin: 0,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {block.lang && (
                <span style={{
                  display: "block",
                  fontSize: 11,
                  color: "#8C887E",
                  marginBottom: 8,
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}>
                  {block.lang}
                </span>
              )}
              <code>{block.content}</code>
            </pre>
          );
        }

        // paragraph — handle inline formatting
        return (
          <p key={i} style={{
            fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
            fontSize: Math.round(15 * scale),
            lineHeight: 1.6,
            color: "#3F3B33",
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {renderInline(block.content)}
          </p>
        );
      })}
    </div>
  );
}

/* ── Inline formatting ── */
function renderInline(text: string): React.ReactNode[] {
  // Handle **bold**, *italic*, `code`, and [links](url)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(<strong key={match.index} style={{ fontWeight: 600, color: "#21201C" }}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index} style={{ fontStyle: "italic" }}>{match[4]}</em>);
    } else if (match[5]) {
      // `inline code`
      parts.push(
        <code key={match.index} style={{
          background: "#F2EDE3",
          padding: "1px 5px",
          borderRadius: 4,
          fontSize: "0.9em",
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "#6B5B48",
        }}>
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // [link](url)
      parts.push(
        <a key={match.index} href={match[9]} style={{ color: "#BD6A47", textDecoration: "underline" }}>
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
