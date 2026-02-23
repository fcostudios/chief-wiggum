# SDK Command Discovery & Diagnostic Bundle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SDK-based slash command discovery (CHI-108) and a diagnostic bundle export feature (CHI-96) to Chief Wiggum.

**Architecture:** CHI-108 extends the existing `system:init` event pipeline — the CLI already sends `tools[]` and `mcp_servers[]` in its init payload, and the event loop already parses them. Currently, these are used only for MCP prefix caching. Phase B adds a new `Sdk` category to slash commands, converts SDK tools into `SlashCommand` structs, stores them in `SessionBridgeMap`, and exposes them via an updated IPC command. The frontend listens for `cli:init` events and merges SDK commands with file-scanned ones (SDK takes precedence).

CHI-96 creates a diagnostic bundle ZIP file that collects ring buffer logs (redacted), system info, session state, and redaction summary. Uses the `zip` crate to write a `.zip` archive to the log directory's `exports/` subfolder. A single IPC command triggers collection, and the frontend provides a button in the Settings/Help area.

**Tech Stack:** Tauri v2, Rust (tokio, serde, zip), SolidJS (solid-js/store), TypeScript

---

## Task 1: Add `Sdk` CommandCategory and SDK Command Conversion

**Files:**
- Modify: `src-tauri/src/slash/mod.rs`

**Step 1: Add `Sdk` variant to `CommandCategory`**

After the existing `User` variant in the enum (line 14), add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CommandCategory {
    Builtin,
    Project,
    User,
    Sdk,
}
```

**Step 2: Add `from_sdk_tools()` conversion function**

After the `builtin_commands()` function (after line 126), add:

```rust
/// Convert tool names from SDK `system:init` into SlashCommands.
///
/// CLI tools are reported as plain names (e.g., "Read", "Write", "Bash").
/// MCP tools are reported as "mcp__server__tool" (e.g., "mcp__context7__query-docs").
/// We filter to only include tools that make sense as user-invocable slash commands:
/// - Skip built-in tools (Read, Write, Bash, etc.) — these are tool-use, not slash commands
/// - Include MCP tools as they may be user-invocable
/// - Include any custom/unknown tools
pub fn from_sdk_tools(tools: &[String], mcp_servers: &[String]) -> Vec<SlashCommand> {
    // Built-in tool names that are NOT user-invocable slash commands
    let builtin_tools: std::collections::HashSet<&str> = [
        "Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch",
        "NotebookEdit", "Task", "TodoRead", "TodoWrite",
    ]
    .into_iter()
    .collect();

    let mut commands = Vec::new();

    for tool in tools {
        // Skip well-known built-in tools
        if builtin_tools.contains(tool.as_str()) {
            continue;
        }

        // MCP tools: "mcp__server__toolname" → extract server + tool name
        if tool.starts_with("mcp__") {
            let parts: Vec<&str> = tool.splitn(3, "__").collect();
            if parts.len() == 3 {
                let server = parts[1];
                let tool_name = parts[2];
                commands.push(SlashCommand {
                    name: tool.clone(),
                    description: format!("MCP tool from {} server", server),
                    category: CommandCategory::Sdk,
                    args_hint: None,
                    source_path: None,
                    from_sdk: true,
                });
                // Avoid duplicate if the tool_name alone would also match
                let _ = tool_name;
            }
            continue;
        }

        // Unknown/custom tool — include as SDK command
        commands.push(SlashCommand {
            name: tool.clone(),
            description: format!("SDK tool: {}", tool),
            category: CommandCategory::Sdk,
            args_hint: None,
            source_path: None,
            from_sdk: true,
        });
    }

    // Also add MCP server entries as "namespace" commands (for discovery)
    for server in mcp_servers {
        let normalized = crate::bridge::event_loop::normalize_mcp_server_name(server);
        // Only add if there isn't already a tool with this prefix
        if !commands.iter().any(|c| c.name.starts_with(&normalized)) {
            commands.push(SlashCommand {
                name: normalized,
                description: format!("MCP server: {}", server),
                category: CommandCategory::Sdk,
                args_hint: None,
                source_path: None,
                from_sdk: true,
            });
        }
    }

    commands
}
```

**Step 3: Write tests**

Add to the existing `#[cfg(test)] mod tests` block:

```rust
#[test]
fn from_sdk_tools_filters_builtin_tools() {
    let tools = vec![
        "Read".to_string(),
        "Write".to_string(),
        "Bash".to_string(),
        "mcp__context7__query-docs".to_string(),
        "CustomTool".to_string(),
    ];
    let mcp_servers = vec!["context7".to_string()];

    let commands = from_sdk_tools(&tools, &mcp_servers);

    // Read, Write, Bash should be filtered out
    assert!(!commands.iter().any(|c| c.name == "Read"));
    assert!(!commands.iter().any(|c| c.name == "Write"));
    assert!(!commands.iter().any(|c| c.name == "Bash"));

    // MCP tool and custom tool should be included
    assert!(commands.iter().any(|c| c.name == "mcp__context7__query-docs"));
    assert!(commands.iter().any(|c| c.name == "CustomTool"));

    // All should be SDK category and from_sdk = true
    for cmd in &commands {
        assert_eq!(cmd.category, CommandCategory::Sdk);
        assert!(cmd.from_sdk);
    }
}

#[test]
fn from_sdk_tools_handles_empty_input() {
    let commands = from_sdk_tools(&[], &[]);
    assert!(commands.is_empty());
}

#[test]
fn from_sdk_tools_mcp_server_description() {
    let tools = vec!["mcp__linear__list-issues".to_string()];
    let mcp_servers = vec![];

    let commands = from_sdk_tools(&tools, &mcp_servers);
    assert_eq!(commands.len(), 1);
    assert!(commands[0].description.contains("linear"));
}
```

**Step 4: Run tests**

Run: `cargo test -p chief-wiggum slash`
Expected: All existing slash tests pass + 3 new tests pass

**Step 5: Commit**

```bash
git add src-tauri/src/slash/mod.rs
git commit -m "feat: add Sdk CommandCategory and from_sdk_tools() conversion (CHI-108)"
```

---

## Task 2: Store SDK Commands in SessionBridgeMap

**Files:**
- Modify: `src-tauri/src/bridge/manager.rs`
- Modify: `src-tauri/src/bridge/event_loop.rs`

**Step 1: Add SDK commands storage to SessionBridgeMap**

In `manager.rs`, add a new field to `SessionBridgeMap`:

```rust
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
    mcp_server_prefixes: Arc<RwLock<HashSet<String>>>,
    session_runtimes: Arc<RwLock<HashMap<String, SessionRuntime>>>,
    max_concurrent: usize,
    sdk_commands: Arc<RwLock<Vec<crate::slash::SlashCommand>>>,
}
```

Update `new()` and `with_max_concurrent()`:

```rust
pub fn new() -> Self {
    Self {
        bridges: Arc::new(RwLock::new(HashMap::new())),
        mcp_server_prefixes: Arc::new(RwLock::new(HashSet::new())),
        session_runtimes: Arc::new(RwLock::new(HashMap::new())),
        max_concurrent: DEFAULT_MAX_CONCURRENT,
        sdk_commands: Arc::new(RwLock::new(Vec::new())),
    }
}

pub fn with_max_concurrent(max: usize) -> Self {
    Self {
        bridges: Arc::new(RwLock::new(HashMap::new())),
        mcp_server_prefixes: Arc::new(RwLock::new(HashSet::new())),
        session_runtimes: Arc::new(RwLock::new(HashMap::new())),
        max_concurrent: max,
        sdk_commands: Arc::new(RwLock::new(Vec::new())),
    }
}
```

Add accessor methods:

```rust
/// Get a clone of the SDK commands arc for passing to event loops.
pub fn sdk_commands_handle(&self) -> Arc<RwLock<Vec<crate::slash::SlashCommand>>> {
    self.sdk_commands.clone()
}

/// Get the current SDK-discovered commands.
pub async fn get_sdk_commands(&self) -> Vec<crate::slash::SlashCommand> {
    self.sdk_commands.read().await.clone()
}
```

**Step 2: Update event loop to store SDK commands on SystemInit**

In `event_loop.rs`, update the `spawn_event_loop` signature to accept the SDK commands handle:

