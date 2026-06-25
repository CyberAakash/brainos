use brainos_core::Config;
use brainos_core::config::WorkspaceRoot;
use brainos_core::models::*;
use brainos_core::rag::{ChatRequest, ChatResponse, ChatHistoryItem};
use brainos_core::store::queries::RootRow;
use serde_json::Value;
use tauri::command;
use tauri::{Emitter, Manager};

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::{AppStore, AppConfig, AppEmbedder, IndexCancelTokens};

// ── Queries ──────────────────────────────────────────────────

#[command]
pub fn list_captures(
    store: tauri::State<'_, AppStore>,
    filters: Option<Value>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<CaptureOverview>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let filters = filters
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    store.list_captures(&filters, limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[command]
pub fn get_capture(store: tauri::State<'_, AppStore>, id: String) -> Result<Option<Capture>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.get_capture(&id).map_err(|e| e.to_string())
}

#[command]
pub fn search(
    store: tauri::State<'_, AppStore>,
    embedder: tauri::State<'_, AppEmbedder>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let emb_ref = embedder.0.as_deref();
    brainos_core::search::search_hybrid(&store, emb_ref, &query, limit.unwrap_or(20), None, None)
        .map_err(|e| e.to_string())
}

// ── CRUD ─────────────────────────────────────────────────────

#[command]
pub fn read_capture_raw(
    config: tauri::State<'_, AppConfig>,
    store: tauri::State<'_, AppStore>,
    id: String,
) -> Result<String, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let capture = store.get_capture(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Capture not found: {}", id))?;
    brainos_core::files::read_raw(&config.0.general.kb_root, &capture.file_path)
        .map_err(|e| e.to_string())
}

#[command]
pub fn create_capture_file(
    store: tauri::State<'_, AppStore>,
    config: tauri::State<'_, AppConfig>,
    embedder: tauri::State<'_, AppEmbedder>,
    title: String,
    space: String,
    capture_type: String,
    tags: Vec<String>,
    body: String,
    summary: Option<String>,
    status: Option<String>,
    project_name: Option<String>,
    project_path: Option<String>,
    chain_prev: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> Result<Capture, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let opts = brainos_core::files::CreateCaptureOpts {
        summary,
        status,
        project_name,
        project_path,
        chain_prev,
        color,
        icon,
    };
    let capture = brainos_core::files::create_file(&store, &config.0.general.kb_root, &title, &space, &capture_type, &tags, &body, Some(&opts))
        .map_err(|e| e.to_string())?;

    // Generate embedding for the new capture
    if let Some(ref emb) = embedder.0 {
        let text = brainos_core::embedding::capture_to_embed_text(&capture);
        if let Ok(vectors) = emb.embed_documents(&[text.as_str()]) {
            if let Some(vec) = vectors.first() {
                store.upsert_embedding(&capture.id, vec).ok();
            }
        }
    }

    Ok(capture)
}

#[command]
pub fn save_capture_content(
    store: tauri::State<'_, AppStore>,
    config: tauri::State<'_, AppConfig>,
    embedder: tauri::State<'_, AppEmbedder>,
    id: String,
    content: String,
) -> Result<Capture, String> {
    let store_guard = store.0.lock().map_err(|e| e.to_string())?;
    let capture = store_guard.get_capture(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Capture not found: {}", id))?;
    let updated = brainos_core::files::save_content(&store_guard, &config.0.general.kb_root, &capture.file_path, &content)
        .map_err(|e| e.to_string())?;

    // Re-embed after content change
    if let Some(ref emb) = embedder.0 {
        let text = brainos_core::embedding::capture_to_embed_text(&updated);
        if let Ok(vectors) = emb.embed_documents(&[text.as_str()]) {
            if let Some(vec) = vectors.first() {
                store_guard.upsert_embedding(&updated.id, vec).ok();
            }
        }
    }

    Ok(updated)
}

#[command]
pub fn delete_capture_file(
    store: tauri::State<'_, AppStore>,
    config: tauri::State<'_, AppConfig>,
    id: String,
) -> Result<(), String> {
    let store_guard = store.0.lock().map_err(|e| e.to_string())?;
    let capture = store_guard.get_capture(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Capture not found: {}", id))?;
    brainos_core::files::delete_file(&store_guard, &config.0.general.kb_root, &capture.file_path, &id)
        .map_err(|e| e.to_string())
}

#[command]
pub fn archive_capture(
    store: tauri::State<'_, AppStore>,
    id: String,
) -> Result<(), String> {
    let store_guard = store.0.lock().map_err(|e| e.to_string())?;
    store_guard.archive_capture(&id).map_err(|e| e.to_string())
}

#[command]
pub fn unarchive_capture(
    store: tauri::State<'_, AppStore>,
    id: String,
) -> Result<(), String> {
    let store_guard = store.0.lock().map_err(|e| e.to_string())?;
    store_guard.unarchive_capture(&id).map_err(|e| e.to_string())
}

// ── Settings & Sync ──────────────────────────────────────────

#[command]
pub fn get_stats() -> Result<Value, String> {
    Ok(serde_json::json!({
        "status": "not_yet_implemented"
    }))
}

#[command]
pub fn get_settings() -> Result<Config, String> {
    Config::load().map_err(|e| e.to_string())
}

/// Trigger a full KB re-index — picks up any new/changed/deleted captures.
#[command]
pub fn sync_now(
    store: tauri::State<'_, AppStore>,
    config: tauri::State<'_, AppConfig>,
    embedder: tauri::State<'_, AppEmbedder>,
) -> Result<Value, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let emb_ref = embedder.0.as_deref();
    let count = brainos_core::indexing::index_all(&store, &config.0.general.kb_root, emb_ref)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "status": "ok",
        "indexed": count,
    }))
}

