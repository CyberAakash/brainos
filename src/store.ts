import { create } from "zustand";
import { toast } from "sonner";
import { api, type Capture, type CaptureOverview, type SearchResult, type CreateCaptureOpts, type SourceRef } from "./lib/ipc";

// ─── Capture color palette (fixed set for classification) ───
export const CAPTURE_COLORS: { key: string; bg: string; fg: string; dot: string }[] = [
  { key: "sage",      bg: "#E4EBE0", fg: "#4A6048", dot: "#7E9A6F" },
  { key: "terracotta", bg: "#F0E0DA", fg: "#8A4A38", dot: "#B5694F" },
  { key: "sand",      bg: "#F2E8D4", fg: "#7E6326", dot: "#B89248" },
  { key: "ocean",     bg: "#DFE6EE", fg: "#3F5572", dot: "#6E89AB" },
  { key: "lavender",  bg: "#E9E1EC", fg: "#614A6E", dot: "#927AA0" },
  { key: "mint",      bg: "#DDEAE7", fg: "#3A5F58", dot: "#6A9389" },
  { key: "stone",     bg: "#E8E5DD", fg: "#5C584E", dot: "#908A7C" },
  { key: "teal",      bg: "#DCE9E9", fg: "#36605F", dot: "#689592" },
];

export function getColorMeta(key?: string | null) {
  if (!key) return CAPTURE_COLORS[6]; // stone fallback
  return CAPTURE_COLORS.find((c) => c.key === key) || CAPTURE_COLORS[6];
}

export function randomColorKey(): string {
  return CAPTURE_COLORS[Math.floor(Math.random() * CAPTURE_COLORS.length)].key;
}

// ─── Capture icon set (random assignment, user can edit to any emoji) ───
export const CAPTURE_ICONS: string[] = [
  "📝", "💡", "🔧", "📌", "🧩", "🎯", "📎", "🗂️", "⚡", "🔍", "📚", "🧠",
];

export function randomIcon(): string {
  return CAPTURE_ICONS[Math.floor(Math.random() * CAPTURE_ICONS.length)];
}

// ─── Types ───
export type MainMode = "home" | "browse" | null;
export type RagMode = "auto" | "manual";
export type PaletteMode = "search" | "attach";
export type SidebarTab = "chat" | "explorer" | "search";

// ─── Dock system (Zed-style) ───
export type LeftDockPanel = "explorer" | "chat" | "search";
export type RightDockPanel = "detail";

export interface DockState {
  open: boolean;
  panel: string;
  size: number;     // percentage for non-chat panels
  chatSize: number; // percentage for chat panel (wider)
}

export type ThemeMode = "light" | "dark";

