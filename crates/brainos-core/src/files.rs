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
