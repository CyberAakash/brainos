import React, { useCallback } from "react";
import { useStore } from "@/store";

export default function TopBar() {
  const mainMode = useStore((s) => s.mainMode);
  const setMainMode = useStore((s) => s.setMainMode);
  const goHome = useStore((s) => s.goHome);
  const togglePalette = useStore((s) => s.togglePalette);
  const goBrowse = useStore((s) => s.goBrowse);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const openSettings = useStore((s) => s.openSettings);

  const handleGoHome = useCallback(() => {
    if (mainMode === "home") {
      setMainMode(null);
    } else {
      goHome();
      setMainMode("home");
    }
  }, [mainMode, goHome, setMainMode]);

  const handleBrowseAll = useCallback(() => {
    if (mainMode === "browse") {
      setMainMode(null);
    } else {
      goBrowse("all", null, "All captures");
    }
  }, [mainMode, goBrowse, setMainMode]);

  return (
    <div style={styles.bar} data-tauri-drag-region>
      <button onClick={handleGoHome} style={styles.logoBtn}>
        <span style={styles.logoDot} />
        <span style={styles.logoText}>BrainOS</span>
      </button>

      {/* Nav icons */}
      <div style={styles.navGroup}>
        <button
          onClick={handleGoHome}
          title="Home"
          style={{
            ...styles.navBtn,
            color: mainMode === "home" ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7.5L9 3l6 4.5V15a1 1 0 01-1 1H4a1 1 0 01-1-1V7.5z" />
            <polyline points="7,16 7,10 11,10 11,16" />
          </svg>
        </button>

        <button
          onClick={handleBrowseAll}
          title="All captures"
          style={{
            ...styles.navBtn,
            color: mainMode === "browse" ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="2" y="2.5" width="5" height="5" rx="1" />
            <rect x="9" y="2.5" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </svg>
        </button>
      </div>

      <div style={styles.spacer} />

      {/* Search button */}
      <button onClick={() => togglePalette()} style={styles.searchBtn}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
        >
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
        <span style={styles.searchLabel}>Search...</span>
        <span style={styles.searchKbd}>⌘K</span>
      </button>

      {/* Settings */}
      <button
        onClick={openSettings}
        title="Settings (⌘,)"
        style={{
          ...styles.iconBtn,
          color: settingsOpen ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <line x1="3" y1="6" x2="15" y2="6" />
          <line x1="3" y1="12" x2="15" y2="12" />
          <circle cx="11" cy="6" r="2.1" fill="var(--bg-surface)" />
          <circle cx="7" cy="12" r="2.1" fill="var(--bg-surface)" />
        </svg>
      </button>
    </div>
  );
}

/* ────── inline styles ────── */

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 48,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
    // 78px left padding leaves room for macOS traffic lights
    padding: "0 14px 0 78px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  },

  /* sidebar toggle / gear */
  iconBtn: {
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    borderRadius: 7,
    cursor: "pointer",
  },

  /* logo cluster */
  logoBtn: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
  },
  logoDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: "var(--accent)",
    display: "inline-block",
  },
  logoText: {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 20,
    fontWeight: 500,
    fontStyle: "italic",
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
  },

  /* nav icons */
  navGroup: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    marginLeft: 6,
  },
  navBtn: {
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    borderRadius: 7,
    cursor: "pointer",
  },

  spacer: { flex: 1 },

  /* search pill */
  searchBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 8,
    padding: "6px 9px",
    cursor: "pointer",
  },
  searchLabel: {
    fontSize: 13,
    color: "var(--text-faint)",
  },
  searchKbd: {
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 11,
    color: "var(--text-dimmed)",
    background: "var(--bg-input)",
    borderRadius: 5,
    padding: "2px 5px",
  },

};