export interface GlobalSearchMatch {
  captureId: string;
  title: string;
  space: string;
  captureType: string;
  icon?: string | null;
  color?: string | null;
  lines: { lineNum: number; text: string; matchRanges: [number, number][]; isContext?: boolean }[];
  matchCount: number;
}

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
  sourceRefs?: SourceRef[];
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
  selectedId: string | null;
  detailScrollToLine: number | null;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  newOpen: boolean;
  settingsOpen: boolean;

  // Dock system (Zed-style toggleable panels)
  leftDock: DockState & { panel: LeftDockPanel };
  rightDock: DockState & { panel: RightDockPanel };
  theme: ThemeMode;

  // Legacy compat getters (computed from dock state)
  /** @deprecated use leftDock.open */ sidebarCollapsed: boolean;
  /** @deprecated use leftDock.panel */ sidebarTab: SidebarTab;
  /** @deprecated use rightDock.open && rightDock.panel === "detail" */ detailOpen: boolean;

  // RAG
  ragMode: RagMode;

  // Context — favorites persist across sessions
  favorites: string[];
  suggested: string[];

  // Conversations — persistent chat history
  conversations: Conversation[];
  activeConversationId: string | null;
  chatThinking: boolean;
  editingMessageId: string | null;
  selectedConvoIds: string[];
  showArchived: boolean;

  // Chat panel (P4 — left dock split)
  openChatTabs: string[];         // conversation IDs open as tabs
  chatHistoryOpen: boolean;       // toggleable inner sidebar
  chatHistorySize: number;        // persisted inner split percentage

  // Data
  captures: CaptureOverview[];
  captureCache: Record<string, Capture>;
  loading: boolean;

  // Browse
  browseFilter: BrowseFilter;

  // Search
  searchResults: SearchResult[];

  // Global search (VS Code style)
  globalSearchQuery: string;
  globalSearchCaseSensitive: boolean;
  globalSearchWholeWord: boolean;
  globalSearchRegex: boolean;
  globalSearchResults: GlobalSearchMatch[];
  globalSearching: boolean;

  // Dock actions
  toggleLeftDock: () => void;
  toggleRightDock: () => void;
  setLeftDockPanel: (panel: LeftDockPanel) => void;
  setRightDockPanel: (panel: RightDockPanel) => void;
  setLeftDockSize: (size: number) => void;
  setRightDockSize: (size: number) => void;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;

  // Actions
  setMainMode: (mode: MainMode) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSidebar: () => void;
  openDetail: (id: string, lineNum?: number) => void;
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
  removeLastMessage: () => ChatMessage | null;
  setEditingMessageId: (id: string | null) => void;
  truncateFromMessage: (msgId: string) => void;
  setChatThinking: (v: boolean) => void;
  getActiveConversation: () => Conversation | null;
  getAttached: () => string[];

  // Chat tab actions (P4)
  openChatTab: (id: string) => void;
  closeChatTab: (id: string) => void;
  toggleChatHistory: () => void;
  setChatHistorySize: (size: number) => void;

  // Browse
  setBrowseFilter: (filter: BrowseFilter) => void;
  goBrowse: (kind: BrowseFilter["kind"], value: string | null, label: string) => void;

  // Explorer (sidebar multi-select tags + search)
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  explorerSearch: string;
  setExplorerSearch: (q: string) => void;

  // Global search actions
  setGlobalSearchQuery: (q: string) => void;
  toggleGlobalSearchCase: () => void;
  toggleGlobalSearchWholeWord: () => void;
  toggleGlobalSearchRegex: () => void;
  runGlobalSearch: () => Promise<void>;

  // Toast (uses sonner)
  showToast: (msg: string) => void;

  // Data loading
  loadCaptures: () => Promise<void>;
  loadCapture: (id: string) => Promise<Capture | null>;
  searchCaptures: (query: string) => Promise<SearchResult[]>;
  deleteCapture: (id: string) => Promise<void>;
  archiveCapture: (id: string) => Promise<void>;
  unarchiveCapture: (id: string) => Promise<void>;
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

function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem("brainos_theme");
    return raw === "dark" ? "dark" : "light";
  } catch { return "light"; }
}

