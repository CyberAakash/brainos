//! Smart Forgetting — auto-archive rules engine.
//!
//! Automatically marks stale captures as Archived based on
//! configurable rules per capture type.

use anyhow::Result;
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::store::Store;

/// A rule that controls when captures auto-archive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayRule {
    /// Capture type this rule applies to (e.g., "meeting-note", "standup").
    pub capture_type: String,
    /// Maximum age in days before auto-archiving.
    pub max_age_days: u32,
}

/// Returns a sensible set of default decay rules.
pub fn default_rules() -> Vec<DecayRule> {
    vec![
        DecayRule {
            capture_type: "meeting-note".into(),
            max_age_days: 180,
        },
        DecayRule {
            capture_type: "standup".into(),
            max_age_days: 30,
        },
        DecayRule {
            capture_type: "daily-log".into(),
            max_age_days: 60,
        },
    ]
}

/// Apply decay rules to the store, archiving matching captures.
/// Returns the count of newly archived captures.
pub fn apply_decay_rules(store: &Store, rules: &[DecayRule]) -> Result<u32> {
    let now = Utc::now().date_naive();
    let mut total_archived = 0u32;

    for rule in rules {
        let cutoff = now - chrono::Duration::days(rule.max_age_days as i64);
        let count = archive_stale_captures(store, &rule.capture_type, cutoff)?;
        if count > 0 {
            info!(
                "Decay: archived {} '{}' captures older than {} days",
                count, rule.capture_type, rule.max_age_days
            );
        }
        total_archived += count;
    }

    if total_archived > 0 {
        info!("Decay complete: {total_archived} captures archived");
    }

    Ok(total_archived)
}

/// Mark matching active captures as 'archived' in the database.
fn archive_stale_captures(
    store: &Store,
    capture_type: &str,
    cutoff: NaiveDate,
) -> Result<u32> {
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let sql = "UPDATE captures SET status = 'archived'
               WHERE capture_type = ?1
                 AND status = 'active'
                 AND date < ?2";

    let conn = store.conn();
    let count = conn.execute(sql, rusqlite::params![capture_type, cutoff_str])?;
    Ok(count as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_rules() {
        let rules = default_rules();
        assert_eq!(rules.len(), 3);
        assert_eq!(rules[0].capture_type, "meeting-note");
        assert_eq!(rules[0].max_age_days, 180);
        assert_eq!(rules[1].capture_type, "standup");
        assert_eq!(rules[1].max_age_days, 30);
    }
}
