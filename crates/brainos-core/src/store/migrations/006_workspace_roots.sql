-- 006_workspace_roots.sql
-- Multi-root workspace support: register workspace directories for cross-project context.

CREATE TABLE IF NOT EXISTS roots (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    path  TEXT    NOT NULL UNIQUE,
    name  TEXT    NOT NULL,
    kind  TEXT    NOT NULL DEFAULT 'workspace'  -- 'kb' | 'workspace'
);

-- Seed root 0 for the legacy knowledge-base captures.
-- Path is empty because kb_root is managed by config, not this table.
INSERT OR IGNORE INTO roots (id, path, name, kind) VALUES (0, '', 'Knowledge Base', 'kb');
