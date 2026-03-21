//! Session handover via `claude remote-control --resume` (CHI-344).

pub mod reconcile;

use crate::import::jsonl::{parse_jsonl_reader, JsonlLine, MessageInsert};
use crate::{AppError, AppResult};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex as ParkingMutex;
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::timeout;

const WATCH_IDLE_POLL_MS: u64 = 100;
const WATCH_DEBOUNCE_MS: u64 = 200;

fn relay_url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"https://claude\.ai/code/[A-Za-z0-9_-]+").expect("valid relay URL regex")
    })
}

fn extract_relay_url(line: &str) -> Option<String> {
    relay_url_regex()
        .find(line)
        .map(|matched| matched.as_str().to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct HandoverState {
    pub session_id: String,
    pub cli_session_id: String,
    pub relay_url: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RemoteMessagePayload {
    pub session_id: String,
    pub uuid: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub thinking_tokens: Option<i64>,
    pub stop_reason: Option<String>,
    pub is_error: bool,
    pub parent_uuid: Option<String>,
    pub timestamp: String,
}

pub struct HandoverProcess {
    pub state: HandoverState,
    child: Arc<Mutex<Child>>,
    stdout_task: JoinHandle<()>,
    stderr_task: JoinHandle<()>,
    watcher_stop_tx: Option<mpsc::Sender<()>>,
    watcher_join_handle: Option<thread::JoinHandle<()>>,
}

#[derive(Clone)]
pub struct HandoverMap(Arc<Mutex<HashMap<String, HandoverProcess>>>);

impl HandoverMap {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }

    pub async fn get_state(&self, session_id: &str) -> Option<HandoverState> {
        self.0
            .lock()
            .await
            .get(session_id)
            .map(|process| process.state.clone())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn start(
        &self,
        cli_path: &str,
        session_id: String,
        cli_session_id: String,
        cwd: Option<&str>,
        app: AppHandle,
        jsonl_path: Option<PathBuf>,
        existing_uuids: HashSet<String>,
    ) -> AppResult<HandoverState> {
        if let Some(existing) = self.get_state(&session_id).await {
            return Ok(existing);
        }

        let mut command = Command::new(cli_path);
        command
            .arg("remote-control")
            .arg("--resume")
            .arg(&cli_session_id)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(cwd) = cwd {
            command.current_dir(cwd);
        }

        let mut child = command
            .spawn()
            .map_err(|e| AppError::Bridge(format!("Failed to start handover process: {}", e)))?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AppError::Bridge("Failed to capture handover stdout from claude".to_string())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            AppError::Bridge("Failed to capture handover stderr from claude".to_string())
        })?;

        let (url_tx, url_rx) = oneshot::channel();
        let stdout_task = tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            let mut url_sender = Some(url_tx);
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("handover stdout: {}", line);
                if let Some(sender) = url_sender.take() {
                    if let Some(url) = extract_relay_url(&line) {
                        let _ = sender.send(url);
                    } else {
                        url_sender = Some(sender);
                    }
                }
            }
        });

        let stderr_task = tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!("handover stderr: {}", line);
            }
        });

        let relay_url = timeout(Duration::from_secs(20), url_rx)
            .await
            .map_err(|_| {
                AppError::Bridge(
                    "Timed out waiting for relay URL from `claude remote-control`".to_string(),
                )
            })?
            .map_err(|_| {
                AppError::Bridge(
                    "Handover process exited before publishing a relay URL".to_string(),
                )
            })?;

        let (watcher_stop_tx, watcher_join_handle) = if let Some(path) = jsonl_path {
            let initial_offset = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
            let initial_seen = Arc::new(ParkingMutex::new(existing_uuids));
            let byte_offset = Arc::new(AtomicU64::new(initial_offset));
            let (stop_tx, join_handle) =
                spawn_jsonl_watcher(app, session_id.clone(), path, byte_offset, initial_seen);
            (Some(stop_tx), Some(join_handle))
        } else {
            (None, None)
        };

        let state = HandoverState {
            session_id: session_id.clone(),
            cli_session_id,
            relay_url,
            started_at: chrono::Utc::now().to_rfc3339(),
        };

        self.0.lock().await.insert(
            session_id,
            HandoverProcess {
                state: state.clone(),
                child: Arc::new(Mutex::new(child)),
                stdout_task,
                stderr_task,
                watcher_stop_tx,
                watcher_join_handle,
            },
        );

        Ok(state)
    }

    pub async fn stop(&self, session_id: &str) -> AppResult<()> {
        let process = self.0.lock().await.remove(session_id);
        if let Some(mut process) = process {
            if let Some(stop_tx) = process.watcher_stop_tx.take() {
                let _ = stop_tx.send(());
            }
            if let Some(join_handle) = process.watcher_join_handle.take() {
                let _ = join_handle.join();
            }
            process.stdout_task.abort();
            process.stderr_task.abort();
            let mut child = process.child.lock().await;
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        Ok(())
    }

    pub async fn shutdown_all(&self) {
        let session_ids = self.0.lock().await.keys().cloned().collect::<Vec<_>>();
        for session_id in session_ids {
            let _ = self.stop(&session_id).await;
        }
    }
}

