import { useState, useEffect, useCallback, useRef } from "react";
import { api, type Capture } from "../../lib/ipc";
import { MarkdownPreview } from "../common/MarkdownPreview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptureEditorProps {
  captureId: string | null; // null = creating new capture
  onClose: () => void; // go back to browse view
  onSaved: (id: string) => void; // called after successful save
}

type ViewMode = "split" | "editor" | "preview";

const CAPTURE_TYPES = [
  "learning",
  "debugging",
  "fix",
  "insight",
  "decision",
  "architecture",
  "pattern",
  "tool-setup",
  "config",
  "reference",
  "troubleshooting",
] as const;

interface CreateFormData {
  title: string;
  space: "work" | "personal";
  captureType: string;
  tags: string;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

function generateFrontmatter(form: CreateFormData): string {
  const today = new Date().toISOString().slice(0, 10);
  const tags = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const lines = [
    "---",
    `title: "${form.title}"`,
    `date: ${today}`,
    `space: ${form.space}`,
    `type: ${form.captureType}`,
  ];

  if (tags.length > 0) {
    lines.push(`tags: [${tags.map((t) => `"${t}"`).join(", ")}]`);
  } else {
    lines.push("tags: []");
  }

  lines.push("---", "", `# ${form.title}`, "", "");
  return lines.join("\n");
}

function parseFrontmatter(raw: string): {
  title: string;
  space: "work" | "personal";
  captureType: string;
  tags: string[];
  body: string;
} {
  const defaults = {
    title: "Untitled",
    space: "work" as const,
    captureType: "learning",
    tags: [] as string[],
    body: raw,
  };

  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return defaults;

  const frontmatter = match[1];
  const body = match[2].trim();

  const titleMatch = frontmatter.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
  const spaceMatch = frontmatter.match(/^space:\s*(\S+)\s*$/m);
  const typeMatch = frontmatter.match(/^type:\s*(\S+)\s*$/m);
  const tagsMatch = frontmatter.match(/^tags:\s*\[(.*)\]\s*$/m);

  return {
    title: titleMatch?.[1] ?? defaults.title,
    space: spaceMatch?.[1] === "personal" ? "personal" : "work",
    captureType: typeMatch?.[1] ?? defaults.captureType,
    tags: tagsMatch?.[1]
      ? tagsMatch[1]
          .split(",")
          .map((t) => t.trim().replace(/^"|"$/g, ""))
          .filter(Boolean)
      : [],
    body,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CaptureEditor({
  captureId,
  onClose,
  onSaved,
}: CaptureEditorProps) {
  // Content state
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");

  // UI state
  const [loading, setLoading] = useState(!!captureId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [showCreateForm, setShowCreateForm] = useState(!captureId);
  const [activeId, setActiveId] = useState<string | null>(captureId);
  const [title, setTitle] = useState("");

  const [createForm, setCreateForm] = useState<CreateFormData>({
    title: "",
    space: "work",
    captureType: "learning",
    tags: "",
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== savedContent;

  // -----------------------------------------------------------------------
  // Load existing capture
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!captureId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .readCaptureRaw(captureId)
      .then((raw) => {
        if (cancelled) return;
        setContent(raw);
        setSavedContent(raw);
        setPreviewContent(raw);
        const parsed = parseFrontmatter(raw);
        setTitle(parsed.title);
        setShowCreateForm(false);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          typeof e === "string"
            ? e
            : "Failed to load capture. It may have been deleted.",
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [captureId]);

  // -----------------------------------------------------------------------
  // Debounced preview update
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewContent(content);
    }, 100);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content]);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!isDirty && activeId) return; // nothing to save in edit mode

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      if (activeId) {
        // Edit mode
        await api.saveCaptureContent(activeId, content);
        setSavedContent(content);
        setSaveMessage("Saved");
        onSaved(activeId);
      } else {
        // Create mode
        const parsed = parseFrontmatter(content);
        const result: Capture = await api.createCapture(
          parsed.title,
          parsed.space,
          parsed.captureType,
          parsed.tags,
          parsed.body,
        );
        setActiveId(result.id);
        setSavedContent(content);
        setSaveMessage("Created");
        onSaved(result.id);
      }

      setTimeout(() => setSaveMessage(null), 2000);
    } catch (e) {
      setError(
        typeof e === "string" ? e : "Save failed. Your content is preserved.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, isDirty, activeId, content, onSaved]);

  // -----------------------------------------------------------------------
  // Keyboard shortcut: Cmd+S / Ctrl+S
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  // -----------------------------------------------------------------------
  // Discard / Close
  // -----------------------------------------------------------------------
  const handleDiscard = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard them?",
      );
      if (!confirmed) return;
    }
    if (activeId) {
      setContent(savedContent);
      setPreviewContent(savedContent);
    } else {
      onClose();
    }
  }, [isDirty, activeId, savedContent, onClose]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Leave without saving?",
      );
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, onClose]);

  // -----------------------------------------------------------------------
  // Create form -> editor transition
  // -----------------------------------------------------------------------
  const handleStartWriting = useCallback(() => {
    if (!createForm.title.trim()) return;
    const raw = generateFrontmatter(createForm);
    setContent(raw);
    setSavedContent(""); // new doc — nothing saved yet
    setPreviewContent(raw);
    setTitle(createForm.title);
    setShowCreateForm(false);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(raw.length, raw.length);
      }
    });
  }, [createForm]);

  // -----------------------------------------------------------------------
  // Shared top-bar props
  // -----------------------------------------------------------------------
  const topBarProps = {
    title,
    isDirty,
    viewMode,
    onViewModeChange: setViewMode,
    onClose: handleClose,
    onSave: handleSave,
    onDiscard: handleDiscard,
    saving,
    saveMessage,
    canSave: isDirty || (!activeId && content.length > 0),
  };

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <TopBar {...topBarProps} title="Loading..." isDirty={false} canSave={false} />
        <div className="flex-1 flex items-center justify-center text-zinc-400">
          Loading capture...
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Error (capture not found / failed to load)
  // -----------------------------------------------------------------------
  if (error && !content) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <TopBar {...topBarProps} title="Error" isDirty={false} canSave={false} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-400">
          <div className="text-red-500 text-sm">{error}</div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-zinc-200 dark:bg-zinc-800 text-sm hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Create form
  // -----------------------------------------------------------------------
  if (showCreateForm) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <TopBar {...topBarProps} title="New Capture" isDirty={false} canSave={false} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-5">
            <h2 className="text-lg font-semibold">Create a New Capture</h2>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Title
              </label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Fixing Tauri IPC serialization bug"
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createForm.title.trim()) {
                    handleStartWriting();
                  }
                }}
              />
            </div>

            {/* Space */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Space
              </label>
              <select
                value={createForm.space}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    space: e.target.value as "work" | "personal",
                  }))
                }
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="work">Work</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Type
              </label>
              <select
                value={createForm.captureType}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    captureType: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CAPTURE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1).replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Tags
              </label>
              <input
                type="text"
                value={createForm.tags}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="rust, tauri, ipc (comma-separated)"
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createForm.title.trim()) {
                    handleStartWriting();
                  }
                }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleStartWriting}
                disabled={!createForm.title.trim()}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Writing
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-zinc-200 dark:bg-zinc-800 text-sm hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Editor (main view)
  // -----------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col h-full">
      <TopBar {...topBarProps} />

      {/* Error banner (non-fatal — content still visible) */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-300 ml-3 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Editor + Preview panels */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Editor pane */}
        {(viewMode === "split" || viewMode === "editor") && (
          <div
            className={`flex flex-col overflow-hidden ${
              viewMode === "split" ? "w-1/2" : "w-full"
            }`}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full resize-none p-4 font-mono text-sm leading-relaxed bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none selection:bg-indigo-200 dark:selection:bg-indigo-900 overflow-y-auto"
              placeholder="Start writing markdown..."
            />
          </div>
        )}

        {/* Divider */}
        {viewMode === "split" && (
          <div className="w-px bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        )}

        {/* Preview pane */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div
            className={`flex flex-col overflow-y-auto bg-white dark:bg-zinc-900 ${
              viewMode === "split" ? "w-1/2" : "w-full"
            }`}
          >
            <div className="p-6">
              <MarkdownPreview content={previewContent} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

interface TopBarProps {
  title: string;
  isDirty: boolean;
  canSave: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
  saveMessage: string | null;
}

function TopBar({
  title,
  isDirty,
  canSave,
  viewMode,
  onViewModeChange,
  onClose,
  onSave,
  onDiscard,
  saving,
  saveMessage,
}: TopBarProps) {
  return (
    <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-3 gap-2 shrink-0 bg-white dark:bg-zinc-950">
      {/* Back */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        title="Back"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {/* Title + indicators */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-medium truncate">
          {title || "Untitled"}
        </span>
        {isDirty && (
          <span
            className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
            title="Unsaved changes"
          />
        )}
        {saveMessage && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">
            {saveMessage}
          </span>
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
        <ViewModeButton
          active={viewMode === "editor"}
          onClick={() => onViewModeChange("editor")}
          label="Editor only"
        >
          {/* Pencil icon */}
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </ViewModeButton>
        <ViewModeButton
          active={viewMode === "split"}
          onClick={() => onViewModeChange("split")}
          label="Split view"
        >
          {/* Columns icon */}
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
            />
          </svg>
        </ViewModeButton>
        <ViewModeButton
          active={viewMode === "preview"}
          onClick={() => onViewModeChange("preview")}
          label="Preview only"
        >
          {/* Eye icon */}
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </ViewModeButton>
      </div>

      {/* Discard */}
      <button
        onClick={onDiscard}
        disabled={!isDirty}
        className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Discard
      </button>

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving || !canSave}
        className={`px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors ${
          canSave && !saving
            ? "bg-indigo-600 hover:bg-indigo-700"
            : "bg-zinc-400 dark:bg-zinc-600 cursor-not-allowed"
        }`}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViewModeButton
// ---------------------------------------------------------------------------

function ViewModeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 transition-colors ${
        active
          ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
          : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