export const useStore = create<AppState>((set, get) => ({
  mainMode: "home",

  // Dock system
  leftDock: { open: true, panel: "explorer" as LeftDockPanel, size: 18, chatSize: 32 },
  rightDock: { open: false, panel: "detail" as RightDockPanel, size: 32, chatSize: 32 },
  theme: loadTheme(),

  // Legacy compat (computed from dock state on reads; actions keep them in sync)
  sidebarCollapsed: false,
  sidebarTab: "explorer" as SidebarTab,
  detailOpen: false,

  selectedId: null,
  detailScrollToLine: null,
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
  editingMessageId: null,
  selectedConvoIds: [],
  showArchived: false,
  openChatTabs: [],
  chatHistoryOpen: true,
  chatHistorySize: 35,
  captures: [],
  captureCache: {},
  loading: false,
  browseFilter: { kind: "all", value: null, label: "All captures" },
  selectedTags: [],
  explorerSearch: "",
  searchResults: [],
  globalSearchQuery: "",
  globalSearchCaseSensitive: false,
  globalSearchWholeWord: false,
  globalSearchRegex: false,
  globalSearchResults: [],
  globalSearching: false,

  // Dock actions
  toggleLeftDock: () => set((s) => {
    const open = !s.leftDock.open;
    return { leftDock: { ...s.leftDock, open }, sidebarCollapsed: !open };
  }),
  toggleRightDock: () => set((s) => {
    const open = !s.rightDock.open;
    return { rightDock: { ...s.rightDock, open }, detailOpen: open && s.rightDock.panel === "detail" };
  }),
  setLeftDockPanel: (panel) => set((s) => {
    // If same panel, toggle the dock
    if (s.leftDock.panel === panel && s.leftDock.open) {
      return { leftDock: { ...s.leftDock, open: false }, sidebarCollapsed: true };
    }
    return { leftDock: { ...s.leftDock, panel, open: true }, sidebarCollapsed: false, sidebarTab: panel as SidebarTab };
  }),
  setRightDockPanel: (panel) => set((s) => {
    // If same panel, toggle the dock
    if (s.rightDock.panel === panel && s.rightDock.open) {
      return { rightDock: { ...s.rightDock, open: false }, detailOpen: false };
    }
    return { rightDock: { ...s.rightDock, panel, open: true }, detailOpen: panel === "detail" };
  }),
  setLeftDockSize: (size) => set((s) => ({
    leftDock: {
      ...s.leftDock,
      ...(s.leftDock.panel === "chat" ? { chatSize: size } : { size }),
    },
  })),
  setRightDockSize: (size) => set((s) => ({ rightDock: { ...s.rightDock, size } })),
  setTheme: (mode) => {
    localStorage.setItem("brainos_theme", mode);
    set({ theme: mode });
  },
  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    localStorage.setItem("brainos_theme", next);
    set({ theme: next });
  },

  // Navigation (legacy-compat wrappers that delegate to dock state)
  setMainMode: (mode) => set({ mainMode: mode }),
  setSidebarTab: (tab) => set((s) => ({
    sidebarTab: tab,
    leftDock: { ...s.leftDock, panel: (tab === "search" ? s.leftDock.panel : tab) as LeftDockPanel, open: true },
    sidebarCollapsed: false,
  })),
  toggleSidebar: () => set((s) => {
    const open = !s.leftDock.open;
    return { leftDock: { ...s.leftDock, open }, sidebarCollapsed: !open };
  }),
  openDetail: (id, lineNum) => set((s) => ({
    selectedId: id,
    detailOpen: true,
    detailScrollToLine: lineNum ?? null,
    rightDock: { ...s.rightDock, panel: "detail" as RightDockPanel, open: true },
  })),
  closeDetail: () => set((s) => ({
    detailOpen: false,
    detailScrollToLine: null,
    rightDock: { ...s.rightDock, open: false },
  })),
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
  goHome: () => set({ activeConversationId: null, chatThinking: false, editingMessageId: null }),
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
      const tabs = s.openChatTabs.includes(id) ? s.openChatTabs : [...s.openChatTabs, id];
      return { conversations: convos, activeConversationId: id, chatThinking: false, showArchived: false, openChatTabs: tabs };
    });
    return id;
  },
  switchConversation: (id) => set((s) => {
    const tabs = s.openChatTabs.includes(id) ? s.openChatTabs : [...s.openChatTabs, id];
    return { activeConversationId: id, chatThinking: false, editingMessageId: null, openChatTabs: tabs };
  }),
  deleteConversation: (id) => set((s) => {
    const convos = s.conversations.filter((c) => c.id !== id);
    saveConversations(convos);
    const tabs = s.openChatTabs.filter((t) => t !== id);
    const nextActive = s.activeConversationId === id
      ? (tabs.length > 0 ? tabs[tabs.length - 1] : null)
      : s.activeConversationId;
    return {
      conversations: convos,
      activeConversationId: nextActive,
      openChatTabs: tabs,
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
  removeLastMessage: () => {
    let removed: ChatMessage | null = null;
    set((s) => {
      const convos = s.conversations.map((c) => {
        if (c.id !== s.activeConversationId || c.messages.length === 0) return c;
        removed = c.messages[c.messages.length - 1];
        return { ...c, messages: c.messages.slice(0, -1), updatedAt: Date.now() };
      });
      saveConversations(convos);
      return { conversations: convos };
    });
    return removed;
  },
  setEditingMessageId: (id) => set({ editingMessageId: id }),
  truncateFromMessage: (msgId) => {
    set((s) => {
      const convos = s.conversations.map((c) => {
        if (c.id !== s.activeConversationId) return c;
        const idx = c.messages.findIndex((m) => m.id === msgId);
        if (idx < 0) return c;
        return { ...c, messages: c.messages.slice(0, idx), updatedAt: Date.now() };
      });
      saveConversations(convos);
      return { conversations: convos, editingMessageId: null };
    });
  },
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

  // Chat tab actions (P4)
  openChatTab: (id) => set((s) => {
    const tabs = s.openChatTabs.includes(id) ? s.openChatTabs : [...s.openChatTabs, id];
    return { openChatTabs: tabs, activeConversationId: id, chatThinking: false, editingMessageId: null };
  }),
  closeChatTab: (id) => set((s) => {
    const tabs = s.openChatTabs.filter((t) => t !== id);
    // If closing the active tab, switch to the last remaining tab (or null)
    const nextActive = s.activeConversationId === id
      ? (tabs.length > 0 ? tabs[tabs.length - 1] : null)
      : s.activeConversationId;
    return { openChatTabs: tabs, activeConversationId: nextActive, chatThinking: false, editingMessageId: null };
  }),
  toggleChatHistory: () => set((s) => ({ chatHistoryOpen: !s.chatHistoryOpen })),
  setChatHistorySize: (size) => set({ chatHistorySize: size }),

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

  // Global search
  setGlobalSearchQuery: (q) => set({ globalSearchQuery: q }),
  toggleGlobalSearchCase: () => set((s) => ({ globalSearchCaseSensitive: !s.globalSearchCaseSensitive })),
  toggleGlobalSearchWholeWord: () => set((s) => ({ globalSearchWholeWord: !s.globalSearchWholeWord })),
  toggleGlobalSearchRegex: () => set((s) => ({ globalSearchRegex: !s.globalSearchRegex })),
  runGlobalSearch: async () => {
    const { globalSearchQuery: q, globalSearchCaseSensitive: caseSen, globalSearchWholeWord: wholeWord, globalSearchRegex: useRegex, captures } = get();
    if (!q.trim()) { set({ globalSearchResults: [] }); return; }

    set({ globalSearching: true });
    try {
      // Build matcher
      let matcher: (text: string) => [number, number][];
      if (useRegex) {
        try {
          const flags = caseSen ? "g" : "gi";
          const rx = new RegExp(q, flags);
          matcher = (text) => {
            const ranges: [number, number][] = [];
            let m: RegExpExecArray | null;
            while ((m = rx.exec(text)) !== null) {
              ranges.push([m.index, m.index + m[0].length]);
              if (!rx.global) break;
            }
            return ranges;
          };
        } catch {
          set({ globalSearching: false }); return; // invalid regex
        }
      } else if (wholeWord) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const flags = caseSen ? "g" : "gi";
        const rx = new RegExp(`\\b${escaped}\\b`, flags);
        matcher = (text) => {
          const ranges: [number, number][] = [];
          let m: RegExpExecArray | null;
          while ((m = rx.exec(text)) !== null) {
            ranges.push([m.index, m.index + m[0].length]);
          }
          return ranges;
        };
      } else {
        const needle = caseSen ? q : q.toLowerCase();
        matcher = (text) => {
          const hay = caseSen ? text : text.toLowerCase();
          const ranges: [number, number][] = [];
          let idx = 0;
          while ((idx = hay.indexOf(needle, idx)) !== -1) {
            ranges.push([idx, idx + needle.length]);
            idx += needle.length;
          }
          return ranges;
        };
      }

      // Load full captures and search their bodies + metadata
      const results: GlobalSearchMatch[] = [];
      for (const ov of captures) {
        let cap = get().captureCache[ov.id];
        if (!cap) {
          try { cap = (await api.getCapture(ov.id))!; } catch { continue; }
          if (!cap) continue;
          set((s) => ({ captureCache: { ...s.captureCache, [cap!.id]: cap! } }));
        }

        // Search the body text only (title shown in header)
        const bodyText = cap.body_text || "";
        const lines = bodyText.split("\n");
        const matchLineIndices = new Set<number>();
        let totalMatches = 0;

        for (let i = 0; i < lines.length; i++) {
          const ranges = matcher(lines[i]);
          if (ranges.length > 0) {
            totalMatches += ranges.length;
            matchLineIndices.add(i);
          }
        }

        // Also search title + tags + summary for match count
        const metaText = [cap.title, cap.tags.join(" "), cap.summary || ""].join("\n");
        for (const metaLine of metaText.split("\n")) {
          totalMatches += matcher(metaLine).length;
        }

        if (totalMatches === 0) continue;

        // Build lines with 1-line context above/below
        const contextIndices = new Set<number>();
        for (const idx of matchLineIndices) {
          if (idx > 0) contextIndices.add(idx - 1);
          contextIndices.add(idx);
          if (idx < lines.length - 1) contextIndices.add(idx + 1);
        }

        const sortedIndices = [...contextIndices].sort((a, b) => a - b);
        const matchLines: GlobalSearchMatch["lines"] = [];
        for (const idx of sortedIndices) {
          const isMatch = matchLineIndices.has(idx);
          const ranges = isMatch ? matcher(lines[idx]) : [];
          matchLines.push({
            lineNum: idx + 1,
            text: lines[idx],
            matchRanges: ranges,
            isContext: !isMatch,
          });
          if (matchLines.length >= 20) break; // limit lines per capture
        }

        results.push({
          captureId: cap.id,
          title: cap.title,
          space: cap.space,
          captureType: cap.capture_type,
          icon: cap.icon,
          color: cap.color,
          lines: matchLines,
          matchCount: totalMatches,
        });
      }

      set({ globalSearchResults: results, globalSearching: false });
    } catch {
      set({ globalSearching: false });
    }
  },

  // Toast (delegates to sonner)
  showToast: (msg) => {
    toast(msg, { duration: 2200 });
  },

  // Data
  loadCaptures: async () => {
    set({ loading: true });
    try {
      const captures = await api.listCaptures({ include_archived: true }, 500, 0);
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
          rightDock: s.selectedId === id ? { ...s.rightDock, open: false } : s.rightDock,
          selectedId: s.selectedId === id ? null : s.selectedId,
        };
      });
      get().showToast("Capture deleted");
    } catch (e) {
      console.error("Failed to delete:", e);
      get().showToast("Delete failed");
    }
  },

  archiveCapture: async (id) => {
    try {
      await api.archiveCapture(id);
      set((s) => ({
        captures: s.captures.map((c) => c.id === id ? { ...c, status: "archived" as const } : c),
        captureCache: s.captureCache[id] ? { ...s.captureCache, [id]: { ...s.captureCache[id], status: "archived" as const } } : s.captureCache,
      }));
      get().showToast("Capture archived");
    } catch (e) {
      console.error("Failed to archive:", e);
      get().showToast("Archive failed");
    }
  },

  unarchiveCapture: async (id) => {
    try {
      await api.unarchiveCapture(id);
      set((s) => ({
        captures: s.captures.map((c) => c.id === id ? { ...c, status: "active" as const } : c),
        captureCache: s.captureCache[id] ? { ...s.captureCache, [id]: { ...s.captureCache[id], status: "active" as const } } : s.captureCache,
      }));
      get().showToast("Capture restored");
    } catch (e) {
      console.error("Failed to unarchive:", e);
      get().showToast("Restore failed");
    }
  },

  createCapture: async (title, space, captureType, tags, body, opts?) => {
    try {
      // Assign random color & icon if not provided
      const finalOpts = {
        ...opts,
        color: opts?.color || randomColorKey(),
        icon: opts?.icon || randomIcon(),
      };
      const capture = await api.createCapture(title, space, captureType, tags, body, finalOpts);
      set((s) => ({
        captures: [
          { id: capture.id, file_path: capture.file_path, title: capture.title, summary: capture.summary, space: capture.space, capture_type: capture.capture_type, status: capture.status, date: capture.date, tags: capture.tags, projects: capture.projects, color: capture.color, icon: capture.icon, body_preview: capture.body_text?.slice(0, 200) },
          ...s.captures,
        ],
        captureCache: { ...s.captureCache, [capture.id]: capture },
        newOpen: false,
        selectedId: capture.id,
        detailOpen: true,
        rightDock: { ...s.rightDock, panel: "detail" as RightDockPanel, open: true },
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
