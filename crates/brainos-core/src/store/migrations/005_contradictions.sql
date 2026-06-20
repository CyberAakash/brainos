-- Phase 3C: Contradiction detection table
CREATE TABLE IF NOT EXISTS contradictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_a TEXT NOT NULL,
    capture_b TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    resolution TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (capture_a) REFERENCES captures(id) ON DELETE CASCADE,
    FOREIGN KEY (capture_b) REFERENCES captures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contradictions_entity ON contradictions(entity_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_unresolved ON contradictions(resolved_at) WHERE resolved_at IS NULL;
