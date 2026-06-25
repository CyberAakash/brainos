import { useStore } from "@/store";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import ChatHistorySidebar from "./ChatHistorySidebar";
import ChatPanel from "./ChatPanel";
import ContextSidebar from "./ContextSidebar";
import GlobalSearch from "./GlobalSearch";

/* ════════════════════════════════════════════════════════════════
   Sidebar — Pure content panel (no activity bar).
   Panel switching handled by StatusBar dock toggle icons.
   Left dock panels: Explorer | Chat | Search

   When panel is "chat", renders a resizable split layout:
   - Toggleable chat history sidebar (resizable)
   - ChatPanel (tab bar + messages + input, also resizable)
   ════════════════════════════════════════════════════════════════ */

export default function Sidebar() {
  const panel = useStore((s) => s.leftDock.panel);
  const chatHistoryOpen = useStore((s) => s.chatHistoryOpen);
  const chatHistorySize = useStore((s) => s.chatHistorySize);
  const setChatHistorySize = useStore((s) => s.setChatHistorySize);

  if (panel === "chat") {
    return (
      <div style={styles.root}>
        {chatHistoryOpen ? (
          <PanelGroup direction="horizontal" style={{ flex: 1 }}>
            {/* Chat history — resizable */}
            <Panel
              defaultSize={chatHistorySize}
              minSize={20}
              maxSize={50}
              order={1}
              onResize={(size) => { if (size > 0) setChatHistorySize(size); }}
            >
              <div style={styles.historyPane}>
                <ChatHistorySidebar />
              </div>
            </Panel>
            <PanelResizeHandle className="resize-handle" />
            {/* Chat panel — resizable */}
            <Panel minSize={40} order={2}>
              <ChatPanel />
            </Panel>
          </PanelGroup>
        ) : (
          /* History hidden — ChatPanel takes full width */
          <ChatPanel />
        )}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {panel === "explorer" && <ContextSidebar />}
      {panel === "search" && <GlobalSearch />}
    </div>
  );
}

/* ── Styles ── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
  },
  historyPane: {
    height: "100%",
    overflow: "hidden",
  },
};
