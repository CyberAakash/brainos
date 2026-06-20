import React, { useCallback } from "react";
import { useStore } from "@/store";
import type { MainMode } from "@/store";

export default function TopBar() {
  const mainMode = useStore((s) => s.mainMode);
  const setMainMode = useStore((s) => s.setMainMode);
  const togglePalette = useStore((s) => s.togglePalette);
  const openNew = useStore((s) => s.openNew);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const goBrowse = useStore((s) => s.goBrowse);

  const handleNav = useCallback(
    (mode: MainMode) => () => setMainMode(mode),
    [setMainMode],
  );

  const handleBrowseAll = useCallback(
    () => goBrowse("all", null, "All captures"),
    [goBrowse],
  );

  return (
    <div style={styles.bar}>
      {/* Left: sidebar toggle + logo */}
      <button
        onClick={toggleSidebar}
        title="Toggle sidebar (⌘B)"
        style={styles.iconBtn}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
          <line x1="8" y1="3.5" x2="8" y2="16.5" />
        </svg>
      </button>

      <button onClick={handleNav("home")} style={styles.logoBtn}>
        <span style={styles.logoDot} />
        <span style={styles.logoText}>BrainOS</span>
      </button>

      {/* Nav icons */}
      <div style={styles.navGroup}>
        <button
          onClick={handleNav("home")}
          title="Home"
          style={{
            ...styles.navBtn,
            color: mainMode === "home" ? "#BD6A47" : "#8C887E",
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
            color: mainMode === "browse" ? "#BD6A47" : "#8C887E",
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
      <button onClick={togglePalette} style={styles.searchBtn}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="#8C887E"
          strokeWidth="1.5"
        >
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
        <span style={styles.searchLabel}>Search...</span>
        <span style={styles.searchKbd}>⌘K</span>
      </button>

      {/* New capture */}
      <button onClick={openNew} title="New capture" style={styles.newBtn}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <line x1="7" y1="2.5" x2="7" y2="11.5" />
          <line x1="2.5" y1="7" x2="11.5" y2="7" />
        </svg>
      </button>

      {/* Settings */}
      <button
        onClick={handleNav("settings")}
        title="Settings"
        style={{
          ...styles.iconBtn,
          color: mainMode === "settings" ? "#BD6A47" : "#8C887E",
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
          <circle cx="11" cy="6" r="2.1" fill="#F7F5EF" />
          <circle cx="7" cy="12" r="2.1" fill="#F7F5EF" />
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
    padding: "0 14px",
    background: "#F7F5EF",
    borderBottom: "1px solid #E9E5DC",
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
    color: "#8C887E",
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
    background: "#BD6A47",
    display: "inline-block",
  },
  logoText: {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 20,
    fontWeight: 500,
    fontStyle: "italic",
    color: "#21201C",
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
    background: "#FFFFFF",
    border: "1px solid #E7E1D6",
    borderRadius: 8,
    padding: "6px 9px",
    cursor: "pointer",
  },
  searchLabel: {
    fontSize: 13,
    color: "#9A968B",
  },
  searchKbd: {
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 11,
    color: "#A8A398",
    background: "#F2EDE3",
    borderRadius: 5,
    padding: "2px 5px",
  },

  /* new capture */
  newBtn: {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "#BD6A47",
    color: "#FFF",
    borderRadius: 9,
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(120,60,30,.3)",
  },
};
