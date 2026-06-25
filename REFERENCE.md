# BrainOS — Complete Reference

A personal knowledge base that captures decisions, bugs, learnings, and discoveries across coding sessions. Built as a Tauri v2 desktop app with a Rust backend, SQLite + FTS5 search, and MCP integration for Claude Code and Cowork.

---

## Architecture Overview

```
brainos-core        — shared library: models, store (SQLite), parser, indexer, files, config
brainos-mcp         — MCP server binary (JSON-RPC over stdio), exposes tools to Claude Code / Cowork
brainos-cli         — CLI binary for setup, maintenance, and manual operations
brainos (Tauri app) — desktop UI (React + TypeScript frontend, Rust backend)
```

**Data flow:**

```
Markdown files (~/knowledge-base/captures/)
       ↕  parse / write
SQLite DB (~Library/Application Support/brainos/brainos.db)
       ↕  query
brainos-mcp (stdio JSON-RPC)  ←→  Claude Code / Cowork
brainos-cli (terminal)
brainos (Tauri desktop app)
```

---

## 1. CLI Commands (`brainos`)

The CLI binary. Install location: `target/release/brainos-cli` (renamed to `brainos` on PATH).

Global flag: `--kb <path>` — override the knowledge base root directory.

### `brainos init`

Sets up BrainOS from scratch. Run once.

| Flag | Default | What it does |
|------|---------|-------------|
| `--path <path>` | `~/knowledge-base` | KB root directory |
| `--read-only` | false | Register MCP server without write tools |
| `--no-claude` | false | Skip Claude Code registration |
| `--no-cursor` | false | Skip Cursor registration |

What `init` does step by step:

1. Creates KB directory with spaces: `captures/`, `projects/`, `learning/`, `daily/`, `reference/`
2. Creates config file at `~/Library/Application Support/brainos/config.toml`
3. Initializes SQLite database at `~/Library/Application Support/brainos/brainos.db`
4. Locates the `brainos-mcp` binary (sibling to `brainos-cli`, or on PATH)
5. Installs the `/capture` slash command to `~/.claude/commands/capture.md`
6. Registers MCP server in Claude Code (`~/.claude/settings.json` → `mcpServers.brainos`)
7. Registers MCP server in Cursor (`.cursor/mcp.json`)

After init, Claude Code and Cursor can use all `brainos_*` tools automatically.

### `brainos stats`

Prints KB statistics: total captures, this month's count, date range, breakdown by space, type, project (top 15), and top 10 tags.

### `brainos reindex`

Rebuilds the SQLite search index from scratch by re-parsing all markdown files.

### `brainos lint`

Runs quality checks on all captures. Flags:

- Titles too short (< 10 chars) or generic ("bug fix", "learning", "update")
- Missing tags, summary, or project
- Orphaned files on disk not in DB
- DB entries with missing files on disk
- Duplicate titles

### `brainos sync`

Syncs KB to GitHub via git (add → commit → push).

| Flag | What it does |
|------|-------------|
| `--dry-run` | Show what would be committed |
| `--status` | Show pending changes only |

---

## 2. MCP Server (`brainos-mcp`)

A JSON-RPC stdio server implementing the Model Context Protocol. Claude Code and Cowork spawn it as a subprocess and communicate over stdin/stdout.

### Startup Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--kb <path>` | From config or `~/knowledge-base` | Knowledge base root |
| `--data-dir <path>` | `~/Library/Application Support/brainos` | SQLite database location |
| `--allow-write` | false | Enable write tools (capture, append, update, link) |

### Registration

In `~/.claude/settings.json`:

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

For read-only access, omit `--allow-write`.

### Read Tools (always available)

**`brainos_search`** — Hybrid keyword + semantic search with ranked results.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Natural language search query |
| `limit` | integer | no (10) | Max results, 1–50 |
| `project` | string | no | Filter to a project |
| `tags` | string[] | no | Filter by tags |
| `space` | enum | no | "work", "personal", "wiki" |
| `since` | string | no | ISO date — only captures after this |

