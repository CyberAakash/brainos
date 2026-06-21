import { useRef, useState, useEffect, useCallback } from "react";

/* ════════════════════════════════════════════════════════════════
   MarqueeTitle — infinite linear scroll animation on hover
   Only activates when the text overflows its container.
   ════════════════════════════════════════════════════════════════ */

interface MarqueeTitleProps {
  text: string;
  style?: React.CSSProperties;
  /** Pixels per second — controls scroll speed */
  speed?: number;
  /** Gap between repeated text in px */
  gap?: number;
  /** Always animate (not just on hover) */
  always?: boolean;
  /** Parent-driven hover — animates when true, ignores internal hover */
  externalHover?: boolean;
}

export default function MarqueeTitle({
  text,
  style,
  speed = 20,
  gap = 40,
  always = false,
  externalHover,
}: MarqueeTitleProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [textWidth, setTextWidth] = useState(0);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const span = measureRef.current;
    if (!outer || !span) return;
    const sw = span.scrollWidth;
    setTextWidth(sw);
    setOverflows(sw > outer.clientWidth + 1);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [measure, text]);

  const animate = overflows && (always || (externalHover !== undefined ? externalHover : hovered));
  const duration = textWidth > 0 ? (textWidth + gap) / speed : 4;

  return (
    <div
      ref={outerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...style,
        overflow: "hidden",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      {/* Hidden span for measuring text width — always rendered */}
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {text}
      </span>

      {animate ? (
        <span
          style={{
            display: "inline-block",
            animation: `marqueeScroll ${duration}s linear infinite`,
            paddingRight: gap,
          }}
        >
          <span>{text}</span>
          <span style={{ paddingLeft: gap }}>{text}</span>
        </span>
      ) : (
        <span
          style={{
            display: "inline-block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}
