# JSONL Import, Memory Optimization & Prompt Templates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the JSONL Session Import epic (CHI-303→305), close the Performance epic (CHI-295), and add Saved Prompt Templates (CHI-259).

**Architecture:** CHI-303 adds a Rust session-discovery scanner (`import/discover.rs`) with async tokio I/O; CHI-304 builds the batch-insert import engine on top of the existing `jsonl.rs` parser; CHI-305 wires SolidJS dialogs to those IPC commands. CHI-295 adds Rust build-profile tuning and a frontend message-cap. CHI-259 adds a `prompt_templates` DB table, CRUD IPC commands, and a Settings panel section.

**Tech Stack:** Rust (tokio, rusqlite, serde, tracing), SolidJS 2.x, TailwindCSS v4, Tauri v2 IPC

---

## Dependency Order

```
CHI-303 (Discovery) → CHI-304 (Engine) → CHI-305 (UI)
CHI-295 (Memory+Build)   ← independent, can go after 303 or in parallel
CHI-259 (Templates)      ← independent, fully additive
```

---

## Task 1 — CHI-303: Session Discovery Scanner

**What:** Scan `~/.claude/projects/` to find importable JSONL transcripts.

**Files:**
- Create: `src-tauri/src/import/discover.rs`
- Modify: `src-tauri/src/import/mod.rs`
- Modify: `src-tauri/src/commands/import.rs`
- Modify: `src-tauri/src/main.rs` (register command)
- Test within: `src-tauri/src/import/discover.rs` (unit tests at bottom)

### Background

Claude Code stores sessions at `~/.claude/projects/<encoded-path>/<uuid>.jsonl`:
- `<encoded-path>` is the workspace path with `/` → `-` (e.g. `/home/user/myproject` → `-home-user-myproject`)
- Each file is named by the CLI session UUID
- The DB table `sessions` has `cli_session_id TEXT` — use that to detect already-imported sessions

### Step 1.1: Write failing unit test stubs

Add to a new file `src-tauri/src/import/discover.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_fake_project(root: &TempDir, encoded_path: &str, session_id: &str, content: &str) {
        let dir = root.path().join(encoded_path);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("{}.jsonl", session_id)), content).unwrap();
    }

    #[test]
    fn decode_path_replaces_leading_dash_with_slash() {
        assert_eq!(decode_project_path("-home-user-proj"), "/home/user/proj");
    }

    #[test]
    fn scan_returns_empty_when_dir_missing() {
        let result = scan_projects_dir(std::path::Path::new("/nonexistent/path/xyz"));
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn scan_finds_jsonl_files() {
        let root = TempDir::new().unwrap();
        let line = r#"{"type":"system","subtype":"init","session_id":"abc-123","model":"claude-opus-4-5"}"#;
        make_fake_project(&root, "-home-user-myproject", "abc-123", line);
        let results = scan_projects_dir(root.path()).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].cli_session_id, "abc-123");
        assert_eq!(results[0].project_path, "/home/user/myproject");
    }

    #[test]
    fn scan_sets_already_imported_false_by_default() {
        let root = TempDir::new().unwrap();
        let line = r#"{"type":"system","subtype":"init","session_id":"xyz","model":"claude-opus-4-5"}"#;
        make_fake_project(&root, "-tmp-test", "xyz", line);
        let results = scan_projects_dir(root.path()).unwrap();
        assert!(!results[0].already_imported);
    }
}
```

