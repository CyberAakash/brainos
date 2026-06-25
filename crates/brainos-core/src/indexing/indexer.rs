use anyhow::Result;
use ignore::WalkBuilder;
use rusqlite::params;
use sha2::{Sha256, Digest};
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{info, warn, debug};

use crate::config::{WorkspaceRoot, ALWAYS_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS, MAX_SOURCE_FILE_SIZE};
use crate::embedding::{self, Embedder};
use crate::entities;
use crate::store::Store;
use super::parser::parse_capture_file;

/// Scan the captures directory and index all .md files into the store.
/// If an embedder is provided, also generates vector embeddings.
/// Returns the number of captures indexed.
pub fn index_all(store: &Store, kb_root: &Path, embedder: Option<&Embedder>) -> Result<u32> {
    let captures_dir = kb_root.join("captures");
    if !captures_dir.exists() {
        info!("No captures directory at {}, skipping indexing", captures_dir.display());
        return Ok(0);
    }

    let mut count = 0u32;
    let mut embed_count = 0u32;
    let mut entity_count = 0u32;
    let entries = std::fs::read_dir(&captures_dir)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        match parse_capture_file(&path) {
            Ok(capture) => {
                // Check if already indexed with same hash AND has FTS entry
                let needs_index = match store.get_capture(&capture.id) {
                    Ok(Some(existing)) => {
                        existing.file_hash != capture.file_hash || !has_fts_entry(store, &capture.id)
                    }
                    _ => true,
                };

                if needs_index {
                    if let Err(e) = store.upsert_capture(&capture) {
                        warn!("Failed to index {}: {}", path.display(), e);
                        continue;
                    }
                    info!("Indexed: {} — {}", capture.id, capture.title);
                    count += 1;
                }

                // Generate embedding if missing or content changed
                if let Some(emb) = embedder {
                    let needs_embed = needs_index || !store.has_embedding(&capture.id);
                    if needs_embed {
                        let text = embedding::capture_to_embed_text(&capture);
                        match emb.embed_documents(&[text.as_str()]) {
                            Ok(vectors) if !vectors.is_empty() => {
                                if let Err(e) = store.upsert_embedding(&capture.id, &vectors[0]) {
                                    warn!("Failed to embed {}: {e}", capture.id);
                                } else {
                                    embed_count += 1;
                                }
                            }
                            Ok(_) => warn!("Empty embedding for {}", capture.id),
                            Err(e) => warn!("Embedding failed for {}: {e}", capture.id),
                        }
                    }
                }

                // Extract and link entities (always re-extract on index)
                if needs_index {
                    store.unlink_capture_entities(&capture.id).ok();
                    let mentions = entities::extract_entities(&capture);
                    for mention in &mentions {
                        store.upsert_entity(&mention.entity).ok();
                        store.link_capture_entity(
                            &capture.id,
                            &mention.entity.id,
                            &mention.mention_type.to_string(),
                            mention.confidence,
                        ).ok();
                    }
                    entity_count += mentions.len() as u32;
                }
            }
            Err(e) => {
                warn!("Failed to parse {}: {}", path.display(), e);
            }
        }
    }

    info!("Indexing complete: {count} captures indexed, {embed_count} embeddings, {entity_count} entity links");
    Ok(count)
}

/// Check if a capture has an FTS5 entry
fn has_fts_entry(store: &Store, id: &str) -> bool {
    store.conn().query_row(
        "SELECT COUNT(*) FROM captures_fts WHERE id = ?1",
        params![id],
        |row| row.get::<_, i64>(0),
    ).map(|c| c > 0).unwrap_or(false)
}

// ── Workspace file metadata indexing ────────────────────────────
// Stores only file path, size, hash, and language — no file content.
// Actual content is read on-demand from disk when needed.

/// Generate a deterministic file ID from root_id + relative path.
fn workspace_file_id(root_id: i64, relative_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(root_id.to_le_bytes());
    hasher.update(relative_path.as_bytes());
    let hash = hasher.finalize();
    format!("wf-{:x}", hash).chars().take(20).collect()
}

/// SHA-256 content hash for change detection.
fn content_hash(content: &[u8]) -> String {
    let hash = Sha256::digest(content);
    format!("{:x}", hash)
}

/// Infer language from file extension.
fn lang_from_ext(ext: &str) -> &str {
    match ext {
        "rs" => "rust",
        "js" | "mjs" | "cjs" => "javascript",
        "ts" | "mts" | "cts" => "typescript",
        "jsx" => "jsx",
        "tsx" => "tsx",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "swift" => "swift",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "cs" => "csharp",
        "rb" => "ruby",
        "php" => "php",
        "sh" | "bash" | "zsh" => "shell",
        "sql" => "sql",
        "html" | "htm" => "html",
        "css" | "scss" | "less" => "css",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "xml" => "xml",
        "md" | "mdx" => "markdown",
        "vue" => "vue",
        "svelte" => "svelte",
        "dart" => "dart",
        "r" | "R" => "r",
        "lua" => "lua",
        "zig" => "zig",
        "ex" | "exs" => "elixir",
        _ => "other",
    }
}

/// Progress report emitted during workspace indexing.
#[derive(Debug, Clone)]
pub struct IndexProgress {
    pub files_processed: u32,
    pub files_indexed: u32,
    pub files_skipped: u32,
}

/// Index a single workspace root: walk files, store metadata only (no content).
/// Returns (indexed_count, skipped_count, pruned_count).
pub fn index_workspace(
    store: &Store,
    root_id: i64,
    root: &WorkspaceRoot,
    _embedder: Option<&Embedder>,
) -> Result<(u32, u32, u32)> {
    index_workspace_with_progress(store, root_id, root, _embedder, None::<fn(IndexProgress)>, None)
}

