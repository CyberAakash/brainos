import { useEffect, useRef, useCallback } from "react";
import { useStore } from "./store";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";

// Legacy type kept for backward-compat with v1 components
export type View = "browse" | "editor" | "graph" | "chat" | "timeline" | "settings";

import TopBar from "./components/v2/TopBar";
import ContextSidebar from "./components/v2/ContextSidebar";
import ChatHistorySidebar from "./components/v2/ChatHistorySidebar";
import HomeView from "./components/v2/HomeView";
import BrowseView from "./components/v2/BrowseView";
import DetailPanel from "./components/v2/DetailPanel";
import SettingsView from "./components/v2/SettingsView";
import StatusBar from "./components/v2/StatusBar";
import CommandPalette from "./components/v2/CommandPalette";
import NewCaptureModal from "./components/v2/NewCaptureModal";
import { Toaster } from "sonner";
import { ShortcutsOverlay, useShortcutsOverlay } from "./components/ui";

export default function App() {
  const mainMode = useStore((s) => s.mainMode);
  const detailOpen = useStore((s) => s.detailOpen);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const togglePalette = useStore((s) => s.togglePalette);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const closePalette = useStore((s) => s.closePalette);
  const closeNew = useStore((s) => s.closeNew);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const openSettings = useStore((s) => s.openSettings);
  const closeSettings = useStore((s) => s.closeSettings);
  const loadCaptures = useStore((s) => s.loadCaptures);
  const shortcuts = useShortcutsOverlay();

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  // Load captures on mount
  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  // Sync sidebar panel collapse/expand with store state
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (sidebarCollapsed && !panel.isCollapsed()) {
      panel.collapse();
    } else if (!sidebarCollapsed && panel.isCollapsed()) {
      panel.expand();
    }
  }, [sidebarCollapsed]);

  // When user drags the resize handle to collapse → sync to store
  const onSidebarCollapse = useCallback(() => {
    if (!useStore.getState().sidebarCollapsed) toggleSidebar();
  }, [toggleSidebar]);

  const onSidebarExpand = useCallback(() => {
    if (useStore.getState().sidebarCollapsed) toggleSidebar();
  }, [toggleSidebar]);

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
      } else if ((e.metaKey || e.ctrlKey) && key === ",") {
        e.preventDefault();
        openSettings();
      } else if (key === "escape") {
        closePalette();
        closeNew();
        closeSettings();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePalette, toggleSidebar, closePalette, closeNew, openSettings, closeSettings]);

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
      <TopBar />

      {/* Resizable 3-panel layout: Sidebar | Main | Detail */}
      <PanelGroup direction="horizontal" style={{ flex: 1, overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <Panel
          ref={sidebarPanelRef}
          defaultSize={18}
          minSize={12}
          maxSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={onSidebarCollapse}
          onExpand={onSidebarExpand}
          order={1}
        >
          {(mainMode === "home" || mainMode === "chat") ? <ChatHistorySidebar /> : <ContextSidebar />}
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        {/* ── Main content ── */}
        <Panel defaultSize={detailOpen ? 50 : 78} minSize={30} order={2}>
          <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {(mainMode === "home" || mainMode === "chat") && <HomeView />}
            {mainMode === "browse" && <BrowseView />}
          </div>
        </Panel>

        {/* ── Detail panel (conditional) ── */}
        {detailOpen && (
          <>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={32} minSize={20} maxSize={55} order={3}>
              <DetailPanel />
            </Panel>
          </>
        )}
      </PanelGroup>

      <StatusBar />

      {/* Modals */}
      <CommandPalette />
      <NewCaptureModal />
      {settingsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}
        >
          <div
            style={{
              width: "min(900px, 90vw)",
              height: "min(620px, 85vh)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,.35)",
            }}
          >
            <SettingsView />
          </div>
        </div>
      )}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#2B2823",
            color: "#F3EFE8",
            fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,.25)",
            border: "none",
          },
        }}
      />
      <ShortcutsOverlay open={shortcuts.open} onClose={shortcuts.close} />
    </div>
  );
}
