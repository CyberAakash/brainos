//! MCP tool definitions and handlers.

use anyhow::Result;
use chrono::{Datelike, NaiveDate, Utc};
use serde_json::{json, Value};

use brainos_core::embedding::Embedder;
use brainos_core::models::*;
use brainos_core::search::hybrid::search_hybrid;
use brainos_core::Store;

use crate::protocol::{ToolCallResult, ToolDefinition};

// ── Tool registry ───────────────────────────────────────────

pub fn read_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "brainos_search".into(),
            description: "Search the knowledge base using hybrid keyword + semantic search. Returns ranked results with snippets.".into(),
            input_schema: json!({
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
            }),
        },
        ToolDefinition {
            name: "brainos_get".into(),
            description: "Get the full content of a capture by ID. Returns all metadata and the complete body text.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Capture ID" }
                },
                "required": ["id"]
            }),
        },
        ToolDefinition {
            name: "brainos_list".into(),
            description: "List captures with optional filters. Returns lightweight overviews (no body text).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project": { "type": "string" },
                    "space":   { "type": "string", "enum": ["work", "personal", "wiki"] },
                    "type":    { "type": "string", "description": "Capture type: decision, debug, feature, learning, etc." },
                    "tags":    { "type": "array", "items": { "type": "string" } },
                    "since":   { "type": "string", "description": "ISO date" },
                    "until":   { "type": "string", "description": "ISO date" },
                    "limit":   { "type": "integer", "default": 20 },
                    "offset":  { "type": "integer", "default": 0 }
                }
            }),
        },
        ToolDefinition {
            name: "brainos_recent".into(),
            description: "Get the most recent captures, optionally filtered by project. Useful for context recall at the start of a session.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project": { "type": "string", "description": "Scope to a specific project" },
                    "days":    { "type": "integer", "default": 7, "description": "Look back N days (1-90)" },
                    "limit":   { "type": "integer", "default": 10 }
                }
            }),
        },
        ToolDefinition {
            name: "brainos_projects".into(),
            description: "List all projects in the knowledge base with their capture counts.".into(),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
        ToolDefinition {
            name: "brainos_stats".into(),
            description: "Get knowledge base statistics: total captures, breakdown by space/type/project, top tags.".into(),
            input_schema: json!({ "type": "object", "properties": {} }),
        },
    ]
}

pub fn write_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "brainos_capture".into(),
            description: "Create a new capture in the knowledge base. Writes a markdown file and indexes it.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title":        { "type": "string", "description": "Capture title" },
                    "type":         { "type": "string", "default": "learning", "description": "Capture type: decision, debug, feature, learning, discovery, error, meeting, review" },
                    "space":        { "type": "string", "default": "work", "enum": ["work", "personal", "wiki"] },
                    "summary":      { "type": "string", "description": "One-line summary" },
                    "body":         { "type": "string", "description": "Full markdown body content" },
                    "tags":         { "type": "array", "items": { "type": "string" }, "default": [] },
                    "project":      { "type": "string", "description": "Project name" },
                    "project_path": { "type": "string", "description": "Filesystem path to the project root" },
                    "mode":         { "type": "string", "enum": ["session", "range", "post-hoc"], "default": "session" },
                    "session_ref":  { "type": "string", "description": "Session ID or transcript path" },
                    "chain_prev":   { "type": "string", "description": "ID of previous capture in chain" }
                },
                "required": ["title", "body"]
            }),
        },
        ToolDefinition {
            name: "brainos_check_duplicate".into(),
            description: "Check if a similar capture already exists. Use before creating a new capture to avoid duplicates.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "body":  { "type": "string", "description": "First ~200 chars of body is sufficient" }
                },
                "required": ["title"]
            }),
        },
        ToolDefinition {
            name: "brainos_append".into(),
            description: "Append a new ## section to an existing capture. Use for follow-ups, updates, or additional context.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "id":      { "type": "string", "description": "Capture ID to append to" },
                    "section": { "type": "string", "description": "Markdown content to append (e.g., '## Follow-up\\nNew findings...')" }
                },
                "required": ["id", "section"]
            }),
        },
        ToolDefinition {
            name: "brainos_update".into(),
            description: "Update metadata on an existing capture — status, summary, or tags. Does not change the body.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "id":          { "type": "string", "description": "Capture ID to update" },
                    "status":      { "type": "string", "enum": ["active", "archived", "resolved"], "description": "New status" },
                    "summary":     { "type": "string", "description": "New one-line summary" },
                    "add_tags":    { "type": "array", "items": { "type": "string" }, "description": "Tags to add" },
                    "remove_tags": { "type": "array", "items": { "type": "string" }, "description": "Tags to remove" }
                },
                "required": ["id"]
            }),
        },
        ToolDefinition {
            name: "brainos_link".into(),
            description: "Link two captures as related. Adds each ID to the other's related list (bidirectional).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "id1": { "type": "string", "description": "First capture ID" },
                    "id2": { "type": "string", "description": "Second capture ID" }
                },
                "required": ["id1", "id2"]
            }),
        },
    ]
}