// ── Provider testing ────────────────────────────────────────

/// Test a provider directly — bypasses RAG to avoid FTS5 issues.
#[command]
pub async fn test_provider(
    provider_key: String,
    providers: std::collections::BTreeMap<String, brainos_core::config::ProviderConfig>,
) -> Result<String, String> {
    use brainos_core::config::ChatConfig;
    use brainos_core::llm::{self, LlmMessage};

    let config = ChatConfig {
        active: provider_key,
        providers,
    };

    let messages = vec![
        LlmMessage { role: "user".into(), content: "Say OK".into() },
    ];

    let resp = llm::chat(&config, &messages).await.map_err(|e| e.to_string())?;
    Ok(resp.text)
}

// ── CLI detection ───────────────────────────────────────────

#[command]
pub fn detect_claude_cli() -> Result<Option<String>, String> {
    Ok(brainos_core::llm::cli::detect_cli(""))
}

// ── Git detection ──────────────────────────────────────────

#[command]
pub fn detect_git_info(path: String) -> Result<Option<brainos_core::models::GitInfo>, String> {
    Ok(brainos_core::git_detect::detect(std::path::Path::new(&path)))
}

// ── Chat (RAG) ──────────────────────────────────────────────

#[command]
pub async fn chat_send(
    store: tauri::State<'_, AppStore>,
    config: tauri::State<'_, AppConfig>,
    embedder: tauri::State<'_, AppEmbedder>,
    message: String,
    pinned_ids: Vec<String>,
    history: Vec<ChatHistoryItem>,
) -> Result<ChatResponse, String> {
    let request = ChatRequest {
        message,
        pinned_ids,
        history,
    };

    // Phase 1 (sync): build context while holding the mutex
    let rag_context = {
        let store_guard = store.0.lock().map_err(|e| e.to_string())?;
        let emb_ref = embedder.0.as_deref();
        brainos_core::rag::build_context(&store_guard, &request, emb_ref)
            .map_err(|e| e.to_string())?
    };
    // MutexGuard dropped here ↑

    // Phase 2 (async): call LLM — no mutex held
    let chat_config = config.0.chat.clone();
    let response = brainos_core::rag::call_llm(&chat_config, rag_context)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response)
}

