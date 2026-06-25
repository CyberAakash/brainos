# BrainOS: Multi-Root Workspaces + MCP Server — Implementation Plan

## Current Architecture (Baseline)

| Component | Current State |
|-----------|--------------|
| **Config** | Single `kb_root: PathBuf` in `GeneralConfig` → `~/knowledge-base` |
| **File Watcher** | One `notify::RecommendedWatcher` on `kb_root`, filters `.md` only |
| **Indexer** | Scans `<kb_root>/captures/*.md`, content-hash diffing, upserts to SQLite |
| **Storage** | SQLite + WAL + FTS5 + sqlite-vec. `captures` table stores `file_path` (relative to kb_root) |
| **Search** | 3-signal RRF: BM25 (FTS5) + Vector (sqlite-vec) + Entity graph |
| **MCP Server** | Stub binary — CLI args parsed, JSON-RPC loop is TODO |
| **Interfaces** | Tauri commands (20+), CLI binary (exists), MCP binary (stub) |

---

## Feature 1: Multi-Root Workspace Registry

### Problem
BrainOS indexes only `~/knowledge-base/captures/*.md`. When chatting about code in `~/ZIDE/zohoim`, the AI has zero context from that workspace. Users work across multiple projects/repos and need all of them queryable.

### Design

#### 1.1 Config Changes (`config.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralConfig {
    pub kb_root: PathBuf,           // keep — primary knowledge base
    pub display_name: String,
    #[serde(default = "default_true")]
    pub auto_index: bool,
    #[serde(default)]
    pub workspace_roots: Vec<WorkspaceRoot>,  // NEW
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceRoot {
    pub path: PathBuf,
    pub name: String,               // display name, e.g. "ZohoIM", "ZohoDesk v1"
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub file_types: Vec<String>,    // e.g. ["rs", "ts", "tsx", "md", "py"] — empty = all supported
    #[serde(default)]
    pub exclude_patterns: Vec<String>, // e.g. ["node_modules", "target", ".git", "dist"]
}
```

TOML example:
```toml
[general]
kb_root = "~/knowledge-base"

[[general.workspace_roots]]
path = "~/ZIDE/zohoim"
name = "ZohoIM"
enabled = true
file_types = ["rs", "ts", "tsx", "java"]
exclude_patterns = ["node_modules", "target", ".git", "build"]

[[general.workspace_roots]]
path = "~/ZIDE26/zohodesk_worker_v1"
name = "ZohoDesk Worker"
enabled = true
file_types = ["rs", "ts", "tsx"]
exclude_patterns = ["node_modules", "target", ".git"]
```

#### 1.2 Database Schema — `roots` Table (Migration 005)

```sql
-- 005_workspace_roots.sql
CREATE TABLE IF NOT EXISTS roots (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    path  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL,
    kind  TEXT NOT NULL DEFAULT 'workspace'  -- 'kb' | 'workspace' | 'external'
);

-- Root 0 = the legacy kb_root (auto-inserted on migration)
INSERT OR IGNORE INTO roots (id, path, name, kind) VALUES (0, '', 'Knowledge Base', 'kb');

-- Add root_id to captures (nullable for backward compat, default 0 = kb)
ALTER TABLE captures ADD COLUMN root_id INTEGER DEFAULT 0 REFERENCES roots(id);

-- Index for per-root queries
CREATE INDEX IF NOT EXISTS idx_captures_root ON captures(root_id);

-- Add source_path for workspace files (absolute path to original file)
ALTER TABLE captures ADD COLUMN source_path TEXT;
```

#### 1.3 File Watcher — Multi-Root Support (`watcher.rs`)

Key change: one `RecommendedWatcher` instance, multiple `watch()` calls.

```rust
pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    rx: mpsc::Receiver<WatchEvent>,
    watched_paths: Vec<PathBuf>,
}

impl FileWatcher {
    pub fn new(paths: &[(PathBuf, WatchFilter)]) -> Result<Self> {
        let (tx, rx) = mpsc::channel();
        let filters: HashMap<PathBuf, WatchFilter> = paths.iter().cloned().collect();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                // ... filter by extension per-root using `filters` map
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )?;

        let mut watched = vec![];
        for (path, _) in paths {
            if path.exists() {
                watcher.watch(path, RecursiveMode::Recursive)?;
                watched.push(path.clone());
                info!("Watching: {}", path.display());
            }
        }

