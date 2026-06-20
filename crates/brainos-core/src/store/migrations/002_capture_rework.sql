-- BrainOS Schema v2 — Capture format rework
-- Adds: summary, status, project_info, git_info, chain, links

ALTER TABLE captures ADD COLUMN summary TEXT;
ALTER TABLE captures ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE captures ADD COLUMN project_name TEXT;
ALTER TABLE captures ADD COLUMN project_path TEXT;
ALTER TABLE captures ADD COLUMN git_json TEXT;
ALTER TABLE captures ADD COLUMN chain_prev TEXT;
ALTER TABLE captures ADD COLUMN chain_refs_json TEXT;
ALTER TABLE captures ADD COLUMN links_json TEXT;

-- Index for chain traversal and project-based queries
CREATE INDEX IF NOT EXISTS idx_captures_project_name ON captures(project_name);
CREATE INDEX IF NOT EXISTS idx_captures_chain_prev ON captures(chain_prev);
CREATE INDEX IF NOT EXISTS idx_captures_status ON captures(status);
