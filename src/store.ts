import { create } from "zustand";
import { toast } from "sonner";
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
export type PaletteMode = "search" | "attach";

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

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  attached: string[];          // capture IDs attached as context
  pinned: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  // Navigation
  mainMode: MainMode;
  sidebarCollapsed: boolean;
  detailOpen: boolean;
  selectedId: string | null;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  newOpen: boolean;
  settingsOpen: boolean;

  // RAG
  ragMode: RagMode;

  // Context — favorites persist across sessions
  favorites: string[];
  suggested: string[];

  // Conversations — persistent chat history
  conversations: Conversation[];
  activeConversationId: string | null;
  chatThinking: boolean;
  selectedConvoIds: string[];
  showArchived: boolean;

  // Data
  captures: CaptureOverview[];
  captureCache: Record<string, Capture>;
  loading: boolean;

  // Browse
  browseFilter: BrowseFilter;

  // Search
  searchResults: SearchResult[];

  // Actions
  setMainMode: (mode: MainMode) => void;
  toggleSidebar: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  togglePalette: (mode?: PaletteMode) => void;
  openPaletteAttach: () => void;
  closePalette: () => void;
  openNew: () => void;
  closeNew: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  goHome: () => void;
  setRagMode: (mode: RagMode) => void;
  toggleRag: () => void;

  // Context actions — attach = per-conversation, favorite = persistent
  attach: (id: string) => void;
  detach: (id: string) => void;
  attachFromSuggest: (id: string) => void;
  dismissSuggest: (id: string) => void;
  favorite: (id: string) => void;
  unfavorite: (id: string) => void;
  isFavorited: (id: string) => boolean;

  // Conversation actions
  newConversation: () => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  pinConversation: (id: string) => void;
  unpinConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  unarchiveConversation: (id: string) => void;
  toggleShowArchived: () => void;
  toggleSelectConvo: (id: string) => void;
  selectAllConvos: (ids: string[]) => void;
  clearConvoSelection: () => void;
  archiveSelectedConvos: () => void;
  unarchiveSelectedConvos: () => void;
  deleteSelectedConvos: () => void;
  addMessage: (msg: ChatMessage) => void;
  setChatThinking: (v: boolean) => void;
  getActiveConversation: () => Conversation | null;
  getAttached: () => string[];

  // Browse
  setBrowseFilter: (filter: BrowseFilter) => void;
  goBrowse: (kind: BrowseFilter["kind"], value: string | null, label: string) => void;

  // Explorer (sidebar multi-select tags + search)
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  explorerSearch: string;
  setExplorerSearch: (q: string) => void;

  // Toast (uses sonner)
  showToast: (msg: string) => void;

  // Data loading
  loadCaptures: () => Promise<void>;
  loadCapture: (id: string) => Promise<Capture | null>;
  searchCaptures: (query: string) => Promise<SearchResult[]>;
  deleteCapture: (id: string) => Promise<void>;
  createCapture: (title: string, space: string, captureType: string, tags: string[], body: string, opts?: CreateCaptureOpts) => Promise<Capture | null>;
}

