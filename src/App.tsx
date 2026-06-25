import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./store";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";

// Legacy type kept for backward-compat with v1 components
export type View = "browse" | "editor" | "graph" | "chat" | "timeline" | "settings";

import TopBar from "./components/v2/TopBar";
import Sidebar from "./components/v2/Sidebar";
import HomeView from "./components/v2/HomeView";
import BrowseView from "./components/v2/BrowseView";
import DetailPanel from "./components/v2/DetailPanel";
import SearchResultsView from "./components/v2/SearchResultsView";
import SettingsView from "./components/v2/SettingsView";
import StatusBar from "./components/v2/StatusBar";
import CommandPalette from "./components/v2/CommandPalette";
import NewCaptureModal from "./components/v2/NewCaptureModal";
import { Toaster } from "sonner";
import { ShortcutsOverlay, useShortcutsOverlay } from "./components/ui";

export default function App() {
  const mainMode = useStore((s) => s.mainMode);
  const leftDock = useStore((s) => s.leftDock);
  const rightDock = useStore((s) => s.rightDock);
  const showSearchResults = useStore((s) => s.leftDock.panel === "search" && s.globalSearchResults.length > 0);
  const isChatPanel = useStore((s) => s.leftDock.panel === "chat");
  const theme = useStore((s) => s.theme);
  const togglePalette = useStore((s) => s.togglePalette);
  const toggleLeftDock = useStore((s) => s.toggleLeftDock);
  const closePalette = useStore((s) => s.closePalette);
  const closeNew = useStore((s) => s.closeNew);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const openSettings = useStore((s) => s.openSettings);
  const closeSettings = useStore((s) => s.closeSettings);
  const loadCaptures = useStore((s) => s.loadCaptures);
  const setLeftDockSize = useStore((s) => s.setLeftDockSize);
  const setRightDockSize = useStore((s) => s.setRightDockSize);
  const shortcuts = useShortcutsOverlay();

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  // Center panel is empty when mainMode is null and no search results
  const centerEmpty = mainMode === null && !showSearchResults;

  // Load captures on mount + auto-refresh on backend changes
  useEffect(() => {
    loadCaptures();
    const unlisten = listen("kb-capture-changed", () => {
      loadCaptures();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [loadCaptures]);

  // Sync left dock panel collapse/expand with store state
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (!leftDock.open && !panel.isCollapsed()) {
      panel.collapse();
    } else if (leftDock.open && panel.isCollapsed()) {
      panel.expand();
    }
  }, [leftDock.open]);

  // Sync right dock panel collapse/expand with store state
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (!rightDock.open && !panel.isCollapsed()) {
      panel.collapse();
    } else if (rightDock.open && panel.isCollapsed()) {
      panel.expand();
    }
  }, [rightDock.open]);

  // When user drags resize handle to collapse → sync to store
  const onLeftCollapse = useCallback(() => {
    if (useStore.getState().leftDock.open) useStore.getState().toggleLeftDock();
  }, []);

  const onLeftExpand = useCallback(() => {
    if (!useStore.getState().leftDock.open) useStore.getState().toggleLeftDock();
  }, []);

  const onRightCollapse = useCallback(() => {
    if (useStore.getState().rightDock.open) useStore.getState().toggleRightDock();
  }, []);

  const onRightExpand = useCallback(() => {
    if (!useStore.getState().rightDock.open) useStore.getState().toggleRightDock();
  }, []);

  // Persist panel sizes when user resizes
  const onLeftResize = useCallback((size: number) => {
    if (size > 0) setLeftDockSize(size);
  }, [setLeftDockSize]);

  const onRightResize = useCallback((size: number) => {
    if (size > 0) setRightDockSize(size);
  }, [setRightDockSize]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const key = (e.key || "").toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        togglePalette();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === "f") {
        e.preventDefault();
        // Open search in left dock
        const store = useStore.getState();
        store.setLeftDockPanel("search");
      } else if ((e.metaKey || e.ctrlKey) && key === "b") {
        e.preventDefault();
        toggleLeftDock();
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
  }, [togglePalette, toggleLeftDock, closePalette, closeNew, openSettings, closeSettings]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-app)",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        color: "var(--text-primary)",
        overflow: "hidden",
      }}
    >
      <TopBar />

      {/* Resizable dock layout — 2-panel when center empty, 3-panel otherwise */}
      <PanelGroup
        key={`${centerEmpty ? "dock-2" : "dock-3"}-${isChatPanel ? "chat" : "nav"}`}
        direction="horizontal"
        style={{ flex: 1, overflow: "hidden" }}
      >
        {/* ── Left Dock (Explorer / Chat) ── */}
        <Panel
          ref={leftPanelRef}
          defaultSize={centerEmpty
            ? (rightDock.open ? 50 : 100)
            : (isChatPanel ? Math.max(leftDock.chatSize, 30) : leftDock.size)}
          minSize={centerEmpty ? 20 : (isChatPanel ? 25 : 12)}
          maxSize={centerEmpty ? 100 : (isChatPanel ? 55 : 30)}
          collapsible
          collapsedSize={0}
          onCollapse={onLeftCollapse}
          onExpand={onLeftExpand}
          onResize={onLeftResize}
          order={1}
        >
          <Sidebar />
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        {/* ── Center content — only rendered when active ── */}
        {!centerEmpty && (
          <>
            <Panel minSize={20} order={2}>
              <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {showSearchResults ? (
                  <SearchResultsView />
                ) : (
                  <>
                    {mainMode === "home" && <HomeView />}
                    {mainMode === "browse" && <BrowseView />}
                  </>
                )}
              </div>
            </Panel>
            <PanelResizeHandle className="resize-handle" />
          </>
        )}

        {/* ── Right Dock (Detail) — always in DOM, collapses to 0 ── */}
        <Panel
          ref={rightPanelRef}
          defaultSize={rightDock.open
            ? (centerEmpty ? 50 : rightDock.size)
            : 0}
          minSize={20}
          maxSize={centerEmpty ? 100 : 55}
          collapsible
          collapsedSize={0}
          onCollapse={onRightCollapse}
          onExpand={onRightExpand}
          onResize={onRightResize}
          order={3}
        >
          <DetailPanel />
        </Panel>
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
            background: "var(--bg-overlay)",
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
            background: "var(--tooltip-bg)",
            color: "var(--tooltip-text)",
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