// ── Tool dispatch ───────────────────────────────────────────

pub fn handle_tool(
    name: &str,
    args: &Value,
    store: &Store,
    embedder: Option<&Embedder>,
    kb_root: &std::path::Path,
    allow_write: bool,
    search_config: &brainos_core::config::SearchConfig,
) -> ToolCallResult {
    match name {
        // Read tools
        "brainos_search"  => handle_search(args, store, embedder, search_config),
        "brainos_get"     => handle_get(args, store),
        "brainos_list"    => handle_list(args, store),
        "brainos_recent"  => handle_recent(args, store),
        "brainos_projects" => handle_projects(store),
        "brainos_stats"   => handle_stats(store),
        // Write tools
        "brainos_capture" => {
            if !allow_write {
                return ToolCallResult::error("Write access disabled. Start the server with --allow-write to enable capture creation.");
            }
            handle_capture(args, store, kb_root)
        }
        "brainos_check_duplicate" => {
            handle_check_duplicate(args, store, embedder, search_config)
        }
        "brainos_append" => {
            if !allow_write {
                return ToolCallResult::error("Write access disabled. Start the server with --allow-write.");
            }
            handle_append(args, store, kb_root)
        }
        "brainos_update" => {
            if !allow_write {
                return ToolCallResult::error("Write access disabled. Start the server with --allow-write.");
            }
            handle_update(args, store, kb_root)
        }
        "brainos_link" => {
            if !allow_write {
                return ToolCallResult::error("Write access disabled. Start the server with --allow-write.");
            }
            handle_link(args, store, kb_root)
        }
        _ => ToolCallResult::error(format!("Unknown tool: {name}")),
    }
}

// ── Read tool handlers ──────────────────────────────────────

fn handle_search(
    args: &Value,
    store: &Store,
    embedder: Option<&Embedder>,
    search_config: &brainos_core::config::SearchConfig,
) -> ToolCallResult {
    let query = match args.get("query").and_then(|v| v.as_str()) {
        Some(q) => q,
        None => return ToolCallResult::error("Missing required parameter: query"),
    };
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10).min(50) as u32;

    let results = match search_hybrid(
        store,
        embedder,
        query,
        limit,
        Some(search_config.rrf_k),
        Some(search_config.temporal_half_life_days),
    ) {
        Ok(r) => r,
        Err(e) => return ToolCallResult::error(format!("Search failed: {e}")),
    };

    // Apply optional post-filters
    let project_filter = args.get("project").and_then(|v| v.as_str());
    let space_filter = args.get("space").and_then(|v| v.as_str());
    let tags_filter: Option<Vec<&str>> = args.get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str()).collect());
    let since_filter = args.get("since").and_then(|v| v.as_str())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let filtered: Vec<_> = results.into_iter().filter(|r| {
        if let Some(p) = project_filter {
            if !r.capture.projects.iter().any(|proj| proj.eq_ignore_ascii_case(p)) {
                return false;
            }
        }
        if let Some(s) = space_filter {
            if r.capture.space.to_string() != s {
                return false;
            }
        }
        if let Some(ref tags) = tags_filter {
            if !tags.iter().all(|t| r.capture.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t))) {
                return false;
            }
        }
        if let Some(since) = since_filter {
            if r.capture.date < since {
                return false;
            }
        }
        true
    }).collect();

    let output: Vec<Value> = filtered.iter().map(|r| {
        json!({
            "id": r.capture.id,
            "title": r.capture.title,
            "summary": r.capture.summary,
            "score": (r.score * 1000.0).round() / 1000.0,
            "snippet": r.snippet,
            "tags": r.capture.tags,
            "projects": r.capture.projects,
            "date": r.capture.date.to_string(),
            "capture_type": r.capture.capture_type,
            "space": r.capture.space.to_string(),
        })
    }).collect();

    ToolCallResult::text(serde_json::to_string_pretty(&output).unwrap_or_default())
}

