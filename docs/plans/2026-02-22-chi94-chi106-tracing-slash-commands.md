# 3-Layer Tracing (CHI-94) & Slash Command Discovery (CHI-106) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a composable 3-layer logging system (console + file + ring buffer) and a Rust backend for discovering slash commands from built-in definitions, project files, and user files.

**Architecture:** CHI-94 creates a new `logging/` module that replaces the current `tracing_subscriber::fmt().init()` in `main.rs` with a registry-based 3-layer subscriber. The ring buffer layer stores the last ~36K entries in a `VecDeque` protected by `parking_lot::Mutex`. CHI-106 creates a new `slash/` module with a filesystem scanner that reads `.md` files from `.claude/commands/` directories, merges with hardcoded built-in commands, and serves the result via two IPC commands.

**Tech Stack:** Rust (tracing, tracing-subscriber, tracing-appender, parking_lot), Tauri v2 IPC, dirs crate (already in Cargo.toml)

---

## Task 1: Add Dependencies for CHI-94

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add tracing-appender and parking_lot**

In `src-tauri/Cargo.toml`, add these under `[dependencies]`:

```toml
# Rolling file logger (CHI-94)
tracing-appender = "0.2"

# Non-poisoning fast mutex (CHI-94)
parking_lot = "0.12"
```

Note: `dirs = "6"` and `tracing-subscriber` (with `env-filter`) are already present.

**Step 2: Verify it compiles**

Run: `cargo check -p chief-wiggum`
Expected: Clean compilation

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "chore: add tracing-appender and parking_lot deps (CHI-94)"
```

---

## Task 2: RingBufferLayer Implementation

**Files:**
- Create: `src-tauri/src/logging/ring_buffer.rs`

**Step 1: Create the ring buffer layer**

```rust
//! In-memory ring buffer layer for tracing.
//! Captures the last ~36,000 log entries (~10 min at 60 events/sec, ~15MB budget).
//! Uses parking_lot::Mutex for non-poisoning, fast locking.

use std::collections::VecDeque;
use std::fmt;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

/// Maximum entries in the ring buffer (~10 min at 60 events/sec).
const DEFAULT_MAX_ENTRIES: usize = 36_000;

/// A single captured log entry.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields: Vec<(String, String)>,
}

/// Visitor that extracts the message and fields from a tracing event.
struct FieldVisitor {
    message: String,
    fields: Vec<(String, String)>,
}

impl FieldVisitor {
    fn new() -> Self {
        Self {
            message: String::new(),
            fields: Vec::new(),
        }
    }
}

impl Visit for FieldVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{:?}", value);
        } else {
            self.fields.push((field.name().to_string(), format!("{:?}", value)));
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else {
            self.fields.push((field.name().to_string(), value.to_string()));
        }
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields.push((field.name().to_string(), value.to_string()));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields.push((field.name().to_string(), value.to_string()));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields.push((field.name().to_string(), value.to_string()));
    }
}

/// Shared handle to the ring buffer's inner storage.
pub type RingBufferHandle = Arc<Mutex<VecDeque<LogEntry>>>;

/// A tracing layer that captures events into a bounded ring buffer.
pub struct RingBufferLayer {
    buffer: RingBufferHandle,
    max_entries: usize,
}

impl RingBufferLayer {
    /// Create a new ring buffer layer with default capacity.
    pub fn new() -> (Self, RingBufferHandle) {
        Self::with_capacity(DEFAULT_MAX_ENTRIES)
    }

    /// Create a new ring buffer layer with a specific capacity.
    pub fn with_capacity(max_entries: usize) -> (Self, RingBufferHandle) {
        let buffer = Arc::new(Mutex::new(VecDeque::with_capacity(
            max_entries.min(1024), // Don't pre-allocate the full 36K
        )));
        let handle = buffer.clone();
        (Self { buffer, max_entries }, handle)
    }
}

impl<S: Subscriber> Layer<S> for RingBufferLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        let level = *metadata.level();

        let mut visitor = FieldVisitor::new();
        event.record(&mut visitor);

        let entry = LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: level_str(level),
            target: metadata.target().to_string(),
            message: visitor.message,
            fields: visitor.fields,
        };

        let mut buf = self.buffer.lock();
        if buf.len() >= self.max_entries {
            buf.pop_front();
        }
        buf.push_back(entry);
    }
}

