use anyhow::{Context, Result};
use chrono::Local;
use std::path::{Path, PathBuf};

use crate::indexing::parser::parse_capture_file;
use crate::models::Capture;
use crate::store::Store;

/// Read raw markdown content of a capture file
pub fn read_raw(kb_root: &Path, file_name: &str) -> Result<String> {
    let path = kb_root.join("captures").join(file_name);
    std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))
}

/// Save raw markdown content to a capture file and re-index
pub fn save_content(store: &Store, kb_root: &Path, file_name: &str, content: &str) -> Result<Capture> {
    let path = kb_root.join("captures").join(file_name);
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write {}", path.display()))?;

    // Re-parse and re-index
    let capture = parse_capture_file(&path)?;
    store.upsert_capture(&capture)?;
    Ok(capture)
}

/// Options for creating a new capture file (v2 fields)
pub struct CreateCaptureOpts {
    pub summary: Option<String>,
    pub status: Option<String>,
    pub project_name: Option<String>,
    pub project_path: Option<String>,
    pub chain_prev: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    /// Capture mode: "session" | "range" | "post-hoc"
    pub capture_mode: Option<String>,
    /// Session ID or transcript path
    pub session_ref: Option<String>,
}

/// Create a new capture file with frontmatter template, index it, return the Capture
pub fn create_file(
    store: &Store,
    kb_root: &Path,
    title: &str,
    space: &str,
    capture_type: &str,
    tags: &[String],
    body: &str,
    opts: Option<&CreateCaptureOpts>,
) -> Result<Capture> {
    let captures_dir = kb_root.join("captures");
    std::fs::create_dir_all(&captures_dir)?;

    let today = Local::now().format("%Y-%m-%d").to_string();
    let slug = slugify(title);
    let seq = next_sequence(&captures_dir, &today)?;
    let file_name = format!("{}-{:03}_{}.md", today, seq, slug);
    let id = format!("{}-{:03}_{}", today, seq, slug);

    let tags_yaml = if tags.is_empty() {
        "[]".to_string()
    } else {
        format!("[{}]", tags.iter().map(|t| format!("\"{}\"", t)).collect::<Vec<_>>().join(", "))
    };

    let date_iso = Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string();

    // Build optional frontmatter sections
    let mut extra_fm = String::new();

    if let Some(opts) = opts {
        if let Some(ref summary) = opts.summary {
            extra_fm.push_str(&format!("summary: \"{}\"\n", summary.replace('"', "\\\"")));
        }
        if let Some(ref status) = opts.status {
            extra_fm.push_str(&format!("status: {}\n", status));
        }
        if let Some(ref proj_name) = opts.project_name {
            extra_fm.push_str("project:\n");
            extra_fm.push_str(&format!("  name: \"{}\"\n", proj_name));
            if let Some(ref proj_path) = opts.project_path {
                extra_fm.push_str(&format!("  path: \"{}\"\n", proj_path));
            }
        }
        if let Some(ref prev) = opts.chain_prev {
            extra_fm.push_str("chain:\n");
            extra_fm.push_str(&format!("  prev: \"{}\"\n", prev));
        }
        if let Some(ref color) = opts.color {
            extra_fm.push_str(&format!("color: \"{}\"\n", color));
        }
        if let Some(ref icon) = opts.icon {
            extra_fm.push_str(&format!("icon: \"{}\"\n", icon));
        }
        if let Some(ref mode) = opts.capture_mode {
            extra_fm.push_str(&format!("capture_mode: {}\n", mode));
        }
        if let Some(ref sref) = opts.session_ref {
            extra_fm.push_str(&format!("session_ref: \"{}\"\n", sref));
        }
    }

    // Auto-chain: if project provided but no explicit chain_prev, find latest in project
    if let Some(opts) = opts {
        if opts.chain_prev.is_none() {
            if let Some(ref proj_name) = opts.project_name {
                if let Ok(Some(prev_id)) = store.latest_capture_in_project(proj_name) {
                    extra_fm.push_str("chain:\n");
                    extra_fm.push_str(&format!("  prev: \"{}\"\n", prev_id));
                }
            }
        }
    }

    let content = format!(
        r#"---
id: "{id}"
title: "{title}"
space: {space}
type: {capture_type}
date: "{date_iso}"
{extra_fm}tags: {tags_yaml}
projects: []
related: []
files: []
---

{body}"#,
    );

    let path = captures_dir.join(&file_name);
    std::fs::write(&path, &content)?;

    let capture = parse_capture_file(&path)?;
    store.upsert_capture(&capture)?;
    Ok(capture)
}