Run: `cargo test -p chief-wiggum-lib import::discover` (will fail — module doesn't exist yet)

### Step 1.2: Create `discover.rs`

```rust
//! Session discovery scanner for ~/.claude/projects/ (CHI-303).
//!
//! Walks the directory tree, extracts session metadata from the first JSONL line,
//! and returns a list of importable sessions with their decoded project paths.

use crate::import::jsonl::JsonlLine;
use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tracing::{debug, warn};

/// Metadata about a discoverable JSONL session file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSession {
    /// Absolute path to the .jsonl file.
    pub file_path: String,
    /// Human-readable decoded workspace path (e.g. "/home/user/project").
    pub project_path: String,
    /// CLI session UUID extracted from the filename.
    pub cli_session_id: String,
    /// File size in bytes.
    pub file_size_bytes: u64,
    /// Approximate message count (line count minus blank lines).
    pub line_count: u64,
    /// Model string from the first init line, if present.
    pub model: Option<String>,
    /// ISO-8601 timestamp from first line's `created_at` or `timestamp`, if present.
    pub first_timestamp: Option<String>,
    /// Whether this CLI session ID is already present in the local DB.
    pub already_imported: bool,
}

/// Decode a `~/.claude/projects/<encoded>` directory name back to a filesystem path.
///
/// Claude Code encodes paths by replacing the leading `/` with `-` and subsequent
/// `/` with `-`, so `/home/user/proj` becomes `-home-user-proj`.
pub fn decode_project_path(encoded: &str) -> String {
    // Leading dash represents the root `/`
    if let Some(rest) = encoded.strip_prefix('-') {
        format!("/{}", rest.replace('-', "/"))
    } else {
        encoded.replace('-', "/")
    }
}

/// Walk `base_dir` (typically `~/.claude/projects/`) and collect all `.jsonl` files.
/// Does NOT query the DB — `already_imported` is always `false` here.
/// Call `mark_already_imported` afterwards to fill that field from the DB.
pub fn scan_projects_dir(base_dir: &Path) -> AppResult<Vec<DiscoveredSession>> {
    if !base_dir.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();

    let entries = std::fs::read_dir(base_dir).map_err(|e| {
        AppError::Io(format!("Cannot read projects dir {:?}: {}", base_dir, e))
    })?;

    for entry in entries.flatten() {
        let project_dir = entry.path();
        if !project_dir.is_dir() {
            continue;
        }
        let encoded_name = project_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let project_path = decode_project_path(&encoded_name);

        let jsonl_entries = match std::fs::read_dir(&project_dir) {
            Ok(e) => e,
            Err(e) => {
                warn!("Permission denied reading {:?}: {}", project_dir, e);
                continue;
            }
        };

        for jentry in jsonl_entries.flatten() {
            let jpath = jentry.path();
            if jpath.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let cli_session_id = jpath
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if cli_session_id.is_empty() {
                continue;
            }

            let meta = match std::fs::metadata(&jpath) {
                Ok(m) => m,
                Err(e) => {
                    warn!("Cannot stat {:?}: {}", jpath, e);
                    continue;
                }
            };

            let (line_count, model, first_timestamp) = read_first_line_metadata(&jpath);

            results.push(DiscoveredSession {
                file_path: jpath.to_string_lossy().to_string(),
                project_path: project_path.clone(),
                cli_session_id,
                file_size_bytes: meta.len(),
                line_count,
                model,
                first_timestamp,
                already_imported: false,
            });
            debug!("Discovered session at {:?}", jpath);
        }
    }

    Ok(results)
}

/// Read only the first non-blank line of a JSONL file and extract metadata.
/// Returns (approx_line_count, model, first_timestamp).
fn read_first_line_metadata(path: &Path) -> (u64, Option<String>, Option<String>) {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return (0, None, None),
    };
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let mut model = None;
    let mut first_timestamp = None;

    // Read first non-blank line
    for raw in lines.by_ref() {
        let raw = match raw {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };
        if let Ok(parsed) = serde_json::from_str::<JsonlLine>(&raw) {
            model = parsed.model;
            first_timestamp = parsed.timestamp.clone();
        }
        break;
    }

    // Count remaining lines for approx line_count
    let mut count = 1u64;
    for raw in lines {
        if raw.map(|l| !l.trim().is_empty()).unwrap_or(false) {
            count += 1;
        }
    }

    (count, model, first_timestamp)
}

/// Given a list of discovered sessions and the set of CLI session IDs already in the DB,
/// mark `already_imported = true` for any match.
pub fn mark_already_imported(
    sessions: &mut Vec<DiscoveredSession>,
    imported_cli_ids: &std::collections::HashSet<String>,
) {
    for s in sessions.iter_mut() {
        s.already_imported = imported_cli_ids.contains(&s.cli_session_id);
    }
}

#[cfg(test)]
mod tests {
    // ... (paste tests from Step 1.1 here)
}
```

**Note:** `JsonlLine` needs a `timestamp` field and `model` field exposed. Check `jsonl.rs` — if `timestamp` is not already there, add `pub timestamp: Option<String>` to the struct with `#[serde(default)]`.

### Step 1.3: Add `timestamp` + `model` to `JsonlLine` if missing

In `src-tauri/src/import/jsonl.rs`, find `pub struct JsonlLine` and verify/add:

```rust
pub struct JsonlLine {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub subtype: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub model: Option<String>,          // ← ensure this exists
    #[serde(default)]
    pub timestamp: Option<String>,      // ← add if missing
    // ... rest of fields
}
```

### Step 1.4: Export `discover` from `mod.rs`

In `src-tauri/src/import/mod.rs`:
```rust
pub mod consistency;
pub mod discover;
pub mod jsonl;
```

### Step 1.5: Add IPC command for discovery

In `src-tauri/src/commands/import.rs`, add:

```rust
use crate::db::queries::list_all_cli_session_ids;
use crate::import::discover::{
    mark_already_imported, scan_projects_dir, DiscoveredSession,
};
use std::collections::HashSet;

/// Scan ~/.claude/projects/ and return all discoverable JSONL sessions.
/// Marks sessions already present in the local DB.
#[tauri::command(rename_all = "snake_case")]
pub fn discover_importable_sessions(
    db: State<'_, Database>,
) -> Result<Vec<DiscoveredSession>, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Io("Cannot determine home directory".to_string()))?;
    let projects_dir = home.join(".claude").join("projects");

    let mut sessions = scan_projects_dir(&projects_dir)?;

    // Mark already-imported
    let cli_ids: HashSet<String> = list_all_cli_session_ids(&db)?
        .into_iter()
        .collect();
    mark_already_imported(&mut sessions, &cli_ids);

    Ok(sessions)
}
```

### Step 1.6: Add `list_all_cli_session_ids` to `queries.rs`

In `src-tauri/src/db/queries.rs`, add after `update_session_cli_id`:

```rust
/// Return all non-null cli_session_id values from the sessions table.
pub fn list_all_cli_session_ids(db: &Database) -> Result<Vec<String>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT cli_session_id FROM sessions WHERE cli_session_id IS NOT NULL",
        )?;
        let ids = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    })
}
```

### Step 1.7: Verify `dirs` crate is present

`dirs = "6"` is already in `src-tauri/Cargo.toml`. No changes needed.

### Step 1.8: Register the command in `main.rs`

In `src-tauri/src/main.rs`, find the `.invoke_handler(tauri::generate_handler![` block and add:
```rust
commands::import::discover_importable_sessions,
```

### Step 1.9: Run tests

```bash
cargo test -p chief-wiggum-lib import::discover -- --nocapture
```
Expected: all tests pass.

### Step 1.10: Run full Rust checks

```bash
cargo clippy -- -D warnings && cargo fmt --check && cargo test
```
Expected: 0 errors, 0 warnings.

### Step 1.11: Commit

```bash
git add src-tauri/src/import/discover.rs \
        src-tauri/src/import/mod.rs \
        src-tauri/src/commands/import.rs \
        src-tauri/src/db/queries.rs \
        src-tauri/src/import/jsonl.rs \
        src-tauri/src/main.rs \
        src-tauri/Cargo.toml \
        src-tauri/Cargo.lock
git commit -m "CHI-303: add session discovery scanner for ~/.claude/projects/"
```

---

## Task 2 — CHI-304: Import Engine

**What:** Batch-insert a discovered JSONL session into the local DB with conflict resolution.

**Files:**
- Create: `src-tauri/src/import/engine.rs`
- Modify: `src-tauri/src/import/mod.rs`
- Modify: `src-tauri/src/commands/import.rs`
- Modify: `src-tauri/src/main.rs`
- Tests within `engine.rs`

### Background

The existing `parse_jsonl_file()` in `jsonl.rs` already returns `JsonlParseResult` with:
- `session_id: Option<String>` — the CLI session UUID
- `metadata: JsonlSessionMetadata` — model, cli_version, tools, mcp_servers
- `messages: Vec<MessageInsert>` — ready for `insert_message()`
- `tool_uses: Vec<ToolUseRecord>` / `tool_results: Vec<ToolResultRecord>`
- `token_totals: TokenAccumulator`

**Conflict Resolution Matrix:**

| Scenario | Action |
|----------|--------|
| `cli_session_id` not in DB | Create new session, import all messages |
| Same `cli_session_id`, same message count | Skip (already imported) |
| JSONL has MORE messages than DB | Merge — insert new messages only (INSERT OR IGNORE by uuid) |
| DB has MORE messages (real-time data) | Preserve — import JSONL up to DB count, skip rest |
| No `cli_session_id` in JSONL | Create new session with generated UUID |

### Step 2.1: Write failing tests

Add to new `src-tauri/src/import/engine.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::Database;
    use crate::db::queries::{insert_message, insert_session};

    fn make_db() -> Database {
        let db = Database::open_in_memory().expect("in-memory db");
        db.run_migrations().expect("migrations");
        db
    }

    #[test]
    fn import_result_contains_session_id() {
        let db = make_db();
        let line = r#"{"type":"system","subtype":"init","session_id":"cli-abc","model":"claude-opus-4-5"}"#;
        let jsonl = r#"{"type":"user","message":{"role":"user","content":"hi"}}"#;
        let content = format!("{}\n{}", line, jsonl);
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), content).unwrap();

        let result = import_session_file(&db, tmp.path(), "proj-1").unwrap();
        assert_eq!(result.outcome, ImportOutcome::Created);
        assert!(!result.session_id.is_empty());
        assert_eq!(result.messages_imported, 1);
    }

    #[test]
    fn duplicate_import_returns_skipped() {
        let db = make_db();
        let line = r#"{"type":"system","subtype":"init","session_id":"cli-dup","model":"claude-opus-4-5"}"#;
        let content = format!("{}\n", line);
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), &content).unwrap();

        import_session_file(&db, tmp.path(), "proj-1").unwrap();
        let result2 = import_session_file(&db, tmp.path(), "proj-1").unwrap();
        assert_eq!(result2.outcome, ImportOutcome::Skipped);
        assert_eq!(result2.messages_imported, 0);
    }
}
```

Run: `cargo test -p chief-wiggum-lib import::engine` — expect FAIL (no module).

### Step 2.2: Create `engine.rs`

```rust
//! Import engine: orchestrates JSONL parsing → DB batch-insert (CHI-304).
//!
//! Uses INSERT OR IGNORE on uuid for idempotent re-imports.
//! Conflict resolution: Created | Merged | Preserved | Skipped.

use crate::db::queries::{
    count_session_messages, get_session_by_cli_id, insert_cost_event, insert_message,
    insert_session, update_session_cost,
};
use crate::import::jsonl::{parse_jsonl_file, MessageInsert};
use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{debug, info};
use uuid::Uuid;

/// Outcome of a single import attempt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportOutcome {
    /// New session created and all messages inserted.
    Created,
    /// JSONL had more messages — merged new ones into existing session.
    Merged,
    /// DB had more messages (real-time data) — skipped extra JSONL messages.
    Preserved,
    /// Identical message count, nothing to do.
    Skipped,
}

/// Summary returned after importing one JSONL file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub session_id: String,
    pub cli_session_id: Option<String>,
    pub outcome: ImportOutcome,
    pub messages_imported: usize,
    pub messages_skipped: usize,
    pub warnings: Vec<String>,
}

/// Import a single JSONL file into the database.
///
/// `project_id` is the Chief Wiggum project to associate the session with.
pub fn import_session_file(
    db: &crate::db::Database,
    path: &Path,
    project_id: &str,
) -> AppResult<ImportResult> {
    let parse = parse_jsonl_file(path)?;

    let cli_session_id = parse.session_id.clone();
    let model = parse.metadata.model.as_deref().unwrap_or("unknown");

    // --- Conflict resolution ---
    let existing = if let Some(ref cli_id) = cli_session_id {
        get_session_by_cli_id(db, cli_id)?
    } else {
        None
    };

    let (session_id, outcome_base) = if let Some(existing_session) = existing {
        let db_count = count_session_messages(db, &existing_session.id)?;
        let jsonl_count = parse.messages.len() as i64;

        if jsonl_count <= db_count {
            // DB has same or more — Skipped or Preserved
            let outcome = if jsonl_count == db_count {
                ImportOutcome::Skipped
            } else {
                ImportOutcome::Preserved
            };
            return Ok(ImportResult {
                session_id: existing_session.id,
                cli_session_id,
                outcome,
                messages_imported: 0,
                messages_skipped: parse.messages.len(),
                warnings: parse.warnings.iter().map(|w| w.message.clone()).collect(),
            });
        }
        (existing_session.id, ImportOutcome::Merged)
    } else {
        // New session
        let new_id = Uuid::new_v4().to_string();
        insert_session(db, &new_id, project_id, Some(model))?;
        if let Some(ref cli_id) = cli_session_id {
            crate::db::queries::update_session_cli_id(db, &new_id, cli_id)?;
        }
        if let Some(ref ver) = parse.metadata.cli_version {
            crate::db::queries::update_session_cli_version(db, &new_id, ver)?;
        }
        (new_id, ImportOutcome::Created)
    };

    // --- Batch insert messages ---
    let mut imported = 0usize;
    let mut skipped = 0usize;

    for msg in &parse.messages {
        let msg_id = msg.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let result = insert_message(
            db,
            &msg_id,
            &session_id,
            &msg.role,
            &msg.content,
            msg.model.as_deref(),
            msg.input_tokens,
            msg.output_tokens,
            msg.thinking_tokens,
            msg.cost_cents,
            msg.uuid.as_deref(),
            msg.parent_uuid.as_deref(),
            msg.stop_reason.as_deref(),
            Some(msg.is_error),
        );
        match result {
            Ok(_) => imported += 1,
            Err(AppError::Conflict(_)) | Err(AppError::Sqlite(_)) => {
                // INSERT OR IGNORE — uuid collision means already present
                skipped += 1;
                debug!("Skipped duplicate message uuid={:?}", msg.uuid);
            }
            Err(e) => return Err(e),
        }
    }

    // --- Update session cost totals ---
    let totals = &parse.token_totals;
    update_session_cost(
        db,
        &session_id,
        totals.input_tokens,
        totals.output_tokens,
        totals.thinking_tokens,
        totals.cache_read_tokens,
        totals.cache_write_tokens,
        0, // cost_cents accumulated from messages; leave at 0 for import
    )?;

    info!(
        session_id = %session_id,
        outcome = ?outcome_base,
        imported,
        skipped,
        "Session import complete"
    );

    Ok(ImportResult {
        session_id,
        cli_session_id,
        outcome: outcome_base,
        messages_imported: imported,
        messages_skipped: skipped,
        warnings: parse.warnings.iter().map(|w| w.message.clone()).collect(),
    })
}
```

### Step 2.3: Add missing DB helpers

In `src-tauri/src/db/queries.rs`:

**`get_session_by_cli_id`** (add after `get_session`):
```rust
/// Find a session by its CLI session ID (from Claude Code).
pub fn get_session_by_cli_id(db: &Database, cli_id: &str) -> Result<Option<SessionRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, model, status, parent_session_id,
                    total_cost_cents, total_input_tokens, total_output_tokens,
                    created_at, updated_at, cli_session_id, pinned,
                    total_thinking_tokens, total_cache_read_tokens, total_cache_write_tokens,
                    cli_version
             FROM sessions WHERE cli_session_id = ?1 LIMIT 1",
        )?;
        let row = stmt
            .query_row(rusqlite::params![cli_id], |row| {
                // Same mapping as get_session
                Ok(map_session_row(row)?)
            })
            .optional()?;
        Ok(row)
    })
}
```

**`update_session_cli_version`** (add after `update_session_cli_id`):
```rust
pub fn update_session_cli_version(
    db: &Database,
    id: &str,
    cli_version: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET cli_version = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id, cli_version],
        )?;
        Ok(())
    })
}
```

**Note:** `map_session_row` — if the session row mapping is duplicated in `get_session` and `list_sessions`, extract it into a private `fn map_session_row(row: &rusqlite::Row) -> rusqlite::Result<SessionRow>` helper. If it already exists, skip this.

**Also** ensure `INSERT INTO messages` uses `INSERT OR IGNORE` to support idempotent re-imports. Find `insert_message` in `queries.rs` and change the SQL to:
```sql
INSERT OR IGNORE INTO messages (id, session_id, role, content, ...) VALUES (...)
```

### Step 2.4: Add IPC commands for import

In `src-tauri/src/commands/import.rs`, add:

```rust
use crate::import::engine::{import_session_file, ImportResult};

/// Import a single JSONL file by absolute path into the given project.
#[tauri::command(rename_all = "snake_case")]
pub fn import_jsonl_file(
    db: State<'_, Database>,
    file_path: String,
    project_id: String,
) -> Result<ImportResult, AppError> {
    if file_path.trim().is_empty() {
        return Err(AppError::Validation("file_path cannot be empty".to_string()));
    }
    if project_id.trim().is_empty() {
        return Err(AppError::Validation("project_id cannot be empty".to_string()));
    }
    let path = std::path::PathBuf::from(&file_path);
    import_session_file(&db, &path, &project_id)
}

/// Batch-import multiple JSONL files. Returns one ImportResult per file.
/// Continues on individual failures, collects errors into the warnings field.
#[tauri::command(rename_all = "snake_case")]
pub fn import_jsonl_batch(
    db: State<'_, Database>,
    file_paths: Vec<String>,
    project_id: String,
) -> Result<Vec<ImportResult>, AppError> {
    if project_id.trim().is_empty() {
        return Err(AppError::Validation("project_id cannot be empty".to_string()));
    }
    let mut results = Vec::new();
    for fp in &file_paths {
        let path = std::path::PathBuf::from(fp);
        match import_session_file(&db, &path, &project_id) {
            Ok(r) => results.push(r),
            Err(e) => {
                results.push(ImportResult {
                    session_id: String::new(),
                    cli_session_id: None,
                    outcome: crate::import::engine::ImportOutcome::Skipped,
                    messages_imported: 0,
                    messages_skipped: 0,
                    warnings: vec![format!("Error importing {}: {}", fp, e)],
                });
            }
        }
    }
    Ok(results)
}
```

### Step 2.5: Register commands in `main.rs`

Add to the `.invoke_handler` list:
```rust
commands::import::import_jsonl_file,
commands::import::import_jsonl_batch,
```

### Step 2.6: Export `engine` from `mod.rs`

```rust
pub mod consistency;
pub mod discover;
pub mod engine;
pub mod jsonl;
```

### Step 2.7: Run tests

```bash
cargo test -p chief-wiggum-lib import::engine -- --nocapture
```
Expected: all pass.

### Step 2.8: Full checks

```bash
cargo clippy -- -D warnings && cargo fmt --check && cargo test
```

### Step 2.9: Commit

```bash
git add src-tauri/src/import/engine.rs \
        src-tauri/src/import/mod.rs \
        src-tauri/src/commands/import.rs \
        src-tauri/src/db/queries.rs \
        src-tauri/src/main.rs
git commit -m "CHI-304: add import engine with batch insert and conflict resolution"
```

---

## Task 3 — CHI-305: Frontend Import UI

**What:** SolidJS dialogs for discovering, selecting, and importing JSONL sessions.

**Files:**
- Create: `src/components/import/ImportDialog.tsx`
- Create: `src/components/import/ImportProgress.tsx`
- Create: `src/stores/importStore.ts`
- Modify: `src/components/layout/Sidebar.tsx` (add trigger button)
- Modify: `src/components/settings/SettingsModal.tsx` (add Import section)
- Modify: `src/lib/types.ts` (add ImportResult + DiscoveredSession types)

### Background — SolidJS Patterns

- Stores: `createStore` singleton, exported read-only state + mutation functions
- Signals: `createSignal` for local component state
- Reactivity: access reactive values inside JSX or `createEffect` — not in event handlers
- `For` for lists, `Show` for conditional rendering
- Styling: TailwindCSS v4 with SPEC-002 tokens (e.g. `var(--color-bg-elevated)`, `var(--color-accent-primary)`)
- IPC: `invoke('command_name', { param: value })` from `@tauri-apps/api/core`
- File picker: `open()` from `@tauri-apps/plugin-dialog`

### Step 3.1: Add TypeScript types

In `src/lib/types.ts`, add at the end:

```ts
// ── JSONL Import (CHI-305) ───────────────────────────────────────────────────

export type ImportOutcome = 'created' | 'merged' | 'preserved' | 'skipped';

export interface ImportResult {
  session_id: string;
  cli_session_id: string | null;
  outcome: ImportOutcome;
  messages_imported: number;
  messages_skipped: number;
  warnings: string[];
}

export interface DiscoveredSession {
  file_path: string;
  project_path: string;
  cli_session_id: string;
  file_size_bytes: number;
  line_count: number;
  model: string | null;
  first_timestamp: string | null;
  already_imported: boolean;
}
```

### Step 3.2: Create `importStore.ts`

Create `src/stores/importStore.ts`:

```ts
import { createStore } from 'solid-js/store';

interface ImportState {
  dialogOpen: boolean;
  /** 'idle' | 'discovering' | 'importing' | 'done' | 'error' */
  phase: 'idle' | 'discovering' | 'importing' | 'done' | 'error';
  error: string | null;
}

const [importState, setImportState] = createStore<ImportState>({
  dialogOpen: false,
  phase: 'idle',
  error: null,
});

export { importState };

export function openImportDialog() {
  setImportState({ dialogOpen: true, phase: 'idle', error: null });
}

export function closeImportDialog() {
  setImportState({ dialogOpen: false, phase: 'idle', error: null });
}

export function setImportPhase(phase: ImportState['phase'], error?: string) {
  setImportState({ phase, error: error ?? null });
}
```

### Step 3.3: Create `ImportProgress.tsx`

Create `src/components/import/ImportProgress.tsx`:

```tsx
import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import type { ImportResult } from '@/lib/types';

interface Props {
  results: ImportResult[];
  isRunning: boolean;
  onClose: () => void;
}

const ImportProgress: Component<Props> = (props) => {
  const total = () => props.results.length;
  const imported = () => props.results.reduce((s, r) => s + r.messages_imported, 0);
  const skipped = () => props.results.filter((r) => r.outcome === 'skipped').length;
  const warnings = () => props.results.flatMap((r) => r.warnings);

  return (
    <div class="flex flex-col gap-3 p-4">
      <Show when={props.isRunning}>
        <div class="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <div class="h-3 w-3 animate-spin rounded-full border-2"
               style={{ 'border-color': 'var(--color-accent-primary)', 'border-top-color': 'transparent' }} />
          Importing sessions…
        </div>
      </Show>

      <Show when={!props.isRunning && total() > 0}>
        <div class="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Import complete
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-xs rounded-md p-3"
             style={{ background: 'var(--color-bg-elevated)' }}>
          <div>
            <div class="text-lg font-semibold" style={{ color: 'var(--color-accent-primary)' }}>
              {total()}
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Sessions</div>
          </div>
          <div>
            <div class="text-lg font-semibold" style={{ color: 'var(--color-accent-primary)' }}>
              {imported()}
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Messages</div>
          </div>
          <div>
            <div class="text-lg font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
              {skipped()}
            </div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Skipped</div>
          </div>
        </div>

        <Show when={warnings().length > 0}>
          <details class="text-xs rounded-md p-2"
                   style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}>
            <summary class="cursor-pointer font-medium">
              {warnings().length} warning{warnings().length !== 1 ? 's' : ''}
            </summary>
            <ul class="mt-2 space-y-1 list-disc list-inside">
              {warnings().map((w) => <li>{w}</li>)}
            </ul>
          </details>
        </Show>

        <button
          onClick={props.onClose}
          class="mt-2 rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-primary)' }}
        >
          Done
        </button>
      </Show>
    </div>
  );
};

export default ImportProgress;
```

### Step 3.4: Create `ImportDialog.tsx`

Create `src/components/import/ImportDialog.tsx`:

```tsx
import type { Component } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { DiscoveredSession, ImportResult } from '@/lib/types';
import { closeImportDialog, importState, setImportPhase } from '@/stores/importStore';
import { addToast } from '@/stores/toastStore';
import { sessionState } from '@/stores/sessionStore';
import ImportProgress from './ImportProgress';

const ImportDialog: Component = () => {
  const [discovered, setDiscovered] = createSignal<DiscoveredSession[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [results, setResults] = createSignal<ImportResult[]>([]);

  const activeProject = () => sessionState.activeProjectId ?? '';

  async function discover() {
    setImportPhase('discovering');
    try {
      const sessions = await invoke<DiscoveredSession[]>('discover_importable_sessions');
      setDiscovered(sessions);
      setImportPhase('idle');
    } catch (e) {
      setImportPhase('error', String(e));
    }
  }

  async function pickFile() {
    const files = await open({
      multiple: true,
      filters: [{ name: 'JSONL Session', extensions: ['jsonl'] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    await runImport(paths);
  }

  async function importSelected() {
    const paths = [...selected()];
    if (paths.length === 0) return;
    await runImport(paths);
  }

  async function runImport(filePaths: string[]) {
    if (!activeProject()) {
      addToast('No active project — open or create a project first', 'error');
      return;
    }
    setImportPhase('importing');
    try {
      const res = await invoke<ImportResult[]>('import_jsonl_batch', {
        file_paths: filePaths,
        project_id: activeProject(),
      });
      setResults(res);
      setImportPhase('done');
      // Refresh session list
      await invoke('list_all_sessions');
    } catch (e) {
      setImportPhase('error', String(e));
      addToast('Import failed: ' + String(e), 'error');
    }
  }

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <Show when={importState.dialogOpen}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={(e) => e.target === e.currentTarget && closeImportDialog()}
      >
        {/* Modal */}
        <div
          class="relative flex flex-col w-full max-w-xl rounded-xl shadow-2xl"
          style={{ background: 'var(--color-bg-elevated)', 'max-height': '80vh' }}
        >
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-4 border-b"
               style={{ 'border-color': 'var(--color-border-subtle)' }}>
            <h2 class="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Import Sessions
            </h2>
            <button onClick={closeImportDialog}
                    class="text-lg leading-none"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    aria-label="Close">✕</button>
          </div>

          {/* Body */}
          <div class="flex-1 overflow-y-auto">
            <Show when={importState.phase === 'done'}>
              <ImportProgress results={results()} isRunning={false} onClose={closeImportDialog} />
            </Show>

            <Show when={importState.phase === 'importing'}>
              <ImportProgress results={[]} isRunning={true} onClose={() => {}} />
            </Show>

            <Show when={importState.phase !== 'done' && importState.phase !== 'importing'}>
              <div class="p-5 flex flex-col gap-4">
                {/* Action buttons */}
                <div class="flex gap-2">
                  <button
                    onClick={discover}
                    disabled={importState.phase === 'discovering'}
                    class="flex-1 rounded-md px-3 py-2 text-sm font-medium border"
                    style={{
                      'border-color': 'var(--color-border-default)',
                      color: 'var(--color-text-primary)',
                      background: 'var(--color-bg-primary)',
                    }}
                  >
                    {importState.phase === 'discovering' ? 'Scanning…' : 'Scan ~/.claude/projects/'}
                  </button>
                  <button
                    onClick={pickFile}
                    class="flex-1 rounded-md px-3 py-2 text-sm font-medium"
                    style={{
                      background: 'var(--color-accent-primary)',
                      color: 'var(--color-bg-primary)',
                    }}
                  >
                    Pick File…
                  </button>
                </div>

                {/* Error */}
                <Show when={importState.phase === 'error'}>
                  <div class="text-sm rounded-md px-3 py-2"
                       style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
                    {importState.error}
                  </div>
                </Show>

                {/* Discovered list */}
                <Show when={discovered().length > 0}>
                  <div class="flex flex-col gap-1">
                    <div class="text-xs font-medium mb-1"
                         style={{ color: 'var(--color-text-secondary)' }}>
                      {discovered().length} session{discovered().length !== 1 ? 's' : ''} found
                    </div>
                    <For each={discovered()}>
                      {(session) => (
                        <label
                          class="flex items-start gap-3 rounded-md px-3 py-2 cursor-pointer"
                          style={{
                            background: session.already_imported
                              ? 'transparent'
                              : 'var(--color-bg-primary)',
                            opacity: session.already_imported ? '0.5' : '1',
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={session.already_imported}
                            checked={selected().has(session.file_path)}
                            onChange={() => toggleSelect(session.file_path)}
                            class="mt-0.5 flex-shrink-0"
                          />
                          <div class="flex flex-col gap-0.5 min-w-0">
                            <span class="text-sm font-medium truncate"
                                  style={{ color: 'var(--color-text-primary)' }}>
                              {session.project_path}
                            </span>
                            <span class="text-xs truncate"
                                  style={{ color: 'var(--color-text-tertiary)' }}>
                              {session.cli_session_id}
                              {session.model ? ` · ${session.model}` : ''}
                              {session.already_imported ? ' · already imported' : ''}
                            </span>
                          </div>
                        </label>
                      )}
                    </For>

                    <button
                      onClick={importSelected}
                      disabled={selected().size === 0}
                      class="mt-2 w-full rounded-md px-4 py-2 text-sm font-medium"
                      style={{
                        background:
                          selected().size > 0
                            ? 'var(--color-accent-primary)'
                            : 'var(--color-bg-elevated)',
                        color:
                          selected().size > 0
                            ? 'var(--color-bg-primary)'
                            : 'var(--color-text-tertiary)',
                      }}
                    >
                      Import {selected().size > 0 ? `${selected().size} session${selected().size !== 1 ? 's' : ''}` : '…'}
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ImportDialog;
```

### Step 3.5: Mount dialog in `App.tsx`

In `src/App.tsx`, import and add:

```tsx
import ImportDialog from '@/components/import/ImportDialog';

// Inside the return JSX, after other dialogs:
<ImportDialog />
```

### Step 3.6: Add trigger in Sidebar

In `src/components/layout/Sidebar.tsx`, add an import button in the sidebar footer area (near the bottom where Export is):

```tsx
import { openImportDialog } from '@/stores/importStore';

// In the JSX footer section:
<button
  onClick={openImportDialog}
  class="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm"
  style={{ color: 'var(--color-text-secondary)' }}
  title="Import sessions from Claude Code"
>
  <span>↑</span>
  Import Sessions
</button>
```

### Step 3.7: Add trigger in Settings

In `src/components/settings/SettingsModal.tsx`, add an Import section:

```tsx
import { openImportDialog } from '@/stores/importStore';

// In the settings sections JSX, add a new section:
<section class="flex flex-col gap-3">
  <h3 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
    Import
  </h3>
  <div class="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
    Import session transcripts from Claude Code's local storage (~/.claude/projects/).
  </div>
  <button
    onClick={() => { closeSettings(); openImportDialog(); }}
    class="self-start rounded-md px-4 py-2 text-sm font-medium"
    style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-primary)' }}
  >
    Import Sessions…
  </button>
</section>
```

### Step 3.8: Frontend type checks

```bash
npx tsc --noEmit
```
Expected: 0 errors.

### Step 3.9: Lint check

```bash
npx eslint src/components/import/ src/stores/importStore.ts --max-warnings 0
npx prettier --check src/components/import/ src/stores/importStore.ts
```

### Step 3.10: Full build check

```bash
npx vite build 2>&1 | tail -5
```
Expected: build succeeds, no errors.

### Step 3.11: Commit

```bash
git add src/components/import/ \
        src/stores/importStore.ts \
        src/lib/types.ts \
        src/App.tsx \
        src/components/layout/Sidebar.tsx \
        src/components/settings/SettingsModal.tsx
git commit -m "CHI-305: add frontend import UI with discovery, file picker, and progress"
```

---

## Task 4 — CHI-295: Memory + Build Optimization

**What:** Cap the in-memory message buffer in `conversationStore`, ensure old runtimes are cleaned up eagerly, and tune Rust release-build profile.

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src-tauri/src/bridge/manager.rs`
- Modify: `src-tauri/Cargo.toml`

### Step 4.1: Frontend — message buffer cap

The `messages` array in `conversationStore` grows unbounded for very long sessions. Cap it at 500 displayed messages (older messages are in the DB and loaded on demand).

In `src/stores/conversationStore.ts`, find `loadMessages`:

```ts
// After setState('messages', messages):
// Trim to 500 most recent to cap memory use
if (messages.length > 500) {
  setState('messages', messages.slice(-500));
}
```

Also, in the streaming handlers where messages are pushed (`setState('messages', (prev) => [...prev, msg])`), add a trim after large accumulations. Find the `message:complete` handler and after `setState`:

```ts
// Cap at 500 messages — older messages remain in DB
setState('messages', (prev) => prev.length > 500 ? prev.slice(-500) : prev);
```

### Step 4.2: Write a test for the cap behavior

In `src/stores/conversationStore.ts` (or a dedicated test file if one exists), add a comment marker:
```ts
// TESTME: loadMessages should trim to 500 when more messages returned from DB
```

Since `conversationStore` uses Tauri IPC (hard to unit test in isolation), document the manual test:

**Manual test:** Load a session with >500 messages. Verify `state.messages.length === 500` in devtools and no out-of-memory crash.

### Step 4.3: Backend — eager runtime cleanup

In `src-tauri/src/bridge/manager.rs`, review `remove_runtime`. Ensure it is called when a session is removed from the bridge map (not just when explicitly cleaned up):

Find `remove` method:
```rust
pub async fn remove(&self, session_id: &str) -> AppResult<()> {
    // existing code removes the bridge...
    self.remove_runtime(session_id).await;  // ← ensure this line exists
    Ok(())
}
```

If `remove_runtime` is NOT called from `remove`, add it. This prevents ghost runtimes accumulating memory when sessions are deleted.

### Step 4.4: Add runtime count metric (tracing)

In `SessionBridgeMap::create_runtime`, add:
```rust
pub async fn create_runtime(&self, session_id: &str) {
    let mut runtimes = self.runtimes.write().await;
    runtimes.entry(session_id.to_string()).or_insert_with(|| SessionRuntime::new(session_id.to_string()));
    tracing::debug!(runtime_count = runtimes.len(), "Runtime created for session {}", session_id);
}
```

In `remove_runtime`, add:
```rust
pub async fn remove_runtime(&self, session_id: &str) {
    let mut runtimes = self.runtimes.write().await;
    runtimes.remove(session_id);
    tracing::debug!(runtime_count = runtimes.len(), "Runtime removed for session {}", session_id);
}
```

### Step 4.5: Rust build profile tuning

In `src-tauri/Cargo.toml`, find the `[profile.release]` section (or add it if absent). Add:

```toml
[profile.release]
opt-level = 3
lto = "thin"          # Link-time optimization — faster than "fat", better than false
codegen-units = 1     # Single codegen unit for best optimization
strip = true          # Strip debug symbols from release binary
```

**Why these choices:**
- `lto = "thin"` — good balance between compile time and binary size/perf
- `codegen-units = 1` — allows cross-crate inlining; slower to compile but smaller binary
- `strip = true` — reduces binary size significantly on macOS/Linux

### Step 4.6: Verify build profile takes effect

```bash
cd src-tauri && cargo build --release 2>&1 | grep -E "Compiling|Finished|error"
```
Expected: builds successfully.

### Step 4.7: Run all Rust tests

```bash
cargo test && cargo clippy -- -D warnings
```

### Step 4.8: Run frontend checks

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

### Step 4.9: Commit

```bash
git add src/stores/conversationStore.ts \
        src-tauri/src/bridge/manager.rs \
        src-tauri/Cargo.toml
git commit -m "CHI-295: cap message buffer at 500, eager runtime cleanup, release build tuning"
```

---

## Task 5 — CHI-259: Saved Prompt Templates

**What:** Users can save frequently-used prompts (with `{placeholder}` variables), recall them from the command palette or `/template` slash command, and manage them in Settings.

**Spec:** SPEC-006 §4.19

**Files:**
- Modify: `src-tauri/src/db/migrations.rs` (add migration v8)
- Create: `src-tauri/src/commands/templates.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src/stores/templateStore.ts`
- Modify: `src/components/settings/SettingsModal.tsx`
- Modify: `src/components/common/CommandPalette.tsx`
- Modify: `src/lib/types.ts`

### Step 5.1: Add DB migration v8

In `src-tauri/src/db/migrations.rs`, add after the v7 migration entry (inside the `MIGRATIONS` array):

```rust
Migration {
    version: 8,
    description: "Add prompt_templates table (CHI-259)",
    sql: r#"
        CREATE TABLE IF NOT EXISTS prompt_templates (
            id          TEXT PRIMARY KEY NOT NULL,
            name        TEXT NOT NULL,
            content     TEXT NOT NULL,
            variables   TEXT NOT NULL DEFAULT '[]',
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            usage_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_templates_usage ON prompt_templates(usage_count DESC);
    "#,
},
```

### Step 5.2: Write template DB query tests

In `src-tauri/src/db/queries.rs`, add to the `#[cfg(test)]` section:

```rust
#[test]
fn prompt_template_crud_works() {
    let db = Database::open_in_memory().expect("db");
    db.run_migrations().expect("migrations");

    insert_prompt_template(&db, "t1", "Greeting", "Hello {name}!", r#"["name"]"#).unwrap();
    let templates = list_prompt_templates(&db).unwrap();
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].name, "Greeting");

    increment_template_usage(&db, "t1").unwrap();
    let templates = list_prompt_templates(&db).unwrap();
    assert_eq!(templates[0].usage_count, 1);

    delete_prompt_template(&db, "t1").unwrap();
    let templates = list_prompt_templates(&db).unwrap();
    assert!(templates.is_empty());
}
```

### Step 5.3: Add template query functions

In `src-tauri/src/db/queries.rs`, add:

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
    pub variables: String,   // JSON array of variable names, e.g. ["name", "topic"]
    pub created_at: String,
    pub usage_count: i64,
}

pub fn insert_prompt_template(
    db: &Database,
    id: &str,
    name: &str,
    content: &str,
    variables: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO prompt_templates (id, name, content, variables) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, name, content, variables],
        )?;
        Ok(())
    })
}