Returns: `[{ id, title, summary, score, snippet, tags, projects, date, capture_type, space }]`

**`brainos_get`** — Full capture by ID, including body text, chain info, git info, links, color, icon.

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |

**`brainos_list`** — Lightweight overviews (no body text) with filters.

| Param | Type | Default |
|-------|------|---------|
| `project` | string | — |
| `space` | enum | — |
| `type` | string | — |
| `tags` | string[] | — |
| `since` / `until` | string | — |
| `limit` | integer | 20 |
| `offset` | integer | 0 |

**`brainos_recent`** — Most recent captures for context loading.

| Param | Type | Default |
|-------|------|---------|
| `project` | string | — |
| `days` | integer | 7 (max 90) |
| `limit` | integer | 10 |

**`brainos_projects`** — All projects with capture counts and latest date. No params.

**`brainos_stats`** — KB-wide statistics: total, by space/type/project, top tags, this month count. No params.

### Write Tools (require `--allow-write`)

**`brainos_capture`** — Create a new capture.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Specific, searchable title |
| `body` | string | yes | Full markdown body |
| `type` | string | no ("learning") | decision, debug, feature, learning, discovery, error, meeting, review, bug-fix, investigation, architecture-decision |
| `space` | enum | no ("work") | work, personal, wiki |
| `summary` | string | no | One-line summary |
| `tags` | string[] | no | Lowercase, hyphenated |
| `project` | string | no | Project name |
| `project_path` | string | no | Filesystem path to project root |
| `mode` | enum | no ("session") | session, range, post-hoc |
| `session_ref` | string | no | Session ID or transcript path |
| `chain_prev` | string | no | ID of previous capture in chain |

Auto-chains: if `chain_prev` is not provided but `project` is set, automatically links to the latest capture in that project.

**`brainos_check_duplicate`** — Similarity check. Always call before creating.

| Param | Type | Required |
|-------|------|----------|
| `title` | string | yes |
| `body` | string | no |

Returns: `{ is_duplicate: bool (threshold 0.8), similar: [{ id, title, score }] }`

**`brainos_append`** — Append a `##` section to an existing capture.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Capture ID |
| `section` | string | yes | Markdown to append (e.g., `## Follow-up\nNew findings...`) |

**`brainos_update`** — Update metadata without changing body.

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `status` | enum | no | active, archived, resolved |
| `summary` | string | no |
| `add_tags` | string[] | no |
| `remove_tags` | string[] | no |

**`brainos_link`** — Bidirectional link between two captures.

| Param | Type | Required |
|-------|------|----------|
| `id1` | string | yes |
| `id2` | string | yes |

---

## 3. Claude Code Slash Command (`/capture`)

Installed at `~/.claude/commands/capture.md` by `brainos init`. A unified entry point that routes to different workflows based on the first argument.

### Usage

| Command | What it does |
|---------|-------------|
| `/capture begin [topic]` | Start a range capture — tracks everything from this point |
| `/capture end` | End active range, compose and save a distilled capture |
| `/capture last N` | Capture the last N conversation turns |
| `/capture this` | Capture the agent's most recent response |
| `/capture session` | Scan entire session, propose grouping, create captures |
| `/capture search [query]` | Quick search — top 5 results |
| `/capture status` | Show active range captures |
| `/capture add [id] [content]` | Append to existing capture |
| `/capture update [id] [fields]` | Update metadata (status, tags, summary) |
| `/capture link [id1] [id2]` | Link two captures |
| `/capture` (no args) | Suggest what to do |
| `/capture [free text]` | Ad-hoc capture from description |

---

## 4. Cowork Skill Commands

The Cowork skill (`skills/brainos/SKILL.md`) provides the same functionality through a different interface. Cowork uses the MCP tools underneath.

### Slash Commands in Cowork

