//! Session handover via `claude --resume <session-id> --remote-control` (CHI-344).

pub mod reconcile;

use crate::import::jsonl::{parse_jsonl_reader, JsonlLine, MessageInsert};
use crate::{AppError, AppResult};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex as ParkingMutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtySize};
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;

const WATCH_IDLE_POLL_MS: u64 = 100;
const WATCH_DEBOUNCE_MS: u64 = 200;

fn relay_url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"https://claude\.ai/code(?:/[A-Za-z0-9_-]+|\?bridge=[A-Za-z0-9_-]+)")
            .expect("valid relay URL regex")
    })
}

fn extract_relay_url(line: &str) -> Option<String> {
    relay_url_regex()
        .find(line)
        .map(|matched| matched.as_str().to_string())
}

fn truncate_for_logs(text: &str, max_chars: usize) -> String {
    let count = text.chars().count();
    if count <= max_chars {
        return text.to_string();
    }
    let truncated = text.chars().take(max_chars).collect::<String>();
    format!("{}…", truncated)
}

/// Keep the *tail* of `text` (up to `max_chars` Unicode scalar values).
/// Used for rolling buffers where recent output matters more than old output.
fn keep_tail(text: &str, max_chars: usize) -> String {
    let count = text.chars().count();
    if count <= max_chars {
        return text.to_string();
    }
    text.chars().skip(count - max_chars).collect()
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
    killer: Box<dyn ChildKiller + Send + Sync>,
    output_join_handle: Option<thread::JoinHandle<()>>,
    wait_join_handle: Option<thread::JoinHandle<()>>,
    watcher_stop_tx: Option<mpsc::Sender<()>>,
    watcher_join_handle: Option<thread::JoinHandle<()>>,
    debug_file_path: PathBuf,
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

        let debug_file_path = std::env::temp_dir().join(format!(
            "chief-wiggum-handover-{}-{}.log",
            session_id,
            chrono::Utc::now().timestamp()
        ));

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Bridge(format!("Failed to create handover PTY: {}", e)))?;

        let mut command = CommandBuilder::new(cli_path);
        command.arg("--resume");
        command.arg(&cli_session_id);
        command.arg("--remote-control");
        command.arg("--debug-file");
        command.arg(&debug_file_path);
        if let Some(cwd) = cwd {
            command.cwd(cwd);
        }
        // Match bridge spawning behavior so Claude doesn't think this is nested.
        command.env("CLAUDECODE", "");

        tracing::info!(
            session_id = %session_id,
            cli_session_id = %cli_session_id,
            cli_path = %cli_path,
            cwd = ?cwd,
            debug_file = %debug_file_path.display(),
            "starting handover process",
        );

        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| AppError::Bridge(format!("Failed to start handover process: {}", e)))?;
        let mut killer = child.clone_killer();
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Bridge(format!("Failed to clone handover PTY reader: {}", e)))?;

        let (url_tx, url_rx) = oneshot::channel();
        let output_tail = Arc::new(ParkingMutex::new(String::new()));

        let output_tail_reader = output_tail.clone();
        let output_join_handle = std::thread::Builder::new()
            .name("handover-reader".to_string())
            .spawn(move || {
                let mut buf = [0_u8; 4096];
                let mut search_window = String::new();
                let mut url_sender = Some(url_tx);

                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                            tracing::info!(
                                bytes = n,
                                chunk = %truncate_for_logs(&chunk, 240),
                                "handover stdout chunk",
                            );

                            {
                                let mut tail = output_tail_reader.lock();
                                tail.push_str(&chunk);
                                *tail = keep_tail(&tail, 4000);
                            }

                            search_window.push_str(&chunk);
                            search_window = keep_tail(&search_window, 8000);

                            if let Some(sender) = url_sender.take() {
                                if let Some(url) = extract_relay_url(&search_window) {
                                    tracing::info!(relay_url = %url, "handover relay URL detected");
                                    let _ = sender.send(url);
                                } else {
                                    url_sender = Some(sender);
                                }
                            }
                        }
                        Err(err) => {
                            tracing::warn!(error = %err, "handover stdout read failed");
                            break;
                        }
                    }
                }

                tracing::info!("handover stdout reader exited");
            })
            .map_err(|e| {
                AppError::Bridge(format!("Failed to spawn handover reader thread: {}", e))
            })?;

        let wait_join_handle = std::thread::Builder::new()
            .name("handover-wait".to_string())
            .spawn(move || match child.wait() {
                Ok(status) => {
                    tracing::info!(exit_code = status.exit_code(), "handover process exited")
                }
                Err(err) => tracing::warn!(error = %err, "handover process wait failed"),
            })
            .map_err(|e| {
                AppError::Bridge(format!("Failed to spawn handover wait thread: {}", e))
            })?;

        let relay_url = match timeout(Duration::from_secs(20), url_rx).await {
            Ok(Ok(url)) => url,
            Err(_) => {
                let output_tail = output_tail.lock().clone();
                tracing::error!(
                    session_id = %session_id,
                    cli_session_id = %cli_session_id,
                    output_tail = %keep_tail(&output_tail, 600),
                    debug_file = %debug_file_path.display(),
                    "timed out waiting for handover relay URL",
                );
                let _ = killer.kill();
                let _ = output_join_handle.join();
                let _ = wait_join_handle.join();
                let _ = std::fs::remove_file(&debug_file_path);
                return Err(AppError::Bridge(
                    "Timed out waiting for relay URL from `claude --resume <id> --remote-control`. Check that the session is still active and the CLI is authenticated.".to_string(),
                ));
            }
            Ok(Err(_)) => {
                let output_tail = output_tail.lock().clone();
                tracing::error!(
                    session_id = %session_id,
                    cli_session_id = %cli_session_id,
                    output_tail = %keep_tail(&output_tail, 600),
                    debug_file = %debug_file_path.display(),
                    "handover process exited before publishing a relay URL",
                );
                let _ = killer.kill();
                let _ = output_join_handle.join();
                let _ = wait_join_handle.join();
                let _ = std::fs::remove_file(&debug_file_path);
                return Err(AppError::Bridge(
                    "Handover process exited before publishing a relay URL. Ensure the CLI session ID is valid and the CLI is up to date.".to_string(),
                ));
            }
        };

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
                killer,
                output_join_handle: Some(output_join_handle),
                wait_join_handle: Some(wait_join_handle),
                watcher_stop_tx,
                watcher_join_handle,
                debug_file_path: debug_file_path.clone(),
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
            let _ = process.killer.kill();
            if let Some(join_handle) = process.output_join_handle.take() {
                let _ = join_handle.join();
            }
            if let Some(join_handle) = process.wait_join_handle.take() {
                let _ = join_handle.join();
            }
            let _ = std::fs::remove_file(&process.debug_file_path);
            tracing::debug!(
                path = %process.debug_file_path.display(),
                "removed handover debug file"
            );
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
    let encoded = crate::paths::encode_project_path(project_path);
    let home = dirs::home_dir().unwrap_or_else(|| {
        tracing::warn!("home_dir() returned None — JSONL path will be relative to filesystem root");
        PathBuf::new()
    });
    home.join(".claude/projects")
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
        let did_shrink = current_len < previous_offset;
        if did_shrink {
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

        let final_len = if did_shrink {
            std::fs::metadata(&jsonl_path)
                .map(|meta| meta.len())
                .unwrap_or_else(|_| byte_offset.load(Ordering::Relaxed))
        } else {
            current_len
        };
        byte_offset.store(final_len, Ordering::Relaxed);
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
    fn extracts_session_relay_url_from_remote_control_status_line() {
        let line =
            "/remote-control is active. Code in CLI or at https://claude.ai/code/session_01TPAFXgT5KJwu99XchGbq6";
        assert_eq!(
            extract_relay_url(line).as_deref(),
            Some("https://claude.ai/code/session_01TPAFXgT5KJwu99XchGbq6")
        );
    }

    #[test]
    fn extracts_bridge_relay_url_from_spawn_mode_output() {
        let line =
            "Continue coding in the Claude app or https://claude.ai/code?bridge=env_018zn9ZMg9eqEBvB32XrnCDS";
        assert_eq!(
            extract_relay_url(line).as_deref(),
            Some("https://claude.ai/code?bridge=env_018zn9ZMg9eqEBvB32XrnCDS")
        );
    }

    #[test]
    fn ignores_lines_without_relay_url() {
        assert!(extract_relay_url("waiting for tunnel").is_none());
    }

    #[test]
    fn compute_jsonl_path_builds_expected_path() {
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
