//! Smart Forgetting — status-aware decay rules engine.
//!
//! Phase 3B: Automatically marks stale captures as Expired based on
//! configurable rules per capture type and status.

use anyhow::Result;
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::store::Store;

/// A rule that controls when captures auto-expire.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayRule {
    /// Capture type this rule applies to (e.g., "meeting-note", "standup").
    pub capture_type: String,
    /// Maximum age in days before auto-expiry.
    pub max_age_days: u32,
    /// Only expire captures in these statuses (Draft/Active — never Resolved).
    pub condition: DecayCondition,
}

/// Which capture statuses are eligible for auto-expiry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DecayCondition {
    /// Only expire Draft captures.
    Draft,
    /// Only expire Active captures.
    Active,
    /// Expire Draft or Active (but never Resolved/Archived).
    DraftOrActive,
}

/// Returns a sensible set of default decay rules.
pub fn default_rules() -> Vec<DecayRule> {
    vec![
        DecayRule {
            capture_type: "meeting-note".into(),
            max_age_days: 180,
            condition: DecayCondition::Draft,
        },
        DecayRule {
            capture_type: "standup".into(),
            max_age_days: 30,
            condition: DecayCondition::DraftOrActive,
        },
        DecayRule {
            capture_type: "daily-log".into(),
            max_age_days: 60,
            condition: DecayCondition::Draft,
        },
    ]
}

/// Apply decay rules to the store, marking matching captures as Expired.
/// Returns the count of newly expired captures.
pub fn apply_decay_rules(store: &Store, rules: &[DecayRule]) -> Result<u32> {
    let now = Utc::now().date_naive();
    let mut total_expired = 0u32;

    for rule in rules {
        let cutoff = now - chrono::Duration::days(rule.max_age_days as i64);
        let statuses = match rule.condition {
            DecayCondition::Draft => vec!["draft"],
            DecayCondition::Active => vec!["active"],
            DecayCondition::DraftOrActive => vec!["draft", "active"],
        };

        let count = expire_captures(store, &rule.capture_type, &statuses, cutoff)?;
        if count > 0 {
            info!(
                "Decay: expired {} '{}' captures older than {} days",
                count, rule.capture_type, rule.max_age_days
            );
        }
        total_expired += count;
    }

    if total_expired > 0 {
        info!("Decay complete: {total_expired} captures expired");
    }

    Ok(total_expired)
}

/// Mark matching captures as 'expired' in the database.
fn expire_captures(
    store: &Store,
    capture_type: &str,
    statuses: &[&str],
    cutoff: NaiveDate,
) -> Result<u32> {
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    // Build a dynamic IN clause for statuses
    let placeholders: Vec<&str> = statuses.iter().map(|_| "?").collect();
    let in_clause = placeholders.join(", ");

    let sql = format!(
        "UPDATE captures SET status = 'expired'
         WHERE capture_type = ?1
           AND status IN ({})
           AND date < ?{}
           AND status != 'expired'",
        in_clause,
        statuses.len() + 2
    );

    let conn = store.conn();
    let mut stmt = conn.prepare(&sql)?;

    // Build params: capture_type, status1, status2, ..., cutoff
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    params.push(Box::new(capture_type.to_string()));
    for s in statuses {
        params.push(Box::new(s.to_string()));
    }
    params.push(Box::new(cutoff_str));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let count = stmt.execute(param_refs.as_slice())?;

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
