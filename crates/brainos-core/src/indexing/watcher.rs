use anyhow::Result;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc};
use std::time::Duration;
use tracing::{info, warn};

use crate::config::{ALWAYS_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS};

pub enum WatchEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
}

/// Allowed extensions for a watched root.
/// If empty, uses DEFAULT_SOURCE_EXTENSIONS.
#[derive(Clone)]
pub struct WatchFilter {
    /// Allowed file extensions (without dot). Empty = default allowlist.
    pub extensions: HashSet<String>,
}

impl WatchFilter {
    pub fn new(extensions: &[String]) -> Self {
        Self {
            extensions: if extensions.is_empty() {
                DEFAULT_SOURCE_EXTENSIONS.iter().map(|s| s.to_string()).collect()
            } else {
                extensions.iter().cloned().collect()
            },
        }
    }

    /// Markdown-only filter for the knowledge base root.
    pub fn kb_only() -> Self {
        Self {
            extensions: ["md"].iter().map(|s| s.to_string()).collect(),
        }
    }

    fn matches(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|ext| self.extensions.contains(ext))
            .unwrap_or(false)
    }
}

/// Check if a path contains any always-excluded directory component.
fn is_excluded(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            if let Some(s) = name.to_str() {
                if ALWAYS_EXCLUDE_DIRS.contains(&s) {
                    return true;
                }
            }
        }
    }
    false
}

pub struct FileWatcher {
    watcher: RecommendedWatcher,
    rx: mpsc::Receiver<WatchEvent>,
    watched_paths: Vec<PathBuf>,
}

impl FileWatcher {
    /// Create a watcher for the KB root (markdown only).
    pub fn new(watch_path: &Path) -> Result<Self> {
        Self::multi(&[(watch_path.to_path_buf(), WatchFilter::kb_only())])
    }

    /// Create a watcher for multiple roots, each with its own extension filter.
    pub fn multi(roots: &[(PathBuf, WatchFilter)]) -> Result<Self> {
        let (tx, rx) = mpsc::channel();

        // Build a shared filter map: root_path → allowed extensions
        // We'll match each event path to the longest matching root prefix.
        let filter_map: Arc<Vec<(PathBuf, WatchFilter)>> = Arc::new(
            roots.iter().cloned().collect()
        );

        let filters = filter_map.clone();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        for path in event.paths {
                            // Skip excluded directories
                            if is_excluded(&path) {
                                continue;
                            }

                            // Find which root this path belongs to and check extension
                            let allowed = filters.iter().any(|(root, filter)| {
                                path.starts_with(root) && filter.matches(&path)
                            });
                            if !allowed {
                                continue;
                            }

                            let watch_event = match event.kind {
                                EventKind::Create(_) => Some(WatchEvent::Created(path)),
                                EventKind::Modify(_) => Some(WatchEvent::Modified(path)),
                                EventKind::Remove(_) => Some(WatchEvent::Deleted(path)),
                                _ => None,
                            };
                            if let Some(e) = watch_event {
                                let _ = tx.send(e);
                            }
                        }
                    }
                    Err(e) => warn!("File watcher error: {e}"),
                }
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )?;

        let mut watched = Vec::new();
        for (path, _) in roots {
            if path.exists() {
                match watcher.watch(path, RecursiveMode::Recursive) {
                    Ok(()) => {
                        info!("Watching: {}", path.display());
                        watched.push(path.clone());
                    }
                    Err(e) => warn!("Failed to watch {}: {e}", path.display()),
                }
            } else {
                warn!("Watch path does not exist, skipping: {}", path.display());
            }
        }

        Ok(Self { watcher, rx, watched_paths: watched })
    }

    /// Add a new root at runtime.
    pub fn add_root(&mut self, path: &Path) -> Result<()> {
        if !path.exists() {
            anyhow::bail!("Path does not exist: {}", path.display());
        }
        self.watcher.watch(path, RecursiveMode::Recursive)?;
        self.watched_paths.push(path.to_path_buf());
        info!("Added watch root: {}", path.display());
        Ok(())
    }

    /// Remove a root at runtime.
    pub fn remove_root(&mut self, path: &Path) -> Result<()> {
        self.watcher.unwatch(path)?;
        self.watched_paths.retain(|p| p != path);
        info!("Removed watch root: {}", path.display());
        Ok(())
    }

    /// List currently watched paths.
    pub fn watched(&self) -> &[PathBuf] {
        &self.watched_paths
    }

    pub fn recv(&self) -> Option<WatchEvent> {
        self.rx.try_recv().ok()
    }

    pub fn recv_timeout(&self, timeout: Duration) -> Option<WatchEvent> {
        self.rx.recv_timeout(timeout).ok()
    }
}