fn level_str(level: Level) -> String {
    match level {
        Level::ERROR => "ERROR".to_string(),
        Level::WARN => "WARN".to_string(),
        Level::INFO => "INFO".to_string(),
        Level::DEBUG => "DEBUG".to_string(),
        Level::TRACE => "TRACE".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::prelude::*;

    #[test]
    fn ring_buffer_captures_events() {
        let (layer, handle) = RingBufferLayer::new();
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("hello world");
            tracing::warn!("something happened");
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 2);
        assert_eq!(buf[0].level, "INFO");
        assert!(buf[0].message.contains("hello world"));
        assert_eq!(buf[1].level, "WARN");
    }

    #[test]
    fn ring_buffer_evicts_oldest_on_overflow() {
        let (layer, handle) = RingBufferLayer::with_capacity(3);
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("one");
            tracing::info!("two");
            tracing::info!("three");
            tracing::info!("four"); // Evicts "one"
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 3);
        assert!(buf[0].message.contains("two"));
        assert!(buf[2].message.contains("four"));
    }

    #[test]
    fn ring_buffer_captures_fields() {
        let (layer, handle) = RingBufferLayer::new();
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(session_id = "s1", tokens = 42, "processing");
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 1);
        assert!(buf[0].fields.iter().any(|(k, _)| k == "session_id"));
        assert!(buf[0].fields.iter().any(|(k, _)| k == "tokens"));
    }

    #[test]
    fn empty_buffer_drain() {
        let (layer, handle) = RingBufferLayer::new();
        let subscriber = tracing_subscriber::registry().with(layer);

        tracing::subscriber::with_default(subscriber, || {
            // No events
        });

        let buf = handle.lock();
        assert_eq!(buf.len(), 0);
    }
}
```

**Step 2: Run tests**

Run: `cargo test -p chief-wiggum ring_buffer`
Expected: 4 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/logging/ring_buffer.rs
git commit -m "feat: RingBufferLayer for in-memory log capture (CHI-94)"
```

---

## Task 3: Logging Module Init + File Layer

**Files:**
- Create: `src-tauri/src/logging/mod.rs`
- Create: `src-tauri/src/logging/init.rs`
- Modify: `src-tauri/src/lib.rs` — add `pub mod logging;`

**Step 1: Create `logging/mod.rs`**

```rust
//! Structured logging with 3 layers: console, rolling file, in-memory ring buffer.
//! Replaces the previous single-layer tracing setup in main.rs.
//!
//! Architecture: SPEC-004 §2, CHI-94

pub mod init;
pub mod ring_buffer;

pub use init::init_logging;
pub use ring_buffer::{LogEntry, RingBufferHandle};
```

**Step 2: Create `logging/init.rs`**

```rust
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
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

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
    let log_dir = log_directory();
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
fn log_directory() -> PathBuf {
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
        return; // Directory may not exist yet
    };

    let cutoff = chrono::Utc::now() - chrono::Duration::days(30);

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().is_some_and(|ext| ext == "log") {
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
        let dir = log_directory();
        assert!(!dir.as_os_str().is_empty());
        // Should end with a logs-related component
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
        cleanup_old_logs(&nonexistent); // Should not panic
    }
}
```

**Step 3: Register the module in `lib.rs`**

Add to `src-tauri/src/lib.rs` after `pub mod db;`:

```rust
pub mod logging;
```

**Step 4: Run tests**

Run: `cargo test -p chief-wiggum -- logging`
Expected: 6 tests pass (4 ring_buffer + 2 init)

**Step 5: Commit**

```bash
git add src-tauri/src/logging/ src-tauri/src/lib.rs
git commit -m "feat: 3-layer logging module with console, file, and ring buffer (CHI-94)"
```

---

## Task 4: Wire Logging Init to main.rs

**Files:**
- Modify: `src-tauri/src/main.rs`

**Step 1: Replace the tracing setup**

Replace lines 9-15 in `main.rs`:

```rust
    // Initialize tracing subscriber for structured logging per GUIDE-001 §2.5
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
```

With:

```rust
    // Initialize 3-layer tracing: console + rolling file + ring buffer (CHI-94)
    let _ring_buffer = chief_wiggum_lib::logging::init_logging();
```

**Step 2: Verify compilation and tests**

Run: `cargo check -p chief-wiggum && cargo test -p chief-wiggum`
Expected: Clean compilation, all ~90 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: wire 3-layer logging init to main.rs (CHI-94)"
```

---

## Task 5: Slash Command Types and Built-in Registry

**Files:**
- Create: `src-tauri/src/slash/mod.rs`

**Step 1: Create the slash module with types and built-in commands**

```rust
//! Slash command discovery: built-in, project, and user commands.
//! Per CHI-106: foundation for all slash command tasks.

