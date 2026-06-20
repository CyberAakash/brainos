import { create } from "zustand";
import { api, type Capture, type CaptureOverview, type SearchResult, type CreateCaptureOpts } from "./lib/ipc";

// ─── Type metadata ───
export const TYPE_META: Record<string, { bg: string; fg: string; dot: string; glow: string }> = {
  learning:     { bg: '#E4EBE0', fg: '#4A6048', dot: '#7E9A6F', glow: 'rgba(126,154,111,.18)' },
  debugging:    { bg: '#F0E0DA', fg: '#8A4A38', dot: '#B5694F', glow: 'rgba(181,105,79,.18)' },
  fix:          { bg: '#F2E8D4', fg: '#7E6326', dot: '#B89248', glow: 'rgba(184,146,72,.18)' },
  insight:      { bg: '#F2ECD2', fg: '#756321', dot: '#B79C3F', glow: 'rgba(183,156,63,.18)' },
  decision:     { bg: '#DFE6EE', fg: '#3F5572', dot: '#6E89AB', glow: 'rgba(110,137,171,.18)' },
  architecture: { bg: '#E9E1EC', fg: '#614A6E', dot: '#927AA0', glow: 'rgba(146,122,160,.18)' },
  pattern:      { bg: '#DDEAE7', fg: '#3A5F58', dot: '#6A9389', glow: 'rgba(106,147,137,.18)' },
  config:       { bg: '#E8E5DD', fg: '#5C584E', dot: '#908A7C', glow: 'rgba(144,138,124,.18)' },
  reference:    { bg: '#DCE9E9', fg: '#36605F', dot: '#689592', glow: 'rgba(104,149,146,.18)' },
};

export function getTypeMeta(t: string) {
  return TYPE_META[t] || TYPE_META.config;
}

// ─── Types ───
export type MainMode = "home" | "browse" | "chat" | "settings";
export type RagMode = "auto" | "manual";

export interface BrowseFilter {
  kind: "all" | "tag" | "type" | "space" | "project";
  value: string | null;
  label: string;
}

export interface ChatMessage {
  id: string;
  isUser: boolean;
  text: string;
  sources?: number;
  cardIds?: string[];
}

interface AppState {
  // Navigation
  mainMode: MainMode;
  sidebarCollapsed: boolean;
  detailOpen: boolean;
  selectedId: string | null;
  paletteOpen: boolean;
  newOpen: boolean;

  // RAG
  ragMode: RagMode;

  // Context — attached is per-chat (ephemeral), bookmarks persist across sessions
  attached: string[];
  bookmarks: string[];
  suggested: string[];

  // Data
  captures: CaptureOverview[];
  captureCache: Record<string, Capture>;
  loading: boolean;

  // Browse
  browseFilter: BrowseFilter;

  // Chat
  chat: ChatMessage[];
  thinking: boolean;

  // Toast
  toast: string | null;

  // Search
  searchResults: SearchResult[];

  // Actions
  setMainMode: (mode: MainMode) => void;
  toggleSidebar: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  togglePalette: () => void;
  closePalette: () => void;
  openNew: () => void;
  closeNew: () => void;
  setRagMode: (mode: RagMode) => void;
  toggleRag: () => void;

  // Context actions — attach = per-chat ephemeral, bookmark = persistent
  attach: (id: string) => void;
  detach: (id: string) => void;
  attachFromSuggest: (id: string) => void;
  dismissSuggest: (id: string) => void;
  bookmark: (id: string) => void;
  unbookmark: (id: string) => void;
  isBookmarked: (id: string) => boolean;

  // Browse
  setBrowseFilter: (filter: BrowseFilter) => void;
  goBrowse: (kind: BrowseFilter["kind"], value: string | null, label: string) => void;

  // Toast
  showToast: (msg: string) => void;

