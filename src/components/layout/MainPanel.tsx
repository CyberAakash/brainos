import type { View } from "../../App";
import { BrowseView } from "../browse/BrowseView";
import { CaptureEditor } from "../editor/CaptureEditor";
import { ChatView } from "../chat/ChatView";
import { GraphPlaceholder } from "../graph/GraphPlaceholder";
import { TimelinePlaceholder } from "../timeline/TimelinePlaceholder";
import { SettingsView } from "../settings/SettingsView";

interface MainPanelProps {
  activeView: View;
  editingCaptureId: string | null;
  onEditCapture: (id: string) => void;
  onNewCapture: () => void;
  onEditorClose: () => void;
  onEditorSaved: (id: string) => void;
}

export function MainPanel({
  activeView,
  editingCaptureId,
  onEditCapture,
  onNewCapture,
  onEditorClose,
  onEditorSaved,
}: MainPanelProps) {
  switch (activeView) {
    case "browse":
      return <BrowseView onEditCapture={onEditCapture} onNewCapture={onNewCapture} />;
    case "editor":
      return (
        <CaptureEditor
          captureId={editingCaptureId}
          onClose={onEditorClose}
          onSaved={onEditorSaved}
        />
      );
    case "graph":
      return <GraphPlaceholder />;
    case "chat":
      return <ChatView />;
    case "timeline":
      return <TimelinePlaceholder />;
    case "settings":
      return <SettingsView />;
    default:
      return <BrowseView onEditCapture={onEditCapture} onNewCapture={onNewCapture} />;
  }
}
