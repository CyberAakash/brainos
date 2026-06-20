-- Phase 2: Entity graph — extracted concepts linked to captures

CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,             -- normalized lowercase, e.g. "redis", "auth-service"
    display_name TEXT NOT NULL,      -- original casing, e.g. "Redis", "auth-service"
    entity_type TEXT NOT NULL,       -- person, project, technology, concept, error, file, url
    first_seen TEXT NOT NULL,        -- ISO date
    last_seen TEXT NOT NULL,         -- ISO date
    mention_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS capture_entities (
    capture_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    mention_type TEXT NOT NULL DEFAULT 'body',  -- frontmatter, body, title
    confidence REAL DEFAULT 1.0,               -- 1.0 for frontmatter, 0.5-0.9 for extracted
    PRIMARY KEY (capture_id, entity_id),
    FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_capture_entities_entity ON capture_entities(entity_id);
