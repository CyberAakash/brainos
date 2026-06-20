import React from "react";
import { useStore } from "@/store";

export default function StatusBar() {
  const captures = useStore((s) => s.captures);

  return (
    <div style={styles.bar}>
      <span style={styles.dot} />
      <span style={styles.text}>
        {captures.length} capture{captures.length !== 1 ? "s" : ""}
      </span>
      <div style={styles.spacer} />
    </div>
  );
}

/* ────── inline styles ────── */

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 36,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    background: "#FAF8F3",
    borderTop: "1px solid #E9E5DC",
    fontFamily: "ui-monospace, Menlo, monospace",
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#5F8C5A",
    animation: "pulseDot 1.8s ease-in-out infinite",
    flexShrink: 0,
  },

  text: {
    fontSize: 11.5,
    color: "#9A968B",
  },

  spacer: {
    flex: 1,
  },
};
