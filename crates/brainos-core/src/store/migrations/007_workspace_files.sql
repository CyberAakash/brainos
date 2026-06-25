-- 007_workspace_files.sql
-- Separate workspace file metadata from captures.
-- Files are tracked by path/hash only — content is read on-demand from disk.

CREATE TABLE IF NOT EXISTS workspace_files (
    id              TEXT PRIMARY KEY,
    root_id         INTEGER NOT NULL,
    relative_path   TEXT NOT NULL,
    abs_path        TEXT NOT NULL,
    file_hash       TEXT NOT NULL,
    file_size       INTEGER NOT NULL DEFAULT 0,
    language        TEXT,
    modified_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(root_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_wf_root_id ON workspace_files(root_id);
CREATE INDEX IF NOT EXISTS idx_wf_language ON workspace_files(language);

-- Clean up old source captures that stored full file content.
-- They're replaced by the lightweight workspace_files table.
DELETE FROM captures_fts WHERE capture_type = 'source';
DELETE FROM captures WHERE type = 'source';
