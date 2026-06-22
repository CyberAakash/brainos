use std::collections::HashMap;
use anyhow::Result;
use chrono::{NaiveDate, Utc};
use tracing::warn;

use crate::embedding::Embedder;
use crate::models::*;
use crate::store::Store;

/// Reciprocal Rank Fusion constant.
/// Higher k = more weight to lower-ranked results (smoother blending).
/// Industry standard is 60, we use the configured value (default 30 for small corpora).
const DEFAULT_RRF_K: u32 = 30;

/// Hybrid search combining BM25 keyword + vector semantic via RRF.
/// Falls back to BM25-only if embedder is None.
/// `temporal_half_life` controls recency weighting (default 90 days).
pub fn search_hybrid(
    store: &Store,
    embedder: Option<&Embedder>,
    query: &str,
    limit: u32,
    rrf_k: Option<u32>,
    temporal_half_life: Option<u32>,
) -> Result<Vec<SearchResult>> {
    let half_life = temporal_half_life.unwrap_or(90);
    let k = rrf_k.unwrap_or(DEFAULT_RRF_K) as f64;
    let fetch_limit = limit * 3; // fetch more candidates for better RRF fusion

    // 1. BM25 keyword search (always available)
    let bm25_results = store.search_fts(query, fetch_limit)?;

    // 2. Vector semantic search (if embedder available)
    let vec_results = match embedder {
        Some(emb) => {
            match super::vector::search_vector(store, emb, query, fetch_limit) {
                Ok(results) => results,
                Err(e) => {
                    warn!("Vector search failed, using BM25-only: {e}");
                    Vec::new()
                }
            }
        }
        None => Vec::new(),
    };

    // 3. Entity search — extract entities from query, find captures sharing them
    let entity_results = entity_search(store, query, fetch_limit);

    // If no vector or entity results, fall back to pure BM25 path
    if vec_results.is_empty() && entity_results.is_empty() {
        let mut results = bm25_only(store, &bm25_results, query, limit, half_life)?;
        if !query.contains("include:expired") {
            results.retain(|r| {
                r.capture.status != CaptureStatus::Expired
                    && r.capture.status != CaptureStatus::Archived
            });
        }
        return Ok(results);
    }

    // 4. RRF fusion across all signals
    let mut fused_scores: HashMap<String, f64> = HashMap::new();

    // Add BM25 RRF scores (rank 0 = best match)
    for (rank, (id, _score)) in bm25_results.iter().enumerate() {
        let rrf_score = 1.0 / (k + rank as f64 + 1.0);
        *fused_scores.entry(id.clone()).or_default() += rrf_score;
    }

    // Add vector RRF scores
    for (rank, (id, _similarity)) in vec_results.iter().enumerate() {
        let rrf_score = 1.0 / (k + rank as f64 + 1.0);
        *fused_scores.entry(id.clone()).or_default() += rrf_score;
    }

    // Add entity RRF scores (weighted slightly lower — supplementary signal)
    for (rank, (id, _match_count)) in entity_results.iter().enumerate() {
        let rrf_score = 0.5 / (k + rank as f64 + 1.0);
        *fused_scores.entry(id.clone()).or_default() += rrf_score;
    }

    // 5. Sort by fused score descending
    let mut ranked: Vec<(String, f64)> = fused_scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    ranked.truncate(limit as usize);

    // 6. Hydrate results with temporal scoring
    let mut results = hydrate_results(store, &ranked, query, half_life)?;

    // 7. Filter out Expired/Archived unless user opts in with "include:expired"
    if !query.contains("include:expired") {
        results.retain(|r| {
            r.capture.status != CaptureStatus::Expired
                && r.capture.status != CaptureStatus::Archived
        });
    }

    Ok(results)
}

/// Compute recency score using exponential decay.
/// Returns 1.0 for today, 0.5 at half_life days ago, approaches 0 for very old.
fn temporal_score(capture_date: NaiveDate, now: NaiveDate, half_life_days: u32) -> f64 {
    let days_ago = (now - capture_date).num_days().max(0) as f64;
    0.5_f64.powf(days_ago / half_life_days.max(1) as f64)
}

