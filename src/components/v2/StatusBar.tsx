import React, { useMemo, useState } from "react";
import { useStore } from "@/store";
import type { MainMode, BrowseFilter } from "@/store";

/* ════════════════════════════════════════════════════════════════
   StatusBar — Zed-style dock toggle icons
   Left:  [Explorer] [Chat]     (left dock panel toggles)
   Center: breadcrumbs
   Right:  [Detail] | [Theme] | capture count
   ════════════════════════════════════════════════════════════════ */

export default function StatusBar() {
  const captures = useStore((s) => s.captures);
  const mainMode = useStore((s) => s.mainMode);
  const browseFilter = useStore((s) => s.browseFilter);
  const setMainMode = useStore((s) => s.setMainMode);
  const goBrowse = useStore((s) => s.goBrowse);
  const leftDock = useStore((s) => s.leftDock);
  const rightDock = useStore((s) => s.rightDock);
  const theme = useStore((s) => s.theme);
  const setLeftDockPanel = useStore((s) => s.setLeftDockPanel);
  const setRightDockPanel = useStore((s) => s.setRightDockPanel);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const crumbs = buildCrumbs(mainMode, browseFilter, setMainMode, goBrowse);
  const activeCount = useMemo(() => captures.filter((c) => c.status !== "archived").length, [captures]);

  return (
    <div style={styles.bar}>
      {/* Left: dock toggle icons for left dock panels */}
      <div style={styles.toggleGroup}>
        <DockToggle
          icon={<ExplorerIcon />}
          label="Explorer"
          active={leftDock.open && leftDock.panel === "explorer"}
          onClick={() => setLeftDockPanel("explorer")}
          shortcut="⌘B"
        />
        <DockToggle
          icon={<ChatIcon />}
          label="Chat"
          active={leftDock.open && leftDock.panel === "chat"}
          onClick={() => setLeftDockPanel("chat")}
        />
        <DockToggle
          icon={<SearchIcon />}
          label="Search"
          active={leftDock.open && leftDock.panel === "search"}
          onClick={() => setLeftDockPanel("search")}
          shortcut="⌘⇧F"
        />
      </div>

      {/* Center: breadcrumbs */}
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

      {/* Right: dock toggle icons for right dock + settings + theme */}
      <div style={styles.toggleGroup}>
        <DockToggle
          icon={<DetailIcon />}
          label="Detail"
          active={rightDock.open && rightDock.panel === "detail"}
          onClick={() => setRightDockPanel("detail")}
        />

        <div style={styles.divider} />

        <DockToggle
          icon={theme === "dark" ? <MoonIcon /> : <SunIcon />}
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          active={false}
          onClick={toggleTheme}
        />
      </div>

      <div style={styles.divider} />

      {/* Capture count */}
      <span style={styles.dot} />
      <span style={styles.text}>
        {activeCount} capture{activeCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

/* ── Dock toggle button ── */
function DockToggle({ icon, label, active, onClick, shortcut }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  shortcut?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const title = shortcut ? `${label} (${shortcut})` : label;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={title}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26,
          border: "none",
          background: active ? "var(--accent-active)" : (hovered ? "var(--bg-hover)" : "transparent"),
          borderRadius: 5,
          cursor: "pointer",
          padding: 0,
          transition: "background .1s",
          opacity: active ? 1 : 0.65,
        }}
      >
        {icon}
      </button>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginBottom: 6,
          background: "var(--tooltip-bg)",
          color: "var(--tooltip-text)",
          fontSize: 11,
          fontWeight: 500,
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          padding: "3px 7px",
          borderRadius: 5,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 100,
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
        }}>
          {title}
        </div>
      )}
    </div>
  );
}

/* ── SVG Icons (16x16, stroke-based) ── */

function ExplorerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h5l1.5 2H17v12H3V3z" />
      <line x1="3" y1="8" x2="17" y2="8" strokeWidth="1" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h14v9H7l-4 3.5V4z" />
      <line x1="7" y1="7.5" x2="13" y2="7.5" strokeWidth="1.2" />
      <line x1="7" y1="10" x2="11" y2="10" strokeWidth="1.2" />
    </svg>
  );
}

function DetailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <line x1="11" y1="3" x2="11" y2="17" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5" />
      <line x1="13" y1="13" x2="17" y2="17" strokeWidth="2" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="2" x2="10" y2="4" /><line x1="10" y1="16" x2="10" y2="18" />
      <line x1="2" y1="10" x2="4" y2="10" /><line x1="16" y1="10" x2="18" y2="10" />
      <line x1="4.3" y1="4.3" x2="5.7" y2="5.7" /><line x1="14.3" y1="14.3" x2="15.7" y2="15.7" />
      <line x1="15.7" y1="4.3" x2="14.3" y2="5.7" /><line x1="5.7" y1="14.3" x2="4.3" y2="15.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 11.5A7.5 7.5 0 118.5 3a5.5 5.5 0 008.5 8.5z" />
    </svg>
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

  if (mode === null) {
    return [{ label: "BrainOS" }];
  }

  if (mode === "home") {
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
    gap: 6,
    padding: "0 10px",
    background: "var(--bg-surface)",
    borderTop: "1px solid var(--border)",
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },

  toggleGroup: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },

  divider: {
    width: 1,
    height: 16,
    background: "var(--border-divider)",
    margin: "0 4px",
    flexShrink: 0,
  },

  crumbRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    overflow: "hidden",
    marginLeft: 4,
  },

  crumbBtn: {
    border: "none",
    background: "transparent",
    color: "var(--accent)",
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
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  sep: {
    fontSize: 11,
    color: "var(--text-ghost)",
    flexShrink: 0,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--green-dot)",
    animation: "pulseDot 1.8s ease-in-out infinite",
    flexShrink: 0,
  },

  text: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    fontFamily: "ui-monospace, Menlo, monospace",
  },

  spacer: {
    flex: 1,
  },
};
