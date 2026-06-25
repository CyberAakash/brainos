# BrainOS

> Open-source development knowledge base with hybrid search, knowledge graph, AI chat, GitHub backup, and MCP integration.

**BrainOS** captures what you learn while coding — patterns, gotchas, architecture decisions, bug fixes — and makes it searchable, connected, and queryable by AI. Everything stays local on your machine.

## Features

- **Hybrid Search** — BM25 keyword + vector semantic search with Reciprocal Rank Fusion
- **Knowledge Graph** — Visual connections between captures via shared tags, projects, and references
- **AI Chat (RAG)** — Ask questions answered from your captured knowledge, with citations
- **GitHub Backup** — Automatic morning/night sync + manual push, version history for free
- **MCP Server** — Expose your KB to Claude Code, Cursor, Windsurf, or any MCP client
- **Local-First** — SQLite + FTS5 + sqlite-vec, embeddings computed locally via ONNX (BAAI/bge-small-en-v1.5)
- **Open Source** — MIT licensed

## Quick Start

### Prerequisites

- **Rust** 1.75+ (with `cargo`)
- **Node.js** 18+ (with `npm`)
- **Tauri v2 prerequisites** — see [Tauri setup guide](https://v2.tauri.app/start/prerequisites/)

### Install and Run

```bash
git clone https://github.com/CyberAakash/brainos.git
cd brainos
npm install
cargo tauri dev
```

### Initialize the Knowledge Base

After building, initialize BrainOS and register the MCP server with your AI tools:

```bash
# Build the CLI and MCP server
cargo build -p brainos-cli -p brainos-mcp

# Run init (creates KB dirs, config, SQLite DB, registers MCP server)
./target/debug/brainos init
```

This will:
1. Create `~/knowledge-base/` with space directories (`projects/`, `learning/`, `daily/`, `reference/`)
2. Write config to `~/Library/Application Support/brainos/config.toml`
3. Initialize the SQLite database
4. Register `brainos-mcp` in Claude Code (`~/.claude/settings.json`)
5. Register `brainos-mcp` in Cursor (`.cursor/mcp.json`)

**Options:**

```bash
brainos init --path ~/my-kb          # Custom KB location
brainos init --read-only             # MCP server without write access
brainos init --no-claude             # Skip Claude Code registration
brainos init --no-cursor             # Skip Cursor registration
```

## Architecture

```
brainos/
├── crates/
│   ├── brainos-core/     # Shared library — Store, search, models, parser, files, config
│   ├── brainos-mcp/      # MCP server binary (stdio JSON-RPC)
│   └── brainos-cli/      # CLI binary (init, sync, reindex, lint, stats)
├── src-tauri/            # Tauri v2 backend — IPC commands, app state
├── src/                  # React frontend — browse, search, chat, graph views
├── skills/brainos/       # Cowork Skill (SKILL.md) for Claude desktop app
└── docs/                 # Design documents
```

**Storage:** Single SQLite database with FTS5 full-text search and sqlite-vec vector embeddings. WAL mode enables concurrent reads from the Tauri app and MCP server simultaneously.

**Search:** Hybrid search combines BM25 keyword matching, vector semantic similarity, and entity-based lookup using Reciprocal Rank Fusion (RRF) with temporal decay weighting.

**Captures:** Markdown files with YAML frontmatter stored in `~/knowledge-base/`. Each capture has a type (decision, bug-fix, learning, pattern, etc.), belongs to a space (work/personal/wiki), and can be linked to projects, tags, and other captures.

## MCP Integration

The MCP server (`brainos-mcp`) exposes your knowledge base to any MCP-compatible AI tool via stdio JSON-RPC.

### How It Works

```
Claude Code / Cursor / Windsurf
        │
        ├── spawns brainos-mcp as subprocess
        ├── sends JSON-RPC over stdin/stdout
        └── discovers and calls 11 tools
```

After `brainos init`, restart your AI tool. It will auto-discover the MCP server and its tools.

### Available Tools

| Tool | Description |
|------|-------------|
| `brainos_search` | Hybrid keyword + semantic search with filters (project, tags, space, date) |
| `brainos_get` | Full capture content by ID (all metadata + body text + file path) |
| `brainos_list` | Browse/filter captures with lightweight overviews |
| `brainos_recent` | Recent captures (last N days, optionally by project) |
| `brainos_projects` | List all projects with capture counts |
| `brainos_stats` | Knowledge base statistics (total captures, tags, date range) |
| `brainos_capture` | Create a new capture (write mode only) |
| `brainos_check_duplicate` | Similarity check before creating a capture |
| `brainos_append` | Append a section to an existing capture (write mode only) |
| `brainos_update` | Update metadata (status, summary, tags) on a capture (write mode only) |
| `brainos_link` | Link two captures as related — bidirectional (write mode only) |

### Manual MCP Server Usage

```bash
# Run with write access (default after brainos init)
brainos-mcp --allow-write

# Run read-only
brainos-mcp

# Test with a JSON-RPC request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | brainos-mcp
```

### `/capture` Slash Command (Claude Code)

After `brainos init`, type `/capture` in Claude Code to trigger knowledge capture workflows:

```
/capture begin investigating auth flow   # Start tracking a bounded range
/capture end                             # End range, draft and save
/capture session                         # Scan full session, propose grouped captures
/capture last 5                          # Capture last 5 turns
/capture this                            # Capture the previous response
/capture search token refresh            # Quick search the KB
/capture add 2026-06-25-001              # Append to existing capture
/capture update 2026-06-25-001 status: resolved
/capture link 2026-06-25-001 2026-06-25-002
```

The command file is installed to `~/.claude/commands/capture.md` during `brainos init`.

### Cowork Skill

BrainOS includes a Cowork Skill (`skills/brainos/SKILL.md`) that teaches the Claude desktop app when and how to use the MCP tools — auto-loading project context at session start, searching before re-investigating problems, and suggesting captures when valuable knowledge surfaces.

## CLI Reference

```bash
brainos init                # Initialize KB + register MCP server
brainos stats               # Show KB statistics (total, by type/space/project, top tags)
brainos reindex             # Rebuild search index from capture files
brainos lint                # Quality checks — short titles, missing tags, orphaned files
brainos sync                # Git add + commit + push the KB directory
brainos sync --status       # Show pending changes without committing
brainos sync --dry-run      # Show what would be committed
```

## Knowledge Base Structure

```
~/knowledge-base/
├── projects/         # Architecture decisions, design docs, implementation notes
├── learning/         # Patterns, gotchas, TIL entries
├── daily/            # Daily logs, session summaries
└── reference/        # API docs, config references, cheat sheets
```

Each capture is a markdown file with YAML frontmatter:

```yaml
---
id: 2024-0615-rust-lifetime-gotcha
title: "Rust lifetime gotcha with async closures"
type: bug-fix
space: work
tags: [rust, async, lifetimes]
project: brainos
date: 2024-06-15
status: active
---

## Context
While implementing the MCP server...

## Problem
The async closure captured a reference...

## Solution
Used `Arc<Store>` instead of `&Store`...
```

## Development

```bash
# Run the desktop app in dev mode
cargo tauri dev

# Build all Rust crates
cargo build --workspace

# Type-check the frontend
npx tsc --noEmit

# Build for release
cargo tauri build
```

## License

MIT
