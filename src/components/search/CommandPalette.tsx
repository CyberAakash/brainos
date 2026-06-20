import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api, type CaptureOverview, type SearchResult, type Capture } from "../../lib/ipc";
import { MarkdownPreview } from "../common/MarkdownPreview";

interface CommandPaletteProps {
  onClose: () => void;
  onOpenCapture: (id: string) => void;
  onEditCapture: (id: string) => void;
}

/** Unified item that works for both browse (CaptureOverview) and search (SearchResult) modes. */
interface DisplayItem {
  id: string;
  title: string;
  capture_type: string;
  date: string;
  tags: string[];
  snippet?: string;
  score?: number;
}

const TYPE_ICONS: Record<string, string> = {
  learning: "\u{1F4DD}",
  debugging: "\u{1F41B}",
  fix: "\u{1F527}",
  insight: "\u{1F4A1}",
  decision: "\u{1F4CB}",
  architecture: "\u{1F3D7}️",
  research: "\u{1F50D}",
  snippet: "\u{2702}️",
  reference: "\u{1F4D6}",
  note: "\u{1F5D2}️",
};

const TYPE_COLORS: Record<string, string> = {
  learning: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  debugging: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  fix: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  insight: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  decision: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  architecture: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  research: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
  snippet: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400",
  reference: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  note: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

const DEFAULT_BADGE = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

function getTypeIcon(type: string): string {
  return TYPE_ICONS[type.toLowerCase()] ?? "\u{1F4C4}";
}

function getTypeBadgeClass(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? DEFAULT_BADGE;
}

function overviewToDisplayItem(c: CaptureOverview): DisplayItem {
  return {
    id: c.id,
    title: c.title,
    capture_type: c.capture_type,
    date: c.date,
    tags: c.tags,
  };
}

function searchResultToDisplayItem(r: SearchResult): DisplayItem {
  return {
    id: r.capture.id,
    title: r.capture.title,
    capture_type: r.capture.capture_type,
    date: r.capture.date,
    tags: r.capture.tags,
    snippet: r.snippet,
    score: r.score,
  };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function CommandPalette({ onClose, onOpenCapture, onEditCapture }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [previewCapture, setPreviewCapture] = useState<Capture | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // ----- Load recent captures on mount -----
  useEffect(() => {
    inputRef.current?.focus();
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoading(true);
    try {
      const recent = await api.listCaptures(undefined, 10, 0);
      setItems(recent.map(overviewToDisplayItem));
      setIsSearchMode(false);
    } catch (e) {
      console.error("Failed to load recent captures:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // ----- Debounced search (fires at 3+ chars) -----
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      // Show recents when query is too short or cleared
      if (!trimmed) loadRecent();
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.search(trimmed, 20);
        setItems(results.map(searchResultToDisplayItem));
        setIsSearchMode(true);
      } catch (e) {
        console.error("Search failed:", e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 150); // slightly faster debounce for letter-by-letter feel

    return () => clearTimeout(timer);
  }, [query]);

  // ----- Reset selection when items change -----
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // ----- Fetch full capture for preview when selection changes -----
  const selectedItem = items[selectedIndex] ?? null;

  useEffect(() => {
    if (!selectedItem) {
      setPreviewCapture(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    api.getCapture(selectedItem.id).then((capture) => {
      if (!cancelled) {
        setPreviewCapture(capture);
        setPreviewLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setPreviewCapture(null);
        setPreviewLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [selectedItem?.id]);

  // ----- Scroll selected item into view -----
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // ----- Keyboard navigation -----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const item = items[selectedIndex];
          if (!item) break;
          if (e.metaKey || e.ctrlKey) {
            onEditCapture(item.id);
          } else {
            onOpenCapture(item.id);
          }
          onClose();
          break;
        }
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [items, selectedIndex, onClose, onOpenCapture, onEditCapture],
  );

  // ----- Preview content -----
  const previewContent = useMemo(() => {
    if (previewCapture?.body_text) return previewCapture.body_text;
    // Fall back to snippet while full capture loads
    if (selectedItem?.snippet) return selectedItem.snippet;
    return "";
  }, [previewCapture, selectedItem]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />

      {/* Palette container */}
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700/60 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-4 duration-200"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <svg
            className="w-4 h-4 text-zinc-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captures..."
            className="flex-1 py-3 px-3 bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
              Esc
            </kbd>
          </div>
        </div>

        {/* Body: results list + preview */}
        <div className="flex flex-1 min-h-0">
          {/* Results list */}
          <div
            ref={listRef}
            className="w-[55%] border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto"
          >
            {/* Section label */}
            {!loading && items.length > 0 && (
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {isSearchMode ? "Search Results" : "Recent Captures"}
                </span>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Searching...
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                <div className="text-2xl mb-2">
                  {query.trim() ? "\u{1F50E}" : "\u{1F4AD}"}
                </div>
                <p className="text-sm">
                  {query.trim() ? "No results found" : "No captures yet"}
                </p>
              </div>
            )}

            {/* Result items */}
            {!loading &&
              items.map((item, index) => (
                <button
                  key={item.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(index, el);
                    else itemRefs.current.delete(index);
                  }}
                  onClick={() => {
                    onOpenCapture(item.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer border-l-2 ${
                    selectedIndex === index
                      ? "bg-indigo-50 dark:bg-indigo-950/50 border-l-indigo-500"
                      : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Type icon */}
                    <span className="text-base leading-none mt-0.5 shrink-0">
                      {getTypeIcon(item.capture_type)}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {item.title}
                        </span>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getTypeBadgeClass(item.capture_type)}`}
                        >
                          {item.capture_type}
                        </span>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          {formatDate(item.date)}
                        </span>
                        {item.tags.length > 0 && (
                          <div className="flex items-center gap-1 ml-auto">
                            {item.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] text-indigo-600 dark:text-indigo-400"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Snippet */}
                      {item.snippet && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 line-clamp-1">
                          {item.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
          </div>

          {/* Preview panel */}
          <div className="w-[45%] overflow-y-auto p-4">
            {previewLoading && !previewContent ? (
              <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                <svg
                  className="w-4 h-4 animate-spin mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Loading preview...
              </div>
            ) : previewContent ? (
              <div>
                {previewCapture && (
                  <div className="mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {previewCapture.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getTypeBadgeClass(previewCapture.capture_type)}`}
                      >
                        {previewCapture.capture_type}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {previewCapture.space}
                      </span>
                    </div>
                  </div>
                )}
                <MarkdownPreview
                  content={previewContent}
                  className="text-sm"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                <div className="text-3xl mb-2">{"\u{1F50D}"}</div>
                <p className="text-sm">Select a capture to preview</p>
                <p className="text-xs mt-1 text-zinc-500">
                  <kbd className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-[10px] font-mono">
                    Enter
                  </kbd>{" "}
                  to open{" · "}
                  <kbd className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-[10px] font-mono">
                    {"⌘"}Enter
                  </kbd>{" "}
                  to edit
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px]">
                {"↑↓"}
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px]">
                {"↵"}
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px]">
                {"⌘↵"}
              </kbd>
              edit
            </span>
          </div>
          {items.length > 0 && (
            <span>
              {items.length} {items.length === 1 ? "result" : "results"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