#[command]
pub fn save_settings(
    active: String,
    providers: std::collections::BTreeMap<String, brainos_core::config::ProviderConfig>,
) -> Result<(), String> {
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    cfg.chat.active = active;
    cfg.chat.providers = providers;
    cfg.save().map_err(|e| e.to_string())?;
    // Note: in-memory AppConfig won't update until restart.
    Ok(())
}

#[command]
pub fn save_general_settings(
    display_name: Option<String>,
    auto_index: Option<bool>,
    compact_mode: Option<bool>,
) -> Result<(), String> {
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    if let Some(name) = display_name {
        cfg.general.display_name = name;
    }
    if let Some(ai) = auto_index {
        cfg.general.auto_index = ai;
    }
    if let Some(cm) = compact_mode {
        cfg.ui.compact_mode = cm;
    }
    cfg.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Entities (Phase 2) ─────────────────────────────────────

#[command]
pub fn get_entities_for_capture(
    store: tauri::State<'_, AppStore>,
    id: String,
) -> Result<Vec<brainos_core::models::Entity>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.get_entities_for_capture(&id).map_err(|e| e.to_string())
}

#[command]
pub fn get_captures_for_entity(
    store: tauri::State<'_, AppStore>,
    entity_id: String,
    limit: Option<u32>,
) -> Result<Vec<CaptureOverview>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let capture_ids = store.get_captures_for_entity(&entity_id)
        .map_err(|e| e.to_string())?;
    let mut captures = Vec::new();
    for id in capture_ids.iter().take(limit.unwrap_or(50) as usize) {
        if let Some(c) = store.get_capture(id).map_err(|e| e.to_string())? {
            captures.push(CaptureOverview {
                id: c.id,
                title: c.title,
                summary: c.summary,
                space: c.space,
                capture_type: c.capture_type,
                status: c.status,
                date: c.date,
                tags: c.tags,
                projects: c.projects,
                color: c.color,
                icon: c.icon,
            });
        }
    }
    Ok(captures)
}

#[command]
pub fn search_entities(
    store: tauri::State<'_, AppStore>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<brainos_core::models::Entity>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.search_entities(&query, limit.unwrap_or(20)).map_err(|e| e.to_string())
}

#[command]
pub fn get_related_entities(
    store: tauri::State<'_, AppStore>,
    entity_id: String,
) -> Result<Vec<(brainos_core::models::Entity, u32)>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.get_related_entities(&entity_id).map_err(|e| e.to_string())
}

// ── Contradictions (Phase 3C) ─────────────────────────────────

#[command]
pub fn get_unresolved_contradictions(
    store: tauri::State<'_, AppStore>,
) -> Result<Vec<brainos_core::contradiction::Contradiction>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.get_unresolved_contradictions().map_err(|e| e.to_string())
}

#[command]
pub fn get_contradictions_for_entity(
    store: tauri::State<'_, AppStore>,
    entity_id: String,
) -> Result<Vec<brainos_core::contradiction::Contradiction>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.get_contradictions_for_entity(&entity_id).map_err(|e| e.to_string())
}

#[command]
pub fn resolve_contradiction(
    store: tauri::State<'_, AppStore>,
    id: i64,
    resolution: String,
) -> Result<(), String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.resolve_contradiction(id, &resolution).map_err(|e| e.to_string())
}

// ── Workspace Roots (Multi-root) ──────────────────────────────

#[command]
pub fn list_workspace_roots(
    store: tauri::State<'_, AppStore>,
) -> Result<Vec<RootRow>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.list_roots().map_err(|e| e.to_string())
}

