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
                color, icon)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
             ON CONFLICT(id) DO UPDATE SET
                file_path=excluded.file_path, file_hash=excluded.file_hash, title=excluded.title,
                summary=excluded.summary, space=excluded.space, type=excluded.type, status=excluded.status,
                date=excluded.date, confidence=excluded.confidence,
                repo=excluded.repo, workspace=excluded.workspace, session_tool=excluded.session_tool,
                body_text=excluded.body_text, project_name=excluded.project_name,
                project_path=excluded.project_path, git_json=excluded.git_json,
                chain_prev=excluded.chain_prev, chain_refs_json=excluded.chain_refs_json,
                links_json=excluded.links_json, color=excluded.color, icon=excluded.icon,
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
                    color, icon
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
                    Some("active") => CaptureStatus::Active,
                    Some("resolved") => CaptureStatus::Resolved,
                    Some("archived") => CaptureStatus::Archived,
                    Some("expired") => CaptureStatus::Expired,
                    _ => CaptureStatus::Draft,
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
                }))
            }
            None => Ok(None),
        }
    }

    pub fn list_captures(&self, filters: &CaptureFilters, limit: u32, offset: u32) -> Result<Vec<CaptureOverview>> {
        let mut sql = String::from(
            "SELECT c.id, c.title, c.summary, c.space, c.type, c.status, c.date, c.color, c.icon FROM captures c WHERE 1=1"
        );
        let mut bind_values: Vec<String> = Vec::new();

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

        sql.push_str(" ORDER BY c.date DESC, c.id DESC");
        sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

        let mut stmt = self.conn().prepare(&sql)?;
        let params: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();

        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok(CaptureOverviewRow {
                id: row.get(0)?,
                title: row.get(1)?,
                summary: row.get(2)?,
                space: row.get(3)?,
                capture_type: row.get(4)?,
                status: row.get(5)?,
                date: row.get(6)?,
                color: row.get(7)?,
                icon: row.get(8)?,
            })
        })?;

        let mut captures = Vec::new();
        for row in rows {
            let row = row?;
            let tags = self.get_tags(&row.id)?;
            let projects = self.get_projects(&row.id)?;
            let status = match row.status.as_deref() {
                Some("active") => CaptureStatus::Active,
                Some("resolved") => CaptureStatus::Resolved,
                _ => CaptureStatus::Draft,
            };
            captures.push(CaptureOverview {
                id: row.id,
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
            });
        }
        Ok(captures)
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
                if c.is_alphanumeric() || c == '_' || c == '.' || c == '@' || c == '#' {
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
}

struct CaptureOverviewRow {
    id: String,
    title: String,
    summary: Option<String>,
    space: String,
    capture_type: String,
    status: Option<String>,
    date: String,
    color: Option<String>,
    icon: Option<String>,
}
