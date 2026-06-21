import React from "react";
import { useStore } from "@/store";
import type { MainMode, BrowseFilter } from "@/store";

export default function StatusBar() {
  const captures = useStore((s) => s.captures);
  const mainMode = useStore((s) => s.mainMode);
  const browseFilter = useStore((s) => s.browseFilter);
  const setMainMode = useStore((s) => s.setMainMode);
  const goBrowse = useStore((s) => s.goBrowse);

  const crumbs = buildCrumbs(mainMode, browseFilter, setMainMode, goBrowse);

  return (
    <div style={styles.bar}>
      {/* Left: breadcrumbs */}
      <div style={styles.crumbRow}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={styles.sep}>›</span>}
            {c.onClick ? (
              <button onClick={c.onClick} style={styles.crumbBtn}>{c.label}</button>
            ) : (
              <span style={styles.crumbActive}>{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div style={styles.spacer} />

      {/* Right: status */}
      <span style={styles.dot} />
      <span style={styles.text}>
        {captures.length} capture{captures.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

/* ── Breadcrumb builder ── */
interface Crumb { label: string; onClick?: () => void }

function buildCrumbs(
  mode: MainMode,
  filter: BrowseFilter,
  setMainMode: (m: MainMode) => void,
  goBrowse: (kind: BrowseFilter["kind"], value: string | null, label: string) => void,
): Crumb[] {
  const home: Crumb = { label: "Home", onClick: () => setMainMode("home") };

  if (mode === "home" || mode === "chat") {
    return [{ label: "Home" }];
  }

  if (mode === "browse") {
    if (filter.kind === "all") {
      return [home, { label: "All captures" }];
    }
    return [
      home,
      { label: "All captures", onClick: () => goBrowse("all", null, "All captures") },
      { label: filter.label },
    ];
  }

  return [home, { label: mode }];
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
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },

  crumbRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    overflow: "hidden",
  },

  crumbBtn: {
    border: "none",
    background: "transparent",
    color: "#BD6A47",
    fontSize: 11.5,
    fontWeight: 500,
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
    whiteSpace: "nowrap" as const,
    transition: "background .1s",
  },

  crumbActive: {
    fontSize: 11.5,
    fontWeight: 500,
    color: "#56524A",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  sep: {
    fontSize: 11,
    color: "#C8C2B6",
    flexShrink: 0,
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
    fontFamily: "ui-monospace, Menlo, monospace",
  },

  spacer: {
    flex: 1,
  },
};