fn handle_get(args: &Value, store: &Store) -> ToolCallResult {
    let id = match args.get("id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return ToolCallResult::error("Missing required parameter: id"),
    };

    match store.get_capture(id) {
        Ok(Some(c)) => {
            let out = json!({
                "id": c.id,
                "file_path": c.file_path,
                "title": c.title,
                "summary": c.summary,
                "space": c.space.to_string(),
                "capture_type": c.capture_type,
                "status": c.status.to_string(),
                "date": c.date.to_string(),
                "tags": c.tags,
                "projects": c.projects,
                "related": c.related,
                "files": c.files,
                "body_text": c.body_text,
                "chain": c.chain.as_ref().map(|ch| json!({
                    "prev": ch.prev,
                    "refs": ch.refs,
                })),
                "git_info": c.git_info.as_ref().map(|g| json!({
                    "repo": g.repo,
                    "branch": g.branch,
                    "remote": g.remote,
                    "commits": g.commits.iter().map(|gc| json!({
                        "hash": gc.hash,
                        "message": gc.message,
                    })).collect::<Vec<_>>(),
                })),
                "project_info": c.project_info.as_ref().map(|p| json!({
                    "name": p.name,
                    "path": p.path,
                })),
                "links": c.links.iter().map(|l| json!({
                    "url": l.url,
                    "label": l.label,
                })).collect::<Vec<Value>>(),
                "capture_mode": c.capture_mode,
                "session_ref": c.session_ref,
                "updated": c.updated,
                "color": c.color,
                "icon": c.icon,
            });
            ToolCallResult::text(serde_json::to_string_pretty(&out).unwrap_or_default())
        }
        Ok(None) => ToolCallResult::error(format!("Capture not found: {id}")),
        Err(e) => ToolCallResult::error(format!("Failed to get capture: {e}")),
    }
}

fn handle_list(args: &Value, store: &Store) -> ToolCallResult {
    let filters = build_filters(args);
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(20).min(100) as u32;
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

    match store.list_captures(&filters, limit, offset) {
        Ok(captures) => {
            let output: Vec<Value> = captures.iter().map(overview_to_json).collect();
            ToolCallResult::text(serde_json::to_string_pretty(&output).unwrap_or_default())
        }
        Err(e) => ToolCallResult::error(format!("Failed to list captures: {e}")),
    }
}

fn handle_recent(args: &Value, store: &Store) -> ToolCallResult {
    let days = args.get("days").and_then(|v| v.as_u64()).unwrap_or(7).min(90) as i64;
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10).min(50) as u32;
    let project = args.get("project").and_then(|v| v.as_str());

    let since = Utc::now().date_naive() - chrono::Duration::days(days);
    let filters = CaptureFilters {
        project: project.map(|s| s.to_string()),
        since: Some(since),
        ..Default::default()
    };

    match store.list_captures(&filters, limit, 0) {
        Ok(captures) => {
            let output: Vec<Value> = captures.iter().map(overview_to_json).collect();
            ToolCallResult::text(serde_json::to_string_pretty(&output).unwrap_or_default())
        }
        Err(e) => ToolCallResult::error(format!("Failed to get recent captures: {e}")),
    }
}

fn handle_projects(store: &Store) -> ToolCallResult {
    // Query distinct projects from captures
    match list_projects_from_store(store) {
        Ok(projects) => ToolCallResult::text(serde_json::to_string_pretty(&projects).unwrap_or_default()),
        Err(e) => ToolCallResult::error(format!("Failed to list projects: {e}")),
    }
}

fn handle_stats(store: &Store) -> ToolCallResult {
    match compute_stats(store) {
        Ok(stats) => ToolCallResult::text(serde_json::to_string_pretty(&stats).unwrap_or_default()),
        Err(e) => ToolCallResult::error(format!("Failed to get stats: {e}")),
    }
}

// ── Write tool handlers ─────────────────────────────────────

