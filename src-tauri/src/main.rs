#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use brainos_core::{Config, Embedder, Store};
use brainos_core::embedding;
use std::sync::{Arc, Mutex};
use tracing::{info, error, warn};

/// Shared store wrapped in a Mutex for Tauri managed state.
pub struct AppStore(pub Mutex<Store>);

/// Shared config for Tauri managed state.
pub struct AppConfig(pub Config);

/// Shared embedder wrapped in Arc for Tauri managed state.
/// Option because embedding init can fail (graceful degradation).
pub struct AppEmbedder(pub Option<Arc<Embedder>>);

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
        Ok(count) => info!("Startup indexing: {count} captures indexed"),
        Err(e) => error!("Startup indexing failed: {e}"),
    }

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
            commands::chat_send,
            commands::save_settings,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running BrainOS");
}