pub mod scanner;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Category indicating where a slash command was discovered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CommandCategory {
    Builtin,
    Project,
    User,
}

/// A discovered slash command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommand {
    /// Command name (without leading `/`).
    pub name: String,
    /// Short description shown in autocomplete.
    pub description: String,
    /// Where this command came from.
    pub category: CommandCategory,
    /// Hint for expected arguments, e.g. `"<model-name>"`.
    pub args_hint: Option<String>,
    /// Filesystem path for file-scanned commands (None for built-in).
    pub source_path: Option<PathBuf>,
    /// Whether this command was discovered from the Agent SDK (Phase B).
    pub from_sdk: bool,
}

/// Built-in slash commands (always available).
pub fn builtin_commands() -> Vec<SlashCommand> {
    vec![
        SlashCommand {
            name: "clear".to_string(),
            description: "Clear conversation history".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "compact".to_string(),
            description: "Compact context window".to_string(),
            category: CommandCategory::Builtin,
            args_hint: Some("[instructions]".to_string()),
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "cost".to_string(),
            description: "Show session cost summary".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "doctor".to_string(),
            description: "Check CLI health".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "help".to_string(),
            description: "Show help and available commands".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "memory".to_string(),
            description: "View/edit CLAUDE.md".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "model".to_string(),
            description: "Switch model".to_string(),
            category: CommandCategory::Builtin,
            args_hint: Some("<model-name>".to_string()),
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "permissions".to_string(),
            description: "View permission settings".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "review".to_string(),
            description: "Code review mode".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "status".to_string(),
            description: "Show CLI status".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
        SlashCommand {
            name: "vim".to_string(),
            description: "Toggle vim mode".to_string(),
            category: CommandCategory::Builtin,
            args_hint: None,
            source_path: None,
            from_sdk: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_commands_has_minimum_set() {
        let commands = builtin_commands();
        assert!(commands.len() >= 10, "Expected at least 10 built-in commands");

        let names: Vec<&str> = commands.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"clear"));
        assert!(names.contains(&"model"));
        assert!(names.contains(&"compact"));
        assert!(names.contains(&"cost"));
    }

    #[test]
    fn builtin_commands_all_have_builtin_category() {
        for cmd in builtin_commands() {
            assert_eq!(cmd.category, CommandCategory::Builtin);
            assert!(!cmd.from_sdk);
            assert!(cmd.source_path.is_none());
        }
    }

    #[test]
    fn slash_command_serializes() {
        let cmd = SlashCommand {
            name: "test".to_string(),
            description: "Test command".to_string(),
            category: CommandCategory::Project,
            args_hint: Some("<file>".to_string()),
            source_path: Some(PathBuf::from("/tmp/test.md")),
            from_sdk: false,
        };
        let json = serde_json::to_string(&cmd).expect("should serialize");
        assert!(json.contains("\"name\":\"test\""));
        assert!(json.contains("\"Project\""));
    }
}
```

**Step 2: Register the module in `lib.rs`**

Add to `src-tauri/src/lib.rs` after `pub mod logging;`:

```rust
pub mod slash;
```

**Step 3: Run tests**

Run: `cargo test -p chief-wiggum -- slash`
Expected: 3 tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/slash/mod.rs src-tauri/src/lib.rs
git commit -m "feat: slash command types and built-in registry (CHI-106)"
```

---

## Task 6: Filesystem Scanner for .md Command Files

**Files:**
- Create: `src-tauri/src/slash/scanner.rs`

**Step 1: Implement the scanner**

```rust
//! Filesystem scanner for slash command `.md` files.
//! Scans project commands (`.claude/commands/`) and user commands (`~/.claude/commands/`).
//! Extracts command name from filename and description from first line/heading.

use std::path::{Path, PathBuf};

use super::{CommandCategory, SlashCommand};

/// Scan a directory for `.md` command files.
/// Returns an empty Vec if the directory doesn't exist or is unreadable.
fn scan_directory(dir: &Path, category: CommandCategory) -> Vec<SlashCommand> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut commands = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("md") {
            continue;
        }

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if name.is_empty() {
            continue;
        }

        let description = extract_description(&path);

        commands.push(SlashCommand {
            name,
            description,
            category: category.clone(),
            args_hint: None,
            source_path: Some(path),
            from_sdk: false,
        });
    }

    commands.sort_by(|a, b| a.name.cmp(&b.name));
    commands
}

/// Extract a description from the first meaningful line of a `.md` file.
/// Priority: first `# heading`, then first non-empty line, else "Custom command".
fn extract_description(path: &Path) -> String {
    let Ok(content) = std::fs::read_to_string(path) else {
        return "Custom command".to_string();
    };

    // Look for YAML frontmatter description
    if content.starts_with("---") {
        let mut in_frontmatter = true;
        for line in content.lines().skip(1) {
            if line.trim() == "---" {
                in_frontmatter = false;
                continue;
            }
            if in_frontmatter {
                let trimmed = line.trim();
                if let Some(desc) = trimmed.strip_prefix("description:") {
                    let desc = desc.trim().trim_matches('"').trim_matches('\'');
                    if !desc.is_empty() {
                        return desc.to_string();
                    }
                }
            }
        }
    }

    // Fall back to first heading or first non-empty line
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "---" {
            continue;
        }
        if let Some(heading) = trimmed.strip_prefix('#') {
            let heading = heading.trim_start_matches('#').trim();
            if !heading.is_empty() {
                return heading.to_string();
            }
        }
        // First non-empty, non-frontmatter line
        if !trimmed.starts_with("---") {
            return truncate(trimmed, 80);
        }
    }

    "Custom command".to_string()
}