/// Like `index_workspace` but with an optional progress callback and cancel token.
/// If `cancel` is set to `true`, the indexing loop exits early.
pub fn index_workspace_with_progress<F>(
    store: &Store,
    root_id: i64,
    root: &WorkspaceRoot,
    _embedder: Option<&Embedder>,
    on_progress: Option<F>,
    cancel: Option<&AtomicBool>,
) -> Result<(u32, u32, u32)>
where
    F: Fn(IndexProgress),
{
    let root_path = root.resolved_path();
    if !root_path.exists() {
        warn!("Workspace root does not exist: {}", root_path.display());
        return Ok((0, 0, 0));
    }

    // Build the allowed extensions set
    let allowed_exts: HashSet<&str> = if root.file_types.is_empty() {
        DEFAULT_SOURCE_EXTENSIONS.iter().copied().collect()
    } else {
        root.file_types.iter().map(|s| s.as_str()).collect()
    };

    // Build walker with .gitignore support
    let mut builder = WalkBuilder::new(&root_path);
    builder
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true);

    // Add custom exclude directories via ignore overrides
    let mut overrides = ignore::overrides::OverrideBuilder::new(&root_path);
    for dir in ALWAYS_EXCLUDE_DIRS {
        overrides.add(&format!("!{}/**", dir)).ok();
    }
    for dir in &root.exclude_dirs {
        overrides.add(&format!("!{}/**", dir)).ok();
    }
    if let Ok(built) = overrides.build() {
        builder.overrides(built);
    }

    let mut indexed = 0u32;
    let mut skipped = 0u32;
    let mut processed = 0u32;
    let mut current_ids = HashSet::new();

    for result in builder.build() {
        // Check cancel flag every iteration
        if cancel.map_or(false, |c| c.load(Ordering::Relaxed)) {
            info!("Indexing cancelled for workspace root {root_id}");
            break;
        }

        let entry = match result {
            Ok(e) => e,
            Err(e) => {
                debug!("Walk error: {e}");
                continue;
            }
        };

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Check extension allowlist
        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e,
            None => continue,
        };
        if !allowed_exts.contains(ext) {
            continue;
        }

        processed += 1;

        // Report progress every 50 files
        if let Some(ref cb) = on_progress {
            if processed % 50 == 0 {
                cb(IndexProgress {
                    files_processed: processed,
                    files_indexed: indexed,
                    files_skipped: skipped,
                });
            }
        }

        // Get file metadata
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.len() > MAX_SOURCE_FILE_SIZE {
            debug!("Skipping large file ({}KB): {}", metadata.len() / 1024, path.display());
            skipped += 1;
            continue;
        }

        // Compute relative path
        let relative = match path.strip_prefix(&root_path) {
            Ok(r) => r.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        // Read file bytes ONLY for hashing (not stored)
        let raw_bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                debug!("Cannot read {}: {e}", path.display());
                skipped += 1;
                continue;
            }
        };

        // Skip binary files
        if String::from_utf8(raw_bytes.clone()).is_err() {
            debug!("Skipping binary file: {}", path.display());
            skipped += 1;
            continue;
        }

        let hash = content_hash(&raw_bytes);
        let id = workspace_file_id(root_id, &relative);
        current_ids.insert(id.clone());

        // Check if already indexed with same hash
        let needs_index = !store.has_workspace_file(&id, &hash);

        if !needs_index {
            continue;
        }

        let abs_path = path.to_string_lossy().to_string();
        let language = lang_from_ext(ext).to_string();
        let file_size = metadata.len() as i64;
        let modified_at = metadata.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| {
                let secs = d.as_secs() as i64;
                chrono::DateTime::from_timestamp(secs, 0)
                    .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
            })
            .flatten();

        if let Err(e) = store.upsert_workspace_file(
            &id, root_id, &relative, &abs_path,
            &hash, file_size, &language, modified_at.as_deref(),
        ) {
            warn!("Failed to index file {}: {e}", relative);
            continue;
        }

        indexed += 1;
    }

    // Prune files deleted from disk
    let pruned = store.prune_stale_workspace_files(root_id, &current_ids)?;

    info!(
        "Workspace '{}' indexed: {} new/updated, {} skipped, {} pruned (total {} on disk)",
        root.name, indexed, skipped, pruned, current_ids.len()
    );

    Ok((indexed, skipped, pruned))
}

/// Index all configured workspace roots. Returns total files indexed.
pub fn index_all_workspaces(
    store: &Store,
    roots: &[WorkspaceRoot],
    embedder: Option<&Embedder>,
) -> Result<u32> {
    let mut total = 0u32;

    for root in roots {
        if !root.enabled {
            debug!("Skipping disabled workspace root: {}", root.name);
            continue;
        }

        let root_path = root.resolved_path();
        let path_str = root_path.to_string_lossy().to_string();

        // Ensure root is registered in DB
        let root_id = match store.get_root_by_path(&path_str)? {
            Some(row) => row.id,
            None => store.add_root(&path_str, &root.name, "workspace")?,
        };

        match index_workspace(store, root_id, root, embedder) {
            Ok((indexed, _, _)) => total += indexed,
            Err(e) => warn!("Failed to index workspace '{}': {e}", root.name),
        }
    }

    if !roots.is_empty() {
        info!("All workspaces indexed: {total} files updated");
    }

    Ok(total)
}
