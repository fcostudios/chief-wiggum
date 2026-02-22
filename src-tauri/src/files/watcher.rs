//! Project file watcher (CHI-115).
//! Emits debounced `files:changed` Tauri events with relative paths.

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::{AppError, AppResult};

const DEBOUNCE_WINDOW_MS: u64 = 500;
const IDLE_POLL_MS: u64 = 100;

#[derive(Debug, Clone, Serialize)]
pub struct FilesChangedEvent {
    pub project_id: String,
    pub paths: Vec<String>,
}

struct ActiveWatcher {
    project_root: PathBuf,
    stop_tx: mpsc::Sender<()>,
    join_handle: thread::JoinHandle<()>,
}

/// Manages per-project filesystem watchers.
///
/// Stored in Tauri state so commands can start/stop watching the active project.
#[derive(Default)]
pub struct FileWatcherManager {
    watchers: Mutex<HashMap<String, ActiveWatcher>>,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    pub fn start_watching(
        &self,
        app: AppHandle,
        project_id: String,
        project_root: PathBuf,
    ) -> AppResult<()> {
        if !project_root.exists() {
            return Err(AppError::Other(format!(
                "Project path does not exist: {}",
                project_root.display()
            )));
        }
        if !project_root.is_dir() {
            return Err(AppError::Other(format!(
                "Project path is not a directory: {}",
                project_root.display()
            )));
        }

        let canonical_root = std::fs::canonicalize(&project_root).unwrap_or(project_root);

        {
            let watchers = self.watchers.lock();
            if let Some(existing) = watchers.get(&project_id) {
                if existing.project_root == canonical_root {
                    tracing::debug!(
                        project_id = %project_id,
                        root = %canonical_root.display(),
                        "file watcher already active for project"
                    );
                    return Ok(());
                }
            }
        }

        let _ = self.stop_watching(&project_id);

        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        let thread_project_id = project_id.clone();
        let thread_root = canonical_root.clone();

        let join_handle = thread::spawn(move || {
            let (raw_tx, raw_rx) = mpsc::channel::<notify::Result<Event>>();
            let callback_tx = raw_tx.clone();

            let mut watcher = match RecommendedWatcher::new(
                move |res| {
                    let _ = callback_tx.send(res);
                },
                Config::default(),
            ) {
                Ok(watcher) => watcher,
                Err(err) => {
                    let _ = ready_tx.send(Err(err.to_string()));
                    tracing::warn!(
                        project_id = %thread_project_id,
                        error = %err,
                        "failed to create file watcher"
                    );
                    return;
                }
            };

            if let Err(err) = watcher.watch(&thread_root, RecursiveMode::Recursive) {
                let _ = ready_tx.send(Err(err.to_string()));
                tracing::warn!(
                    project_id = %thread_project_id,
                    root = %thread_root.display(),
                    error = %err,
                    "failed to start watching project root"
                );
                return;
            }

            let _ = ready_tx.send(Ok(()));
            tracing::info!(
                project_id = %thread_project_id,
                root = %thread_root.display(),
                "started project file watcher"
            );

            run_watch_loop(app, thread_project_id, thread_root, raw_rx, stop_rx);

            tracing::info!("project file watcher thread exited");
        });

        match ready_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(())) => {
                self.watchers.lock().insert(
                    project_id,
                    ActiveWatcher {
                        project_root: canonical_root,
                        stop_tx,
                        join_handle,
                    },
                );
                Ok(())
            }
            Ok(Err(err)) => {
                let _ = stop_tx.send(());
                let _ = join_handle.join();
                Err(AppError::Other(format!(
                    "Failed to start file watcher: {}",
                    err
                )))
            }
            Err(_) => {
                let _ = stop_tx.send(());
                let _ = join_handle.join();
                Err(AppError::Other(
                    "Timed out waiting for file watcher startup".to_string(),
                ))
            }
        }
    }

    pub fn stop_watching(&self, project_id: &str) -> AppResult<()> {
        let maybe_active = self.watchers.lock().remove(project_id);
        if let Some(active) = maybe_active {
            tracing::debug!(project_id = %project_id, "stopping project file watcher");
            let _ = active.stop_tx.send(());
            let _ = active.join_handle.join();
        }
        Ok(())
    }

    pub fn stop_all(&self) {
        let drained: Vec<_> = {
            let mut watchers = self.watchers.lock();
            watchers.drain().map(|(_, watcher)| watcher).collect()
        };

        for active in drained {
            let _ = active.stop_tx.send(());
            let _ = active.join_handle.join();
        }
    }
}

