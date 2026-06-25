use anyhow::{Context, Result};
use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::models::*;

/// Parsed frontmatter from a capture markdown file
#[derive(Debug, serde::Deserialize)]
struct Frontmatter {
    id: String,
    title: String,
    #[serde(default)]
    summary: Option<String>,
    space: Space,
    #[serde(rename = "type")]
    capture_type: String,
    #[serde(default)]
    status: Option<String>,
    date: String,
    #[serde(default)]
    confidence: Option<String>,
    #[serde(default)]
    repo: Option<String>,
    #[serde(default)]
    workspace: Option<String>,
    #[serde(default)]
    session_tool: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    projects: Vec<String>,
    #[serde(default)]
    related: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
    /// Nested project info (new format)
    #[serde(default)]
    project: Option<ProjectInfo>,
    /// Nested git info (new format)
    #[serde(default)]
    git: Option<GitInfo>,
    /// Capture chaining
    #[serde(default)]
    chain: Option<Chain>,
    /// Reference links
    #[serde(default)]
    links: Option<Vec<Link>>,
    /// Card color (from fixed palette)
    #[serde(default)]
    color: Option<String>,
    /// Card icon (emoji)
    #[serde(default)]
    icon: Option<String>,
}

/// Parse a capture markdown file into a Capture struct
pub fn parse_capture_file(path: &Path) -> Result<Capture> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read {}", path.display()))?;

    let file_hash = {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    };

    let (frontmatter_str, body) = split_frontmatter(&content)
        .with_context(|| format!("No valid YAML frontmatter in {}", path.display()))?;

    let fm: Frontmatter = serde_yaml::from_str(frontmatter_str)
        .with_context(|| format!("Invalid YAML frontmatter in {}", path.display()))?;

    let file_path = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();

    let status = match fm.status.as_deref() {
        Some("archived") => CaptureStatus::Archived,
        _ => CaptureStatus::Active,
    };

    Ok(Capture {
        id: fm.id,
        file_path,
        file_hash,
        title: fm.title,
        summary: fm.summary,
        space: fm.space,
        capture_type: fm.capture_type,
        status,
        date: parse_date(&fm.date).with_context(|| format!("Invalid date '{}' in frontmatter", fm.date))?,
        confidence: fm.confidence,
        repo: fm.repo,
        workspace: fm.workspace,
        session_tool: fm.session_tool,
        tags: fm.tags,
        projects: fm.projects,
        related: fm.related,
        files: fm.files,
        project_info: fm.project,
        git_info: fm.git,
        chain: fm.chain,
        links: merge_links(fm.links.unwrap_or_default(), extract_urls(body)),
        body_text: body.to_string(),
        color: fm.color,
        icon: fm.icon,
    })
}

/// Parse date from various formats: "2026-06-18", "2026-06-18T15:00:00+05:30", etc.
fn parse_date(s: &str) -> Result<NaiveDate> {
    // Try plain date first: "2026-06-18"
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Ok(d);
    }
    // Try datetime with timezone: "2026-06-18T15:00:00+05:30"
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Ok(dt.date_naive());
    }
    // Try datetime without timezone: "2026-06-18T15:00:00"
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Ok(dt.date());
    }
    // Fallback: take first 10 chars as YYYY-MM-DD
    if s.len() >= 10 {
        if let Ok(d) = NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d") {
            return Ok(d);
        }
    }
    anyhow::bail!("Cannot parse date: {}", s)
}

/// Extract http/https URLs from text.
fn extract_urls(text: &str) -> Vec<Link> {
    // Simple regex: match http(s)://... up to whitespace or common delimiters
    let url_re = regex::Regex::new(r#"https?://[^\s\)\]\}>"'`,;]+"#).unwrap();
    let mut seen = std::collections::HashSet::new();
    let mut links = Vec::new();

    for m in url_re.find_iter(text) {
        let mut url = m.as_str().to_string();
        // Strip trailing punctuation that's likely not part of the URL
        while url.ends_with('.') || url.ends_with(',') || url.ends_with(')') || url.ends_with(']') {
            url.pop();
        }
        if !seen.contains(&url) {
            seen.insert(url.clone());
            links.push(Link { url, label: None });
        }
    }
    links
}

/// Merge frontmatter-declared links with auto-extracted URLs (no duplicates).
fn merge_links(declared: Vec<Link>, extracted: Vec<Link>) -> Vec<Link> {
    if extracted.is_empty() {
        return declared;
    }
    let declared_urls: std::collections::HashSet<String> = declared.iter().map(|l| l.url.clone()).collect();
    let mut merged = declared;
    for link in extracted {
        if !declared_urls.contains(&link.url) {
            merged.push(link);
        }
    }
    merged
}

/// Split content into (frontmatter_yaml, body_markdown)
fn split_frontmatter(content: &str) -> Option<(&str, &str)> {
    let content = content.trim_start();
    if !content.starts_with("---") {
        return None;
    }

    let after_first = &content[3..];
    let end = after_first.find("\n---")?;
    let frontmatter = &after_first[..end].trim();
    let body = &after_first[end + 4..].trim();

    Some((frontmatter, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_frontmatter() {
        let content = "---\ntitle: Test\ntype: learning\n---\n\n# Body here";
        let (fm, body) = split_frontmatter(content).unwrap();
        assert!(fm.contains("title: Test"));
        assert!(body.contains("# Body here"));
    }

    #[test]
    fn test_extract_urls() {
        let text = "Check https://github.com/user/repo and http://example.com/page.html for details.";
        let links = extract_urls(text);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].url, "https://github.com/user/repo");
        assert_eq!(links[1].url, "http://example.com/page.html");
    }

    #[test]
    fn test_extract_urls_dedup() {
        let text = "Visit https://example.com twice: https://example.com";
        let links = extract_urls(text);
        assert_eq!(links.len(), 1);
    }

    #[test]
    fn test_merge_links_no_overlap() {
        let declared = vec![Link { url: "https://a.com".into(), label: Some("A".into()) }];
        let extracted = vec![Link { url: "https://b.com".into(), label: None }];
        let merged = merge_links(declared, extracted);
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn test_merge_links_with_overlap() {
        let declared = vec![Link { url: "https://a.com".into(), label: Some("A".into()) }];
        let extracted = vec![Link { url: "https://a.com".into(), label: None }];
        let merged = merge_links(declared, extracted);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].label, Some("A".into())); // keeps declared version
    }

    #[test]
    fn test_no_frontmatter() {
        let content = "# Just a heading\nNo frontmatter here.";
        assert!(split_frontmatter(content).is_none());
    }
}