  // Data loading
  loadCaptures: () => Promise<void>;
  loadCapture: (id: string) => Promise<Capture | null>;
  searchCaptures: (query: string) => Promise<SearchResult[]>;
  deleteCapture: (id: string) => Promise<void>;
  createCapture: (title: string, space: string, captureType: string, tags: string[], body: string, opts?: CreateCaptureOpts) => Promise<Capture | null>;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function loadBookmarks(): string[] {
  try {
    const raw = localStorage.getItem("brainos_bookmarks");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveBookmarks(ids: string[]) {
  localStorage.setItem("brainos_bookmarks", JSON.stringify(ids));
}

export const useStore = create<AppState>((set, get) => ({
  mainMode: "home",
  sidebarCollapsed: false,
  detailOpen: false,
  selectedId: null,
  paletteOpen: false,
  newOpen: false,
  ragMode: "auto",
  attached: [],
  bookmarks: loadBookmarks(),
  suggested: [],
  captures: [],
  captureCache: {},
  loading: false,
  browseFilter: { kind: "all", value: null, label: "All captures" },
  chat: [],
  thinking: false,
  toast: null,
  searchResults: [],

  // Navigation
  setMainMode: (mode) => set({ mainMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openDetail: (id) => set({ selectedId: id, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  closePalette: () => set({ paletteOpen: false }),
  openNew: () => set({ newOpen: true, paletteOpen: false }),
  closeNew: () => set({ newOpen: false }),
  setRagMode: (mode) => set({ ragMode: mode }),
  toggleRag: () => set((s) => ({ ragMode: s.ragMode === "auto" ? "manual" : "auto" })),

  // Context — attached (per-chat) + bookmarks (persistent)
  attach: (id) => set((s) => ({
    attached: s.attached.includes(id) ? s.attached : [...s.attached, id],
  })),
  detach: (id) => set((s) => ({ attached: s.attached.filter((x) => x !== id) })),
  attachFromSuggest: (id) => {
    set((s) => ({
      attached: s.attached.includes(id) ? s.attached : [...s.attached, id],
      suggested: s.suggested.filter((x) => x !== id),
    }));
    get().showToast("Attached to chat context");
  },
  dismissSuggest: (id) => set((s) => ({ suggested: s.suggested.filter((x) => x !== id) })),
  bookmark: (id) => {
    set((s) => {
      if (s.bookmarks.includes(id)) return s;
      const next = [...s.bookmarks, id];
      saveBookmarks(next);
      return { bookmarks: next };
    });
    get().showToast("Bookmarked");
  },
  unbookmark: (id) => {
    set((s) => {
      const next = s.bookmarks.filter((x) => x !== id);
      saveBookmarks(next);
      return { bookmarks: next };
    });
    get().showToast("Bookmark removed");
  },
  isBookmarked: (id) => get().bookmarks.includes(id),

  // Browse
  setBrowseFilter: (filter) => set({ browseFilter: filter }),
  goBrowse: (kind, value, label) => set({ mainMode: "browse", browseFilter: { kind, value, label } }),

  // Toast
  showToast: (msg) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },

  // Data
  loadCaptures: async () => {
    set({ loading: true });
    try {
      const captures = await api.listCaptures({}, 100, 0);
      set({ captures, loading: false });
    } catch (e) {
      console.error("Failed to load captures:", e);
      set({ loading: false });
    }
  },

  loadCapture: async (id) => {
    const cached = get().captureCache[id];
    if (cached) return cached;
    try {
      const capture = await api.getCapture(id);
      if (capture) {
        set((s) => ({ captureCache: { ...s.captureCache, [id]: capture } }));
      }
      return capture;
    } catch (e) {
      console.error("Failed to load capture:", e);
      return null;
    }
  },

  searchCaptures: async (query) => {
    try {
      const results = await api.search(query, 20);
      set({ searchResults: results });
      return results;
    } catch (e) {
      console.error("Search failed:", e);
      return [];
    }
  },

  deleteCapture: async (id) => {
    try {
      await api.deleteCapture(id);
      set((s) => ({
        captures: s.captures.filter((c) => c.id !== id),
        captureCache: (() => { const cc = { ...s.captureCache }; delete cc[id]; return cc; })(),
        attached: s.attached.filter((x) => x !== id),
        bookmarks: (() => { const next = s.bookmarks.filter((x) => x !== id); saveBookmarks(next); return next; })(),
        suggested: s.suggested.filter((x) => x !== id),
        detailOpen: s.selectedId === id ? false : s.detailOpen,
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
      get().showToast("Capture deleted");
    } catch (e) {
      console.error("Failed to delete:", e);
      get().showToast("Delete failed");
    }
  },

  createCapture: async (title, space, captureType, tags, body, opts?) => {
    try {
      const capture = await api.createCapture(title, space, captureType, tags, body, opts);
      set((s) => ({
        captures: [
          { id: capture.id, title: capture.title, summary: capture.summary, space: capture.space, capture_type: capture.capture_type, status: capture.status, date: capture.date, tags: capture.tags, projects: capture.projects },
          ...s.captures,
        ],
        captureCache: { ...s.captureCache, [capture.id]: capture },
        newOpen: false,
        selectedId: capture.id,
        detailOpen: true,
      }));
      get().showToast("Capture created");
      return capture;
    } catch (e) {
      console.error("Failed to create:", e);
      get().showToast("Create failed");
      return null;
    }
  },
}));
