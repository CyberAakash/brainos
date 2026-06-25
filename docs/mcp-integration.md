# BrainOS MCP Server + Cowork Skill — Design Doc

> **Status:** Draft  
> **Date:** 2026-06-25  
> **Crate:** `brainos-mcp`  
> **Depends on:** `brainos-core`

---

## 1. Goal

Let any MCP-compatible AI tool (Claude Code, Cowork, Cursor, Copilot) **read from and write to** the BrainOS knowledge base. Two deliverables:

1. **MCP Server** — a standalone stdio binary (`brainos-mcp`) that exposes BrainOS data via JSON-RPC tools.
2. **Cowork Skill** — a `SKILL.md` file that teaches Claude *when* and *how* to call those tools, turning BrainOS into persistent cross-session memory.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────┐
│  AI Client (Claude Code / Cowork / Cursor)       │
│                                                  │
│  stdio ←──JSON-RPC──→  brainos-mcp binary        │
│                           │                      │
│                     ┌─────┴─────┐                │
│                     │brainos-core│                │
│                     └─────┬─────┘                │
│                           │                      │
│              ┌────────────┼────────────┐         │
│              │            │            │         │
│          SQLite+FTS5   Vector KNN   ~/knowledge- │
│          (captures,    (embeddings)   base/*.md   │
│           entities)                              │
└──────────────────────────────────────────────────┘
```

### Why a standalone binary (not embedded in Tauri)?

- Claude Code runs headless in a terminal — it can't call Tauri IPC.
- MCP spec uses **stdio** transport: the client spawns the server as a child process.
- The binary reuses `brainos-core` directly (same Store, same search, same models).
- Tauri desktop app and MCP server can run concurrently — SQLite WAL mode allows multiple readers.

### Configuration

The MCP server discovers the KB the same way the desktop app does:

```
brainos-mcp [--kb <path>] [--allow-write]
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--kb <path>` | `Config::load().kb_root` → `~/knowledge-base` | Override KB location |
| `--allow-write` | `false` | Enable create/update tools (read-only by default) |

---

## 3. MCP Tools

### 3.1 Read Tools (always available)

#### `brainos_search`

Hybrid search (BM25 + vector + entity) across all captures.

```jsonc
{
  "name": "brainos_search",
  "description": "Search the knowledge base using hybrid keyword + semantic search. Returns ranked results with snippets.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":   { "type": "string", "description": "Natural language search query" },
      "limit":   { "type": "integer", "default": 10, "description": "Max results (1-50)" },
      "project": { "type": "string", "description": "Filter to a specific project" },
      "tags":    { "type": "array", "items": { "type": "string" }, "description": "Filter by tags" },
      "space":   { "type": "string", "enum": ["work", "personal", "wiki"], "description": "Filter by space" },
      "since":   { "type": "string", "description": "ISO date — only captures after this date" }
    },
    "required": ["query"]
  }
}
```

**Returns:** Array of `{ id, title, summary, score, snippet, tags, projects, date, capture_type }`.

**Implementation:** Calls `search_hybrid()` from `brainos-core`, applies CaptureFilters from optional params, returns SearchResult objects serialized to JSON.

---

#### `brainos_get`

Get the full content of a specific capture by ID.

```jsonc
{
  "name": "brainos_get",
  "description": "Get the full content of a capture by ID. Returns all metadata and the complete body text.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Capture ID (e.g. '20260625-143052-auth-flow')" }
    },
    "required": ["id"]
  }
}
```

**Returns:** Full Capture object: `{ id, title, summary, space, capture_type, status, date, tags, projects, body_text, chain, related, git_info, project_info, links, files, capture_mode, session_ref }`.

**Implementation:** Calls `store.get_capture(id)`. Returns 404-style error if not found.

---

#### `brainos_list`

Browse/filter captures without a search query.

```jsonc
{
  "name": "brainos_list",
  "description": "List captures with optional filters. Returns lightweight overviews (no body text).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "project":  { "type": "string" },
      "space":    { "type": "string", "enum": ["work", "personal", "wiki"] },
      "type":     { "type": "string", "description": "Capture type: decision, debug, feature, learning, etc." },
      "tags":     { "type": "array", "items": { "type": "string" } },
      "since":    { "type": "string", "description": "ISO date" },
      "until":    { "type": "string", "description": "ISO date" },
      "limit":    { "type": "integer", "default": 20 },
      "offset":   { "type": "integer", "default": 0 }
    }
  }
}
```

**Returns:** Array of CaptureOverview: `{ id, title, summary, space, capture_type, status, date, tags, projects }`.

**Implementation:** Calls `store.list_captures(&filters, limit, offset)`.

---

#### `brainos_recent`

Get the most recent captures, optionally scoped to a project. Designed for "what did I work on recently?" queries.

```jsonc
{
  "name": "brainos_recent",
  "description": "Get the most recent captures, optionally filtered by project. Useful for context recall at the start of a session.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "project": { "type": "string", "description": "Scope to a specific project" },
      "days":    { "type": "integer", "default": 7, "description": "Look back N days (1-90)" },
      "limit":   { "type": "integer", "default": 10 }
    }
  }
}
```

**Returns:** Same as `brainos_list`, sorted by date descending.

**Implementation:** Builds CaptureFilters with `since = today - days`, calls `store.list_captures()`.

---

#### `brainos_projects`

List all projects in the KB with capture counts.

```jsonc
{
  "name": "brainos_projects",
  "description": "List all projects in the knowledge base with their capture counts.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

**Returns:** Array of `{ name, capture_count, latest_date }`.

**Implementation:** Query distinct `projects` from captures table, count per project, max date.

---

#### `brainos_stats`

KB-wide statistics.

```jsonc
{
  "name": "brainos_stats",
  "description": "Get knowledge base statistics: total captures, breakdown by space/type/project, top tags.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

**Returns:** KBStats object.

**Implementation:** Already exists as a query pattern in the desktop app.

---

### 3.2 Write Tools (require `--allow-write`)

#### `brainos_capture`

Create a new capture. This is the primary write operation — AI tools use it to persist knowledge after a session.

```jsonc
{
  "name": "brainos_capture",
  "description": "Create a new capture in the knowledge base. Writes a markdown file and indexes it.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title":        { "type": "string", "description": "Capture title" },
      "type":         { "type": "string", "default": "learning", "description": "Capture type: decision, debug, feature, learning, discovery, error, meeting, review" },
      "space":        { "type": "string", "default": "work", "enum": ["work", "personal", "wiki"] },
      "summary":      { "type": "string", "description": "One-line summary" },
      "body":         { "type": "string", "description": "Full markdown body content" },
      "tags":         { "type": "array", "items": { "type": "string" }, "default": [] },
      "project":      { "type": "string", "description": "Project name to associate with" },
      "project_path": { "type": "string", "description": "Filesystem path to the project root" },
      "mode":         { "type": "string", "enum": ["session", "range", "post-hoc"], "default": "session" },
      "session_ref":  { "type": "string", "description": "Session ID or transcript path for traceability" },
      "chain_prev":   { "type": "string", "description": "ID of previous capture in chain" }
    },
    "required": ["title", "body"]
  }
}
```

**Returns:** `{ id, file_path }` of the created capture.

**Implementation:** Calls `files::create_file()` then `store.upsert_capture()`. Auto-detects `chain_prev` from `latest_capture_in_project()` if not provided.

---

#### `brainos_check_duplicate`

Check if a capture with similar content already exists before creating one.

```jsonc
{
  "name": "brainos_check_duplicate",
  "description": "Check if a similar capture already exists. Use before creating a new capture to avoid duplicates.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "body":  { "type": "string", "description": "First ~200 chars of body is sufficient" }
    },
    "required": ["title"]
  }
}
```

**Returns:** `{ is_duplicate: bool, similar: [{ id, title, score }] }`.

**Implementation:** Runs `search_hybrid()` with the title as query, checks if any result exceeds a similarity threshold (score > 0.8). Returns the top 3 similar captures.

---

## 4. JSON-RPC Protocol

Standard MCP stdio transport. The server reads newline-delimited JSON-RPC from stdin, writes responses to stdout. Stderr is used for logging.

```
Client → Server:  {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
Server → Client:  {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}

Client → Server:  {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brainos_search","arguments":{"query":"auth flow decisions"}}}
Server → Client:  {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"[...]"}]}}
```

### MCP Lifecycle

1. Client sends `initialize` → server responds with capabilities + tool list.
2. Client sends `tools/list` → server returns all available tools (filtered by `--allow-write`).
3. Client sends `tools/call` → server executes, returns result.
4. Repeat until client disconnects.

### Error Handling

- Tool not found → standard MCP error code.
- Invalid arguments → return error with descriptive message.
- Capture not found → return `{ "content": [{ "type": "text", "text": "Capture not found: {id}" }], "isError": true }`.
- DB errors → return MCP internal error with message (no stack traces).

---

## 5. Cowork Skill

The skill is a `SKILL.md` file that gets installed alongside the MCP server config. It teaches Claude when and how to use BrainOS tools.

### 5.1 Skill Behavior

**On session start (auto-trigger):**
1. If a project is detected (from cwd or user context), call `brainos_recent` scoped to that project.
2. Surface the last 5 captures as context: "Here's what was captured recently for {project}…"
3. This gives Claude continuity across sessions without the user asking.

**During a session (on-demand):**
- When the user asks "what did we decide about X?" → `brainos_search` with the question.
- When the user references a past session → `brainos_search` or `brainos_get`.
- When the user says "remember this" or "capture this" → `brainos_capture`.

**On session end (suggested):**
- If meaningful decisions, learnings, or discoveries were made, suggest creating a capture.
- Draft the capture content from the conversation context.
- Ask user to confirm before writing.

### 5.2 SKILL.md Structure

```
skills/
└── brainos/
    └── SKILL.md
```

The SKILL.md will contain:

```markdown
# BrainOS Knowledge Base

## When to use
- Start of any coding session: pull recent context for the current project
- When the user asks about past decisions, patterns, bugs, or learnings
- When the user says "remember", "capture", "save this", "log this"
- When you encounter a decision worth preserving
- When debugging something that was debugged before

## MCP Tools Available
- `brainos_search` — hybrid search across all captures
- `brainos_get` — get full capture by ID
- `brainos_list` — browse/filter captures
- `brainos_recent` — recent captures (session start context)
- `brainos_projects` — list all projects
- `brainos_capture` — create a new capture (write mode only)
- `brainos_check_duplicate` — check before creating

## How to use

### Session Start
1. Detect the current project from cwd or user context
2. Call `brainos_recent` with project name and days=7
3. If results exist, briefly summarize: "I found N recent captures for {project}..."
4. Don't dump full content — mention titles and offer to expand

### Answering Questions
When asked about past work, decisions, or patterns:
1. Call `brainos_search` with the question as query
2. If results are relevant (score > 0.3), cite them with IDs
3. If a specific capture is needed, use `brainos_get` for full content
4. Always attribute: "According to capture {id} from {date}..."

### Creating Captures
When asked to remember something or when a session produced valuable knowledge:
1. Call `brainos_check_duplicate` first
2. If not duplicate, draft the capture with:
   - Clear title (imperative or descriptive)
   - Type: decision | debug | feature | learning | discovery | error
   - Tags: extract from context
   - Body: structured markdown with context, rationale, outcome
3. Call `brainos_capture` to create
4. Confirm to user: "Captured as {id}"

### Capture Quality Guidelines
A good capture has:
- **Title**: Specific and searchable ("Fix auth token refresh race condition", not "Bug fix")
- **Summary**: One sentence that answers "what and why"
- **Body**: Context → Problem/Decision → Rationale → Outcome/Next steps
- **Tags**: 2-5 relevant tags
- **Project**: Always set if working in a project context
```

### 5.3 MCP Server Registration

For Claude Code (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "brainos": {
      "command": "brainos-mcp",
      "args": ["--allow-write"],
      "env": {}
    }
  }
}
```

For Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "brainos": {
      "command": "brainos-mcp",
      "args": ["--allow-write"]
    }
  }
}
```

---

## 6. Implementation Plan

### Phase 1: MCP Server Core (read-only)

**Crate:** `crates/brainos-mcp`

1. Add MCP protocol layer — JSON-RPC stdio loop with `initialize`, `tools/list`, `tools/call`.
2. Implement read tools: `brainos_search`, `brainos_get`, `brainos_list`, `brainos_recent`, `brainos_projects`, `brainos_stats`.
3. Wire up `brainos-core::Store` + optional `Embedder` for hybrid search.
4. Error handling and logging via `tracing`.

**Dependencies to add to Cargo.toml:**
- `serde_json` (already present)
- `tokio` (already present)
- `anyhow` (already present)
- No additional deps needed — MCP stdio is just line-delimited JSON-RPC over stdin/stdout.

**Key implementation details:**
- Parse CLI args (already skeleton in `main.rs`)
- `Config::load()` to find KB root
- `Store::open(db_path)` to connect to SQLite
- Optionally init `Embedder` for vector search
- Infinite loop: read line from stdin → parse JSON-RPC → dispatch to tool handler → write response to stdout

### Phase 2: Write Tools

1. Implement `brainos_capture` — calls `files::create_file()` + `store.upsert_capture()`.
2. Implement `brainos_check_duplicate` — runs search, returns similarity check.
3. Gate both behind `--allow-write` flag.
4. Auto-chain: if project is set and `chain_prev` is not, call `store.latest_capture_in_project()`.

### Phase 3: Cowork Skill

1. Write `SKILL.md` with trigger conditions, tool usage guide, and capture quality rules.
2. Package as installable skill for Cowork.
3. Test with Cowork session: verify auto-context on session start, search on demand, capture on request.

### Phase 4: Polish & Distribution

1. `brainos-cli init` — sets up MCP server registration in Claude Code / Cursor config files.
2. Homebrew / cargo install distribution.
3. README with setup instructions.
4. Integration tests: spawn `brainos-mcp` as subprocess, send JSON-RPC, verify responses.

---

## 7. Data Flow Examples

### Example 1: Session Start Context

```
User starts Claude Code in ~/projects/brainos
  → Skill detects project = "brainos"
  → Calls brainos_recent { project: "brainos", days: 7 }
  → Gets back 3 captures:
      - "Fix auth token refresh race condition" (2 days ago)
      - "Decision: Use RRF k=30 for small corpus" (4 days ago)
      - "Capture System v2 implementation complete" (today)
  → Claude says: "I see 3 recent captures for BrainOS. The latest is about
     the Capture System v2 being complete. Want me to pull up any of these
     for context?"
```

### Example 2: Searching Past Decisions

```
User: "Why did we choose SQLite over a vector DB?"
  → Skill calls brainos_search { query: "SQLite vs vector database decision" }
  → Gets SearchResult with score 0.87:
      capture: "Architecture Decision: SQLite + FTS5 Hybrid Search"
      snippet: "...chose SQLite for local-first, zero-config deployment.
                Vector DB adds operational complexity without proportional
                benefit at <10k captures..."
  → Claude cites the capture and summarizes the rationale
```

### Example 3: Creating a Capture

```
User: "We just decided to use stdio for the MCP transport. Capture this."
  → Skill calls brainos_check_duplicate { title: "MCP transport decision" }
  → No duplicates found
  → Skill calls brainos_capture {
      title: "Decision: Use stdio transport for MCP server",
      type: "decision",
      space: "work",
      tags: ["mcp", "architecture", "transport"],
      project: "brainos",
      body: "## Context\nBrainOS MCP server needs a transport...\n## Decision\nUse stdio...\n## Rationale\n- Claude Code spawns as child process...",
      mode: "session"
    }
  → Returns { id: "20260625-153022-mcp-stdio-decision", file_path: "..." }
  → Claude confirms: "Captured as 20260625-153022-mcp-stdio-decision"
```

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Unauthorized writes | `--allow-write` flag is opt-in. Default is read-only. |
| Data exfiltration | MCP server only reads local SQLite + files. No network calls. |
| Concurrent access | SQLite WAL mode supports multiple readers. Single writer at a time (MCP server or Tauri app). |
| Path traversal | `files::create_file()` already validates paths stay within `kb_root`. |
| Prompt injection via captures | Captures are user-authored knowledge. The skill treats them as data, not instructions. |

---

## 9. Future Extensions

- **`brainos_update`** — Edit an existing capture's metadata or body.
- **`brainos_relate`** — Add a cross-reference between two captures.
- **`brainos_entity_graph`** — Query the entity relationship graph.
- **Workspace file search** — Expose `search_workspace_files()` for code-aware context retrieval.
- **Streaming** — SSE transport for long-running searches (not needed for v1, stdio is fine).
- **Multi-KB** — Support switching between knowledge bases mid-session.

---

## 10. Open Questions

1. **Embedder initialization** — The MCP server is long-lived. Should it load the embedding model on startup (slow start, fast search) or lazily on first vector search (fast start, first-search latency)?
   - *Recommendation:* Lazy init. Most MCP calls won't need vector search — BM25 alone is good enough for targeted queries.

2. **Capture auto-suggestion** — Should the skill proactively suggest captures during a session, or only when asked?
   - *Recommendation:* Only suggest at session end. Mid-session suggestions are interruptive.

3. **Concurrent writes** — If both Tauri app and MCP server have `--allow-write`, SQLite's single-writer lock could cause contention.
   - *Recommendation:* Use busy_timeout (5 seconds). In practice, writes are rare and fast.