impl Default for HandoverMap {
    fn default() -> Self {
        Self::new()
    }
}

pub fn compute_jsonl_path(project_path: &str, cli_session_id: &str) -> PathBuf {
    let encoded = project_path.replace('/', "-");
    dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/projects")
        .join(encoded)
        .join(format!("{}.jsonl", cli_session_id))
}

pub fn read_jsonl_from_offset(path: &Path, byte_offset: u64) -> AppResult<Vec<JsonlLine>> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(byte_offset))?;
    let reader = BufReader::new(file);
    let mut entries = Vec::new();
    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<JsonlLine>(trimmed) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                tracing::warn!(
                    line = %trimmed,
                    error = %e,
                    "Skipping malformed JSONL line in handover watcher"
                );
            }
        }
    }
    Ok(entries)
}

fn parse_messages_from_offset(path: &Path, byte_offset: u64) -> AppResult<Vec<MessageInsert>> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(byte_offset))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    if buf.is_empty() {
        return Ok(Vec::new());
    }
    let parsed = parse_jsonl_reader(std::io::Cursor::new(buf))?;
    Ok(parsed.messages)
}

fn spawn_jsonl_watcher(
    app: AppHandle,
    session_id: String,
    jsonl_path: PathBuf,
    byte_offset: Arc<AtomicU64>,
    seen_uuids: Arc<ParkingMutex<HashSet<String>>>,
) -> (mpsc::Sender<()>, thread::JoinHandle<()>) {
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
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
                tracing::warn!(error = %err, "failed to create handover jsonl watcher");
                return;
            }
        };

        let watch_target = jsonl_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| jsonl_path.clone());
        if let Err(err) = watcher.watch(&watch_target, RecursiveMode::NonRecursive) {
            tracing::warn!(
                target = %watch_target.display(),
                error = %err,
                "failed to start handover jsonl watcher"
            );
            return;
        }

        run_watch_loop(
            app,
            session_id,
            jsonl_path,
            byte_offset,
            seen_uuids,
            raw_rx,
            stop_rx,
        );
    });

    (stop_tx, join_handle)
}