/// Truncate a string to max_len, adding "..." if truncated.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

/// Scan project commands from `<project_path>/.claude/commands/`.
pub fn scan_project_commands(project_path: &Path) -> Vec<SlashCommand> {
    let commands_dir = project_path.join(".claude").join("commands");
    scan_directory(&commands_dir, CommandCategory::Project)
}

/// Scan user commands from `~/.claude/commands/`.
pub fn scan_user_commands() -> Vec<SlashCommand> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let commands_dir = home.join(".claude").join("commands");
    scan_directory(&commands_dir, CommandCategory::User)
}

/// Discover all slash commands: built-in + project + user.
/// Project commands override user commands with the same name.
/// User commands override built-in commands with the same name.
pub fn discover_all(project_path: Option<&Path>) -> Vec<SlashCommand> {
    let mut commands = super::builtin_commands();

    let user_commands = scan_user_commands();
    let project_commands = project_path
        .map(|p| scan_project_commands(p))
        .unwrap_or_default();

    // User commands override built-ins
    for cmd in user_commands {
        if let Some(pos) = commands.iter().position(|c| c.name == cmd.name) {
            commands[pos] = cmd;
        } else {
            commands.push(cmd);
        }
    }

    // Project commands override user + built-ins
    for cmd in project_commands {
        if let Some(pos) = commands.iter().position(|c| c.name == cmd.name) {
            commands[pos] = cmd;
        } else {
            commands.push(cmd);
        }
    }

    commands.sort_by(|a, b| a.name.cmp(&b.name));
    commands
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scan_nonexistent_directory_returns_empty() {
        let dir = PathBuf::from("/tmp/chiefwiggum-test-nonexistent");
        let result = scan_directory(&dir, CommandCategory::Project);
        assert!(result.is_empty());
    }

    #[test]
    fn scan_directory_finds_md_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("deploy.md"), "# Deploy to production\nSteps here.").unwrap();
        fs::write(dir.path().join("lint.md"), "Run linters on the codebase").unwrap();
        fs::write(dir.path().join("readme.txt"), "Not a command").unwrap();

        let result = scan_directory(dir.path(), CommandCategory::Project);
        assert_eq!(result.len(), 2);
        assert!(result.iter().any(|c| c.name == "deploy"));
        assert!(result.iter().any(|c| c.name == "lint"));
    }

    #[test]
    fn extract_description_from_heading() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(&path, "# Run all tests\n\nThis runs the test suite.").unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Run all tests");
    }

    #[test]
    fn extract_description_from_yaml_frontmatter() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(
            &path,
            "---\ndescription: Deploy the application\n---\n\n# Deploy\n\nDeploy steps.",
        )
        .unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Deploy the application");
    }

    #[test]
    fn extract_description_from_first_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(&path, "Run the deployment pipeline").unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Run the deployment pipeline");
    }

    #[test]
    fn extract_description_fallback_for_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.md");
        fs::write(&path, "").unwrap();

        let desc = extract_description(&path);
        assert_eq!(desc, "Custom command");
    }

    #[test]
    fn discover_all_merges_sources() {
        // Without project path, should return at least built-ins + user
        let commands = discover_all(None);
        assert!(commands.len() >= 10);
        // All built-ins should be present
        assert!(commands.iter().any(|c| c.name == "clear"));
    }

    #[test]
    fn project_commands_override_builtins() {
        let dir = tempfile::tempdir().unwrap();
        let commands_dir = dir.path().join(".claude").join("commands");
        fs::create_dir_all(&commands_dir).unwrap();
        fs::write(
            commands_dir.join("clear.md"),
            "# Custom clear\nProject-specific clear.",
        )
        .unwrap();

        let commands = discover_all(Some(dir.path()));
        let clear = commands.iter().find(|c| c.name == "clear").unwrap();
        assert_eq!(clear.category, CommandCategory::Project);
        assert_eq!(clear.description, "Custom clear");
    }

    #[test]
    fn truncate_long_description() {
        let long_text = "A".repeat(100);
        let result = truncate(&long_text, 80);
        assert_eq!(result.len(), 80);
        assert!(result.ends_with("..."));
    }

    #[test]
    fn truncate_short_description_unchanged() {
        let short = "Hello world";
        assert_eq!(truncate(short, 80), short);
    }
}
```

**Step 2: Run tests**

Run: `cargo test -p chief-wiggum -- slash`
Expected: 13 tests pass (3 from mod.rs + 10 from scanner.rs)

**Step 3: Commit**

```bash
git add src-tauri/src/slash/scanner.rs
git commit -m "feat: filesystem scanner for .md slash command files (CHI-106)"
```

---

## Task 7: IPC Commands for Slash Command Discovery

**Files:**
- Create: `src-tauri/src/commands/slash.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create IPC commands**

