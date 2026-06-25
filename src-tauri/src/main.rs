#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use brainos_core::{Config, Embedder, Store};
use brainos_core::embedding;
use brainos_core::indexing::{FileWatcher, WatchEvent, parse_capture_file};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tracing::{info, error, warn};

/// Shared store wrapped in a Mutex for Tauri managed state.
pub struct AppStore(pub Mutex<Store>);

/// Shared config for Tauri managed state.
pub struct AppConfig(pub Config);

/// Shared embedder wrapped in Arc for Tauri managed state.
/// Option because embedding init can fail (graceful degradation).
pub struct AppEmbedder(pub Option<Arc<Embedder>>);

/// Cancel tokens for in-progress workspace indexing, keyed by root_id.
pub struct IndexCancelTokens(pub Mutex<HashMap<i64, Arc<AtomicBool>>>);

fn main() {
    tracing_subscriber::fmt::init();

    let config = Config::load().unwrap_or_else(|e| {
        error!("Failed to load config: {e}");
        panic!("Cannot start without config");
    });

    info!("Knowledge base: {}", config.general.kb_root.display());

    let store = Store::open(&Config::data_dir()).unwrap_or_else(|e| {
        error!("Failed to open store: {e}");
        panic!("Cannot start without database");
    });

    // Initialize embedding model (optional — app works without it)
    let models_dir = Config::data_dir().join("models");
    let embedder = embedding::try_init(&models_dir).map(Arc::new);
    if embedder.is_some() {
        info!("Vector search enabled");
    } else {
        warn!("Vector search disabled — using keyword search only");
    }

    // Run startup indexing with embedding support
    let embedder_ref = embedder.as_deref();
    match brainos_core::indexing::index_all(&store, &config.general.kb_root, embedder_ref) {
        Ok(count) => info!("Startup indexing: {count} KB captures indexed"),
        Err(e) => error!("Startup KB indexing failed: {e}"),
    }

    // NOTE: Workspace root indexing is deferred to the setup hook (background thread)
    // so the window opens immediately even for large workspaces.

    // Run decay rules to expire stale captures
    let decay_rules = brainos_core::decay::default_rules();
    match brainos_core::decay::apply_decay_rules(&store, &decay_rules) {
        Ok(0) => {}
        Ok(n) => info!("Decay: {n} captures expired on startup"),
        Err(e) => warn!("Decay rules failed: {e}"),
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppStore(Mutex::new(store)))
        .manage(AppConfig(config))
        .manage(AppEmbedder(embedder))
        .manage(IndexCancelTokens(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            commands::list_captures,
            commands::get_capture,
            commands::search,
            commands::get_stats,
            commands::get_settings,
            commands::sync_now,
            commands::read_capture_raw,
            commands::create_capture_file,
            commands::save_capture_content,
            commands::delete_capture_file,
            commands::archive_capture,
            commands::unarchive_capture,
            commands::chat_send,
            commands::save_settings,
            commands::save_general_settings,
            commands::test_provider,
            commands::detect_claude_cli,
            commands::detect_git_info,
            commands::get_entities_for_capture,
            commands::get_captures_for_entity,
            commands::search_entities,
            commands::get_related_entities,
            commands::get_unresolved_contradictions,
            commands::get_contradictions_for_entity,
            commands::resolve_contradiction,
            commands::list_workspace_roots,
            commands::add_workspace_root,
            commands::remove_workspace_root,
            commands::get_workspace_root_stats,
            commands::reindex_workspace_root,
            commands::get_workspace_root_excludes,
            commands::update_workspace_root_excludes,
            commands::read_workspace_file,
            commands::list_workspace_files,
            commands::cancel_indexing,
        ])
        .setup(|app| {
            // Kick off workspace indexing in a background thread so the
            // window opens immediately. Each root gets its own
            // spawn_workspace_index call with a fresh DB connection.
            let cfg = Config::load().unwrap_or_default();
            if !cfg.general.workspace_roots.is_empty() {
                let handle = app.handle().clone();
                let emb_arc = app.state::<AppEmbedder>().0.clone();

                // We need root IDs from the DB — quick read, then release.
                let roots: Vec<_> = {
                    let store_state = app.state::<AppStore>();
                    let store = store_state.0.lock().expect("store lock");
                    store.list_roots().unwrap_or_default()
                };

                for root in roots {
                    if root.id == 0 { continue; } // skip KB pseudo-root
                    info!("Scheduling background index for workspace: {} (root {})", root.name, root.id);
                    commands::spawn_workspace_index(handle.clone(), root.id, emb_arc.clone());
                }
            }

            // ── KB file watcher — auto-index new/changed/deleted captures ──
            {
                let captures_dir = cfg.general.kb_root.join("captures");
                std::fs::create_dir_all(&captures_dir).ok();

                let watch_handle = app.handle().clone();
                let emb_arc = app.state::<AppEmbedder>().0.clone();

                std::thread::spawn(move || {
                    let watcher_store = match Store::open(&Config::data_dir()) {
                        Ok(s) => s,
                        Err(e) => {
                            error!("KB watcher: failed to open store: {e}");
                            return;
                        }
                    };

                    let watcher = match FileWatcher::new(&captures_dir) {
                        Ok(w) => w,
                        Err(e) => {
                            error!("KB watcher: failed to start: {e}");
                            return;
                        }
                    };

                    info!("KB file watcher started on {}", captures_dir.display());

                    loop {
                        match watcher.recv_timeout(Duration::from_secs(1)) {
                            Some(WatchEvent::Created(ref path)) | Some(WatchEvent::Modified(ref path)) => {
                                if path.extension().and_then(|e| e.to_str()) != Some("md") {
                                    continue;
                                }
                                // Brief delay to let the file finish writing
                                std::thread::sleep(Duration::from_millis(200));

                                match parse_capture_file(path) {
                                    Ok(capture) => {
                                        if let Err(e) = watcher_store.upsert_capture(&capture) {
                                            warn!("KB watcher: index failed for {}: {e}", path.display());
                                            continue;
                                        }

                                        // Embed the capture
                                        if let Some(ref emb) = emb_arc {
                                            let text = brainos_core::embedding::capture_to_embed_text(&capture);
                                            if let Ok(vectors) = emb.embed_documents(&[text.as_str()]) {
                                                if let Some(vec) = vectors.first() {
                                                    watcher_store.upsert_embedding(&capture.id, vec).ok();
                                                }
                                            }
                                        }

                                        // Extract and link entities
                                        watcher_store.unlink_capture_entities(&capture.id).ok();
                                        let mentions = brainos_core::entities::extract_entities(&capture);
                                        for mention in &mentions {
                                            watcher_store.upsert_entity(&mention.entity).ok();
                                            watcher_store.link_capture_entity(
                                                &capture.id,
                                                &mention.entity.id,
                                                &mention.mention_type.to_string(),
                                                mention.confidence,
                                            ).ok();
                                        }

                                        let _ = watch_handle.emit("kb-capture-changed", serde_json::json!({
                                            "id": capture.id,
                                            "title": capture.title,
                                            "action": "upserted",
                                        }));
                                        info!("KB watcher: indexed {}", capture.id);
                                    }
                                    Err(e) => warn!("KB watcher: parse failed {}: {e}", path.display()),
                                }
                            }
                            Some(WatchEvent::Deleted(ref path)) => {
                                if let Some(file_name) = path.file_name().and_then(|f| f.to_str()) {
                                    let id = file_name.trim_end_matches(".md");
                                    watcher_store.delete_capture(id).ok();
                                    let _ = watch_handle.emit("kb-capture-changed", serde_json::json!({
                                        "id": id,
                                        "action": "deleted",
                                    }));
                                    info!("KB watcher: removed {}", id);
                                }
                            }
                            None => {} // timeout — loop again
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BrainOS");
}
