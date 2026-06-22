use brainos_core::Config;
use brainos_core::models::*;
use brainos_core::rag::{ChatRequest, ChatResponse, ChatHistoryItem};
use serde_json::Value;
use tauri::command;

use crate::{AppStore, AppConfig, AppEmbedder};

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

#[command]
pub fn sync_now() -> Result<Value, String> {
    Ok(serde_json::json!({
        "status": "not_yet_implemented"
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
