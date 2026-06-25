import { invoke } from "@tauri-apps/api/core";

// ── New v2 types ─────────────────────────────────────────────

export type CaptureStatus = "active" | "archived";

export interface ProjectInfo {
  name: string;
  path?: string;
}

export interface GitCommit {
  hash: string;
  message?: string;
}

export interface GitInfo {
  repo?: string;
  branch?: string;
  remote?: string;
  commits: GitCommit[];
}

export interface Chain {
  prev?: string;
  refs: string[];
}

export interface Link {
  url: string;
  label?: string;
}

// ── Core types ───────────────────────────────────────────────

export interface CaptureOverview {
  id: string;
  title: string;
  summary?: string;
  space: "work" | "personal" | "wiki";
  capture_type: string;
  status: CaptureStatus;
  date: string;
  tags: string[];
  projects: string[];
  color?: string;
  icon?: string;
}

export interface Capture extends CaptureOverview {
  file_path: string;
  file_hash: string;
  confidence?: string;
  repo?: string;
  workspace?: string;
  session_tool?: string;
  related: string[];
  files: string[];
  project_info?: ProjectInfo;
  git_info?: GitInfo;
  chain?: Chain;
  links: Link[];
  body_text: string;
}

export interface SearchResult {
  capture: CaptureOverview;
  score: number;
  snippet: string;
}

export interface CaptureFilters {
  space?: "work" | "personal" | "wiki";
  capture_type?: string;
  project?: string;
  tags?: string[];
  since?: string;
  until?: string;
  status?: CaptureStatus;
  include_archived?: boolean;
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface SourceRef {
  id: string;
  title: string;
  space: string;
  capture_type: string;
  tags: string[];
}

export interface ChatResponse {
  text: string;
  source_ids: string[];
  sources: SourceRef[];
}

export interface ProviderConfig {
  api_key: string;
  model: string;
  endpoint: string;
  api_mode?: string; // "openai" | "anthropic" — used by custom provider
}

export interface AppSettings {
  general: { kb_root: string; display_name: string; auto_index: boolean };
  chat: { active: string; providers: Record<string, ProviderConfig> };
  ui: { theme: string; sidebar_width: number; compact_mode: boolean };
}

// ── Create capture options ───────────────────────────────────

export interface CreateCaptureOpts {
  summary?: string;
  status?: CaptureStatus;
  projectName?: string;
  projectPath?: string;
  chainPrev?: string;
  color?: string;
  icon?: string;
}

// ── Workspace root types ────────────────────────────────────

export interface WorkspaceRootRow {
  id: number;
  path: string;
  name: string;
  kind: string;
}

// ── Workspace file metadata (no content stored) ─────────────

export interface WorkspaceFileRow {
  id: string;
  root_id: number;
  relative_path: string;
  abs_path: string;
  file_hash: string;
  file_size: number;
  language?: string;
  modified_at?: string;
}

// ── API ──────────────────────────────────────────────────────

export const api = {
  listCaptures: (filters?: CaptureFilters, limit?: number, offset?: number) =>
    invoke<CaptureOverview[]>("list_captures", { filters, limit, offset }),

  getCapture: (id: string) =>
    invoke<Capture | null>("get_capture", { id }),

  search: (query: string, limit?: number) =>
    invoke<SearchResult[]>("search", { query, limit }),

  readCaptureRaw: (id: string) =>
    invoke<string>("read_capture_raw", { id }),

  createCapture: (
    title: string,
    space: string,
    captureType: string,
    tags: string[],
    body: string,
    opts?: CreateCaptureOpts,
  ) =>
    invoke<Capture>("create_capture_file", {
      title,
      space,
      captureType,
      tags,
      body,
      ...(opts ?? {}),
    }),

  saveCaptureContent: (id: string, content: string) =>
    invoke<Capture>("save_capture_content", { id, content }),

  deleteCapture: (id: string) =>
    invoke<void>("delete_capture_file", { id }),

  archiveCapture: (id: string) =>
    invoke<void>("archive_capture", { id }),

  unarchiveCapture: (id: string) =>
    invoke<void>("unarchive_capture", { id }),

  getSettings: () =>
    invoke<AppSettings>("get_settings"),

  saveSettings: (active: string, providers: Record<string, ProviderConfig>) =>
    invoke<void>("save_settings", { active, providers }),

  saveGeneralSettings: (opts: { displayName?: string; autoIndex?: boolean; compactMode?: boolean }) =>
    invoke<void>("save_general_settings", opts),

  chatSend: (message: string, pinnedIds: string[], history: ChatHistoryItem[]) =>
    invoke<ChatResponse>("chat_send", { message, pinnedIds, history }),

  testProvider: (providerKey: string, providers: Record<string, ProviderConfig>) =>
    invoke<string>("test_provider", { providerKey, providers }),

  detectClaudeCli: () =>
    invoke<string | null>("detect_claude_cli"),

  detectGitInfo: (path: string) =>
    invoke<GitInfo | null>("detect_git_info", { path }),

  syncNow: () =>
    invoke<any>("sync_now"),

  // ── Workspace roots ─────────────────────────────────────────
  listWorkspaceRoots: () =>
    invoke<WorkspaceRootRow[]>("list_workspace_roots"),

  addWorkspaceRoot: (path: string, name: string, fileTypes?: string[], excludeDirs?: string[]) =>
    invoke<WorkspaceRootRow>("add_workspace_root", { path, name, fileTypes, excludeDirs }),

  removeWorkspaceRoot: (rootId: number) =>
    invoke<void>("remove_workspace_root", { rootId }),

  getWorkspaceRootStats: (rootId: number) =>
    invoke<number>("get_workspace_root_stats", { rootId }),

  reindexWorkspaceRoot: (rootId: number) =>
    invoke<void>("reindex_workspace_root", { rootId }),

  cancelIndexing: (rootId: number) =>
    invoke<boolean>("cancel_indexing", { rootId }),

  getWorkspaceRootExcludes: (rootId: number) =>
    invoke<string[]>("get_workspace_root_excludes", { rootId }),

  updateWorkspaceRootExcludes: (rootId: number, excludeDirs: string[]) =>
    invoke<void>("update_workspace_root_excludes", { rootId, excludeDirs }),

  // ── Workspace files (metadata-only) ────────────────────────
  listWorkspaceFiles: (rootId: number) =>
    invoke<WorkspaceFileRow[]>("list_workspace_files", { rootId }),

  readWorkspaceFile: (absPath: string) =>
    invoke<string>("read_workspace_file", { absPath }),
};