```rust
pub fn spawn_event_loop(
    app: AppHandle,
    session_id: String,
    bridge: Arc<dyn BridgeInterface>,
    mcp_cache: Arc<RwLock<HashSet<String>>>,
    runtimes: Arc<RwLock<HashMap<String, SessionRuntime>>>,
    sdk_commands: Arc<RwLock<Vec<crate::slash::SlashCommand>>>,
) -> tokio::task::JoinHandle<()> {
```

In the `BridgeEvent::SystemInit` handler (around line 223), after the MCP prefix caching block and before the payload construction, add:

```rust
// Convert SDK tools into SlashCommands and store for frontend discovery (CHI-108)
{
    let sdk_cmds = crate::slash::from_sdk_tools(&tools, &mcp_servers);
    if !sdk_cmds.is_empty() {
        tracing::info!(
            "Event loop [{}]: discovered {} SDK commands from system:init",
            session_id,
            sdk_cmds.len()
        );
        let mut store = sdk_commands.write().await;
        // Replace — latest init is authoritative
        *store = sdk_cmds;
    }
}
```

**Step 3: Update CliInitPayload to include tool/MCP data for frontend**

In `event_loop.rs`, extend `CliInitPayload`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliInitPayload {
    pub session_id: String,
    pub cli_session_id: String,
    pub model: String,
    pub tools: Vec<String>,
    pub mcp_servers: Vec<String>,
}
```

Update the payload construction in the SystemInit handler:

```rust
let payload = CliInitPayload {
    session_id: session_id.to_string(),
    cli_session_id,
    model,
    tools,
    mcp_servers,
};
```

**Step 4: Update the `send_to_cli` call site to pass SDK commands handle**

In `src-tauri/src/commands/bridge.rs`, find the `spawn_event_loop` call and add the SDK commands parameter:

```rust
event_loop::spawn_event_loop(
    app.clone(),
    session_id,
    bridge,
    bridge_map.mcp_cache(),
    bridge_map.runtimes(),
    bridge_map.sdk_commands_handle(),
);
```

**Step 5: Run tests**

Run: `cargo test -p chief-wiggum && cargo clippy -- -D warnings`
Expected: All tests pass, no warnings

**Step 6: Commit**

```bash
git add src-tauri/src/bridge/manager.rs src-tauri/src/bridge/event_loop.rs src-tauri/src/commands/bridge.rs
git commit -m "feat: store SDK commands from system:init in SessionBridgeMap (CHI-108)"
```

---

## Task 3: Update Slash Command IPC to Merge SDK Commands

**Files:**
- Modify: `src-tauri/src/commands/slash.rs`

**Step 1: Update IPC commands to merge SDK commands**

Replace the existing `list_slash_commands` and `refresh_slash_commands`:

```rust
use tauri::State;

use crate::bridge::SessionBridgeMap;
use crate::slash::scanner;
use crate::slash::SlashCommand;
use crate::AppError;

/// List all discovered slash commands (built-in + file-scanned + SDK).
/// SDK commands take precedence over file-scanned commands with the same name.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_slash_commands(
    bridge_map: State<'_, SessionBridgeMap>,
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let mut commands = scanner::discover_all(project_path.as_deref());

    // Merge SDK-discovered commands (take precedence over file-scanned)
    let sdk_commands = bridge_map.get_sdk_commands().await;
    for sdk_cmd in sdk_commands {
        // Remove any existing command with the same name (SDK wins)
        commands.retain(|c| c.name != sdk_cmd.name);
        commands.push(sdk_cmd);
    }

    Ok(commands)
}

/// Refresh slash commands (force rescan + include SDK commands).
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_slash_commands(
    bridge_map: State<'_, SessionBridgeMap>,
    project_path: Option<String>,
) -> Result<Vec<SlashCommand>, AppError> {
    let mut commands = scanner::discover_all(project_path.as_deref());

    let sdk_commands = bridge_map.get_sdk_commands().await;
    for sdk_cmd in sdk_commands {
        commands.retain(|c| c.name != sdk_cmd.name);
        commands.push(sdk_cmd);
    }

    Ok(commands)
}
```

**Step 2: Run tests**

Run: `cargo test -p chief-wiggum && cargo clippy -- -D warnings`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/commands/slash.rs
git commit -m "feat: merge SDK commands into slash command IPC responses (CHI-108)"
```