fn run_watch_loop(
    app: AppHandle,
    session_id: String,
    jsonl_path: PathBuf,
    byte_offset: Arc<AtomicU64>,
    seen_uuids: Arc<ParkingMutex<HashSet<String>>>,
    raw_rx: mpsc::Receiver<notify::Result<Event>>,
    stop_rx: mpsc::Receiver<()>,
) {
    let debounce_window = Duration::from_millis(WATCH_DEBOUNCE_MS);
    let poll_window = Duration::from_millis(WATCH_IDLE_POLL_MS);
    let mut last_event_at: Option<Instant> = None;
    let mut changed = false;

    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match raw_rx.recv_timeout(poll_window) {
            Ok(Ok(_event)) => {
                changed = true;
                last_event_at = Some(Instant::now());
            }
            Ok(Err(err)) => {
                tracing::warn!(error = %err, "handover watcher reported an error");
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if !changed {
            continue;
        }

        if let Some(last_event_at) = last_event_at {
            if last_event_at.elapsed() < debounce_window {
                continue;
            }
        }

        let previous_offset = byte_offset.load(Ordering::Relaxed);
        let current_len = std::fs::metadata(&jsonl_path)
            .map(|meta| meta.len())
            .unwrap_or(previous_offset);
        if current_len < previous_offset {
            byte_offset.store(0, Ordering::Relaxed);
            seen_uuids.lock().clear();
        }

        match parse_messages_from_offset(&jsonl_path, byte_offset.load(Ordering::Relaxed)) {
            Ok(messages) => {
                for message in messages {
                    let Some(uuid) = message.uuid.clone() else {
                        continue;
                    };
                    if !matches!(message.role.as_str(), "user" | "assistant") {
                        continue;
                    }

                    let mut seen = seen_uuids.lock();
                    if seen.contains(&uuid) {
                        continue;
                    }
                    seen.insert(uuid.clone());
                    drop(seen);

                    let payload = RemoteMessagePayload {
                        session_id: session_id.clone(),
                        uuid,
                        role: message.role,
                        content: message.content,
                        model: message.model,
                        input_tokens: message.usage.as_ref().and_then(|usage| usage.input_tokens),
                        output_tokens: message.usage.as_ref().and_then(|usage| usage.output_tokens),
                        thinking_tokens: message
                            .usage
                            .as_ref()
                            .and_then(|usage| usage.thinking_tokens),
                        stop_reason: message.stop_reason,
                        is_error: message.is_error,
                        parent_uuid: message.parent_uuid,
                        timestamp: message.timestamp.unwrap_or_default(),
                    };

                    if let Err(err) = app.emit("session:remote-message", &payload) {
                        tracing::warn!(error = %err, "failed to emit session:remote-message");
                    }
                }
            }
            Err(err) => {
                tracing::warn!(error = %err, "failed to read JSONL in handover watcher");
            }
        }

        byte_offset.store(current_len, Ordering::Relaxed);
        changed = false;
        last_event_at = None;
    }
}

#[cfg(test)]
mod tests {
    use super::{compute_jsonl_path, extract_relay_url, read_jsonl_from_offset};
    use std::io::Write;

    #[test]
    fn extracts_relay_url_from_stdout_line() {
        let line = "Open this link on your phone: https://claude.ai/code/abc_DEF-123";
        assert_eq!(
            extract_relay_url(line).as_deref(),
            Some("https://claude.ai/code/abc_DEF-123")
        );
    }

    #[test]
    fn ignores_lines_without_relay_url() {
        assert!(extract_relay_url("waiting for tunnel").is_none());
    }

    #[test]
    fn compute_jsonl_path_encodes_slashes() {
        let path = compute_jsonl_path("/Users/alice/projects/myapp", "session-uuid-123");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("-Users-alice-projects-myapp"));
        assert!(path_str.ends_with("session-uuid-123.jsonl"));
    }

    #[test]
    fn tail_reads_new_lines_from_offset() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("session.jsonl");

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .expect("open");
        writeln!(
            file,
            r#"{{"type":"user","uuid":"u1","message":{{"role":"user","content":"hello"}}}}"#
        )
        .expect("write");
        writeln!(
            file,
            r#"{{"type":"assistant","uuid":"a1","message":{{"role":"assistant","content":[{{"type":"text","text":"hi"}}]}}}}"#
        )
        .expect("write");
        drop(file);

        let initial_offset = std::fs::metadata(&path).expect("metadata").len();

        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .expect("append");
        writeln!(
            file,
            r#"{{"type":"user","uuid":"u2","message":{{"role":"user","content":"second"}}}}"#
        )
        .expect("write");
        drop(file);

        let new_entries = read_jsonl_from_offset(&path, initial_offset).expect("tail");
        assert_eq!(new_entries.len(), 1);
        assert_eq!(new_entries[0].uuid.as_deref(), Some("u2"));
    }
}
