//! Logging initialization: composable 3-layer tracing subscriber.
//!
//! 1. Console layer — stdout, pretty (dev) / compact (release), env filter
//! 2. Rolling file layer — daily rotation, JSON format, platform-aware path
//! 3. Ring buffer layer — in-memory VecDeque for export/forwarding

use std::path::PathBuf;

use tracing_appender::rolling;
use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;

use super::ring_buffer::{RingBufferHandle, RingBufferLayer};

/// Global ring buffer handle, set once during init.
static RING_BUFFER: std::sync::OnceLock<RingBufferHandle> = std::sync::OnceLock::new();

/// Initialize the 3-layer tracing subscriber.
///
/// Must be called exactly once, before any tracing macros.
/// Returns the ring buffer handle for export access.
pub fn init_logging() -> RingBufferHandle {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    // Layer 1: Console
    let console_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_span_events(FmtSpan::NONE);

    #[cfg(debug_assertions)]
    let console_layer = console_layer.pretty();

    #[cfg(not(debug_assertions))]
    let console_layer = console_layer.compact();

    // Layer 2: Rolling file (JSON format)
    let log_dir = log_directory_path();
    let file_appender = rolling::daily(&log_dir, "chiefwiggum.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Leak the guard so the non-blocking writer lives for the process lifetime.
    // This is intentional — the app process owns the logger.
    std::mem::forget(_guard);

    let file_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(non_blocking)
        .with_target(true)
        .with_span_events(FmtSpan::NONE);

    // Layer 3: Ring buffer (in-memory)
    let (ring_layer, ring_handle) = RingBufferLayer::new();

    // Compose and install
    tracing_subscriber::registry()
        .with(env_filter)
        .with(console_layer)
        .with(file_layer)
        .with(ring_layer)
        .init();

    // Clean up old log files (>30 days)
    cleanup_old_logs(&log_dir);

    // Store handle globally for access via get_ring_buffer()
    let _ = RING_BUFFER.set(ring_handle.clone());

    ring_handle
}

/// Get the global ring buffer handle.
/// Returns None if logging hasn't been initialized yet.
pub fn get_ring_buffer() -> Option<RingBufferHandle> {
    RING_BUFFER.get().cloned()
}

/// Platform-aware log directory.
///
/// - macOS: `~/Library/Logs/com.fcostudios.chiefwiggum/`
/// - Windows: `%APPDATA%/fcostudios/Chief Wiggum/logs/`
/// - Linux: `~/.local/share/chief-wiggum/logs/`
/// - Fallback: `~/.chiefwiggum/logs/`
pub(crate) fn log_directory_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            return home.join("Library/Logs/com.fcostudios.chiefwiggum");
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = dirs::data_dir() {
            return appdata.join("fcostudios").join("Chief Wiggum").join("logs");
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(data) = dirs::data_local_dir() {
            return data.join("chief-wiggum").join("logs");
        }
    }

    // Fallback — same parent as DB
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".chiefwiggum")
        .join("logs")
}

/// Remove log files older than 30 days.
fn cleanup_old_logs(log_dir: &PathBuf) {
    let Ok(entries) = std::fs::read_dir(log_dir) else {
        return;
    };

    let cutoff = chrono::Utc::now() - chrono::Duration::days(30);

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "log") {
            continue;
        }
        if let Ok(metadata) = path.metadata() {
            if let Ok(modified) = metadata.modified() {
                let modified: chrono::DateTime<chrono::Utc> = modified.into();
                if modified < cutoff {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_directory_returns_valid_path() {
        let dir = log_directory_path();
        assert!(!dir.as_os_str().is_empty());
        let dir_str = dir.to_string_lossy();
        assert!(
            dir_str.contains("log") || dir_str.contains("Log"),
            "Expected log-related path, got: {}",
            dir_str
        );
    }

    #[test]
    fn cleanup_handles_missing_directory() {
        let nonexistent = PathBuf::from("/tmp/chiefwiggum-test-nonexistent-logs");
        cleanup_old_logs(&nonexistent);
    }
}