/// Delete a capture's .md file and remove from index
pub fn delete_file(store: &Store, kb_root: &Path, file_name: &str, id: &str) -> Result<()> {
    let path = kb_root.join("captures").join(file_name);
    if path.exists() {
        std::fs::remove_file(&path)
            .with_context(|| format!("Failed to delete {}", path.display()))?;
    }
    store.delete_capture(id)?;
    Ok(())
}

/// Generate a URL-safe slug from a title
fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(60)
        .collect()
}

/// Find the next sequence number for today's captures
fn next_sequence(captures_dir: &Path, today: &str) -> Result<u32> {
    let mut max = 0u32;
    if let Ok(entries) = std::fs::read_dir(captures_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(today) {
                // Parse NNN from "YYYY-MM-DD-NNN_..."
                if let Some(seq_str) = name.get(11..14) {
                    if let Ok(seq) = seq_str.parse::<u32>() {
                        max = max.max(seq);
                    }
                }
            }
        }
    }
    Ok(max + 1)
}

/// Append a new `## Section` to an existing capture's body, then re-index.
pub fn append_section(store: &Store, kb_root: &Path, id: &str, section: &str) -> Result<Capture> {
    let capture = store.get_capture(id)?
        .ok_or_else(|| anyhow::anyhow!("Capture not found: {}", id))?;
    let path = kb_root.join("captures").join(&capture.file_path);
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;

    // Append the section with a blank line separator
    let updated = format!("{}\n\n{}", content.trim_end(), section);
    save_content(store, kb_root, &capture.file_path, &updated)
}

/// Fields that can be updated on an existing capture.
pub struct MetadataUpdate {
    pub status: Option<String>,
    pub summary: Option<String>,
    pub add_tags: Vec<String>,
    pub remove_tags: Vec<String>,
}