impl Drop for FileWatcherManager {
    fn drop(&mut self) {
        let drained: Vec<_> = self.watchers.get_mut().drain().map(|(_, w)| w).collect();
        for active in drained {
            let _ = active.stop_tx.send(());
            let _ = active.join_handle.join();
        }
    }
}

fn run_watch_loop(
    app: AppHandle,
    project_id: String,
    project_root: PathBuf,
    raw_rx: mpsc::Receiver<notify::Result<Event>>,
    stop_rx: mpsc::Receiver<()>,
) {
    let debounce_window = Duration::from_millis(DEBOUNCE_WINDOW_MS);
    let poll_window = Duration::from_millis(IDLE_POLL_MS);
    let mut pending_paths: BTreeSet<String> = BTreeSet::new();
    let mut last_event_at: Option<Instant> = None;

    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match raw_rx.recv_timeout(poll_window) {
            Ok(Ok(event)) => {
                collect_event_paths(&project_root, &event, &mut pending_paths);
                last_event_at = Some(Instant::now());
            }
            Ok(Err(err)) => {
                tracing::warn!(
                    project_id = %project_id,
                    error = %err,
                    "file watcher reported an error"
                );
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if pending_paths.is_empty() {
            continue;
        }

        if let Some(last_event_at) = last_event_at {
            if last_event_at.elapsed() < debounce_window {
                continue;
            }
        }

        emit_pending_paths(&app, &project_id, &mut pending_paths);
        last_event_at = None;
    }

    if !pending_paths.is_empty() {
        emit_pending_paths(&app, &project_id, &mut pending_paths);
    }
}

fn collect_event_paths(project_root: &Path, event: &Event, pending_paths: &mut BTreeSet<String>) {
    for path in &event.paths {
        if let Some(relative) = normalize_relative_path(project_root, path) {
            pending_paths.insert(relative);
        }
    }
}

fn emit_pending_paths(app: &AppHandle, project_id: &str, pending_paths: &mut BTreeSet<String>) {
    if pending_paths.is_empty() {
        return;
    }

    let paths = pending_paths.iter().cloned().collect::<Vec<_>>();
    pending_paths.clear();

    let payload = FilesChangedEvent {
        project_id: project_id.to_string(),
        paths,
    };

    tracing::debug!(
        project_id = %project_id,
        changed_count = payload.paths.len(),
        "emitting debounced files:changed event"
    );

    if let Err(err) = app.emit("files:changed", &payload) {
        tracing::warn!(
            project_id = %project_id,
            error = %err,
            "failed to emit files:changed event"
        );
    }
}

fn normalize_relative_path(project_root: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(project_root)
        .ok()
        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_relative_path_returns_forward_slashes() {
        let root = PathBuf::from("/tmp/project");
        let path = PathBuf::from("/tmp/project/src/main.rs");
        let rel = normalize_relative_path(&root, &path).expect("path should be relative");
        assert_eq!(rel, "src/main.rs");
    }

    #[test]
    fn normalize_relative_path_outside_root_returns_none() {
        let root = PathBuf::from("/tmp/project");
        let path = PathBuf::from("/tmp/other/main.rs");
        assert!(normalize_relative_path(&root, &path).is_none());
    }
}
