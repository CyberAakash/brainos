use anyhow::Result;
use rusqlite::params;
use std::path::Path;
use tracing::{info, warn};

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
