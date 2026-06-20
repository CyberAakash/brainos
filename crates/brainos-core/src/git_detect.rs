//! Auto-detect git context from a working directory.
//!
//! Uses the `git` CLI (via std::process::Command) to extract:
//! - Repository name (from remote URL or directory name)
//! - Current branch
//! - Remote URL (origin)
//! - Recent commits (last 5)

use std::path::Path;
use std::process::Command;

use crate::models::{GitCommit, GitInfo};

/// Detect git info from a directory. Returns None if not a git repo.
pub fn detect(dir: &Path) -> Option<GitInfo> {
    // Quick check: is this inside a git repo?
    let status = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(dir)
        .output()
        .ok()?;

    if !status.status.success() {
        return None;
    }

    let branch = git_str(dir, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let remote = git_str(dir, &["config", "--get", "remote.origin.url"]);
    let repo = repo_name_from_remote(remote.as_deref())
        .or_else(|| repo_name_from_dir(dir));
    let commits = recent_commits(dir, 5);

    Some(GitInfo {
        repo,
        branch,
        remote,
        commits,
    })
}

/// Run a git command and return trimmed stdout, or None.
fn git_str(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

/// Extract repo name from a remote URL.
/// Handles: git@github.com:user/repo.git, https://github.com/user/repo.git, etc.
fn repo_name_from_remote(remote: Option<&str>) -> Option<String> {
    let remote = remote?;

    // Take the last path segment, strip .git suffix
    let name = remote
        .rsplit('/')
        .next()
        .or_else(|| remote.rsplit(':').next())?
        .trim_end_matches(".git");

    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Fallback: use the directory name as the repo name.
fn repo_name_from_dir(dir: &Path) -> Option<String> {
    // Find the git root first
    let root = git_str(dir, &["rev-parse", "--show-toplevel"])?;
    Path::new(&root)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
}

/// Get the N most recent commits (hash + message).
fn recent_commits(dir: &Path, count: u32) -> Vec<GitCommit> {
    let output = Command::new("git")
        .args([
            "log",
            &format!("-{}", count),
            "--format=%H%n%s",
            "--no-decorate",
        ])
        .current_dir(dir)
        .output();

    let output = match output {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = text.lines().collect();

    // Output is pairs: hash\nmessage\nhash\nmessage\n...
    lines
        .chunks(2)
        .filter_map(|chunk| {
            let hash = chunk.first()?.trim().to_string();
            let message = chunk.get(1).map(|m| m.trim().to_string());
            if hash.is_empty() {
                None
            } else {
                Some(GitCommit { hash, message })
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repo_name_ssh() {
        assert_eq!(
            repo_name_from_remote(Some("git@github.com:user/my-project.git")),
            Some("my-project".to_string())
        );
    }

    #[test]
    fn test_repo_name_https() {
        assert_eq!(
            repo_name_from_remote(Some("https://github.com/user/my-project.git")),
            Some("my-project".to_string())
        );
    }

    #[test]
    fn test_repo_name_no_git_suffix() {
        assert_eq!(
            repo_name_from_remote(Some("https://github.com/user/repo")),
            Some("repo".to_string())
        );
    }

    #[test]
    fn test_repo_name_none() {
        assert_eq!(repo_name_from_remote(None), None);
    }
}
