use anyhow::Result;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tracing::{info, warn};

pub enum WatchEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    rx: mpsc::Receiver<WatchEvent>,
}

impl FileWatcher {
    pub fn new(watch_path: &Path) -> Result<Self> {
        let (tx, rx) = mpsc::channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        for path in event.paths {
                            if !path.extension().is_some_and(|ext| ext == "md") {
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

        watcher.watch(watch_path, RecursiveMode::Recursive)?;
        info!("Watching for changes in {}", watch_path.display());

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    pub fn recv(&self) -> Option<WatchEvent> {
        self.rx.try_recv().ok()
    }

    pub fn recv_timeout(&self, timeout: Duration) -> Option<WatchEvent> {
        self.rx.recv_timeout(timeout).ok()
    }
}
