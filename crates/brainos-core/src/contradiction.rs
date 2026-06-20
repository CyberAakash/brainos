//! Contradiction detection — finds conflicting information across captures.
//!
//! Phase 3C: Entity-based contradiction detection. Opt-in, not automatic.
//! User triggers it per-entity or via settings.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::store::Store;

/// A detected contradiction between two captures about the same entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contradiction {
    pub id: i64,
    /// Older capture ID.
    pub capture_a: String,
    /// Newer capture ID.
    pub capture_b: String,
    /// The entity they conflict on.
    pub entity_id: String,
    /// Description of the conflict.
    pub summary: String,
    /// User's resolution (if resolved).
    pub resolution: Option<String>,
    /// When detected.
    pub detected_at: String,
    /// When resolved.
    pub resolved_at: Option<String>,
}

// ── Store queries for contradictions ───────────────────────────

impl Store {
    /// Insert a new contradiction.
    pub fn insert_contradiction(
        &self,
        capture_a: &str,
        capture_b: &str,
        entity_id: &str,
        summary: &str,
    ) -> Result<i64> {
        self.conn().execute(
            "INSERT INTO contradictions (capture_a, capture_b, entity_id, summary)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![capture_a, capture_b, entity_id, summary],
        )?;
        Ok(self.conn().last_insert_rowid())
    }

    /// Get all unresolved contradictions.
    pub fn get_unresolved_contradictions(&self) -> Result<Vec<Contradiction>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, capture_a, capture_b, entity_id, summary, resolution, detected_at, resolved_at
             FROM contradictions
             WHERE resolved_at IS NULL
             ORDER BY detected_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Contradiction {
                id: row.get(0)?,
                capture_a: row.get(1)?,
                capture_b: row.get(2)?,
                entity_id: row.get(3)?,
                summary: row.get(4)?,
                resolution: row.get(5)?,
                detected_at: row.get(6)?,
                resolved_at: row.get(7)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Get contradictions for a specific entity.
    pub fn get_contradictions_for_entity(&self, entity_id: &str) -> Result<Vec<Contradiction>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, capture_a, capture_b, entity_id, summary, resolution, detected_at, resolved_at
             FROM contradictions
             WHERE entity_id = ?1
             ORDER BY detected_at DESC"
        )?;
        let rows = stmt.query_map(rusqlite::params![entity_id], |row| {
            Ok(Contradiction {
                id: row.get(0)?,
                capture_a: row.get(1)?,
                capture_b: row.get(2)?,
                entity_id: row.get(3)?,
                summary: row.get(4)?,
                resolution: row.get(5)?,
                detected_at: row.get(6)?,
                resolved_at: row.get(7)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Check if a capture has any unresolved contradictions.
    pub fn has_unresolved_contradictions(&self, capture_id: &str) -> Result<bool> {
        let count: u32 = self.conn().query_row(
            "SELECT COUNT(*) FROM contradictions
             WHERE (capture_a = ?1 OR capture_b = ?1)
               AND resolved_at IS NULL",
            rusqlite::params![capture_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Resolve a contradiction with a user-provided resolution.
    pub fn resolve_contradiction(&self, id: i64, resolution: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE contradictions
             SET resolution = ?1, resolved_at = datetime('now')
             WHERE id = ?2",
            rusqlite::params![resolution, id],
        )?;
        Ok(())
    }

    /// Get capture IDs that have unresolved contradictions (for batch checking).
    pub fn capture_ids_with_contradictions(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn().prepare(
            "SELECT DISTINCT capture_a FROM contradictions WHERE resolved_at IS NULL
             UNION
             SELECT DISTINCT capture_b FROM contradictions WHERE resolved_at IS NULL"
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row?);
        }
        Ok(ids)
    }
}