```rust
//! IPC commands for slash command discovery (CHI-106).

use crate::slash::{scanner, SlashCommand};
use crate::AppError;

/// List all available slash commands (built-in + project + user).
/// Called by frontend to populate autocomplete.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_slash_commands(
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    Ok(scanner::discover_all(path))
}

/// Rescan and return all slash commands (forces re-read from filesystem).
/// Called when user switches projects or explicitly refreshes.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_slash_commands(
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let path = project_path.as_deref().map(std::path::Path::new);
    Ok(scanner::discover_all(path))
}
```

**Step 2: Register in `commands/mod.rs`**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod slash;
```

**Step 3: Register in `main.rs`**

Add to the `invoke_handler` list:

```rust
chief_wiggum_lib::commands::slash::list_slash_commands,
chief_wiggum_lib::commands::slash::refresh_slash_commands,
```

**Step 4: Verify compilation and tests**

Run: `cargo check -p chief-wiggum && cargo test -p chief-wiggum`
Expected: Clean compilation, all tests pass

**Step 5: Commit**

```bash
git add src-tauri/src/commands/slash.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat: IPC commands for slash command discovery (CHI-106)"
```

---

## Task 8: Full Verification Pipeline

**Step 1: Run Rust checks**

Run: `cargo test -p chief-wiggum` — all tests pass (~97 expected)
Run: `cargo clippy -p chief-wiggum -- -D warnings` — no warnings

**Step 2: Run frontend checks**

Run: `npx tsc --noEmit` — clean
Run: `npx eslint .` — clean

**Step 3: Build**

Run: `npx vite build` — succeeds

---

## Verification Checklist

### CHI-94: 3-Layer Tracing
- [ ] `logging::init_logging()` sets up all 3 layers with `tracing_subscriber::registry()`
- [ ] Console layer uses pretty format in dev, compact in release
- [ ] File layer writes JSON to platform-appropriate log directory
- [ ] Ring buffer captures entries in `VecDeque` with size limit (36K)
- [ ] Old log files cleaned up on startup (>30 days)
- [ ] `RUST_LOG` env var still controls filtering
- [ ] `logging::get_ring_buffer()` returns handle for export access
- [ ] Unit tests: ring buffer overflow, entry capture, cleanup logic
- [ ] No performance regression

### CHI-106: Slash Command Discovery
- [ ] Built-in commands always returned (11 commands)
- [ ] Project commands scanned from `.claude/commands/` relative to active project
- [ ] User commands scanned from `~/.claude/commands/`
- [ ] `.md` frontmatter/first-line parsing for descriptions
- [ ] `list_slash_commands` IPC returns categorized list
- [ ] `refresh_slash_commands` rescans on demand
- [ ] Handles missing directories gracefully (empty list, not error)
- [ ] Unit tests: scanner, built-in list, merge logic, override priority
