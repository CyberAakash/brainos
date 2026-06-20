-- Vector storage for semantic search (sqlite-vec)
-- Each capture gets a 384-dim float32 embedding (BGE-small-en-v1.5)
-- Cosine distance for semantic similarity
CREATE VIRTUAL TABLE IF NOT EXISTS capture_vectors USING vec0(
    capture_id TEXT PRIMARY KEY,
    embedding float[384] distance_metric=cosine
);