---

## Task 4: Frontend SDK Command Integration

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/slashStore.ts`
- Modify: `src/App.tsx`

**Step 1: Update TypeScript types**

In `src/lib/types.ts`, update the `SlashCommand` interface to include the `Sdk` category. Find the existing `SlashCommand` type and ensure it matches:

```typescript
/** Slash command discovered from backend. */
export interface SlashCommand {
  name: string;
  description: string;
  category: 'Builtin' | 'Project' | 'User' | 'Sdk';
  args_hint: string | null;
  source_path: string | null;
  from_sdk: boolean;
}
```

Also add a `CliInitEvent` type for the `cli:init` Tauri event payload:

```typescript
/** Payload from cli:init Tauri event. */
export interface CliInitEvent {
  session_id: string;
  cli_session_id: string;
  model: string;
  tools: string[];
  mcp_servers: string[];
}
```

**Step 2: Add `handleSdkInit()` and SDK listener to slashStore**

In `src/stores/slashStore.ts`, add:

```typescript
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { SlashCommand, CliInitEvent } from '@/lib/types';

let sdkInitUnlisten: UnlistenFn | null = null;

/** Merge SDK-discovered commands into the store.
 *  Called when cli:init fires with tools/mcp_servers data.
 *  Refreshes from backend which now includes SDK commands. */
export async function handleSdkInit(projectPath?: string): Promise<void> {
  await refreshCommands(projectPath);
}

/** Start listening for cli:init events to auto-refresh commands. */
export async function startSdkCommandListener(): Promise<void> {
  if (sdkInitUnlisten) return;
  try {
    sdkInitUnlisten = await listen<CliInitEvent>('cli:init', (event) => {
      if (event.payload.tools.length > 0 || event.payload.mcp_servers.length > 0) {
        // Refresh commands — backend now includes SDK commands in the response
        void handleSdkInit();
      }
    });
  } catch (err) {
    console.warn('[slashStore] Failed to listen for cli:init:', err);
  }
}

/** Stop listening for cli:init events. */
export function stopSdkCommandListener(): void {
  if (sdkInitUnlisten) {
    sdkInitUnlisten();
    sdkInitUnlisten = null;
  }
}
```

**Step 3: Start the SDK command listener on app mount**

In `src/App.tsx`, import and call `startSdkCommandListener`:

```typescript
import { startSdkCommandListener } from '@/stores/slashStore';

// In the onMount:
onMount(() => {
  // ... existing code ...
  void startSdkCommandListener();
});
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/lib/types.ts src/stores/slashStore.ts src/App.tsx
git commit -m "feat: frontend SDK command discovery via cli:init listener (CHI-108)"
```

---

## Task 5: Add `zip` Dependency and Diagnostic Bundle Module

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/logging/bundle.rs`
- Modify: `src-tauri/src/logging/mod.rs`
- Modify: `src-tauri/src/logging/init.rs`

**Step 1: Add `zip` crate to Cargo.toml**

In `src-tauri/Cargo.toml`, add to the `[dependencies]` section:

```toml
# ZIP archive for diagnostic bundle export (CHI-96)
zip = { version = "2", default-features = false, features = ["deflate"] }
```

**Step 2: Make `log_directory` accessible for reuse**

In `src-tauri/src/logging/init.rs`, rename the private `log_directory()` to `log_directory_path()` and make it `pub(crate)`:

```rust
/// Platform-aware log directory.
pub(crate) fn log_directory_path() -> PathBuf {
```

Update all internal references in `init.rs` from `log_directory()` to `log_directory_path()`:
- Line 39: `let log_dir = log_directory_path();`
- Line 65: unchanged (uses `log_dir` variable)
- Test: update `log_directory()` → `log_directory_path()`

**Step 3: Create `bundle.rs` module**

Create `src-tauri/src/logging/bundle.rs`:

```rust
//! Diagnostic bundle export — collects logs, system info, session state into a ZIP.
//!
//! CHI-96: Export diagnostic data for bug reports and support.
//! Redaction is applied to all log entries before inclusion.

use std::io::Write;
use std::path::PathBuf;

use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::init::get_ring_buffer;
use super::redactor::{LogRedactor, RedactionSummary};
use super::ring_buffer::LogEntry;

/// System information snapshot for the diagnostic bundle.
#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub timestamp: String,
}

impl SystemInfo {
    pub fn collect() -> Self {
        Self {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Result of a diagnostic bundle export.
#[derive(Debug, Clone, Serialize)]
pub struct BundleExportResult {
    /// Path to the created ZIP file.
    pub path: String,
    /// Size of the ZIP file in bytes.
    pub size_bytes: u64,
    /// Number of log entries included.
    pub log_entry_count: usize,
    /// Redaction summary.
    pub redaction: RedactionSummary,
}

/// Export a diagnostic bundle to a ZIP file.
///
/// The bundle includes:
/// 1. `logs.jsonl` — Redacted ring buffer entries in JSON Lines format
/// 2. `system_info.json` — OS, version, timestamp
/// 3. `redaction_summary.json` — What was redacted and how many entries affected
/// 4. `README.txt` — Human-readable description
///
/// Returns the path to the created ZIP and metadata, or an error.
pub fn export_bundle() -> Result<BundleExportResult, crate::AppError> {
    // 1. Collect ring buffer entries
    let ring_buffer = get_ring_buffer().ok_or_else(|| {
        crate::AppError::Other("Logging not initialized — cannot export bundle".to_string())
    })?;

    let entries: Vec<LogEntry> = {
        let buf = ring_buffer.lock();
        buf.iter().cloned().collect()
    };

    // 2. Redact entries
    let redactor = LogRedactor::new();
    let (redacted_entries, redaction_summary) = redactor.redact_entries(&entries);

    // 3. Collect system info
    let system_info = SystemInfo::collect();

    // 4. Create export directory
    let export_dir = export_directory();
    std::fs::create_dir_all(&export_dir).map_err(|e| {
        crate::AppError::Io(std::io::Error::new(
            e.kind(),
            format!("Failed to create export directory {:?}: {}", export_dir, e),
        ))
    })?;

    // 5. Create ZIP file
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let zip_filename = format!("chiefwiggum-diagnostic-{}.zip", timestamp);
    let zip_path = export_dir.join(&zip_filename);

    let file = std::fs::File::create(&zip_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    // 5a. Write logs.jsonl
    zip.start_file("logs.jsonl", options)?;
    for entry in &redacted_entries {
        let line = serde_json::to_string(entry)?;
        zip.write_all(line.as_bytes())?;
        zip.write_all(b"\n")?;
    }

    // 5b. Write system_info.json
    zip.start_file("system_info.json", options)?;
    let system_json = serde_json::to_string_pretty(&system_info)?;
    zip.write_all(system_json.as_bytes())?;

    // 5c. Write redaction_summary.json
    zip.start_file("redaction_summary.json", options)?;
    let redaction_json = serde_json::to_string_pretty(&redaction_summary)?;
    zip.write_all(redaction_json.as_bytes())?;

    // 5d. Write README.txt
    zip.start_file("README.txt", options)?;
    zip.write_all(
        b"Chief Wiggum Diagnostic Bundle\n\
          ==============================\n\n\
          This archive contains diagnostic information for bug reports.\n\
          All sensitive data (API keys, emails, file paths) has been redacted.\n\n\
          Contents:\n\
          - logs.jsonl         Redacted application logs (JSON Lines format)\n\
          - system_info.json   System and application version information\n\
          - redaction_summary.json  Summary of what was redacted\n\
          - README.txt         This file\n\n\
          Generated by Chief Wiggum v",
    )?;
    zip.write_all(env!("CARGO_PKG_VERSION").as_bytes())?;
    zip.write_all(b"\n")?;

    zip.finish()?;

    // 6. Get file size
    let metadata = std::fs::metadata(&zip_path)?;

    Ok(BundleExportResult {
        path: zip_path.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        log_entry_count: redacted_entries.len(),
        redaction: redaction_summary,
    })
}

/// Platform-aware export directory (subfolder of log directory).
fn export_directory() -> PathBuf {
    super::init::log_directory_path().join("exports")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_info_collects_valid_data() {
        let info = SystemInfo::collect();
        assert!(!info.app_version.is_empty());
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
        assert!(!info.timestamp.is_empty());
    }

    #[test]
    fn export_directory_is_inside_log_directory() {
        let export = export_directory();
        let log = super::super::init::log_directory_path();
        assert!(
            export.starts_with(&log),
            "Export dir {:?} should be inside log dir {:?}",
            export,
            log
        );
    }

    #[test]
    fn export_directory_ends_with_exports() {
        let dir = export_directory();
        assert!(
            dir.ends_with("exports"),
            "Export dir should end with 'exports': {:?}",
            dir
        );
    }
}
```

