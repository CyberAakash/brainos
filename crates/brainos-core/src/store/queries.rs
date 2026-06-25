use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use super::Store;
use crate::models::*;

impl Store {
    pub fn upsert_capture(&self, capture: &Capture) -> Result<()> {
        // Serialize nested structs to JSON for storage
        let git_json = capture.git_info.as_ref()
            .map(|g| serde_json::to_string(g).unwrap_or_default());
        let chain_refs_json = capture.chain.as_ref()
            .map(|c| serde_json::to_string(&c.refs).unwrap_or_default());
        let chain_prev = capture.chain.as_ref().and_then(|c| c.prev.clone());
        let links_json = if capture.links.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&capture.links).unwrap_or_default())
        };
        let project_name = capture.project_info.as_ref().map(|p| p.name.clone());
        let project_path = capture.project_info.as_ref().and_then(|p| p.path.clone());

        self.conn().execute(
            "INSERT INTO captures (id, file_path, file_hash, title, summary, space, type, status, date,
                confidence, repo, workspace, session_tool, body_text,
                project_name, project_path, git_json, chain_prev, chain_refs_json, links_json,
                color, icon, capture_mode, updated, session_ref)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)
             ON CONFLICT(id) DO UPDATE SET
                file_path=excluded.file_path, file_hash=excluded.file_hash, title=excluded.title,
                summary=excluded.summary, space=excluded.space, type=excluded.type, status=excluded.status,
                date=excluded.date, confidence=excluded.confidence,
                repo=excluded.repo, workspace=excluded.workspace, session_tool=excluded.session_tool,
                body_text=excluded.body_text, project_name=excluded.project_name,
                project_path=excluded.project_path, git_json=excluded.git_json,
                chain_prev=excluded.chain_prev, chain_refs_json=excluded.chain_refs_json,
                links_json=excluded.links_json, color=excluded.color, icon=excluded.icon,
                capture_mode=excluded.capture_mode, updated=excluded.updated, session_ref=excluded.session_ref,
                updated_at=datetime('now')",
            params![
                capture.id,                         // ?1
                capture.file_path,                  // ?2
                capture.file_hash,                  // ?3
                capture.title,                      // ?4
                capture.summary,                    // ?5
                capture.space.to_string(),          // ?6
                &capture.capture_type,              // ?7
                capture.status.to_string(),         // ?8
                capture.date.to_string(),           // ?9
                &capture.confidence,                // ?10
                capture.repo,                       // ?11
                capture.workspace,                  // ?12
                capture.session_tool,               // ?13
                capture.body_text,                  // ?14
                project_name,                       // ?15
                project_path,                       // ?16
                git_json,                           // ?17
                chain_prev,                         // ?18
                chain_refs_json,                    // ?19
                links_json,                         // ?20
                &capture.color,                     // ?21
                &capture.icon,                      // ?22
                &capture.capture_mode,              // ?23
                &capture.updated,                   // ?24
                &capture.session_ref,               // ?25
            ],
        )?;

        // Upsert tags
        self.conn().execute("DELETE FROM capture_tags WHERE capture_id = ?1", params![capture.id])?;
        for tag in &capture.tags {
            self.conn().execute(
                "INSERT INTO capture_tags (capture_id, tag) VALUES (?1, ?2)",
                params![capture.id, tag],
            )?;
        }

        // Upsert projects (legacy junction table — also populate from project_info.name)
        self.conn().execute("DELETE FROM capture_projects WHERE capture_id = ?1", params![capture.id])?;
        let mut project_set: Vec<String> = capture.projects.clone();
        if let Some(ref pi) = capture.project_info {
            if !project_set.contains(&pi.name) {
                project_set.push(pi.name.clone());
            }
        }
        for project in &project_set {
            self.conn().execute(
                "INSERT INTO capture_projects (capture_id, project) VALUES (?1, ?2)",
                params![capture.id, project],
            )?;
        }

        // Upsert relations (legacy + chain.refs)
        self.conn().execute("DELETE FROM capture_relations WHERE source_id = ?1", params![capture.id])?;
        for related in &capture.related {
            self.conn().execute(
                "INSERT OR IGNORE INTO capture_relations (source_id, target_id) VALUES (?1, ?2)",
                params![capture.id, related],
            )?;
        }
        if let Some(ref chain) = capture.chain {
            for ref_id in &chain.refs {
                self.conn().execute(
                    "INSERT OR IGNORE INTO capture_relations (source_id, target_id) VALUES (?1, ?2)",
                    params![capture.id, ref_id],
                )?;
            }
        }

        // Upsert files
        self.conn().execute("DELETE FROM capture_files WHERE capture_id = ?1", params![capture.id])?;
        for file in &capture.files {
            self.conn().execute(
                "INSERT INTO capture_files (capture_id, file_name) VALUES (?1, ?2)",
                params![capture.id, file],
            )?;
        }

        // Update FTS5 index (standalone table — direct insert/delete)
        let tags_str = capture.tags.join(" ");
        let space_str = capture.space.to_string();
        let summary_str = capture.summary.as_deref().unwrap_or("");
        self.conn().execute(
            "DELETE FROM captures_fts WHERE id = ?1",
            params![capture.id],
        ).ok(); // ignore if no previous entry
        self.conn().execute(
            "INSERT INTO captures_fts(id, title, summary, body_text, tags, space, capture_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![capture.id, capture.title, summary_str, capture.body_text, tags_str, space_str, capture.capture_type],
        )?;

        Ok(())
    }

    pub fn delete_capture(&self, id: &str) -> Result<bool> {
        self.conn().execute("DELETE FROM captures_fts WHERE id = ?1", params![id]).ok();
        self.conn().execute("DELETE FROM capture_vectors WHERE capture_id = ?1", params![id]).ok();
        let rows = self.conn().execute("DELETE FROM captures WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    pub fn get_capture(&self, id: &str) -> Result<Option<Capture>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, file_path, file_hash, title, summary, space, type, status, date,
                    confidence, repo, workspace, session_tool, body_text,
                    project_name, project_path, git_json, chain_prev, chain_refs_json, links_json,
                    color, icon, capture_mode, updated, session_ref
             FROM captures WHERE id = ?1"
        )?;

        let capture = stmt.query_row(params![id], |row| {
            Ok(CaptureRow {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                summary: row.get(4)?,
                space: row.get(5)?,
                capture_type: row.get(6)?,
                status: row.get(7)?,
                date: row.get(8)?,
                confidence: row.get(9)?,
                repo: row.get(10)?,
                workspace: row.get(11)?,
                session_tool: row.get(12)?,
                body_text: row.get(13)?,
                project_name: row.get(14)?,
                project_path: row.get(15)?,
                git_json: row.get(16)?,
                chain_prev: row.get(17)?,
                chain_refs_json: row.get(18)?,
                links_json: row.get(19)?,
                color: row.get(20)?,
                icon: row.get(21)?,
                capture_mode: row.get(22)?,
                updated: row.get(23)?,
                session_ref: row.get(24)?,
            })
        }).optional()?;

        match capture {
            Some(row) => {
                let tags = self.get_tags(&row.id)?;
                let projects = self.get_projects(&row.id)?;
                let related = self.get_related(&row.id)?;
                let files = self.get_files(&row.id)?;

                let project_info = row.project_name.map(|name| ProjectInfo {
                    name,
                    path: row.project_path,
                });
                let git_info: Option<GitInfo> = row.git_json
                    .and_then(|json| serde_json::from_str(&json).ok());
                let chain = {
                    let refs: Vec<String> = row.chain_refs_json
                        .and_then(|json| serde_json::from_str(&json).ok())
                        .unwrap_or_default();
                    if row.chain_prev.is_some() || !refs.is_empty() {
                        Some(Chain { prev: row.chain_prev, refs })
                    } else {
                        None
                    }
                };
                let links: Vec<Link> = row.links_json
                    .and_then(|json| serde_json::from_str(&json).ok())
                    .unwrap_or_default();

                let status = match row.status.as_deref() {
                    Some("resolved") => CaptureStatus::Resolved,
                    Some("archived") => CaptureStatus::Archived,
                    _ => CaptureStatus::Active,
                };

                Ok(Some(Capture {
                    id: row.id,
                    file_path: row.file_path,
                    file_hash: row.file_hash,
                    title: row.title,
                    summary: row.summary,
                    space: serde_json::from_str(&format!("\"{}\"", row.space)).unwrap_or(Space::Work),
                    capture_type: row.capture_type,
                    status,
                    date: row.date.parse().unwrap_or(chrono::NaiveDate::MIN),
                    confidence: row.confidence,
                    repo: row.repo,
                    workspace: row.workspace,
                    session_tool: row.session_tool,
                    tags,
                    projects,
                    related,
                    files,
                    project_info,
                    git_info,
                    chain,
                    links,
                    body_text: row.body_text,
                    color: row.color,
                    icon: row.icon,
                    capture_mode: row.capture_mode,
                    updated: row.updated,
                    session_ref: row.session_ref,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn list_captures(&self, filters: &CaptureFilters, limit: u32, offset: u32) -> Result<Vec<CaptureOverview>> {
        let mut sql = String::from(
            "SELECT c.id, c.file_path, c.title, c.summary, c.space, c.type, c.status, c.date, c.color, c.icon, SUBSTR(c.body_text, 1, 200) FROM captures c WHERE 1=1"
        );
        let mut bind_values: Vec<String> = Vec::new();

        // By default, exclude workspace source captures from the KB list.
        // Note: source captures no longer exist in the captures table (migrated to workspace_files).
        // This filter is kept as a safety net for any legacy data.

        if let Some(ref space) = filters.space {
            bind_values.push(space.to_string());
            sql.push_str(&format!(" AND c.space = ?{}", bind_values.len()));
        }
        if let Some(ref ct) = filters.capture_type {
            bind_values.push(ct.to_string());
            sql.push_str(&format!(" AND c.type = ?{}", bind_values.len()));
        }
        if let Some(ref project) = filters.project {
            bind_values.push(project.clone());
            sql.push_str(&format!(
                " AND (c.project_name = ?{0} OR c.id IN (SELECT capture_id FROM capture_projects WHERE project = ?{0}))",
                bind_values.len()
            ));
        }

        // Status filter: default to active-only unless include_archived is set
        if filters.include_archived == Some(true) {
            // show all — no status filter
        } else if let Some(ref status) = filters.status {
            bind_values.push(status.to_string());
            sql.push_str(&format!(" AND c.status = ?{}", bind_values.len()));
        } else {
            // Default: exclude archived
            sql.push_str(" AND (c.status IS NULL OR c.status != 'archived')");
        }

        sql.push_str(" ORDER BY c.date DESC, c.id DESC");
        sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

        let mut stmt = self.conn().prepare(&sql)?;
        let params: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();

        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok(CaptureOverviewRow {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
                space: row.get(4)?,
                capture_type: row.get(5)?,
                status: row.get(6)?,
                date: row.get(7)?,
                color: row.get(8)?,
                icon: row.get(9)?,
                body_preview: row.get(10)?,
            })
        })?;

        let mut captures = Vec::new();
        for row in rows {
            let row = row?;
            let tags = self.get_tags(&row.id)?;
            let projects = self.get_projects(&row.id)?;
            let status = match row.status.as_deref() {
                Some("resolved") => CaptureStatus::Resolved,
                Some("archived") => CaptureStatus::Archived,
                _ => CaptureStatus::Active,
            };
            captures.push(CaptureOverview {
                id: row.id,
                file_path: row.file_path,
                title: row.title,
                summary: row.summary,
                space: serde_json::from_str(&format!("\"{}\"", row.space)).unwrap_or(Space::Work),
                capture_type: row.capture_type,
                status,
                date: row.date.parse().unwrap_or(chrono::NaiveDate::MIN),
                tags,
                projects,
                color: row.color,
                icon: row.icon,
                body_preview: row.body_preview,
            });
        }
        Ok(captures)
    }

    /// Archive a capture (set status to 'archived').
    pub fn archive_capture(&self, id: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE captures SET status = 'archived' WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Unarchive a capture (set status back to 'active').
    pub fn unarchive_capture(&self, id: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE captures SET status = 'active' WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Find the latest capture for a given project name (for auto-chaining)
    pub fn latest_capture_in_project(&self, project_name: &str) -> Result<Option<String>> {
        let mut stmt = self.conn().prepare(
            "SELECT id FROM captures WHERE project_name = ?1 ORDER BY date DESC, id DESC LIMIT 1"
        )?;
        let result = stmt.query_row(params![project_name], |row| {
            row.get::<_, String>(0)
        }).optional()?;
        Ok(result)
    }

    /// FTS5 prefix search: appends * to each term so "rus" matches "rust".
    /// Sanitizes input to strip FTS5 metacharacters that would cause syntax errors.
    pub fn search_fts(&self, query: &str, limit: u32) -> Result<Vec<(String, f64)>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        // Sanitize: keep only alphanumeric, whitespace, and basic punctuation safe for FTS5.
        // Strip characters that FTS5 interprets as syntax: ' " ( ) + - * ^ : { } NEAR AND OR NOT
        let sanitized: String = trimmed
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '_' {
                    c
                } else if c.is_whitespace() {
                    ' '
                } else {
                    ' ' // replace special chars with space
                }
            })
            .collect();

        // Build prefix query: each word gets a trailing * for prefix matching
        // e.g. "rus tai" → "rus* tai*"
        let terms: Vec<String> = sanitized
            .split_whitespace()
            .filter(|w| !w.is_empty())
            .map(|w| format!("{}*", w))
            .collect();

        if terms.is_empty() {
            return Ok(Vec::new());
        }

        let prefix_query = terms.join(" ");

        let mut stmt = self.conn().prepare(
            "SELECT id, rank FROM captures_fts WHERE captures_fts MATCH ?1 ORDER BY rank LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![prefix_query, limit], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// LIKE-based substring search across all fields. Catches matches FTS5 prefix can't
    /// (e.g. "onnect" matching "connection" — infix, not prefix).
    pub fn search_like(&self, query: &str, limit: u32) -> Result<Vec<String>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let pattern = format!("%{}%", trimmed);
        let mut stmt = self.conn().prepare(
            "SELECT DISTINCT c.id FROM captures c
             LEFT JOIN capture_tags ct ON ct.capture_id = c.id
             WHERE c.title LIKE ?1
                OR c.summary LIKE ?1
                OR c.body_text LIKE ?1
                OR c.type LIKE ?1
                OR c.space LIKE ?1
                OR ct.tag LIKE ?1
             ORDER BY c.date DESC
             LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![pattern, limit], |row| {
            row.get::<_, String>(0)
        })?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── Vector embedding operations ─────────────────────────────

    /// Insert or update a vector embedding for a capture.
    pub fn upsert_embedding(&self, capture_id: &str, embedding: &[f32]) -> Result<()> {
        use zerocopy::AsBytes;
        // Delete existing entry first (vec0 doesn't support ON CONFLICT)
        self.conn().execute(
            "DELETE FROM capture_vectors WHERE capture_id = ?1",
            params![capture_id],
        ).ok();
        self.conn().execute(
            "INSERT INTO capture_vectors(capture_id, embedding) VALUES (?1, ?2)",
            params![capture_id, embedding.as_bytes()],
        )?;
        Ok(())
    }

    /// Delete the vector embedding for a capture.
    pub fn delete_embedding(&self, capture_id: &str) -> Result<()> {
        self.conn().execute(
            "DELETE FROM capture_vectors WHERE capture_id = ?1",
            params![capture_id],
        )?;
        Ok(())
    }

    /// Check if a capture has a vector embedding.
    pub fn has_embedding(&self, capture_id: &str) -> bool {
        self.conn().query_row(
            "SELECT COUNT(*) FROM capture_vectors WHERE capture_id = ?1",
            params![capture_id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c > 0).unwrap_or(false)
    }

    /// KNN vector search — returns (capture_id, cosine_distance) pairs.
    /// Lower distance = more similar (cosine distance = 1 - cosine_similarity).
    pub fn search_vec(&self, query_vec: &[f32], limit: u32) -> Result<Vec<(String, f64)>> {
        use zerocopy::AsBytes;
        let mut stmt = self.conn().prepare(
            "SELECT capture_id, distance
             FROM capture_vectors
             WHERE embedding MATCH ?1
             ORDER BY distance
             LIMIT ?2"
        )?;
        let rows = stmt.query_map(
            rusqlite::params![query_vec.as_bytes(), limit],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
        )?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    fn get_tags(&self, capture_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn().prepare("SELECT tag FROM capture_tags WHERE capture_id = ?1")?;
        let rows = stmt.query_map(params![capture_id], |row| row.get(0))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn get_projects(&self, capture_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn().prepare("SELECT project FROM capture_projects WHERE capture_id = ?1")?;
        let rows = stmt.query_map(params![capture_id], |row| row.get(0))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn get_related(&self, capture_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn().prepare("SELECT target_id FROM capture_relations WHERE source_id = ?1")?;
        let rows = stmt.query_map(params![capture_id], |row| row.get(0))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn get_files(&self, capture_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn().prepare("SELECT file_name FROM capture_files WHERE capture_id = ?1")?;
        let rows = stmt.query_map(params![capture_id], |row| row.get(0))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }
}

// Internal row types for mapping

struct CaptureRow {
    id: String,
    file_path: String,
    file_hash: String,
    title: String,
    summary: Option<String>,
    space: String,
    capture_type: String,
    status: Option<String>,
    date: String,
    confidence: Option<String>,
    repo: Option<String>,
    workspace: Option<String>,
    session_tool: Option<String>,
    body_text: String,
    project_name: Option<String>,
    project_path: Option<String>,
    git_json: Option<String>,
    chain_prev: Option<String>,
    chain_refs_json: Option<String>,
    links_json: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    capture_mode: Option<String>,
    updated: Option<String>,
    session_ref: Option<String>,
}

struct CaptureOverviewRow {
    id: String,
    file_path: String,
    title: String,
    summary: Option<String>,
    space: String,
    capture_type: String,
    status: Option<String>,
    date: String,
    color: Option<String>,
    icon: Option<String>,
    body_preview: Option<String>,
}

// ── Workspace Root operations ────────────────────────────────

/// A registered workspace root stored in the DB.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RootRow {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub kind: String,
}

/// Stats for a single root.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RootStats {
    pub root_id: i64,
    pub file_count: u32,
}

impl Store {
    /// Register a new workspace root, or return the existing one if the path
    /// is already registered. Updates the name on conflict.
    pub fn add_root(&self, path: &str, name: &str, kind: &str) -> Result<i64> {
        self.conn().execute(
            "INSERT INTO roots (path, name, kind) VALUES (?1, ?2, ?3)
             ON CONFLICT(path) DO UPDATE SET name = excluded.name",
            params![path, name, kind],
        )?;
        // last_insert_rowid returns the rowid whether it was an insert or an
        // on-conflict update, but only if the row was actually modified.
        // To be safe, always SELECT back.
        let id: i64 = self.conn().query_row(
            "SELECT id FROM roots WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )?;
        Ok(id)
    }

    /// Remove a workspace root and all its indexed file metadata.
    pub fn remove_root(&self, root_id: i64) -> Result<()> {
        // Guard: never allow deleting the KB pseudo-root (id=0)
        if root_id == 0 {
            anyhow::bail!("Cannot remove the knowledge base root (id=0)");
        }
        // Delete workspace file metadata for this root
        self.conn().execute("DELETE FROM workspace_files WHERE root_id = ?1", params![root_id])?;
        // Also clean up any legacy source captures that might remain
        let ids: Vec<String> = {
            let mut stmt = self.conn().prepare(
                "SELECT id FROM captures WHERE root_id = ?1"
            )?;
            let rows = stmt.query_map(params![root_id], |row| row.get::<_, String>(0))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        for id in &ids {
            self.conn().execute("DELETE FROM captures_fts WHERE id = ?1", params![id]).ok();
            self.conn().execute("DELETE FROM capture_vectors WHERE capture_id = ?1", params![id]).ok();
        }
        self.conn().execute("DELETE FROM captures WHERE root_id = ?1", params![root_id])?;
        self.conn().execute("DELETE FROM roots WHERE id = ?1", params![root_id])?;
        Ok(())
    }

    /// List all registered roots.
    pub fn list_roots(&self) -> Result<Vec<RootRow>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, path, name, kind FROM roots ORDER BY id"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(RootRow {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                kind: row.get(3)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Get a root by ID.
    pub fn get_root(&self, root_id: i64) -> Result<Option<RootRow>> {
        let result = self.conn().query_row(
            "SELECT id, path, name, kind FROM roots WHERE id = ?1",
            params![root_id],
            |row| Ok(RootRow {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                kind: row.get(3)?,
            }),
        ).optional()?;
        Ok(result)
    }

    /// Get a root by path.
    pub fn get_root_by_path(&self, path: &str) -> Result<Option<RootRow>> {
        let result = self.conn().query_row(
            "SELECT id, path, name, kind FROM roots WHERE path = ?1",
            params![path],
            |row| Ok(RootRow {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                kind: row.get(3)?,
            }),
        ).optional()?;
        Ok(result)
    }

    /// Count indexed files for a given root (from workspace_files table).
    pub fn root_file_count(&self, root_id: i64) -> Result<u32> {
        let count: u32 = self.conn().query_row(
            "SELECT COUNT(*) FROM workspace_files WHERE root_id = ?1",
            params![root_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    // ── Workspace files (metadata-only) ─────────────────────────

    /// Check if a workspace file exists with the same hash.
    pub fn has_workspace_file(&self, id: &str, file_hash: &str) -> bool {
        self.conn().query_row(
            "SELECT file_hash FROM workspace_files WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        ).map(|h| h == file_hash).unwrap_or(false)
    }

    /// Upsert a workspace file's metadata (no content stored).
    pub fn upsert_workspace_file(
        &self,
        id: &str,
        root_id: i64,
        relative_path: &str,
        abs_path: &str,
        file_hash: &str,
        file_size: i64,
        language: &str,
        modified_at: Option<&str>,
    ) -> Result<()> {
        self.conn().execute(
            "INSERT INTO workspace_files (id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                relative_path=excluded.relative_path,
                abs_path=excluded.abs_path,
                file_hash=excluded.file_hash,
                file_size=excluded.file_size,
                language=excluded.language,
                modified_at=excluded.modified_at,
                updated_at=datetime('now')",
            params![id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at],
        )?;
        Ok(())
    }

    /// Prune workspace files that were deleted from disk.
    pub fn prune_stale_workspace_files(&self, root_id: i64, current_ids: &std::collections::HashSet<String>) -> Result<u32> {
        let mut stmt = self.conn().prepare(
            "SELECT id FROM workspace_files WHERE root_id = ?1"
        )?;
        let rows = stmt.query_map(params![root_id], |row| row.get::<_, String>(0))?;
        let db_ids: Vec<String> = rows.filter_map(|r| r.ok()).collect();

        let mut pruned = 0u32;
        for id in db_ids {
            if !current_ids.contains(&id) {
                self.conn().execute("DELETE FROM workspace_files WHERE id = ?1", params![id])?;
                pruned += 1;
            }
        }
        Ok(pruned)
    }

    /// List workspace files for a given root.
    pub fn list_workspace_files(&self, root_id: i64) -> Result<Vec<WorkspaceFileRow>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at
             FROM workspace_files WHERE root_id = ?1
             ORDER BY relative_path ASC"
        )?;
        let rows = stmt.query_map(params![root_id], |row| {
            Ok(WorkspaceFileRow {
                id: row.get(0)?,
                root_id: row.get(1)?,
                relative_path: row.get(2)?,
                abs_path: row.get(3)?,
                file_hash: row.get(4)?,
                file_size: row.get(5)?,
                language: row.get(6)?,
                modified_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Read a workspace file's content from disk on-demand.
    /// This is the key function: content lives on disk, NOT in the database.
    pub fn read_workspace_file_content(abs_path: &str) -> Result<String> {
        let content = std::fs::read_to_string(abs_path)
            .map_err(|e| anyhow::anyhow!("Cannot read file {}: {e}", abs_path))?;
        Ok(content)
    }

    /// Find workspace files matching a path fragment.
    /// Tries exact match on abs_path first, then suffix/contains match on relative_path.
    /// Returns at most 3 matches to avoid flooding context with many files.
    pub fn find_workspace_file_by_path(&self, path_fragment: &str) -> Result<Vec<WorkspaceFileRow>> {
        // 1. Exact match on abs_path
        let mut stmt = self.conn().prepare(
            "SELECT id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at
             FROM workspace_files WHERE abs_path = ?1 LIMIT 1"
        )?;
        let exact: Vec<WorkspaceFileRow> = stmt.query_map(params![path_fragment], |row| {
            Ok(WorkspaceFileRow {
                id: row.get(0)?,
                root_id: row.get(1)?,
                relative_path: row.get(2)?,
                abs_path: row.get(3)?,
                file_hash: row.get(4)?,
                file_size: row.get(5)?,
                language: row.get(6)?,
                modified_at: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        if !exact.is_empty() {
            return Ok(exact);
        }

        // 2. Suffix match — relative_path ends with the fragment (or contains it)
        let frag_lower = path_fragment.to_lowercase();
        let like_pattern = format!("%{}", frag_lower);
        let mut stmt2 = self.conn().prepare(
            "SELECT id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at
             FROM workspace_files WHERE LOWER(relative_path) LIKE ?1
             ORDER BY LENGTH(relative_path) ASC
             LIMIT 3"
        )?;
        let suffix: Vec<WorkspaceFileRow> = stmt2.query_map(params![like_pattern], |row| {
            Ok(WorkspaceFileRow {
                id: row.get(0)?,
                root_id: row.get(1)?,
                relative_path: row.get(2)?,
                abs_path: row.get(3)?,
                file_hash: row.get(4)?,
                file_size: row.get(5)?,
                language: row.get(6)?,
                modified_at: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        if !suffix.is_empty() {
            return Ok(suffix);
        }

        // 3. Contains match — fragment appears anywhere in relative_path
        let contains_pattern = format!("%{}%", frag_lower);
        let mut stmt3 = self.conn().prepare(
            "SELECT id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at
             FROM workspace_files WHERE LOWER(relative_path) LIKE ?1
             ORDER BY LENGTH(relative_path) ASC
             LIMIT 3"
        )?;
        let contains: Vec<WorkspaceFileRow> = stmt3.query_map(params![contains_pattern], |row| {
            Ok(WorkspaceFileRow {
                id: row.get(0)?,
                root_id: row.get(1)?,
                relative_path: row.get(2)?,
                abs_path: row.get(3)?,
                file_hash: row.get(4)?,
                file_size: row.get(5)?,
                language: row.get(6)?,
                modified_at: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(contains)
    }

    /// Search workspace files by keywords matched against relative_path.
    /// Splits the query into tokens and returns files whose path contains ANY token.
    /// Results are ranked: files matching more tokens come first.
    pub fn search_workspace_files(&self, query: &str, limit: u32) -> Result<Vec<WorkspaceFileRow>> {
        let tokens: Vec<&str> = query.split_whitespace()
            .filter(|t| t.len() >= 2)
            .collect();
        if tokens.is_empty() {
            return Ok(vec![]);
        }

        // Build a query that counts how many tokens match each file's path
        // Each token is matched case-insensitively against relative_path
        let mut conditions = Vec::new();
        let mut bind_values: Vec<String> = Vec::new();
        for token in &tokens {
            bind_values.push(format!("%{}%", token.to_lowercase()));
            let idx = bind_values.len();
            conditions.push(format!("(LOWER(relative_path) LIKE ?{idx})"));
        }

        let where_clause = conditions.join(" OR ");
        // Score = number of matching tokens (for ranking)
        let score_expr: Vec<String> = (1..=bind_values.len())
            .map(|i| format!("(CASE WHEN LOWER(relative_path) LIKE ?{i} THEN 1 ELSE 0 END)"))
            .collect();
        let score_sql = score_expr.join(" + ");

        let sql = format!(
            "SELECT id, root_id, relative_path, abs_path, file_hash, file_size, language, modified_at, ({score_sql}) AS score \
             FROM workspace_files \
             WHERE {where_clause} \
             ORDER BY score DESC, LENGTH(relative_path) ASC \
             LIMIT ?{}",
            bind_values.len() + 1
        );

        let mut stmt = self.conn().prepare(&sql)?;
        bind_values.push(limit.to_string());

        // Build params dynamically
        let params: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter()
            .map(|v| v as &dyn rusqlite::types::ToSql)
            .collect();

        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok(WorkspaceFileRow {
                id: row.get(0)?,
                root_id: row.get(1)?,
                relative_path: row.get(2)?,
                abs_path: row.get(3)?,
                file_hash: row.get(4)?,
                file_size: row.get(5)?,
                language: row.get(6)?,
                modified_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Delete all workspace files for a root (used when removing a root).
    pub fn delete_workspace_files_for_root(&self, root_id: i64) -> Result<u32> {
        let deleted = self.conn().execute(
            "DELETE FROM workspace_files WHERE root_id = ?1",
            params![root_id],
        )?;
        Ok(deleted as u32)
    }
}

/// Row returned from workspace_files queries.
#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkspaceFileRow {
    pub id: String,
    pub root_id: i64,
    pub relative_path: String,
    pub abs_path: String,
    pub file_hash: String,
    pub file_size: i64,
    pub language: Option<String>,
    pub modified_at: Option<String>,
}