#[command]
pub fn add_workspace_root(
    store: tauri::State<'_, AppStore>,
    path: String,
    name: String,
    file_types: Option<Vec<String>>,
    exclude_dirs: Option<Vec<String>>,
) -> Result<RootRow, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;

    // Register root in DB (fast)
    let root_id = store.add_root(&path, &name, "workspace")
        .map_err(|e| e.to_string())?;

    // Persist to config file (fast)
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    cfg.general.workspace_roots.push(WorkspaceRoot {
        path: std::path::PathBuf::from(&path),
        name: name.clone(),
        enabled: true,
        file_types: file_types.unwrap_or_default(),
        exclude_dirs: exclude_dirs.unwrap_or_default(),
    });
    cfg.save().map_err(|e| e.to_string())?;

    // NOTE: Indexing is NOT done here — caller should invoke reindex_workspace_root
    // separately so the UI stays responsive.

    Ok(RootRow { id: root_id, path, name, kind: "workspace".into() })
}

#[command]
pub fn remove_workspace_root(
    store: tauri::State<'_, AppStore>,
    root_id: i64,
) -> Result<(), String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;

    // Get the path before removing so we can clean config
    let root = store.get_root(root_id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Root not found: {root_id}"))?;

    store.remove_root(root_id).map_err(|e| e.to_string())?;

    // Also remove from config file
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    cfg.general.workspace_roots.retain(|r| {
        r.resolved_path().to_string_lossy() != root.path
    });
    cfg.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn get_workspace_root_stats(
    store: tauri::State<'_, AppStore>,
    root_id: i64,
) -> Result<u32, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.root_file_count(root_id).map_err(|e| e.to_string())
}

/// Background workspace indexer. Opens its own DB connection so the main
/// store mutex is never held during the (potentially long) walk.
/// Emits `workspace-index-started`, `workspace-index-progress`,
/// `workspace-index-complete`, or `workspace-index-error` events.
pub fn spawn_workspace_index(app_handle: tauri::AppHandle, root_id: i64, embedder_arc: Option<Arc<brainos_core::Embedder>>) {
    // Create a cancel token for this indexing run
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let tokens = app_handle.state::<IndexCancelTokens>();
        let mut map = tokens.0.lock().expect("cancel tokens lock");
        map.insert(root_id, cancel.clone());
    }

    std::thread::spawn(move || {
        let data_dir = Config::data_dir();
        let bg_store = match brainos_core::Store::open(&data_dir) {
            Ok(s) => s,
            Err(e) => {
                let _ = app_handle.emit("workspace-index-error", serde_json::json!({
                    "rootId": root_id, "error": e.to_string(),
                }));
                return;
            }
        };

        // Look up root row
        let root_row = match bg_store.get_root(root_id) {
            Ok(Some(r)) => r,
            Ok(None) => {
                let _ = app_handle.emit("workspace-index-error", serde_json::json!({
                    "rootId": root_id, "error": format!("Root {root_id} not found"),
                }));
                return;
            }
            Err(e) => {
                let _ = app_handle.emit("workspace-index-error", serde_json::json!({
                    "rootId": root_id, "error": e.to_string(),
                }));
                return;
            }
        };

        // Build WorkspaceRoot config
        let cfg = Config::load().unwrap_or_default();
        let workspace_root = cfg.general.workspace_roots.iter()
            .find(|r| r.resolved_path().to_string_lossy() == root_row.path)
            .cloned()
            .unwrap_or_else(|| WorkspaceRoot {
                path: std::path::PathBuf::from(&root_row.path),
                name: root_row.name.clone(),
                enabled: true,
                file_types: Vec::new(),
                exclude_dirs: Vec::new(),
            });

        // Emit "started" event
        let _ = app_handle.emit("workspace-index-started", serde_json::json!({
            "rootId": root_id,
            "name": root_row.name,
        }));

        // Progress callback — emits event to frontend every 50 files
        let progress_handle = app_handle.clone();
        let progress_root_id = root_id;
        let progress_name = root_row.name.clone();
        let on_progress = move |p: brainos_core::indexing::IndexProgress| {
            let _ = progress_handle.emit("workspace-index-progress", serde_json::json!({
                "rootId": progress_root_id,
                "name": progress_name,
                "filesProcessed": p.files_processed,
                "filesIndexed": p.files_indexed,
                "filesSkipped": p.files_skipped,
            }));
        };

        let emb_ref = embedder_arc.as_deref();
        match brainos_core::indexing::index_workspace_with_progress(
            &bg_store, root_id, &workspace_root, emb_ref, Some(on_progress), Some(cancel.as_ref()),
        ) {
            Ok((added, updated, unchanged)) => {
                let was_cancelled = cancel.load(Ordering::Relaxed);
                if was_cancelled {
                    let _ = app_handle.emit("workspace-index-cancelled", serde_json::json!({
                        "rootId": root_id,
                        "name": root_row.name,
                    }));
                } else {
                    let _ = app_handle.emit("workspace-index-complete", serde_json::json!({
                        "rootId": root_id,
                        "name": root_row.name,
                        "added": added,
                        "updated": updated,
                        "unchanged": unchanged,
                    }));
                }
            }
            Err(e) => {
                let _ = app_handle.emit("workspace-index-error", serde_json::json!({
                    "rootId": root_id, "error": e.to_string(),
                }));
            }
        }

        // Clean up cancel token
        let tokens = app_handle.state::<IndexCancelTokens>();
        let mut map = tokens.0.lock().expect("cancel tokens lock");
        map.remove(&root_id);
    });
}