function loadFavorites(): string[] {
  try {
    // Migrate old key if present
    const legacy = localStorage.getItem("brainos_bookmarks");
    if (legacy) {
      localStorage.setItem("brainos_favorites", legacy);
      localStorage.removeItem("brainos_bookmarks");
      return JSON.parse(legacy);
    }
    const raw = localStorage.getItem("brainos_favorites");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveFavorites(ids: string[]) {
  localStorage.setItem("brainos_favorites", JSON.stringify(ids));
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem("brainos_conversations");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    // Backward compat: add pinned/archived if missing
    return parsed.map((c) => ({
      ...c,
      pinned: c.pinned ?? false,
      archived: c.archived ?? false,
    }));
  } catch { return []; }
}
function saveConversations(convos: Conversation[]) {
  // Keep last 50 conversations max
  localStorage.setItem("brainos_conversations", JSON.stringify(convos.slice(0, 50)));
}
function makeConvoId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useStore = create<AppState>((set, get) => ({
  mainMode: "home",
  sidebarCollapsed: false,
  detailOpen: false,
  selectedId: null,
  paletteOpen: false,
  paletteMode: "search" as PaletteMode,
  newOpen: false,
  settingsOpen: false,
  ragMode: "auto",
  favorites: loadFavorites(),
  suggested: [],
  conversations: loadConversations(),
  activeConversationId: null,
  chatThinking: false,
  selectedConvoIds: [],
  showArchived: false,
  captures: [],
  captureCache: {},
  loading: false,
  browseFilter: { kind: "all", value: null, label: "All captures" },
  selectedTags: [],
  explorerSearch: "",
  searchResults: [],

  // Navigation
  setMainMode: (mode) => set({ mainMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openDetail: (id) => set({ selectedId: id, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  togglePalette: (mode?: PaletteMode) => set((s) => ({
    paletteOpen: !s.paletteOpen,
    paletteMode: mode || "search",
  })),
  openPaletteAttach: () => set({ paletteOpen: true, paletteMode: "attach" as PaletteMode }),
  closePalette: () => set({ paletteOpen: false }),
  openNew: () => set({ newOpen: true, paletteOpen: false }),
  closeNew: () => set({ newOpen: false }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  goHome: () => set({ activeConversationId: null, chatThinking: false }),
  setRagMode: (mode) => set({ ragMode: mode }),
  toggleRag: () => set((s) => ({ ragMode: s.ragMode === "auto" ? "manual" : "auto" })),

  // Context — attached lives on the active conversation
  attach: (id) => {
    const s = get();
    if (!s.activeConversationId) {
      // Auto-create a conversation when attaching without one
      const cid = get().newConversation();
      set((s2) => ({
        conversations: s2.conversations.map((c) =>
          c.id === cid ? { ...c, attached: c.attached.includes(id) ? c.attached : [...c.attached, id] } : c
        ),
      }));
    } else {
      set((s2) => ({
        conversations: s2.conversations.map((c) =>
          c.id === s2.activeConversationId
            ? { ...c, attached: c.attached.includes(id) ? c.attached : [...c.attached, id], updatedAt: Date.now() }
            : c
        ),
      }));
    }
    saveConversations(get().conversations);
  },
  detach: (id) => set((s) => {
    const convos = s.conversations.map((c) =>
      c.id === s.activeConversationId
        ? { ...c, attached: c.attached.filter((x: string) => x !== id), updatedAt: Date.now() }
        : c
    );
    saveConversations(convos);
    return { conversations: convos };
  }),
  attachFromSuggest: (id) => {
    get().attach(id);
    set((s) => ({ suggested: s.suggested.filter((x) => x !== id) }));
    get().showToast("Attached to chat context");
  },
  dismissSuggest: (id) => set((s) => ({ suggested: s.suggested.filter((x) => x !== id) })),
  favorite: (id) => {
    set((s) => {
      if (s.favorites.includes(id)) return s;
      const next = [...s.favorites, id];
      saveFavorites(next);
      return { favorites: next };
    });
    get().showToast("Added to favorites");
  },
  unfavorite: (id) => {
    set((s) => {
      const next = s.favorites.filter((x) => x !== id);
      saveFavorites(next);
      return { favorites: next };
    });
    get().showToast("Removed from favorites");
  },
  isFavorited: (id) => get().favorites.includes(id),

  // Conversations
  newConversation: () => {
    // Reuse existing empty chat instead of creating duplicates
    const existing = get().conversations.find((c) => c.messages.length === 0 && !c.archived);
    if (existing) {
      set({ activeConversationId: existing.id, chatThinking: false, showArchived: false });
      return existing.id;
    }
    const id = makeConvoId();
    const convo: Conversation = {
      id,
      title: "New chat",
      messages: [],
      attached: [],
      pinned: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => {
      const convos = [convo, ...s.conversations];
      saveConversations(convos);
      return { conversations: convos, activeConversationId: id, chatThinking: false, showArchived: false };
    });
    return id;
  },
  switchConversation: (id) => set({ activeConversationId: id, chatThinking: false }),
  deleteConversation: (id) => set((s) => {
    const convos = s.conversations.filter((c) => c.id !== id);
    saveConversations(convos);
    return {
      conversations: convos,
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      selectedConvoIds: s.selectedConvoIds.filter((x) => x !== id),
    };
  }),
  renameConversation: (id, title) => set((s) => {
    const convos = s.conversations.map((c) => c.id === id ? { ...c, title } : c);
    saveConversations(convos);
    return { conversations: convos };
  }),
  pinConversation: (id) => set((s) => {
    const convos = s.conversations.map((c) => c.id === id ? { ...c, pinned: true } : c);
    saveConversations(convos);
    return { conversations: convos };
  }),
  unpinConversation: (id) => set((s) => {
    const convos = s.conversations.map((c) => c.id === id ? { ...c, pinned: false } : c);
    saveConversations(convos);
    return { conversations: convos };
  }),
  archiveConversation: (id) => set((s) => {
    const convos = s.conversations.map((c) => c.id === id ? { ...c, archived: true, pinned: false } : c);
    saveConversations(convos);
    return {
      conversations: convos,
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      selectedConvoIds: s.selectedConvoIds.filter((x) => x !== id),
    };
  }),
  unarchiveConversation: (id) => set((s) => {
    const convos = s.conversations.map((c) => c.id === id ? { ...c, archived: false } : c);
    saveConversations(convos);
    return { conversations: convos };
  }),
  toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived, selectedConvoIds: [] })),
  toggleSelectConvo: (id) => set((s) => ({
    selectedConvoIds: s.selectedConvoIds.includes(id)
      ? s.selectedConvoIds.filter((x) => x !== id)
      : [...s.selectedConvoIds, id],
  })),
  selectAllConvos: (ids) => set({ selectedConvoIds: ids }),
  clearConvoSelection: () => set({ selectedConvoIds: [] }),
  archiveSelectedConvos: () => set((s) => {
    const convos = s.conversations.map((c) =>
      s.selectedConvoIds.includes(c.id) ? { ...c, archived: true, pinned: false } : c
    );
    saveConversations(convos);
    return {
      conversations: convos,
      selectedConvoIds: [],
      activeConversationId: s.selectedConvoIds.includes(s.activeConversationId || "") ? null : s.activeConversationId,
    };
  }),
  unarchiveSelectedConvos: () => set((s) => {
    const convos = s.conversations.map((c) =>
      s.selectedConvoIds.includes(c.id) ? { ...c, archived: false } : c
    );
    saveConversations(convos);
    return { conversations: convos, selectedConvoIds: [] };
  }),
  deleteSelectedConvos: () => set((s) => {
    const convos = s.conversations.filter((c) => !s.selectedConvoIds.includes(c.id));
    saveConversations(convos);
    return {
      conversations: convos,
      selectedConvoIds: [],
      activeConversationId: s.selectedConvoIds.includes(s.activeConversationId || "") ? null : s.activeConversationId,
    };
  }),
  addMessage: (msg) => set((s) => {
    const convos = s.conversations.map((c) => {
      if (c.id !== s.activeConversationId) return c;
      const updated = { ...c, messages: [...c.messages, msg], updatedAt: Date.now() };
      // Auto-title from first user message
      if (msg.isUser && c.messages.length === 0) {
        updated.title = msg.text.slice(0, 60) + (msg.text.length > 60 ? "…" : "");
      }
      return updated;
    });
    saveConversations(convos);
    return { conversations: convos };
  }),
  setChatThinking: (v) => set({ chatThinking: v }),
  getActiveConversation: () => {
    const s = get();
    return s.conversations.find((c) => c.id === s.activeConversationId) || null;
  },
  getAttached: () => {
    const s = get();
    const convo = s.conversations.find((c) => c.id === s.activeConversationId);
    return convo ? convo.attached : [];
  },

  // Browse
  setBrowseFilter: (filter) => set({ browseFilter: filter }),
  goBrowse: (kind, value, label) => set({ mainMode: "browse", browseFilter: { kind, value, label } }),
  toggleTag: (tag) => set((s) => ({
    selectedTags: s.selectedTags.includes(tag)
      ? s.selectedTags.filter((t) => t !== tag)
      : [...s.selectedTags, tag],
  })),
  clearTags: () => set({ selectedTags: [] }),
  setExplorerSearch: (q) => set({ explorerSearch: q }),

  // Toast (delegates to sonner)
  showToast: (msg) => {
    toast(msg, { duration: 2200 });
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
      set((s) => {
        // Remove from conversation attached lists
        const convos = s.conversations.map((c) => ({
          ...c, attached: c.attached.filter((x: string) => x !== id),
        }));
        saveConversations(convos);
        return {
          captures: s.captures.filter((c) => c.id !== id),
          captureCache: (() => { const cc = { ...s.captureCache }; delete cc[id]; return cc; })(),
          conversations: convos,
          favorites: (() => { const next = s.favorites.filter((x) => x !== id); saveFavorites(next); return next; })(),
          suggested: s.suggested.filter((x) => x !== id),
          detailOpen: s.selectedId === id ? false : s.detailOpen,
          selectedId: s.selectedId === id ? null : s.selectedId,
        };
      });
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
