//! Entity graph CRUD operations on the Store.

use anyhow::Result;
use rusqlite::params;

use super::Store;
use crate::models::*;

impl Store {
    /// Insert or update an entity. Increments mention_count and updates last_seen.
    pub fn upsert_entity(&self, entity: &Entity) -> Result<()> {
        self.conn().execute(
            "INSERT INTO entities (id, display_name, entity_type, first_seen, last_seen, mention_count)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)
             ON CONFLICT(id) DO UPDATE SET
                last_seen = excluded.last_seen,
                mention_count = mention_count + 1",
            params![
                entity.id,
                entity.display_name,
                entity.entity_type.to_string(),
                entity.first_seen,
                entity.last_seen,
            ],
        )?;
        Ok(())
    }

    /// Link a capture to an entity with mention type and confidence.
    pub fn link_capture_entity(
        &self,
        capture_id: &str,
        entity_id: &str,
        mention_type: &str,
        confidence: f64,
    ) -> Result<()> {
        self.conn().execute(
            "INSERT INTO capture_entities (capture_id, entity_id, mention_type, confidence)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(capture_id, entity_id) DO UPDATE SET
                mention_type = CASE WHEN excluded.confidence > confidence THEN excluded.mention_type ELSE mention_type END,
                confidence = MAX(confidence, excluded.confidence)",
            params![capture_id, entity_id, mention_type, confidence],
        )?;
        Ok(())
    }

    /// Remove all entity links for a capture (before re-extraction).
    pub fn unlink_capture_entities(&self, capture_id: &str) -> Result<()> {
        self.conn().execute(
            "DELETE FROM capture_entities WHERE capture_id = ?1",
            params![capture_id],
        )?;
        Ok(())
    }

    /// Get all entities linked to a capture.
    pub fn get_entities_for_capture(&self, capture_id: &str) -> Result<Vec<Entity>> {
        let mut stmt = self.conn().prepare(
            "SELECT e.id, e.display_name, e.entity_type, e.first_seen, e.last_seen, e.mention_count
             FROM entities e
             JOIN capture_entities ce ON e.id = ce.entity_id
             WHERE ce.capture_id = ?1
             ORDER BY ce.confidence DESC"
        )?;
        let rows = stmt.query_map(params![capture_id], |row| {
            Ok(Entity {
                id: row.get(0)?,
                display_name: row.get(1)?,
                entity_type: EntityType::from_str(&row.get::<_, String>(2)?),
                first_seen: row.get(3)?,
                last_seen: row.get(4)?,
                mention_count: row.get(5)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Get all capture IDs linked to an entity.
    pub fn get_captures_for_entity(&self, entity_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn().prepare(
            "SELECT capture_id FROM capture_entities
             WHERE entity_id = ?1
             ORDER BY confidence DESC"
        )?;
        let rows = stmt.query_map(params![entity_id], |row| {
            row.get::<_, String>(0)
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Get related entities — entities that co-occur in captures with the given entity.
    /// Returns (Entity, co_occurrence_count) pairs sorted by frequency.
    pub fn get_related_entities(&self, entity_id: &str) -> Result<Vec<(Entity, u32)>> {
        let mut stmt = self.conn().prepare(
            "SELECT e.id, e.display_name, e.entity_type, e.first_seen, e.last_seen, e.mention_count,
                    COUNT(DISTINCT ce2.capture_id) as co_count
             FROM capture_entities ce1
             JOIN capture_entities ce2 ON ce1.capture_id = ce2.capture_id AND ce1.entity_id != ce2.entity_id
             JOIN entities e ON e.id = ce2.entity_id
             WHERE ce1.entity_id = ?1
             GROUP BY e.id
             ORDER BY co_count DESC
             LIMIT 50"
        )?;
        let rows = stmt.query_map(params![entity_id], |row| {
            Ok((
                Entity {
                    id: row.get(0)?,
                    display_name: row.get(1)?,
                    entity_type: EntityType::from_str(&row.get::<_, String>(2)?),
                    first_seen: row.get(3)?,
                    last_seen: row.get(4)?,
                    mention_count: row.get(5)?,
                },
                row.get::<_, u32>(6)?,
            ))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Search entities by name prefix (for autocomplete/search).
    pub fn search_entities(&self, query: &str, limit: u32) -> Result<Vec<Entity>> {
        let pattern = format!("%{}%", query.to_lowercase());
        let mut stmt = self.conn().prepare(
            "SELECT id, display_name, entity_type, first_seen, last_seen, mention_count
             FROM entities
             WHERE id LIKE ?1
             ORDER BY mention_count DESC
             LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![pattern, limit], |row| {
            Ok(Entity {
                id: row.get(0)?,
                display_name: row.get(1)?,
                entity_type: EntityType::from_str(&row.get::<_, String>(2)?),
                first_seen: row.get(3)?,
                last_seen: row.get(4)?,
                mention_count: row.get(5)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Find captures that share entities with the query text.
    /// Used as the third signal in hybrid search (entity boosting).
    /// Returns (capture_id, entity_match_count) sorted by match count desc.
    pub fn search_by_entities(&self, entity_ids: &[String], limit: u32) -> Result<Vec<(String, f64)>> {
        if entity_ids.is_empty() {
            return Ok(Vec::new());
        }
        // Build IN clause dynamically
        let placeholders: Vec<String> = entity_ids.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            "SELECT capture_id, COUNT(DISTINCT entity_id) as match_count
             FROM capture_entities
             WHERE entity_id IN ({})
             GROUP BY capture_id
             ORDER BY match_count DESC
             LIMIT ?{}",
            placeholders.join(", "),
            entity_ids.len() + 1
        );

        let mut stmt = self.conn().prepare(&sql)?;

        // Bind entity IDs + limit
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = entity_ids.iter()
            .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        param_values.push(Box::new(limit));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter()
            .map(|p| p.as_ref())
            .collect();

        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}