/// Update frontmatter fields on an existing capture, then re-index.
/// Uses targeted string replacement to preserve the rest of the file.
pub fn update_metadata(store: &Store, kb_root: &Path, id: &str, updates: &MetadataUpdate) -> Result<Capture> {
    let capture = store.get_capture(id)?
        .ok_or_else(|| anyhow::anyhow!("Capture not found: {}", id))?;
    let path = kb_root.join("captures").join(&capture.file_path);
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;

    // Split into frontmatter + body at the second `---`
    let parts: Vec<&str> = content.splitn(3, "---").collect();
    if parts.len() < 3 {
        anyhow::bail!("Capture file has invalid frontmatter structure");
    }
    let mut fm = parts[1].to_string();
    let body = parts[2];

    // Update status
    if let Some(ref new_status) = updates.status {
        if let Some(pos) = fm.find("\nstatus:") {
            // Replace existing status line
            let line_end = fm[pos + 1..].find('\n').map(|e| pos + 1 + e).unwrap_or(fm.len());
            fm.replace_range(pos + 1..line_end, &format!("status: {}", new_status));
        } else {
            // Add status field
            fm.push_str(&format!("status: {}\n", new_status));
        }
    }

    // Update summary
    if let Some(ref new_summary) = updates.summary {
        let escaped = new_summary.replace('"', "\\\"");
        if let Some(pos) = fm.find("\nsummary:") {
            let line_end = fm[pos + 1..].find('\n').map(|e| pos + 1 + e).unwrap_or(fm.len());
            fm.replace_range(pos + 1..line_end, &format!("summary: \"{}\"", escaped));
        } else {
            fm.push_str(&format!("summary: \"{}\"\n", escaped));
        }
    }

    // Update tags (merge add/remove with existing)
    if !updates.add_tags.is_empty() || !updates.remove_tags.is_empty() {
        let mut tags: Vec<String> = capture.tags.clone();
        for t in &updates.add_tags {
            let t = t.to_lowercase();
            if !tags.contains(&t) {
                tags.push(t);
            }
        }
        for t in &updates.remove_tags {
            tags.retain(|existing| existing != &t.to_lowercase());
        }
        let tags_yaml = if tags.is_empty() {
            "[]".to_string()
        } else {
            format!("[{}]", tags.iter().map(|t| format!("\"{}\"", t)).collect::<Vec<_>>().join(", "))
        };
        if let Some(pos) = fm.find("\ntags:") {
            let line_end = fm[pos + 1..].find('\n').map(|e| pos + 1 + e).unwrap_or(fm.len());
            fm.replace_range(pos + 1..line_end, &format!("tags: {}", tags_yaml));
        }
    }

    // Update the `updated` timestamp
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    if let Some(pos) = fm.find("\nupdated:") {
        let line_end = fm[pos + 1..].find('\n').map(|e| pos + 1 + e).unwrap_or(fm.len());
        fm.replace_range(pos + 1..line_end, &format!("updated: \"{}\"", now));
    } else {
        fm.push_str(&format!("updated: \"{}\"\n", now));
    }

    let updated_content = format!("---{}---{}", fm, body);
    save_content(store, kb_root, &capture.file_path, &updated_content)
}

/// Link two captures by adding each to the other's `related` list, then re-index both.
pub fn link_captures(store: &Store, kb_root: &Path, id1: &str, id2: &str) -> Result<()> {
    // Helper: add target_id to the `related: [...]` line of source_id's file
    fn add_related(store: &Store, kb_root: &Path, source_id: &str, target_id: &str) -> Result<Capture> {
        let capture = store.get_capture(source_id)?
            .ok_or_else(|| anyhow::anyhow!("Capture not found: {}", source_id))?;

        // Skip if already linked
        if capture.related.contains(&target_id.to_string()) {
            return Ok(capture);
        }

        let path = kb_root.join("captures").join(&capture.file_path);
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?;

        // Find and update the `related: [...]` line
        let updated = if let Some(pos) = content.find("\nrelated:") {
            let line_start = pos + 1;
            let line_end = content[line_start..].find('\n')
                .map(|e| line_start + e)
                .unwrap_or(content.len());
            let line = &content[line_start..line_end];

            let new_line = if line.contains("[]") {
                format!("related: [\"{}\"]", target_id)
            } else if let Some(bracket_end) = line.rfind(']') {
                // Insert before the closing bracket
                let (before, after) = line.split_at(bracket_end);
                format!("{}, \"{}\"{}", before, target_id, after)
            } else {
                format!("related: [\"{}\"]", target_id)
            };

            format!("{}{}{}", &content[..line_start], new_line, &content[line_end..])
        } else {
            // No `related:` line — insert before the closing `---`
            // This shouldn't happen since create_file always adds it, but handle gracefully
            content.clone()
        };

        save_content(store, kb_root, &capture.file_path, &updated)
    }

    add_related(store, kb_root, id1, id2)?;
    add_related(store, kb_root, id2, id1)?;
    Ok(())
}

/// List all .md files in captures directory (for file browser)
pub fn list_files(kb_root: &Path) -> Result<Vec<PathBuf>> {
    let captures_dir = kb_root.join("captures");
    if !captures_dir.exists() {
        return Ok(Vec::new());
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(&captures_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
        .collect();
    files.sort_by(|a, b| b.file_name().cmp(&a.file_name())); // newest first
    Ok(files)
}