        Ok(Self { _watcher: watcher, rx, watched_paths: watched })
    }

    /// Add a new root at runtime (e.g. user adds from Settings UI)
    pub fn add_root(&mut self, path: &Path) -> Result<()> { ... }

    /// Remove a root at runtime
    pub fn remove_root(&mut self, path: &Path) -> Result<()> { ... }
}
```

**Platform note:** Linux inotify limit is ~8192 watches. Deep `node_modules` trees burn through this. Must:
- Respect `exclude_patterns` — don't descend into excluded dirs
- Use `.gitignore` parsing (the `ignore` crate) as default excludes
- Fall back to `PollWatcher` if inotify limit hit

#### 1.4 Indexer Changes (`indexer.rs`)

New function alongside existing `index_all`:

```rust
/// Index workspace source files (code, docs) from a registered root.
/// Unlike kb captures (which are .md with YAML frontmatter),
/// workspace files are indexed as lightweight "source captures":
/// - id = hash of (root_id, relative_path)
/// - title = filename
/// - body_text = file contents (truncated at 50KB)
/// - space = root name
/// - type = "source"
/// - source_path = absolute path
pub fn index_workspace(store: &Store, root: &WorkspaceRoot, root_id: i64, embedder: Option<&Embedder>) -> Result<u32> {
    // Walk directory, respect exclude_patterns + file_types
    // For each file: hash contents, skip if unchanged
    // Upsert as capture with root_id + source_path
    // Generate embedding if embedder available
}
```

**Chunking strategy for code files:**
- Files < 4KB: index as single chunk
- Files 4-50KB: split by function/class boundaries (tree-sitter) or by ~2KB paragraphs
- Files > 50KB: index first 50KB, log warning

#### 1.5 Search — Cross-Root Querying

No changes to `hybrid.rs` needed — FTS5 and vector search already operate on all captures regardless of root. But add optional root scoping:

```rust
pub struct SearchOptions {
    pub query: String,
    pub limit: u32,
    pub root_ids: Option<Vec<i64>>,   // None = search all, Some = filter to these roots
    pub include_expired: bool,
}
```

#### 1.6 Frontend: Settings → Sources Page

The existing SettingsView has a "Sources" tab (placeholder). Wire it up:
- List registered workspace roots with toggle (enabled/disabled)
- "Add Workspace" button → native folder picker dialog
- Per-root: name, path, file types filter, exclude patterns
- Index status: last indexed time, file count, index size
- "Re-index" button per root

#### 1.7 Tauri Commands

```rust
#[tauri::command]
fn add_workspace_root(path: String, name: String) -> Result<WorkspaceRoot, String> { ... }

#[tauri::command]
fn remove_workspace_root(path: String) -> Result<(), String> { ... }

#[tauri::command]
fn list_workspace_roots() -> Result<Vec<WorkspaceRoot>, String> { ... }

#[tauri::command]
fn reindex_root(root_id: i64) -> Result<u32, String> { ... }

#[tauri::command]
fn get_root_stats(root_id: i64) -> Result<RootStats, String> { ... }
```

### Implementation Order

| Step | What | Files Changed | Est. Effort |
|------|------|---------------|-------------|
| 1 | Add `WorkspaceRoot` to config + TOML support | `config.rs` | 30 min |
| 2 | Migration 005: `roots` table + `root_id` column | `db.rs`, new SQL | 30 min |
| 3 | Multi-path `FileWatcher` | `watcher.rs` | 1 hr |
| 4 | `index_workspace()` function | `indexer.rs` | 2 hr |
| 5 | Root-scoped search option | `hybrid.rs`, `queries.rs` | 30 min |
| 6 | Tauri commands for root CRUD | `commands.rs` | 1 hr |
| 7 | Wire watcher + indexer in `main.rs` | `main.rs` | 30 min |
| 8 | Settings → Sources UI | `SettingsView.tsx` | 2 hr |
| 9 | Test with real workspaces | — | 1 hr |
| **Total** | | | **~9 hours** |

---

## Feature 2: MCP Server Mode

### Problem
BrainOS's knowledge is trapped inside the Tauri app. Claude Code, Cursor, and other AI tools can't access it. Making BrainOS an MCP server turns it into infrastructure that any AI client can query.

### Architecture

```
Claude Code / Cursor / Claude Desktop
    │ stdio (JSON-RPC 2.0)
    ▼
brainos-mcp binary (ships with app, standalone)
    │ opens same SQLite DB directly
    ▼