| Command | What it does |
|---------|-------------|
| `/capture-begin [topic]` | Start a range capture |
| `/capture-end` | End range capture, compose and save |
| `/capture-last N` | Capture last N turns |
| `/capture-this` | Capture the most recent response |
| `/capture-session` | Scan session, group, and create |
| `/capture-search [query]` | Quick search |
| `/capture-status` | Show active ranges |
| `/capture-add [id]` | Append to existing capture |
| `/capture-update [id]` | Update metadata |
| `/capture-link [id1] [id2]` | Link two captures |

---

## 5. How Captures Are Created

### File Format

Each capture is a markdown file at `~/knowledge-base/captures/YYYY-MM-DD-NNN_slug.md`:

```yaml
---
id: "2026-06-25-001"
title: "SQLite WAL mode for concurrent Tauri + MCP access"
space: work
type: decision
status: active
date: "2026-06-25T15:30:00+05:30"
summary: "Chose WAL mode to allow concurrent reads from Tauri UI and MCP server"
tags: [sqlite, concurrency, wal]
projects: [brainos]
related: []
files: []
capture_mode: session
updated: "2026-06-25"
session_ref: ""
color: null
icon: null
chain:
  prev: "2026-06-24-003"
  refs: []
---

## Context
...

## Decision
...
```

### Creation Flow (end to end)

1. Claude Code/Cowork decides to create a capture (user command or suggestion)
2. Calls `brainos_check_duplicate` with proposed title → checks FTS5 for similar content
3. If not duplicate, calls `brainos_capture` with title, body, type, tags, project, mode
4. `brainos-mcp` receives the JSON-RPC call → delegates to `brainos-core::files::create_file()`
5. `create_file()`:
   - Generates ID: `YYYY-MM-DD-NNN` (NNN = auto-incremented sequence for today)
   - Creates slug from title (lowercase, alphanumeric + hyphens, max 60 chars)
   - Auto-chains to latest capture in same project (if `chain_prev` not explicit)
   - Writes YAML frontmatter + body to `captures/YYYY-MM-DD-NNN_slug.md`
   - Parses the file back into a `Capture` struct
   - Upserts into SQLite (full-text index + metadata columns)
6. Returns the created capture to the caller

### Capture Modes

| Mode | When used | Meaning |
|------|-----------|---------|
| `session` | Default / auto-capture | Captured during an active coding session |
| `range` | `/capture begin` → `/capture end`, `/capture last N`, `/capture this` | Captured from a bounded section of conversation |
| `post-hoc` | `/capture session`, manual "remember this" | Retrospectively distilled from session content |

### Capture Types

`decision`, `debug`, `feature`, `learning`, `discovery`, `error`, `meeting`, `review`, `bug-fix`, `investigation`, `architecture-decision`

### Capture Status Lifecycle

```
active → resolved → archived
```

- **active**: Default. Searchable, visible in browse.
- **resolved**: Issue fixed / decision finalized. Still searchable but signals completion.
- **archived**: Manually archived. Excluded from search and browse by default.

---

## 6. How Context Is Retrieved (Search)

When Claude Code or Cowork needs to recall past knowledge, it uses two mechanisms:

### Session Start — Auto-Context

When a session starts with an identifiable project:

