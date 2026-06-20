/**
 * Pretext integration for BrainOS.
 *
 * Wraps @chenglou/pretext to provide:
 *  - Text height measurement without DOM reflow
 *  - Line-level layout for canvas rendering
 *  - Balanced text / shrink-wrap helpers
 */

import {
  prepare,
  layout,
  prepareWithSegments,
  layoutWithLines,
  walkLineRanges,
  measureLineStats,
  clearCache,
  type PreparedText,
  type PreparedTextWithSegments,
  type LayoutLine,
  type LayoutCursor,
} from "@chenglou/pretext";

// Re-export types for consumers
export type {
  PreparedText,
  PreparedTextWithSegments,
  LayoutLine,
  LayoutCursor,
};

/* ── Design tokens as font strings ── */

export const FONTS = {
  /** Newsreader serif for headings */
  heading: (size: number, weight = 600) =>
    `${weight} ${size}px Newsreader, Georgia, serif`,

  /** Hanken Grotesk for body text */
  body: (size: number, weight = 400) =>
    `${weight} ${size}px "Hanken Grotesk", system-ui, sans-serif`,

  /** Monospace for code */
  mono: (size: number, weight = 400) =>
    `${weight} ${size}px ui-monospace, Menlo, "Cascadia Code", monospace`,
};

/* ── Measurement helpers ── */

/** Measure text height at a given width, returns { height, lineCount } */
export function measureHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
): { height: number; lineCount: number } {
  if (!text.trim()) return { height: 0, lineCount: 0 };
  const p = prepare(text, font);
  return layout(p, maxWidth, lineHeight);
}

/** Prepare text for line-level layout (canvas rendering) */
export function prepareText(
  text: string,
  font: string,
  opts?: { whiteSpace?: "normal" | "pre-wrap"; wordBreak?: "normal" | "keep-all" },
) {
  return prepareWithSegments(text, font, opts);
}

/** Get all lines at a given width */
export function getLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number,
): LayoutLine[] {
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight);
  return lines;
}

/** Find the tightest width that still fits within a target line count */
export function shrinkWrap(
  text: string,
  font: string,
  maxWidth: number,
  _lineHeight?: number,
): number {
  if (!text.trim()) return 0;
  const prepared = prepareWithSegments(text, font);
  let bestWidth = maxWidth;

  walkLineRanges(prepared, maxWidth, (line) => {
    if (line.width > 0 && line.width < bestWidth) {
      bestWidth = line.width;
    }
  });

  // Find max line width — the tightest container that still fits
  let maxLineWidth = 0;
  walkLineRanges(prepared, maxWidth, (line) => {
    if (line.width > maxLineWidth) maxLineWidth = line.width;
  });

  return Math.ceil(maxLineWidth) + 1; // +1 for rounding safety
}

/**
 * Balanced text: binary-search the narrowest width that keeps
 * the same line count as maxWidth, so lines are roughly equal width.
 */
export function balancedWidth(
  text: string,
  font: string,
  maxWidth: number,
  _lineHeight?: number,
): number {
  if (!text.trim()) return 0;
  const prepared = prepareWithSegments(text, font);

  const baseStats = measureLineStats(prepared, maxWidth);
  if (baseStats.lineCount <= 1) return Math.ceil(baseStats.maxLineWidth) + 1;

  const targetLines = baseStats.lineCount;

  // Binary search for narrowest width keeping same line count
  let lo = Math.ceil(maxWidth * 0.4);
  let hi = maxWidth;
  let best = maxWidth;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { lineCount } = measureLineStats(prepared, mid);
    if (lineCount <= targetLines) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return best;
}

/* ── Canvas rendering helpers ── */

export interface CanvasTextStyle {
  font: string;
  color: string;
  lineHeight: number;
}

/**
 * Render prepared text lines onto a canvas 2D context.
 * Returns the total height consumed.
 */
export function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  style: CanvasTextStyle,
  x: number,
  y: number,
): number {
  const lines = getLines(prepared, maxWidth, style.lineHeight);
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textBaseline = "top";

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].text, x, y + i * style.lineHeight);
  }

  return lines.length * style.lineHeight;
}

/** Clear Pretext's internal measurement caches */
export function clearPretextCache() {
  clearCache();
}

/* ── Virtualization helper ── */

export interface VirtualItem {
  id: string;
  height: number;
  offset: number;
}

/**
 * Pre-compute row heights for a list of text items.
 * Returns an array of { id, height, offset } for virtual scrolling.
 */
export function computeVirtualLayout(
  items: { id: string; text: string }[],
  font: string,
  maxWidth: number,
  lineHeight: number,
  padding = 0,
): VirtualItem[] {
  let offset = 0;
  return items.map((item) => {
    const { height } = measureHeight(item.text, font, maxWidth, lineHeight);
    const totalHeight = Math.max(height, lineHeight) + padding;
    const result: VirtualItem = { id: item.id, height: totalHeight, offset };
    offset += totalHeight;
    return result;
  });
}

/**
 * Given a scroll position and viewport height, return which items are visible.
 */
export function getVisibleRange(
  items: VirtualItem[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 3,
): { start: number; end: number; totalHeight: number } {
  if (items.length === 0) return { start: 0, end: 0, totalHeight: 0 };

  const totalHeight = items[items.length - 1].offset + items[items.length - 1].height;

  // Binary search for first visible item
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].offset + items[mid].height < scrollTop) lo = mid + 1;
    else hi = mid;
  }
  const start = Math.max(0, lo - overscan);

  // Find last visible
  let end = lo;
  const bottom = scrollTop + viewportHeight;
  while (end < items.length && items[end].offset < bottom) end++;
  end = Math.min(items.length, end + overscan);

  return { start, end, totalHeight };
}