index.db (shared SQLite, WAL mode = safe concurrent reads)
```

**Why direct DB access (not HTTP proxy):**
- The Tauri app and MCP binary share the same SQLite database
- WAL mode allows concurrent readers safely
- No need for the Tauri app to be running — MCP server works standalone
- Simpler than HTTP proxy (no port management, auth, or daemon coordination)
- Same pattern as Obsidian MCP servers

### MCP Tools to Expose

#### Phase 1: Read-Only (launch with this)

| Tool | Description | Parameters |
|------|-------------|------------|
| `brainos_search` | Hybrid search across all knowledge | `query: string, limit?: number, root?: string` |
| `brainos_get_capture` | Get full capture by ID | `id: string` |
| `brainos_list_captures` | List recent captures | `limit?: number, space?: string, project?: string` |
| `brainos_get_context` | Get captures related to a topic + entity graph | `topic: string, depth?: number` |
| `brainos_list_roots` | List registered workspace roots | — |

#### Phase 2: Write Access (behind `--allow-write`)

| Tool | Description | Parameters |
|------|-------------|------------|
| `brainos_save_capture` | Create/update a capture | `title, body, space?, tags?, project?` |
| `brainos_add_root` | Register a new workspace root | `path: string, name: string` |

### Implementation (`brainos-mcp/src/main.rs`)

Using `rmcp` crate (official Rust MCP SDK):

```toml
# brainos-mcp/Cargo.toml additions
rmcp = { version = "0.16", features = ["transport-io", "server"] }
```

```rust
use rmcp::prelude::*;
use brainos_core::store::Store;
use brainos_core::search::hybrid;
use brainos_core::config::Config;

#[derive(Clone)]
struct BrainOSServer {
    store: Arc<Store>,       // shared via Arc for thread safety
    config: Arc<Config>,
    embedder: Option<Arc<Embedder>>,
    allow_write: bool,
}

#[tool_handler]
impl ServerHandler for BrainOSServer {
    #[tool(description = "Search BrainOS knowledge base using hybrid search (BM25 + semantic + entity graph)")]
    async fn brainos_search(
        &self,
        #[arg(description = "Search query")] query: String,
        #[arg(description = "Max results (default 10)")] limit: Option<u32>,
        #[arg(description = "Filter to specific workspace root name")] root: Option<String>,
    ) -> Result<CallToolResult, McpError> {
        let results = hybrid::search(
            &self.store,
            &query,
            limit.unwrap_or(10),
            self.embedder.as_deref(),
            &self.config.search,
        ).map_err(|e| McpError::internal(e.to_string()))?;

        // Format as markdown for LLM consumption
        let text = format_search_results(&results);
        Ok(CallToolResult::success(vec![Content::text(text)]))
    }

    #[tool(description = "Get a specific capture by ID with full content")]
    async fn brainos_get_capture(
        &self,
        #[arg(description = "Capture ID")] id: String,
    ) -> Result<CallToolResult, McpError> { ... }

    #[tool(description = "Get contextual knowledge about a topic — related captures + entity connections")]
    async fn brainos_get_context(
        &self,
        #[arg(description = "Topic to get context for")] topic: String,
        #[arg(description = "How many related hops to traverse (default 1)")] depth: Option<u32>,
    ) -> Result<CallToolResult, McpError> { ... }

    #[tool(description = "List recent captures, optionally filtered by space or project")]
    async fn brainos_list_captures(
        &self,
        #[arg(description = "Max results")] limit: Option<u32>,
        #[arg(description = "Filter by space")] space: Option<String>,
        #[arg(description = "Filter by project")] project: Option<String>,
    ) -> Result<CallToolResult, McpError> { ... }

    #[tool(description = "List registered workspace roots")]
    async fn brainos_list_roots(&self) -> Result<CallToolResult, McpError> { ... }
}