pub fn list_prompt_templates(db: &Database) -> Result<Vec<PromptTemplate>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, content, variables, created_at, usage_count
             FROM prompt_templates ORDER BY usage_count DESC, created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PromptTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                content: row.get(2)?,
                variables: row.get(3)?,
                created_at: row.get(4)?,
                usage_count: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    })
}

pub fn update_prompt_template(
    db: &Database,
    id: &str,
    name: &str,
    content: &str,
    variables: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        let updated = conn.execute(
            "UPDATE prompt_templates SET name = ?2, content = ?3, variables = ?4 WHERE id = ?1",
            rusqlite::params![id, name, content, variables],
        )?;
        if updated == 0 {
            return Err(AppError::NotFound(format!("Template {} not found", id)));
        }
        Ok(())
    })
}

pub fn delete_prompt_template(db: &Database, id: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "DELETE FROM prompt_templates WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    })
}

pub fn increment_template_usage(db: &Database, id: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE prompt_templates SET usage_count = usage_count + 1 WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    })
}
```

### Step 5.4: Run the new test

```bash
cargo test -p chief-wiggum-lib prompt_template_crud_works -- --nocapture
```
Expected: PASS.

### Step 5.5: Create `templates.rs` command module

Create `src-tauri/src/commands/templates.rs`:

```rust
//! IPC commands for prompt template management (CHI-259).