**Step 4: Update `logging/mod.rs` to include `bundle` module**

```rust
//! Logging system: 3-layer tracing + redaction + diagnostic export.

pub mod bundle;
pub mod init;
pub mod redactor;
pub mod ring_buffer;

pub use bundle::{export_bundle, BundleExportResult};
pub use init::{get_ring_buffer, init_logging};
pub use redactor::{LogRedactor, RedactionSummary};
pub use ring_buffer::{LogEntry, RingBufferHandle};
```

**Step 5: Run tests**

Run: `cargo test -p chief-wiggum logging`
Expected: All existing logging tests pass + 3 new tests pass

**Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/logging/bundle.rs src-tauri/src/logging/mod.rs src-tauri/src/logging/init.rs
git commit -m "feat: add diagnostic bundle ZIP export module (CHI-96)"
```

---

## Task 6: Diagnostic Bundle IPC Command

**Files:**
- Create: `src-tauri/src/commands/diagnostic.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create `commands/diagnostic.rs`**

```rust
//! IPC commands for diagnostic bundle export (CHI-96).

use crate::logging::bundle::{export_bundle, BundleExportResult};
use crate::AppError;

/// Export a diagnostic bundle ZIP file.
///
/// Collects ring buffer logs (redacted), system info, and redaction summary
/// into a ZIP archive in the log directory's `exports/` subfolder.
/// Returns the file path and metadata for the frontend to display.
#[tauri::command(rename_all = "snake_case")]
pub async fn export_diagnostic_bundle() -> Result<BundleExportResult, AppError> {
    // Run the blocking ZIP creation on a background thread
    tokio::task::spawn_blocking(export_bundle)
        .await
        .map_err(|e| AppError::Other(format!("Bundle export task failed: {}", e)))?
}
```

**Step 2: Update `commands/mod.rs`**

Add the new module. Find the existing module declarations and add:

```rust
pub mod diagnostic;
```

**Step 3: Register in `main.rs`**

Add `chief_wiggum_lib::commands::diagnostic::export_diagnostic_bundle` to the `invoke_handler` list.

**Step 4: Run tests**

Run: `cargo test -p chief-wiggum && cargo clippy -- -D warnings`
Expected: All tests pass, no warnings

**Step 5: Commit**

```bash
git add src-tauri/src/commands/diagnostic.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat: add export_diagnostic_bundle IPC command (CHI-96)"
```

---

## Task 7: Frontend Diagnostic Bundle Export

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/components/layout/StatusBar.tsx`

**Step 1: Add TypeScript types**

In `src/lib/types.ts`, add:

```typescript
/** Redaction summary from diagnostic bundle export. */
export interface RedactionSummary {
  rules_applied: string[];
  entries_redacted: number;
  total_entries: number;
  fields_redacted: number;
}

/** Result of a diagnostic bundle export. */
export interface BundleExportResult {
  path: string;
  size_bytes: number;
  log_entry_count: number;
  redaction: RedactionSummary;
}
```

**Step 2: Add export button to StatusBar**

In `src/components/layout/StatusBar.tsx`, import what's needed:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { addToast } from '@/stores/toastStore';
import type { BundleExportResult } from '@/lib/types';
```

Add a handler function:

```typescript
async function handleExportDiagnostics(): Promise<void> {
  try {
    const result = await invoke<BundleExportResult>('export_diagnostic_bundle');
    const sizeMB = (result.size_bytes / 1024 / 1024).toFixed(2);
    addToast({
      type: 'success',
      message: `Diagnostic bundle exported (${result.log_entry_count} logs, ${sizeMB} MB)`,
      duration: 6000,
    });
  } catch (err) {
    addToast({
      type: 'error',
      message: `Failed to export diagnostics: ${err}`,
      duration: 5000,
    });
  }
}
```

Add the button to the StatusBar JSX (in the right section, near the existing status indicators):

```tsx
<button
  class="px-2 py-0.5 text-xs rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
  style={{ color: 'var(--color-text-secondary)' }}
  onClick={handleExportDiagnostics}
  title="Export diagnostic bundle for bug reports"
>
  Export Diagnostics
</button>
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/lib/types.ts src/components/layout/StatusBar.tsx
git commit -m "feat: frontend diagnostic bundle export button in StatusBar (CHI-96)"
```

---

## Task 8: Integration Tests for SDK Command Discovery

**Files:**
- Modify: `src-tauri/src/slash/mod.rs`

**Step 1: Add integration-style tests**

Add to the existing test module in `slash/mod.rs`:

```rust
#[test]
fn from_sdk_tools_skips_all_builtin_tools() {
    let builtin_tools = vec![
        "Read", "Write", "Edit", "Bash", "Glob", "Grep",
        "WebSearch", "WebFetch", "NotebookEdit", "Task",
        "TodoRead", "TodoWrite",
    ]
    .into_iter()
    .map(String::from)
    .collect::<Vec<_>>();

    let commands = from_sdk_tools(&builtin_tools, &[]);
    assert!(
        commands.is_empty(),
        "All built-in tools should be filtered: {:?}",
        commands.iter().map(|c| &c.name).collect::<Vec<_>>()
    );
}

#[test]
fn from_sdk_tools_deduplicates_mcp_servers() {
    let tools = vec![
        "mcp__linear__list-issues".to_string(),
        "mcp__linear__get-issue".to_string(),
    ];
    let mcp_servers = vec!["linear".to_string()];

    let commands = from_sdk_tools(&tools, &mcp_servers);

    // Should have the 2 MCP tool commands but NOT a duplicate server entry
    // (because tools already have the linear prefix)
    let names: Vec<&str> = commands.iter().map(|c| c.name.as_str()).collect();
    assert!(names.contains(&"mcp__linear__list-issues"));
    assert!(names.contains(&"mcp__linear__get-issue"));
}

#[test]
fn sdk_category_serializes_correctly() {
    let cmd = SlashCommand {
        name: "test".to_string(),
        description: "Test".to_string(),
        category: CommandCategory::Sdk,
        args_hint: None,
        source_path: None,
        from_sdk: true,
    };
    let json = serde_json::to_string(&cmd).expect("should serialize");
    assert!(json.contains("\"Sdk\""));
    assert!(json.contains("\"from_sdk\":true"));
}
```

**Step 2: Run all tests**

Run: `cargo test -p chief-wiggum`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/slash/mod.rs
git commit -m "test: add integration tests for SDK command discovery (CHI-108)"
```

---

## Verification

1. `cargo check` — Rust compiles
2. `cargo test` — All tests pass (existing ~142 + ~9 new = ~151)
3. `cargo clippy -- -D warnings` — No warnings
4. `npx tsc --noEmit` — TypeScript clean
5. `npx eslint .` — No lint errors
6. `npx vite build` — Build succeeds
7. Manual test — SDK Command Discovery:
   - Start a session and send a message
   - After `cli:init` fires, open the slash command menu (`/`)
   - Verify MCP tools from connected servers appear in the list with `Sdk` category badge
   - Verify built-in tools (Read, Write, Bash) do NOT appear as slash commands
8. Manual test — Diagnostic Bundle:
   - Click "Export Diagnostics" in the StatusBar
   - Verify toast shows success with entry count and file size
   - Open the ZIP and verify it contains: `logs.jsonl`, `system_info.json`, `redaction_summary.json`, `README.txt`
   - Verify `logs.jsonl` entries do NOT contain API keys, emails, or home directory paths