#[tokio::main]
async fn main() -> Result<()> {
    // CRITICAL: all logging to stderr (stdout = JSON-RPC channel)
    tracing_subscriber::fmt().with_writer(std::io::stderr).init();

    let cli = Cli::parse();
    let config = Config::load()?;
    let store = Store::open(&Config::data_dir())?;
    let embedder = Embedder::new(&config.search.embedding_model).ok();

    let server = BrainOSServer {
        store: Arc::new(store),
        config: Arc::new(config),
        embedder: embedder.map(Arc::new),
        allow_write: cli.allow_write,
    };

    // stdio transport — this is what Claude/Cursor spawns
    server.serve(stdio()).await?;
    Ok(())
}
```

### Client Configuration

After building, users add to their AI tool config:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "brainos": {
      "command": "/Applications/BrainOS.app/Contents/MacOS/brainos-mcp",
      "args": ["--allow-write"],
      "env": {}
    }
  }
}
```

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "brainos": {
      "command": "/Applications/BrainOS.app/Contents/MacOS/brainos-mcp",
      "args": []
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "brainos": {
      "command": "/Applications/BrainOS.app/Contents/MacOS/brainos-mcp"
    }
  }
}
```

### Auto-Registration from Tauri App

The Tauri app can auto-write the MCP config on first launch:

```rust
fn register_mcp_server() -> Result<()> {
    let mcp_binary = std::env::current_exe()?
        .parent().unwrap()
        .join("brainos-mcp");

    // Claude Desktop
    let claude_config_path = dirs::home_dir().unwrap()
        .join("Library/Application Support/Claude/claude_desktop_config.json");
    if claude_config_path.parent().unwrap().exists() {
        // Read existing config, merge brainos server entry, write back
    }

    // Claude Code
    let claude_code_path = dirs::home_dir().unwrap()
        .join(".claude/settings.json");
    // ... same pattern
}
```

### Concurrency: Tauri App + MCP Server Sharing SQLite

SQLite WAL mode supports:
- Multiple concurrent readers (Tauri app reading + MCP server reading = fine)
- Only one writer at a time (writes from either side will block briefly)
- `busy_timeout` should be set (e.g. 5000ms) on both connections

```rust
// In Store::open, add:
conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
```

### Implementation Order

| Step | What | Files Changed | Est. Effort |
|------|------|---------------|-------------|
| 1 | Add `rmcp` dependency | `brainos-mcp/Cargo.toml` | 10 min |
| 2 | Make `Store` thread-safe (`Arc<Mutex<Store>>` or `Arc<Store>` with WAL) | `store/db.rs` | 1 hr |
| 3 | Implement 5 read-only tools | `brainos-mcp/src/main.rs` | 3 hr |
| 4 | Format output for LLM consumption | `brainos-mcp/src/format.rs` | 1 hr |
| 5 | Add `busy_timeout` pragma | `store/db.rs` | 10 min |
| 6 | Build + test with Claude Code | — | 1 hr |
| 7 | Auto-registration from Tauri app | `main.rs` or setup command | 1 hr |
| 8 | Add write tools (Phase 2) | `brainos-mcp/src/main.rs` | 1 hr |
| 9 | Settings UI: "Connect to AI tools" section | `SettingsView.tsx` | 1 hr |
| **Total** | | | **~9 hours** |

---

## Combined Rollout Plan

### Phase 1: Multi-Root (Week 1)
Solves the immediate cross-workspace problem. After this, BrainOS chat can access code from any registered workspace.

### Phase 2: MCP Server (Week 2)
Turns BrainOS into infrastructure. Claude Code and Cursor can query your entire knowledge base. This is the "Company Brain" primitive.

### Phase 3: Connector Framework (Future)
Add non-file sources: Slack, Jira, browser history, AI conversation sync. Each connector implements a common trait:

```rust
#[async_trait]
pub trait Connector: Send + Sync {
    fn name(&self) -> &str;
    fn kind(&self) -> ConnectorKind;  // File, API, Stream
    async fn sync(&self, store: &Store, since: Option<DateTime>) -> Result<u32>;
    fn config_schema(&self) -> serde_json::Value;
}
```

This is where BrainOS becomes the Cognition OS — but Phases 1 and 2 deliver value immediately.

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One watcher vs per-root | One `RecommendedWatcher`, multiple `watch()` calls | Lower resource usage, simpler lifecycle, what VS Code does |
| Schema for multi-root | `roots` table + `root_id` FK on captures | Clean separation, easy per-root queries, cascade delete |
| MCP transport | stdio (JSON-RPC 2.0) | Universal — works with Claude Desktop, Claude Code, Cursor |
| MCP ↔ Tauri data sharing | Direct SQLite (shared DB, WAL mode) | No daemon needed, MCP works even when Tauri app is closed |
| Code file chunking | tree-sitter for function boundaries, fallback to 2KB paragraphs | Preserves semantic units, keeps chunks useful for RAG |
| MCP SDK | `rmcp` (official Rust SDK, 4.7M downloads) | Maintained by MCP org, proc-macro for tool definitions |
| Exclude patterns | `.gitignore` parsing via `ignore` crate + custom patterns | Respects existing project conventions, avoids indexing junk |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Linux inotify limit exhausted | Use `ignore` crate for .gitignore, hard-cap watched dirs, fall back to PollWatcher |
| Large repos slow to index | Background thread, progress events to UI, incremental (hash-based skip) |
| SQLite write contention (Tauri + MCP) | WAL mode + `busy_timeout(5000)`, reads never block |
| MCP binary not found by clients | Auto-register config, provide manual setup instructions in Settings UI |
| Code files too large for embeddings | Chunk at function boundaries (tree-sitter), cap at 50KB per file |