1. Calls `brainos_recent` with `project` name and `days: 7`
2. If captures exist, briefly mentions titles (doesn't dump content)
3. Offers to pull up specific captures for context
4. Silently skips if nothing found

### Answering Questions About Past Work

When the user asks "what did we decide about X?" or "have we seen this error before?":

1. Calls `brainos_search` with the question as the query
2. Search uses SQLite FTS5 (BM25 keyword scoring) + optional vector similarity
3. Results are ranked by Reciprocal Rank Fusion (RRF) with temporal decay (90-day half-life)
4. If results score > 0.3, cites the captures with attribution
5. Calls `brainos_get` for full body text of relevant captures
6. If nothing found, says so and proceeds normally

### Before Re-investigating

If the user hits an error or architectural question, the skill is configured to search first — the answer may already be captured from a previous session.

### Search Internals

The search pipeline in `brainos-core`:

1. **FTS5 prefix query**: Each term gets a `*` suffix for prefix matching. FTS5 uses implicit AND — all terms must match.
2. **BM25 scoring**: SQLite's built-in ranking for term frequency / inverse document frequency.
3. **Temporal decay**: Recent captures score higher. Configurable half-life (default 90 days).
4. **RRF fusion**: Combines FTS5 rank + vector similarity rank (when embeddings available) using `1/(k + rank)` with k=30.
5. **Snippet extraction**: Returns context around matching terms for preview.

---

## 7. Consolidation Rules

When capturing multiple items from a session, BrainOS follows these rules:

| Scenario | Action |
|---|---|
| Bug fix + debugging gotchas | ONE capture — gotchas as sections within the fix |
| Two unrelated learnings | TWO captures — separate topics, separate files |
| Architecture decision + trade-offs | ONE capture — trade-offs belong with the decision |
| Long debug session with dead ends | ONE capture — dead ends are context for the fix |
| Two features in one session | TWO captures — one per feature |

Core principle: **one logical unit of work = one file.**

---

## 8. Body Template

```markdown
## Context
What was happening. Project, task, trigger.

## Problem / Decision
The issue or choice made.

## Rationale
Why this approach. Alternatives considered. Trade-offs accepted.

## Outcome
What happened. Result. Follow-up needed.

## Key Details
- Specific code, commands, config, or steps worth remembering
- Error messages or stack traces if relevant
```

Not every section is needed. A quick learning might be Context + Key Details. A decision needs Rationale.

---

## 9. Quality Rules

- **Titles**: Specific and searchable. Bad: "Bug fix". Good: "WhatsApp broadcast status NPE — source category from webhook not DB lookup"
- **Tags**: Lowercase, hyphenated, 2–5 per capture. Reuse existing tags from `brainos_stats`.
- **Project**: Always set when in project context.
- **Don't over-capture**: Capture decisions, non-obvious solutions, debugging insights. Skip routine changes.
- **Link related captures**: Use `brainos_link` between related captures. Reference with `[[capture-id]]` in body text.
- **Duplicate check**: Always run `brainos_check_duplicate` before creating. If duplicate, offer to append instead.

---

## 10. Config File

Location: `~/Library/Application Support/brainos/config.toml`

```toml
[general]
kb_root = "~/knowledge-base"
display_name = ""
auto_index = true

[sync]
enabled = false
remote_url = ""
auth_method = "ssh"
schedule = "0 8,22 * * *"
auto_pull_on_launch = true

[search]
embedding_model = "BAAI/bge-small-en-v1.5"
rrf_k = 30
default_limit = 20
temporal_half_life_days = 90

[ui]
theme = "system"
sidebar_width = 280
compact_mode = false
```

---

## 11. Project Structure

```
brainos/
├── crates/
│   ├── brainos-core/          # Shared library
│   │   └── src/
│   │       ├── config.rs      # Config, data_dir, kb_root
│   │       ├── files.rs       # create, append, update_metadata, link, delete
│   │       ├── models.rs      # Capture, CaptureStatus, Space, SearchResult, etc.
│   │       ├── store/         # SQLite Store, queries (FTS5 + vector)
│   │       └── indexing/      # parser.rs (markdown → Capture), indexer.rs
│   ├── brainos-mcp/           # MCP server binary
│   │   ├── src/
│   │   │   ├── main.rs        # CLI flags, JSON-RPC stdio loop
│   │   │   ├── protocol.rs    # JSON-RPC types
│   │   │   └── tools.rs       # 11 MCP tools (6 read + 5 write)
│   │   └── tests/
│   │       └── integration.rs # 14 integration tests
│   └── brainos-cli/           # CLI binary
│       └── src/main.rs        # init, stats, reindex, lint, sync
├── skills/
│   └── brainos/
│       └── SKILL.md           # Cowork skill definition
├── commands/
│   └── capture.md             # Claude Code /capture slash command
├── src/                       # Tauri frontend (React + TypeScript)
└── src-tauri/                 # Tauri backend (Rust)
```
