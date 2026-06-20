# BrainOS

> Open-source development knowledge base with search, knowledge graph, AI chat, GitHub backup, and MCP integration.

**BrainOS** captures what you learn while coding — patterns, gotchas, architecture decisions, bug fixes — and makes it searchable, connected, and queryable by AI.

## Features

- **Hybrid Search** — BM25 keyword + vector semantic search with Reciprocal Rank Fusion
- **Knowledge Graph** — Visual connections between captures via shared tags, projects, and references
- **AI Chat (RAG)** — Ask questions answered from your actual captured knowledge, with citations
- **GitHub Backup** — Automatic morning/night sync + manual push, version history for free
- **MCP Server** — Expose your KB to Claude Code, Cursor, Windsurf, or any MCP client
- **Local-First** — All data on your machine, embeddings computed locally via ONNX
- **Open Source** — MIT licensed, designed for every developer

## Quick Start

```bash
# Install from source
git clone https://github.com/CyberAakash/brainos.git
cd brainos
npm install
cargo tauri dev
```

## Architecture

Built with Tauri v2 (Rust backend + React frontend):

- **Store**: SQLite with FTS5 + sqlite-vec (single file, zero config)
- **Indexing**: File watcher → YAML parser → FTS5 + vector embeddings
- **Search**: Hybrid BM25 + vector with RRF fusion
- **Chat**: Claude CLI subprocess (works with Max/Pro plan, no API key)
- **Sync**: Git-based backup to GitHub (auto-scheduled + manual)
- **MCP**: Standalone `brainos-mcp` binary for AI tool integration

See [docs/architecture.md](docs/architecture.md) for the full system design.

## License

MIT