#[command]
pub fn get_workspace_root_excludes(
    store: tauri::State<'_, AppStore>,
    root_id: i64,
) -> Result<Vec<String>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    let root = store.get_root(root_id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Root not found: {root_id}"))?;

    let cfg = Config::load().map_err(|e| e.to_string())?;
    let excludes = cfg.general.workspace_roots.iter()
        .find(|r| r.resolved_path().to_string_lossy() == root.path)
        .map(|r| r.exclude_dirs.clone())
        .unwrap_or_default();

    Ok(excludes)
}

#[command]
pub fn update_workspace_root_excludes(
    store: tauri::State<'_, AppStore>,
    root_id: i64,
    exclude_dirs: Vec<String>,
) -> Result<(), String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;

    // Get root path so we can find it in config
    let root = store.get_root(root_id).map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Root not found: {root_id}"))?;

    // Update config file
    let mut cfg = Config::load().map_err(|e| e.to_string())?;
    if let Some(wr) = cfg.general.workspace_roots.iter_mut()
        .find(|r| r.resolved_path().to_string_lossy() == root.path)
    {
        wr.exclude_dirs = exclude_dirs;
    }
    cfg.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn reindex_workspace_root(
    app: tauri::AppHandle,
    embedder: tauri::State<'_, AppEmbedder>,
    root_id: i64,
) -> Result<(), String> {
    let emb_arc = embedder.0.clone();
    spawn_workspace_index(app, root_id, emb_arc);
    Ok(())
}

/// Cancel an in-progress workspace indexing operation.
#[command]
pub fn cancel_indexing(
    tokens: tauri::State<'_, IndexCancelTokens>,
    root_id: i64,
) -> Result<bool, String> {
    let map = tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some(token) = map.get(&root_id) {
        token.store(true, Ordering::Relaxed);
        Ok(true)
    } else {
        Ok(false) // no indexing in progress for this root
    }
}

/// Read a workspace file's content from disk on-demand.
/// This is the key design choice: content lives on disk, NOT in the database.
/// Only called when the user explicitly confirms they want to view a file.
#[command]
pub fn read_workspace_file(
    abs_path: String,
) -> Result<String, String> {
    brainos_core::Store::read_workspace_file_content(&abs_path)
        .map_err(|e| e.to_string())
}

/// List workspace files (metadata only) for a given root.
#[command]
pub fn list_workspace_files(
    store: tauri::State<'_, AppStore>,
    root_id: i64,
) -> Result<Vec<brainos_core::store::queries::WorkspaceFileRow>, String> {
    let store = store.0.lock().map_err(|e| e.to_string())?;
    store.list_workspace_files(root_id).map_err(|e| e.to_string())
}