fn handle_capture(
    args: &Value,
    store: &Store,
    kb_root: &std::path::Path,
) -> ToolCallResult {
    let title = match args.get("title").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return ToolCallResult::error("Missing required parameter: title"),
    };
    let body = match args.get("body").and_then(|v| v.as_str()) {
        Some(b) => b,
        None => return ToolCallResult::error("Missing required parameter: body"),
    };
    let space = args.get("space").and_then(|v| v.as_str()).unwrap_or("work");
    let capture_type = args.get("type").and_then(|v| v.as_str()).unwrap_or("learning");
    let summary = args.get("summary").and_then(|v| v.as_str());
    let tags: Vec<String> = args.get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let project = args.get("project").and_then(|v| v.as_str());
    let project_path = args.get("project_path").and_then(|v| v.as_str());
    let mode = args.get("mode").and_then(|v| v.as_str());
    let session_ref = args.get("session_ref").and_then(|v| v.as_str());
    let chain_prev = args.get("chain_prev").and_then(|v| v.as_str());

    // Auto-detect chain_prev if not provided
    let auto_chain = if chain_prev.is_none() {
        project.and_then(|p| store.latest_capture_in_project(p).ok().flatten())
    } else {
        None
    };
    let effective_chain_prev = chain_prev.map(|s| s.to_string()).or(auto_chain);

    // Build create opts
    let opts = brainos_core::files::CreateCaptureOpts {
        summary: summary.map(|s| s.to_string()),
        status: None,
        project_name: project.map(|s| s.to_string()),
        project_path: project_path.map(|s| s.to_string()),
        chain_prev: effective_chain_prev,
        color: None,
        icon: None,
        capture_mode: mode.map(|s| s.to_string()),
        session_ref: session_ref.map(|s| s.to_string()),
    };

    match brainos_core::files::create_file(store, kb_root, title, space, capture_type, &tags, body, Some(&opts)) {
        Ok(capture) => {
            let out = json!({
                "id": capture.id,
                "file_path": capture.file_path,
                "title": capture.title,
            });
            ToolCallResult::text(serde_json::to_string_pretty(&out).unwrap_or_default())
        }
        Err(e) => ToolCallResult::error(format!("Failed to create capture: {e}")),
    }
}

fn handle_check_duplicate(
    args: &Value,
    store: &Store,
    embedder: Option<&Embedder>,
    search_config: &brainos_core::config::SearchConfig,
) -> ToolCallResult {
    let title = match args.get("title").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return ToolCallResult::error("Missing required parameter: title"),
    };

    let query = if let Some(body) = args.get("body").and_then(|v| v.as_str()) {
        format!("{} {}", title, &body[..body.len().min(200)])
    } else {
        title.to_string()
    };

    let results = match search_hybrid(
        store, embedder, &query, 3,
        Some(search_config.rrf_k),
        Some(search_config.temporal_half_life_days),
    ) {
        Ok(r) => r,
        Err(e) => return ToolCallResult::error(format!("Duplicate check failed: {e}")),
    };

    let threshold = 0.8;
    let is_duplicate = results.first().map(|r| r.score > threshold).unwrap_or(false);
    let similar: Vec<Value> = results.iter().map(|r| {
        json!({
            "id": r.capture.id,
            "title": r.capture.title,
            "score": (r.score * 1000.0).round() / 1000.0,
        })
    }).collect();

    let out = json!({
        "is_duplicate": is_duplicate,
        "similar": similar,
    });
    ToolCallResult::text(serde_json::to_string_pretty(&out).unwrap_or_default())
}

// ── New write tool handlers ─────────────────────────────────

fn handle_append(args: &Value, store: &Store, kb_root: &std::path::Path) -> ToolCallResult {
    let id = match args.get("id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return ToolCallResult::error("Missing required parameter: id"),
    };
    let section = match args.get("section").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return ToolCallResult::error("Missing required parameter: section"),
    };

    match brainos_core::files::append_section(store, kb_root, id, section) {
        Ok(capture) => {
            let out = json!({
                "id": capture.id,
                "title": capture.title,
                "message": "Section appended successfully",
            });
            ToolCallResult::text(serde_json::to_string_pretty(&out).unwrap_or_default())
        }
        Err(e) => ToolCallResult::error(format!("Failed to append: {e}")),
    }
}

fn handle_update(args: &Value, store: &Store, kb_root: &std::path::Path) -> ToolCallResult {
    let id = match args.get("id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return ToolCallResult::error("Missing required parameter: id"),
    };

    let updates = brainos_core::files::MetadataUpdate {
        status: args.get("status").and_then(|v| v.as_str()).map(|s| s.to_string()),
        summary: args.get("summary").and_then(|v| v.as_str()).map(|s| s.to_string()),
        add_tags: args.get("add_tags")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default(),
        remove_tags: args.get("remove_tags")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default(),
    };

    // Validate at least one field is being updated
    if updates.status.is_none() && updates.summary.is_none()
        && updates.add_tags.is_empty() && updates.remove_tags.is_empty()
    {
        return ToolCallResult::error("No fields to update. Provide at least one of: status, summary, add_tags, remove_tags");
    }

    match brainos_core::files::update_metadata(store, kb_root, id, &updates) {
        Ok(capture) => {
            let out = json!({
                "id": capture.id,
                "title": capture.title,
                "status": capture.status.to_string(),
                "tags": capture.tags,
                "summary": capture.summary,
                "message": "Metadata updated successfully",
            });
            ToolCallResult::text(serde_json::to_string_pretty(&out).unwrap_or_default())
        }
        Err(e) => ToolCallResult::error(format!("Failed to update metadata: {e}")),
    }
}

