import { useEffect } from "react";
import { useStore } from "./store";

// Legacy type kept for backward-compat with v1 components
export type View = "browse" | "editor" | "graph" | "chat" | "timeline" | "settings";

import TopBar from "./components/v2/TopBar";
import ContextSidebar from "./components/v2/ContextSidebar";
import HomeView from "./components/v2/HomeView";
import BrowseView from "./components/v2/BrowseView";
import DetailPanel from "./components/v2/DetailPanel";
import SettingsView from "./components/v2/SettingsView";
import StatusBar from "./components/v2/StatusBar";
import CommandPalette from "./components/v2/CommandPalette";
import NewCaptureModal from "./components/v2/NewCaptureModal";
import Toast from "./components/v2/Toast";

export default function App() {
  const mainMode = useStore((s) => s.mainMode);
  const detailOpen = useStore((s) => s.detailOpen);
  const togglePalette = useStore((s) => s.togglePalette);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const closePalette = useStore((s) => s.closePalette);
  const closeNew = useStore((s) => s.closeNew);
  const loadCaptures = useStore((s) => s.loadCaptures);

  // Load captures on mount
  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const key = (e.key || "").toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        togglePalette();
      } else if ((e.metaKey || e.ctrlKey) && key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (key === "escape") {
        closePalette();
        closeNew();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePalette, toggleSidebar, closePalette, closeNew]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#F5F3ED",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        color: "#21201C",
        overflow: "hidden",
      }}
    >
      {/* Top Bar */}
      <TopBar />

      {/* Main area: sidebar + content + detail */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Context Sidebar */}
        <ContextSidebar />

        {/* Main panel */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          <div style={{ flex: 1, overflow: (mainMode === "home" || mainMode === "chat") ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
            {(mainMode === "home" || mainMode === "chat") && <HomeView />}
            {mainMode === "browse" && <BrowseView />}
            {mainMode === "settings" && <SettingsView />}
          </div>

          {/* Detail Panel (inside main panel so fullscreen respects sidebar) */}
          {detailOpen && <DetailPanel />}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Modals */}
      <CommandPalette />
      <NewCaptureModal />
      <Toast />
    </div>
  );
}
