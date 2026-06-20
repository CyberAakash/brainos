use anyhow::{Context, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::{info, warn};

use crate::models::Capture;

/// Vector dimension for BGE-small-en-v1.5
pub const EMBED_DIM: usize = 384;

/// Thread-safe wrapper around fastembed's TextEmbedding model.
/// Uses interior mutability because fastembed requires &mut self for embed().
pub struct Embedder {
    model: Mutex<fastembed::TextEmbedding>,
}

// Safety: fastembed::TextEmbedding is Send+Sync, Mutex provides safe mutation
unsafe impl Send for Embedder {}
unsafe impl Sync for Embedder {}

impl Embedder {
    /// Initialize the embedding model. Downloads on first use (~67MB for BGE-small).
    /// `cache_dir` is where ONNX model files are cached (e.g. $DATA_DIR/brainos/models).
    pub fn new(cache_dir: &PathBuf) -> Result<Self> {
        info!("Initializing embedding model (BGE-small-en-v1.5)...");
        std::fs::create_dir_all(cache_dir)?;

        let options = fastembed::TextInitOptions::new(fastembed::EmbeddingModel::BGESmallENV15)
            .with_cache_dir(cache_dir.clone())
            .with_show_download_progress(true);

        let model = fastembed::TextEmbedding::try_new(options)
            .context("Failed to initialize embedding model")?;

        info!("Embedding model ready (384-dim, BGE-small-en-v1.5)");
        Ok(Self {
            model: Mutex::new(model),
        })
    }

    /// Embed multiple document texts. Returns one 384-dim vector per input.
    pub fn embed_documents(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let mut model = self.model.lock().map_err(|e| anyhow::anyhow!("Lock poisoned: {e}"))?;
        let embeddings = model.embed(texts.to_vec(), None)
            .context("Embedding documents failed")?;
        Ok(embeddings)
    }

    /// Embed a single query string. Uses the same model but queries are typically
    /// shorter and should not include the "passage:" prefix.
    pub fn embed_query(&self, query: &str) -> Result<Vec<f32>> {
        let mut model = self.model.lock().map_err(|e| anyhow::anyhow!("Lock poisoned: {e}"))?;
        let embeddings = model.embed(vec![query], None)
            .context("Embedding query failed")?;
        embeddings.into_iter().next()
            .ok_or_else(|| anyhow::anyhow!("No embedding returned for query"))
    }
}

/// Build the text that gets embedded for a given capture.
/// Combines structured fields + body for a rich semantic representation.
pub fn capture_to_embed_text(capture: &Capture) -> String {
    let mut parts = Vec::with_capacity(4);

    // Title is the strongest signal
    parts.push(capture.title.clone());

    // Summary if available
    if let Some(ref summary) = capture.summary {
        if !summary.is_empty() {
            parts.push(summary.clone());
        }
    }

    // Tags as space-separated keywords
    if !capture.tags.is_empty() {
        parts.push(capture.tags.join(" "));
    }

    // Body text truncated to ~2000 chars (embedding models have limited context)
    let body_limit = 2000;
    if !capture.body_text.is_empty() {
        if capture.body_text.len() <= body_limit {
            parts.push(capture.body_text.clone());
        } else {
            // Snap to char boundary
            let end = capture.body_text.char_indices()
                .take_while(|(i, _)| *i < body_limit)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(body_limit);
            parts.push(capture.body_text[..end].to_string());
        }
    }

    parts.join("\n")
}

/// Try to create an Embedder, returning None on failure (graceful degradation).
pub fn try_init(cache_dir: &PathBuf) -> Option<Embedder> {
    match Embedder::new(cache_dir) {
        Ok(embedder) => Some(embedder),
        Err(e) => {
            warn!("Failed to initialize embedder (vector search disabled): {e}");
            None
        }
    }
}
