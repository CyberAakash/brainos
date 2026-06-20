use anyhow::Result;

use crate::embedding::Embedder;
use crate::store::Store;

/// Semantic vector search using sqlite-vec KNN.
/// Returns (capture_id, similarity_score) pairs, highest score first.
/// Similarity = 1.0 - cosine_distance (range 0..1, higher = more similar).
pub fn search_vector(
    store: &Store,
    embedder: &Embedder,
    query: &str,
    limit: u32,
) -> Result<Vec<(String, f64)>> {
    let query_vec = embedder.embed_query(query)?;
    let raw_results = store.search_vec(&query_vec, limit)?;

    // Convert cosine distance to similarity score
    let results: Vec<(String, f64)> = raw_results
        .into_iter()
        .map(|(id, distance)| {
            let similarity = (1.0 - distance).max(0.0);
            (id, similarity)
        })
        .collect();

    Ok(results)
}
