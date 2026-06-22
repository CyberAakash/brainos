use std::collections::HashSet;
use anyhow::Result;
use crate::store::Store;
use crate::models::*;

/// Hybrid search: FTS5 prefix matching + LIKE substring fallback.
/// FTS5 handles word-prefix matches ("rus" → "rust").
/// LIKE catches infix matches ("onnect" → "connection") that FTS5 misses.
pub fn search_bm25(store: &Store, query: &str, limit: u32) -> Result<Vec<SearchResult>> {
    let mut results = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // 1) FTS5 prefix search (ranked by BM25)
    let fts_results = store.search_fts(query, limit)?;
    for (id, score) in fts_results {
        if let Some(capture) = store.get_capture(&id)? {
            seen.insert(capture.id.clone());
            let snippet = build_snippet(&capture.body_text, query);
            results.push(SearchResult {
                capture: CaptureOverview {
                    id: capture.id,
                    title: capture.title,
                    summary: capture.summary,
                    space: capture.space,
                    capture_type: capture.capture_type,
                    status: capture.status,
                    date: capture.date,
                    tags: capture.tags,
                    projects: capture.projects,
                    color: capture.color,
                    icon: capture.icon,
                },
                score: -score, // FTS5 rank is negative (lower = better)
                snippet,
                temporal_score: 0.0,
                has_contradictions: false,
            });
        }
    }

    // 2) LIKE fallback for substring matches FTS5 missed
    let remaining = limit.saturating_sub(results.len() as u32);
    if remaining > 0 {
        let like_ids = store.search_like(query, remaining + seen.len() as u32)?;
        for id in like_ids {
            if seen.contains(&id) {
                continue;
            }
            if let Some(capture) = store.get_capture(&id)? {
                seen.insert(capture.id.clone());
                let snippet = build_snippet(&capture.body_text, query);
                results.push(SearchResult {
                    capture: CaptureOverview {
                        id: capture.id,
                        title: capture.title,
                        summary: capture.summary,
                        space: capture.space,
                        capture_type: capture.capture_type,
                        status: capture.status,
                        date: capture.date,
                        tags: capture.tags,
                        projects: capture.projects,
                        color: capture.color,
                        icon: capture.icon,
                    },
                    score: 0.0, // LIKE results have no BM25 score
                    snippet,
                    temporal_score: 0.0,
                    has_contradictions: false,
                });
            }
            if results.len() >= limit as usize {
                break;
            }
        }
    }

    Ok(results)
}

/// Build a snippet — public alias for use by hybrid search.
pub fn build_snippet_pub(body: &str, query: &str) -> String {
    build_snippet(body, query)
}

/// Build a snippet showing text around the first occurrence of the query.
fn build_snippet(body: &str, query: &str) -> String {
    let lower_body = body.to_lowercase();
    let lower_query = query.trim().to_lowercase();

    // Find first matching term
    let first_term = lower_query.split_whitespace().next().unwrap_or(&lower_query);
    if let Some(pos) = lower_body.find(first_term) {
        let start = snap_to_char_boundary(body, pos.saturating_sub(40), false);
        let end = snap_to_char_boundary(body, (pos + 160).min(body.len()), true);
        let mut snippet = body[start..end].to_string();
        if start > 0 {
            snippet = format!("…{}", snippet.trim_start());
        }
        if end < body.len() {
            snippet = format!("{}…", snippet.trim_end());
        }
        snippet
    } else {
        body.chars().take(200).collect()
    }
}

/// Snap a byte offset to the nearest valid char boundary.
fn snap_to_char_boundary(s: &str, mut pos: usize, forward: bool) -> usize {
    if pos >= s.len() {
        return s.len();
    }
    while !s.is_char_boundary(pos) {
        if forward { pos += 1; } else { pos = pos.saturating_sub(1); }
    }
    pos
}