fn handle_link(args: &Value, store: &Store, kb_root: &std::path::Path) -> ToolCallResult {
    let id1 = match args.get("id1").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return ToolCallResult::error("Missing required parameter: id1"),
    };
    let id2 = match args.get("id2").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return ToolCallResult::error("Missing required parameter: id2"),
    };

    match brainos_core::files::link_captures(store, kb_root, id1, id2) {
        Ok(()) => {
            let out = json!({
                "id1": id1,
                "id2": id2,
                "message": "Captures linked successfully",
            });
            ToolCallResult::text(serde_json::to_string_pretty(&out).unwrap_or_default())
        }
        Err(e) => ToolCallResult::error(format!("Failed to link captures: {e}")),
    }
}

// ── Helpers ─────────────────────────────────────────────────

fn build_filters(args: &Value) -> CaptureFilters {
    CaptureFilters {
        space: args.get("space").and_then(|v| v.as_str()).and_then(|s| match s {
            "work" => Some(Space::Work),
            "personal" => Some(Space::Personal),
            "wiki" => Some(Space::Wiki),
            _ => None,
        }),
        capture_type: args.get("type").and_then(|v| v.as_str()).map(|s| s.to_string()),
        project: args.get("project").and_then(|v| v.as_str()).map(|s| s.to_string()),
        tags: args.get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect()),
        since: args.get("since").and_then(|v| v.as_str())
            .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()),
        until: args.get("until").and_then(|v| v.as_str())
            .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()),
        ..Default::default()
    }
}

fn overview_to_json(c: &CaptureOverview) -> Value {
    json!({
        "id": c.id,
        "file_path": c.file_path,
        "title": c.title,
        "summary": c.summary,
        "space": c.space.to_string(),
        "capture_type": c.capture_type,
        "status": c.status.to_string(),
        "date": c.date.to_string(),
        "tags": c.tags,
        "projects": c.projects,
    })
}

/// Query distinct projects from captures with counts.
fn list_projects_from_store(store: &Store) -> Result<Vec<Value>> {
    // list all captures (lightweight), then aggregate by project
    let all = store.list_captures(&CaptureFilters::default(), 10000, 0)?;
    let mut project_map: std::collections::BTreeMap<String, (u32, NaiveDate)> = std::collections::BTreeMap::new();
    for c in &all {
        for p in &c.projects {
            let entry = project_map.entry(p.clone()).or_insert((0, c.date));
            entry.0 += 1;
            if c.date > entry.1 {
                entry.1 = c.date;
            }
        }
    }
    let projects: Vec<Value> = project_map.into_iter().map(|(name, (count, latest))| {
        json!({ "name": name, "capture_count": count, "latest_date": latest.to_string() })
    }).collect();
    Ok(projects)
}

/// Compute KB-wide stats.
fn compute_stats(store: &Store) -> Result<Value> {
    let all = store.list_captures(
        &CaptureFilters { include_archived: Some(true), ..Default::default() },
        100000, 0,
    )?;
    let total = all.len();

    let mut by_space: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    let mut by_type: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    let mut by_project: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    let mut tag_counts: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();

    let this_month_start = {
        let today = Utc::now().date_naive();
        NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap_or(today)
    };
    let mut this_month: u64 = 0;

    for c in &all {
        *by_space.entry(c.space.to_string()).or_default() += 1;
        *by_type.entry(c.capture_type.clone()).or_default() += 1;
        for p in &c.projects {
            *by_project.entry(p.clone()).or_default() += 1;
        }
        for t in &c.tags {
            *tag_counts.entry(t.clone()).or_default() += 1;
        }
        if c.date >= this_month_start {
            this_month += 1;
        }
    }

    // Top 10 tags
    let mut top_tags: Vec<(String, u64)> = tag_counts.into_iter().collect();
    top_tags.sort_by(|a, b| b.1.cmp(&a.1));
    top_tags.truncate(10);

    Ok(json!({
        "total_captures": total,
        "by_space": by_space,
        "by_type": by_type,
        "by_project": by_project,
        "top_tags": top_tags,
        "this_month": this_month,
    }))
}
