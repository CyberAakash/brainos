import { useState, useEffect, useCallback } from "react";
import { api, type CaptureOverview, type Capture } from "../../lib/ipc";
import { MarkdownPreview } from "../common/MarkdownPreview";

interface BrowseViewProps {
  onEditCapture: (id: string) => void;
  onNewCapture: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  learning: "📝",
  debugging: "🐛",
  fix: "🔧",
  insight: "💡",
  decision: "📋",
  architecture: "🏗️",
  pattern: "🧩",
  "tool-setup": "🛠️",
  config: "⚙️",
  reference: "📚",
  troubleshooting: "🔍",
};

export function BrowseView({ onEditCapture, onNewCapture }: BrowseViewProps) {
  const [captures, setCaptures] = useState<CaptureOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [filterSpace, setFilterSpace] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadCaptures = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (filterSpace) filters.space = filterSpace;
      if (filterType) filters.capture_type = filterType;
      const result = await api.listCaptures(Object.keys(filters).length ? filters : undefined);
      setCaptures(result);
    } catch (e) {
      console.error("Failed to load captures:", e);
    } finally {
      setLoading(false);
    }
  }, [filterSpace, filterType]);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCapture(id);
      setDeleteConfirm(null);
      if (selected === id) setSelected(null);
      loadCaptures();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400">
        <div className="animate-pulse">Loading captures...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-11 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-3 shrink-0">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {captures.length} capture{captures.length !== 1 ? "s" : ""}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <select
            value={filterSpace}
            onChange={(e) => setFilterSpace(e.target.value)}
            className="text-xs px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 border-none outline-none text-zinc-600 dark:text-zinc-300 cursor-pointer"
          >
            <option value="">All spaces</option>
            <option value="work">Work</option>
            <option value="personal">Personal</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 border-none outline-none text-zinc-600 dark:text-zinc-300 cursor-pointer"
          >
            <option value="">All types</option>
            <option value="learning">Learning</option>
            <option value="debugging">Debugging</option>
            <option value="fix">Fix</option>
            <option value="insight">Insight</option>
            <option value="decision">Decision</option>
            <option value="architecture">Architecture</option>
            <option value="pattern">Pattern</option>
            <option value="tool-setup">Tool Setup</option>
            <option value="config">Config</option>
            <option value="reference">Reference</option>
            <option value="troubleshooting">Troubleshooting</option>
          </select>

          <button
            onClick={onNewCapture}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Capture
          </button>
        </div>
      </div>

      {captures.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <div className="text-4xl">🧠</div>
          <div className="text-lg font-medium text-zinc-600 dark:text-zinc-300">No captures yet</div>
          <p className="text-sm max-w-md text-center">
            Click <strong>New Capture</strong> above, use{" "}
            <code className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">/capture</code>{" "}
            in Claude Code, or create one with the MCP server.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* List panel */}
          <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto shrink-0">
            {captures.map((capture) => (
              <button
                key={capture.id}
                onClick={() => setSelected(capture.id)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                  selected === capture.id
                    ? "bg-indigo-50 dark:bg-indigo-950/50 border-l-2 border-l-indigo-500"
                    : "border-l-2 border-l-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{TYPE_ICONS[capture.capture_type] || "📄"}</span>
                  <span className="text-sm font-medium truncate flex-1">{capture.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-6">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {capture.capture_type}
                  </span>
                  <span className="text-xs text-zinc-400">{capture.date}</span>
                </div>
                {capture.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 ml-6 flex-wrap">
                    {capture.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs text-indigo-600 dark:text-indigo-400">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="flex-1 overflow-y-auto">
            {selected ? (
              <CaptureDetail
                id={selected}
                onEdit={() => onEditCapture(selected)}
                onDelete={() => setDeleteConfirm(selected)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                Select a capture to preview
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-6 max-w-sm mx-4">
            <h3 className="text-base font-semibold mb-2">Delete capture?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              This will permanently delete the .md file from your knowledge base. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-3 py-1.5 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CaptureDetail({
  id,
  onEdit,
  onDelete,
}: {
  id: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getCapture(id).then((result) => {
      setCapture(result ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-400 animate-pulse">Loading...</div>;
  if (!capture) return <div className="p-6 text-zinc-400">Capture not found</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{capture.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium">
                {capture.capture_type}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {capture.space}
              </span>
              <span className="text-xs text-zinc-400">{capture.date}</span>
              {capture.confidence && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  {capture.confidence}
                </span>
              )}
            </div>
            {capture.tags.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {capture.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>

        {(capture.repo || capture.workspace || capture.projects.length > 0) && (
          <div className="flex items-center gap-3 mt-3 text-xs text-zinc-400">
            {capture.repo && <span>📂 {capture.repo}</span>}
            {capture.workspace && <span>🗂️ {capture.workspace}</span>}
            {capture.projects.map((p) => (
              <span key={p} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{p}</span>
            ))}
          </div>
        )}
      </div>

      {/* Rendered markdown */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <MarkdownPreview content={capture.body_text} />
      </div>
    </div>
  );
}
