use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capture {
    pub id: String,
    pub file_path: String,
    pub file_hash: String,
    pub title: String,
    pub summary: Option<String>,
    pub space: Space,
    pub capture_type: String,
    pub status: CaptureStatus,
    pub date: NaiveDate,
    pub confidence: Option<String>,
    pub repo: Option<String>,
    pub workspace: Option<String>,
    pub session_tool: Option<String>,
    pub tags: Vec<String>,
    pub projects: Vec<String>,
    pub related: Vec<String>,
    pub files: Vec<String>,
    pub project_info: Option<ProjectInfo>,
    pub git_info: Option<GitInfo>,
    pub chain: Option<Chain>,
    pub links: Vec<Link>,
    pub body_text: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    /// Capture mode: "session" | "range" | "post-hoc"
    pub capture_mode: Option<String>,
    /// Date of last update (ISO format)
    pub updated: Option<String>,
    /// Session ID or transcript path
    pub session_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureOverview {
    pub id: String,
    pub file_path: String,
    pub title: String,
    pub summary: Option<String>,
    pub space: Space,
    pub capture_type: String,
    pub status: CaptureStatus,
    pub date: NaiveDate,
    pub tags: Vec<String>,
    pub projects: Vec<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    /// First ~200 chars of body text for hover preview
    pub body_preview: Option<String>,
}

/// Project context for a capture
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Git context captured at creation time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInfo {
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub remote: Option<String>,
    #[serde(default)]
    pub commits: Vec<GitCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    #[serde(default)]
    pub message: Option<String>,
}

/// Capture chaining — linked list per project + manual cross-refs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chain {
    /// Previous capture in same project (auto-set on creation)
    #[serde(default)]
    pub prev: Option<String>,
    /// Manual cross-references to other captures
    #[serde(default)]
    pub refs: Vec<String>,
}

/// Reference link (URL mentioned or used during session)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub url: String,
    #[serde(default)]
    pub label: Option<String>,
}

/// Capture lifecycle status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum CaptureStatus {
    #[default]
    Active,
    /// Issue fixed / decision finalized — still searchable but signals completion.
    Resolved,
    /// Manually archived — excluded from search and browse by default.
    Archived,
}

impl std::fmt::Display for CaptureStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Active => write!(f, "active"),
            Self::Resolved => write!(f, "resolved"),
            Self::Archived => write!(f, "archived"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Space {
    Work,
    Personal,
    Wiki,
}

impl std::fmt::Display for Space {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Work => write!(f, "work"),
            Self::Personal => write!(f, "personal"),
            Self::Wiki => write!(f, "wiki"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub name: String,
    pub display_name: String,
    pub space: Space,
    pub description: Option<String>,
    pub repos: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source_id: String,
    pub target_id: String,
    pub edge_type: EdgeType,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EdgeType {
    Tag,
    Project,
    Related,
    Wikilink,
    File,
    Type,
    Entity,
}

// ── Entity Graph (Phase 2) ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,             // normalized lowercase
    pub display_name: String,   // original casing
    pub entity_type: EntityType,
    pub first_seen: String,     // ISO date
    pub last_seen: String,      // ISO date
    pub mention_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum EntityType {
    Person,
    Project,
    Technology,
    Concept,
    Error,
    File,
    Url,
}

impl std::fmt::Display for EntityType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Person => write!(f, "person"),
            Self::Project => write!(f, "project"),
            Self::Technology => write!(f, "technology"),
            Self::Concept => write!(f, "concept"),
            Self::Error => write!(f, "error"),
            Self::File => write!(f, "file"),
            Self::Url => write!(f, "url"),
        }
    }
}

impl EntityType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "person" => Self::Person,
            "project" => Self::Project,
            "technology" => Self::Technology,
            "concept" => Self::Concept,
            "error" => Self::Error,
            "file" => Self::File,
            "url" => Self::Url,
            _ => Self::Concept,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MentionType {
    Frontmatter,
    Title,
    Body,
}

impl std::fmt::Display for MentionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Frontmatter => write!(f, "frontmatter"),
            Self::Title => write!(f, "title"),
            Self::Body => write!(f, "body"),
        }
    }
}

/// An extracted entity mention with source info
#[derive(Debug, Clone)]
pub struct EntityMention {
    pub entity: Entity,
    pub mention_type: MentionType,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub capture: CaptureOverview,
    pub score: f64,
    pub snippet: String,
    /// Recency score (0.0–1.0). 1.0 = today, decays with half-life.
    #[serde(default)]
    pub temporal_score: f64,
    /// Whether this capture has unresolved contradictions.
    #[serde(default)]
    pub has_contradictions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CaptureFilters {
    pub space: Option<Space>,
    pub capture_type: Option<String>,
    pub project: Option<String>,
    pub tags: Option<Vec<String>>,
    pub since: Option<NaiveDate>,
    pub until: Option<NaiveDate>,
    pub confidence: Option<String>,
    /// Filter by status. If None, defaults to "active" (excludes archived).
    pub status: Option<CaptureStatus>,
    /// When true, include all statuses (overrides `status` filter).
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KBStats {
    pub total_captures: u64,
    pub by_space: std::collections::HashMap<String, u64>,
    pub by_type: std::collections::HashMap<String, u64>,
    pub by_project: std::collections::HashMap<String, u64>,
    pub top_tags: Vec<(String, u64)>,
    pub this_month: u64,
}
