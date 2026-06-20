-- BrainOS Schema v1

CREATE TABLE IF NOT EXISTS captures (
    id              TEXT PRIMARY KEY,
    file_path       TEXT NOT NULL UNIQUE,
    file_hash       TEXT NOT NULL,
    title           TEXT NOT NULL,
    space           TEXT NOT NULL,
    type            TEXT NOT NULL,
    date            TEXT NOT NULL,
    confidence      TEXT,
    repo            TEXT,
    workspace       TEXT,
    session_tool    TEXT,
    body_text       TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capture_projects (
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    project         TEXT NOT NULL,
    PRIMARY KEY (capture_id, project)
);

CREATE TABLE IF NOT EXISTS capture_tags (
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    tag             TEXT NOT NULL,
    PRIMARY KEY (capture_id, tag)
);

CREATE TABLE IF NOT EXISTS capture_relations (
    source_id       TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    target_id       TEXT NOT NULL,
    PRIMARY KEY (source_id, target_id)
);

CREATE TABLE IF NOT EXISTS capture_files (
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    PRIMARY KEY (capture_id, file_name)
);

CREATE TABLE IF NOT EXISTS projects (
    name            TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    space           TEXT NOT NULL,
    description     TEXT
);

CREATE TABLE IF NOT EXISTS project_repos (
    project_name    TEXT NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
    repo            TEXT NOT NULL,
    PRIMARY KEY (project_name, repo)
);

CREATE TABLE IF NOT EXISTS graph_edges (
    source_id       TEXT NOT NULL,
    target_id       TEXT NOT NULL,
    edge_type       TEXT NOT NULL,
    weight          REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (source_id, target_id, edge_type)
);

CREATE TABLE IF NOT EXISTS sync_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL,
    direction       TEXT NOT NULL,
    status          TEXT NOT NULL,
    commits         INTEGER,
    files_added     INTEGER,
    files_modified  INTEGER,
    error_msg       TEXT,
    duration_ms     INTEGER
);

-- Full-text search (standalone table)
-- Indexes: id, title, body_text, tags, space, capture_type
-- NOTE: If upgrading from an older schema, the migration in db.rs auto-drops the old table.
CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
    id,
    title,
    summary,
    body_text,
    tags,
    space,
    capture_type,
    tokenize='porter unicode61'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_captures_space ON captures(space);
CREATE INDEX IF NOT EXISTS idx_captures_type ON captures(type);
CREATE INDEX IF NOT EXISTS idx_captures_date ON captures(date);
CREATE INDEX IF NOT EXISTS idx_capture_tags_tag ON capture_tags(tag);
CREATE INDEX IF NOT EXISTS idx_capture_projects_project ON capture_projects(project);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