/// Apply temporal weighting: 70% base relevance + 30% recency boost.
/// Old captures can still win if highly relevant.
fn apply_temporal(rrf_score: f64, t_score: f64) -> f64 {
    rrf_score * (0.7 + 0.3 * t_score)
}

/// Pure BM25 fallback — converts FTS results to SearchResults.
fn bm25_only(
    store: &Store,
    fts_results: &[(String, f64)],
    query: &str,
    limit: u32,
    half_life: u32,
) -> Result<Vec<SearchResult>> {
    let now = Utc::now().date_naive();
    let mut results = Vec::new();
    for (id, score) in fts_results.iter().take(limit as usize) {
        if let Some(capture) = store.get_capture(id)? {
            let t_score = temporal_score(capture.date, now, half_life);
            let raw = -score; // FTS5 rank is negative-lower-is-better
            let snippet = super::bm25::build_snippet_pub(&capture.body_text, query);
            results.push(SearchResult {
                capture: overview_from_capture(&capture),
                score: apply_temporal(raw, t_score),
                snippet,
                temporal_score: t_score,
                has_contradictions: false,
            });
        }
    }
    // Re-sort after temporal adjustment
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

/// Hydrate capture IDs + scores into full SearchResults with temporal weighting.
fn hydrate_results(
    store: &Store,
    ranked: &[(String, f64)],
    query: &str,
    half_life: u32,
) -> Result<Vec<SearchResult>> {
    let now = Utc::now().date_naive();
    // Pre-fetch IDs with contradictions for batch efficiency
    let contradicted_ids = store.capture_ids_with_contradictions().unwrap_or_default();
    let mut results = Vec::new();
    for (id, score) in ranked {
        if let Some(capture) = store.get_capture(id)? {
            let t_score = temporal_score(capture.date, now, half_life);
            let snippet = super::bm25::build_snippet_pub(&capture.body_text, query);
            results.push(SearchResult {
                has_contradictions: contradicted_ids.contains(id),
                capture: overview_from_capture(&capture),
                score: apply_temporal(*score, t_score),
                snippet,
                temporal_score: t_score,
            });
        }
    }
    // Re-sort after temporal adjustment
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

/// Extract entities from the query text and find captures sharing those entities.
/// Returns (capture_id, match_count) pairs.
fn entity_search(store: &Store, query: &str, limit: u32) -> Vec<(String, f64)> {
    // Build a minimal "pseudo-capture" to extract entities from the query
    let query_entities = extract_query_entities(query);
    if query_entities.is_empty() {
        return Vec::new();
    }

    match store.search_by_entities(&query_entities, limit) {
        Ok(results) => results,
        Err(e) => {
            warn!("Entity search failed: {e}");
            Vec::new()
        }
    }
}

/// Extract entity IDs from a search query using lightweight matching.
/// Simpler than full capture extraction — just match against known entities.
fn extract_query_entities(query: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let lower = query.to_lowercase();

    // Split query into terms and check each against entity normalization
    for term in lower.split_whitespace() {
        let clean = term.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_');
        if clean.len() >= 2 {
            ids.push(clean.to_string());
        }
    }

    // Also check backtick terms
    let mut rest = query;
    while let Some(start) = rest.find('`') {
        let after = &rest[start + 1..];
        if let Some(end) = after.find('`') {
            let term = after[..end].trim();
            if !term.is_empty() && term.len() >= 2 {
                ids.push(term.to_lowercase());
            }
            rest = &after[end + 1..];
        } else {
            break;
        }
    }

    ids.dedup();
    ids
}

fn overview_from_capture(c: &crate::models::Capture) -> CaptureOverview {
    CaptureOverview {
        id: c.id.clone(),
        title: c.title.clone(),
        summary: c.summary.clone(),
        space: c.space.clone(),
        capture_type: c.capture_type.clone(),
        status: c.status.clone(),
        date: c.date,
        tags: c.tags.clone(),
        projects: c.projects.clone(),
        color: c.color.clone(),
        icon: c.icon.clone(),
    }
}