use crate::db::queries::{
    delete_prompt_template, increment_template_usage, insert_prompt_template,
    list_prompt_templates, update_prompt_template, PromptTemplate,
};
use crate::db::Database;
use crate::AppError;
use tauri::State;
use uuid::Uuid;

#[tauri::command(rename_all = "snake_case")]
pub fn get_prompt_templates(db: State<'_, Database>) -> Result<Vec<PromptTemplate>, AppError> {
    list_prompt_templates(&db)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_prompt_template(
    db: State<'_, Database>,
    name: String,
    content: String,
    variables: String,
) -> Result<String, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("Name cannot be empty".to_string()));
    }
    if content.trim().is_empty() {
        return Err(AppError::Validation("Content cannot be empty".to_string()));
    }
    let id = Uuid::new_v4().to_string();
    insert_prompt_template(&db, &id, &name, &content, &variables)?;
    Ok(id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn edit_prompt_template(
    db: State<'_, Database>,
    id: String,
    name: String,
    content: String,
    variables: String,
) -> Result<(), AppError> {
    update_prompt_template(&db, &id, &name, &content, &variables)
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_prompt_template(
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    delete_prompt_template(&db, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn use_prompt_template(
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    increment_template_usage(&db, &id)
}
```

### Step 5.6: Register templates module and commands

In `src-tauri/src/commands/mod.rs`:
```rust
pub mod templates;
```

In `src-tauri/src/main.rs`, add to invoke_handler:
```rust
commands::templates::get_prompt_templates,
commands::templates::create_prompt_template,
commands::templates::edit_prompt_template,
commands::templates::remove_prompt_template,
commands::templates::use_prompt_template,
```

### Step 5.7: Add TypeScript types

In `src/lib/types.ts`, add:

```ts
// ── Prompt Templates (CHI-259) ────────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  variables: string;  // JSON string: string[]
  created_at: string;
  usage_count: number;
}
```

### Step 5.8: Create `templateStore.ts`

Create `src/stores/templateStore.ts`:

```ts
import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { PromptTemplate } from '@/lib/types';
import { addToast } from './toastStore';

interface TemplateState {
  templates: PromptTemplate[];
  loaded: boolean;
}

const [templateState, setTemplateState] = createStore<TemplateState>({
  templates: [],
  loaded: false,
});

export { templateState };

export async function loadTemplates() {
  try {
    const templates = await invoke<PromptTemplate[]>('get_prompt_templates');
    setTemplateState({ templates, loaded: true });
  } catch (e) {
    console.error('Failed to load templates:', e);
  }
}

export async function createTemplate(name: string, content: string, variables: string[]) {
  const id = await invoke<string>('create_prompt_template', {
    name,
    content,
    variables: JSON.stringify(variables),
  });
  await loadTemplates();
  return id;
}

export async function editTemplate(id: string, name: string, content: string, variables: string[]) {
  await invoke('edit_prompt_template', {
    id,
    name,
    content,
    variables: JSON.stringify(variables),
  });
  await loadTemplates();
}

export async function removeTemplate(id: string) {
  await invoke('remove_prompt_template', { id });
  setTemplateState('templates', (prev) => prev.filter((t) => t.id !== id));
  addToast('Template deleted', 'info');
}

export async function useTemplate(id: string): Promise<string | null> {
  const template = templateState.templates.find((t) => t.id === id);
  if (!template) return null;
  await invoke('use_prompt_template', { id }).catch(console.error);
  return template.content;
}
```

### Step 5.9: Add Templates section to Settings

In `src/components/settings/SettingsModal.tsx`, add imports:

```tsx
import { createSignal, For, Show, onMount } from 'solid-js';
import {
  templateState,
  loadTemplates,
  createTemplate,
  editTemplate,
  removeTemplate,
} from '@/stores/templateStore';
```

Load templates when settings opens (add `onMount` call or add to existing settings load logic):
```ts
onMount(() => { void loadTemplates(); });
```

Add a `PromptTemplatesSection` component in the same file:

```tsx
const PromptTemplatesSection: Component = () => {
  const [newName, setNewName] = createSignal('');
  const [newContent, setNewContent] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  async function handleCreate() {
    if (!newName().trim() || !newContent().trim()) return;
    setSaving(true);
    // Extract {variable} placeholders
    const vars = [...newContent().matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    await createTemplate(newName().trim(), newContent().trim(), [...new Set(vars)]);
    setNewName('');
    setNewContent('');
    setSaving(false);
  }

  return (
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Prompt Templates
      </h3>

      {/* Existing templates list */}
      <Show when={templateState.templates.length > 0}>
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          <For each={templateState.templates}>
            {(t) => (
              <div class="flex items-center gap-2 rounded-md px-3 py-2"
                   style={{ background: 'var(--color-bg-elevated)' }}>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {t.name}
                  </div>
                  <div class="text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.content.slice(0, 60)}{t.content.length > 60 ? '…' : ''}
                  </div>
                </div>
                <button
                  onClick={() => void removeTemplate(t.id)}
                  class="text-xs flex-shrink-0"
                  style={{ color: 'var(--color-error)' }}
                  aria-label="Delete template"
                >
                  Delete
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* New template form */}
      <div class="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Template name"
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          class="rounded-md px-3 py-2 text-sm border"
          style={{
            background: 'var(--color-bg-primary)',
            'border-color': 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        />
        <textarea
          placeholder="Template content — use {variable} for placeholders"
          value={newContent()}
          onInput={(e) => setNewContent(e.currentTarget.value)}
          rows={3}
          class="rounded-md px-3 py-2 text-sm border resize-none"
          style={{
            background: 'var(--color-bg-primary)',
            'border-color': 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          onClick={() => void handleCreate()}
          disabled={saving() || !newName().trim() || !newContent().trim()}
          class="self-start rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: 'var(--color-accent-primary)',
            color: 'var(--color-bg-primary)',
            opacity: saving() || !newName().trim() || !newContent().trim() ? '0.5' : '1',
          }}
        >
          {saving() ? 'Saving…' : 'Save Template'}
        </button>
      </div>
    </section>
  );
};
```

Include `<PromptTemplatesSection />` in the settings modal body (after the Import section from CHI-305 or after the existing sections).

### Step 5.10: Add to Command Palette

In `src/components/common/CommandPalette.tsx`, add template insertion:

```tsx
import { templateState, loadTemplates, useTemplate } from '@/stores/templateStore';

// In the commands list (where other commands are defined), add:
...templateState.templates.map((t) => ({
  id: `template:${t.id}`,
  label: `Insert template: ${t.name}`,
  category: 'Templates',
  action: async () => {
    const content = await useTemplate(t.id);
    if (content) {
      // Insert into message input — use the existing setDraftMessage or equivalent
      // Check what the current input mechanism is (setDraftMessage, appendToInput, etc.)
      // and call it here.
    }
  },
})),
```

**Note:** Look at how other commands in CommandPalette trigger message input changes. Use the same pattern.

### Step 5.11: Run all checks

```bash
cargo test && cargo clippy -- -D warnings && cargo fmt --check
npx tsc --noEmit && npx eslint . --max-warnings 0
```

### Step 5.12: Commit

```bash
git add src-tauri/src/db/migrations.rs \
        src-tauri/src/db/queries.rs \
        src-tauri/src/commands/templates.rs \
        src-tauri/src/commands/mod.rs \
        src-tauri/src/main.rs \
        src/stores/templateStore.ts \
        src/lib/types.ts \
        src/components/settings/SettingsModal.tsx \
        src/components/common/CommandPalette.tsx
git commit -m "CHI-259: add saved prompt templates with DB storage, CRUD commands, Settings UI, and Command Palette integration"
```

---

## Final Validation Checklist

After all 5 tasks are committed:

```bash
# Rust
cargo test            # all tests pass
cargo clippy -- -D warnings   # 0 warnings
cargo fmt --check    # properly formatted

# Frontend
npx tsc --noEmit     # 0 type errors
npx eslint . --max-warnings 0
npx prettier --check .
npx vite build       # clean build
```

### Manual smoke tests

1. **CHI-303:** Open app → Settings → Import → Click "Scan ~/.claude/projects/" → session list populates, already-imported sessions are greyed out
2. **CHI-304:** Select a session → click Import → ImportProgress shows counts → session appears in Sidebar
3. **CHI-305:** Import dialog closes after Done → new session is selectable
4. **CHI-295:** Load a session with many messages → no memory spike; check devtools `messages.length ≤ 500`
5. **CHI-259:** Settings → Prompt Templates → create "My Template" with `Hello {name}!` → appears in Command Palette under "Insert template"

### Update handover.json

After all tasks complete, update `.claude/handover.json`:
- `CHI-303.status` → `"done"`
- `CHI-304.status` → `"done"`
- `CHI-305.status` → `"done"`
- `CHI-295.status` → `"done"`
- `CHI-259.status` → `"done"`
- `CHI-301.status` → `"done"` (all 5 sub-tasks now complete)
- `CHI-287.status` → `"done"` (all 4 sub-tasks now complete)
- `recommended_next` → `["CHI-248", "CHI-249", "CHI-250", "CHI-251", "CHI-252"]` (T5 wave)
- Add notes about epics CHI-301 and CHI-287 needing Linear closure

---

## Watch-outs / Gotchas

| Area | Gotcha | Fix |
|------|--------|-----|
| `dirs` crate | Already in Cargo.toml at v6 | No action needed |
| `uuid` crate | Already in Cargo.toml with `v4` feature | No action needed |
| `tempfile` crate | Already in `[dev-dependencies]` | No action needed |
| `INSERT OR IGNORE` | Only deduplicates if `uuid` is unique + not NULL | Ensure `messages` table has `UNIQUE(uuid)` or `uuid` is the PK; if not, add a migration |
| SolidJS `createSignal` | Mutating a `Set` signal — must replace the Set reference, not mutate in place | `setSelected((prev) => { const n = new Set(prev); n.add(x); return n; })` |
| Tauri dialog plugin | `open()` from `@tauri-apps/plugin-dialog` needs `"dialog:default"` in capabilities | Check `src-tauri/capabilities/default.json` — it should already be there from existing export dialog |
| `AppError::NotFound` | This variant must exist in your error enum | Check `src-tauri/src/lib.rs` or wherever `AppError` is defined; add `NotFound(String)` if missing |
| `AppError::Conflict` | May not exist | Use `AppError::Sqlite` as fallback for INSERT OR IGNORE collision detection, or catch by checking sqlite error code |
| `tempfile` in tests | Already in `[dev-dependencies]` | No action needed |
