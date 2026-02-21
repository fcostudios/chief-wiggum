# CLI Connection & Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the real Claude Code CLI to the GUI — type a message, it goes to the CLI via PTY, streamed response renders in real-time.

**Architecture:** SessionBridgeMap holds one CliBridge per session. IPC commands (start/send/stop) control bridges. A tokio event loop reads BridgeOutput and emits Tauri events. Frontend listens for `message:chunk`/`message:complete` events. CliLocation detected on startup, project folder required before CLI can run.

**Tech Stack:** Tauri v2 managed state, tokio mpsc channels, `portable-pty`, `tauri-plugin-dialog`, SolidJS stores with `@tauri-apps/api/event`.

**Linear Issues:** CHI-48, CHI-40, CHI-44, CHI-45, CHI-46, CHI-47, CHI-49

---

## Dependency Graph

```
CHI-48 (Detect CLI) ──────────────────────────┐
CHI-40 (Folder Picker) ──────────────────────┐ │
CHI-44 (SessionBridgeMap) ──┬────────────────┤ │
CHI-45 (IPC Commands) ──────┤                │ │
CHI-46 (Event Loop) ────────┘                │ │
CHI-47 (Replace Mock) ──────────────── depends on all above
CHI-49 (Streaming Render) ──────────── depends on CHI-47
```

---

### Task 1: CHI-48 Backend — Detect CLI on Startup + IPC Command

**Files:**
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/src/commands/cli.rs`
- Modify: `src-tauri/src/commands/mod.rs`

**Step 1: Create `commands/cli.rs` with `get_cli_info` command**

```rust
// src-tauri/src/commands/cli.rs
// IPC commands for CLI detection and status.

use crate::bridge::CliLocation;
use crate::AppError;
use tauri::State;

#[tauri::command]
pub fn get_cli_info(cli: State<'_, CliLocation>) -> Result<CliLocation, AppError> {
    Ok(cli.inner().clone())
}
```

**Step 2: Register the module in `commands/mod.rs`**

Add after `pub mod session;`:
```rust
pub mod cli;
```

**Step 3: Update `main.rs` to detect CLI and register as managed state**

Add CLI detection after DB init (line ~17). Store as managed state. The app should NOT crash if CLI is missing — store the error in CliLocation instead.

```rust
// After database init, before tauri::Builder
// Detect Claude Code CLI — non-fatal if missing
let cli_location = match chief_wiggum_lib::bridge::CliLocation::detect(None) {
    Ok(loc) => {
        tracing::info!("Claude Code CLI found at: {:?}", loc.resolved_path);
        loc
    }
    Err(e) => {
        tracing::warn!("Claude Code CLI not found: {}", e);
        chief_wiggum_lib::bridge::CliLocation {
            path_override: None,
            resolved_path: None,
            version: None,
        }
    }
};
```

Add `.manage(cli_location)` after `.manage(db)`.

Add `commands::cli::get_cli_info` to the `generate_handler![]` macro.

**Step 4: Run tests**

Run: `cargo test --lib` from `src-tauri/`
Expected: All 64+ tests pass (no new tests needed — existing CLI tests cover detection)

Run: `cargo clippy -- -D warnings` from `src-tauri/`
Expected: No warnings

**Step 5: Commit**

```bash
git add src-tauri/src/commands/cli.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "CHI-48: detect Claude Code CLI on startup + get_cli_info IPC"
```

---

### Task 2: CHI-48 Frontend — CLI Status in StatusBar + Empty State

**Files:**
- Create: `src/stores/cliStore.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Add CliLocation type to `types.ts`**

Add after the `Session` interface:

```typescript
/** CLI location info from backend (mirrors Rust CliLocation) */
export interface CliLocation {
  path_override: string | null;
  resolved_path: string | null;
  version: string | null;
}
```

**Step 2: Create `cliStore.ts`**

```typescript
// src/stores/cliStore.ts
// CLI detection state: tracks whether Claude Code CLI is available.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { CliLocation } from '@/lib/types';

interface CliState {
  location: CliLocation | null;
  isDetected: boolean;
  isLoading: boolean;
}

const [state, setState] = createStore<CliState>({
  location: null,
  isDetected: false,
  isLoading: true,
});

/** Detect CLI on app startup. Non-fatal if missing. */
export async function detectCli(): Promise<void> {
  setState('isLoading', true);
  try {
    const location = await invoke<CliLocation>('get_cli_info');
    setState('location', location);
    setState('isDetected', location.resolved_path !== null);
  } catch {
    setState('isDetected', false);
  } finally {
    setState('isLoading', false);
  }
}

/** Retry CLI detection (e.g., after user installs CLI). */
export async function retryCliDetection(): Promise<void> {
  await detectCli();
}

export { state as cliState };
```

**Step 3: Update `StatusBar.tsx` to show CLI status**

Replace the `<span>Ready</span>` fallback (line 17) with CLI-aware status:

```tsx
import { cliState } from '@/stores/cliStore';

// In the left section, replace the Show fallback:
<Show when={uiState.yoloMode} fallback={
  <Show when={cliState.isDetected} fallback={
    <span class="text-error">CLI not found</span>
  }>
    <span>Ready</span>
  </Show>
}>
  <span class="text-warning font-semibold">YOLO MODE</span>
</Show>
```

**Step 4: Update `ConversationView.tsx` empty state to show CLI guidance**

In the empty state fallback, add CLI detection check:

```tsx
import { cliState } from '@/stores/cliStore';

// Replace the existing fallback div:
<div class="flex flex-col items-center justify-center h-full text-text-tertiary">
  <Show when={cliState.isDetected} fallback={
    <div class="text-center">
      <p class="text-lg mb-2 text-error">Claude Code CLI Not Found</p>
      <p class="text-sm mb-4">Install it to start chatting:</p>
      <code class="bg-bg-elevated px-3 py-1.5 rounded text-xs text-text-primary">
        npm install -g @anthropic-ai/claude-code
      </code>
    </div>
  }>
    <p class="text-lg mb-2">No messages yet</p>
    <p class="text-sm">Type a message below to start a conversation</p>
  </Show>
</div>
```

**Step 5: Call `detectCli()` on app start**

In `src/App.tsx`, add:

```tsx
import { onMount } from 'solid-js';
import { detectCli } from '@/stores/cliStore';

// Inside the App component, add:
onMount(() => {
  detectCli();
});
```

**Step 6: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint . && npx prettier --check .`
Expected: All pass

**Step 7: Commit**

```bash
git add src/stores/cliStore.ts src/lib/types.ts src/components/layout/StatusBar.tsx src/components/conversation/ConversationView.tsx src/App.tsx
git commit -m "CHI-48: CLI detection UI — StatusBar status + empty state guidance"
```

---

### Task 3: CHI-40 Backend — Folder Picker + Project Creation

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/commands/project.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`

**Step 1: Add `tauri-plugin-dialog` dependency**

In `Cargo.toml`, add under `[dependencies]`:

```toml
tauri-plugin-dialog = "2"
```

**Step 2: Add dialog permissions to `capabilities/default.json`**

Add to the `permissions` array:

```json
"dialog:default",
"dialog:allow-open"
```

**Step 3: Create `commands/project.rs`**

```rust
// src-tauri/src/commands/project.rs
// IPC commands for project/folder management.

use crate::db::{queries, Database};
use crate::AppError;
use tauri::State;

/// Open native folder picker and return the selected path.
#[tauri::command]
pub async fn pick_project_folder(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

/// Create a project from a folder path. Returns the project row.
#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    folder_path: String,
    name: Option<String>,
) -> Result<queries::ProjectRow, AppError> {
    // Use folder name as project name if not provided
    let project_name = name.unwrap_or_else(|| {
        std::path::Path::new(&folder_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string())
    });

    let id = uuid::Uuid::new_v4().to_string();
    queries::insert_project(&db, &id, &project_name, &folder_path)?;
    queries::get_project(&db, &id)?
        .ok_or_else(|| AppError::Other(format!("Project {} not found after insert", id)))
}

/// List all projects.
#[tauri::command]
pub fn list_projects(db: State<'_, Database>) -> Result<Vec<queries::ProjectRow>, AppError> {
    queries::list_projects(&db)
}
```

**Step 4: Register module and commands**

Add to `commands/mod.rs`:
```rust
pub mod project;
```

Add to `main.rs` in the `.plugin()` chain (before `.invoke_handler`):
```rust
.plugin(tauri_plugin_dialog::init())
```

Add to `generate_handler![]`:
```rust
commands::project::pick_project_folder,
commands::project::create_project,
commands::project::list_projects,
```

**Step 5: Run tests**

Run: `cargo test --lib` from `src-tauri/`
Expected: All tests pass

Run: `cargo clippy -- -D warnings`
Expected: No warnings

**Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/commands/project.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs src-tauri/capabilities/default.json
git commit -m "CHI-40: folder picker + project creation backend"
```

---

### Task 4: CHI-40 Frontend — Project Selection UI

**Files:**
- Create: `src/stores/projectStore.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/stores/sessionStore.ts`

**Step 1: Add Project type to `types.ts`**

Add after the `CliLocation` interface:

```typescript
/** Project row from backend (mirrors Rust ProjectRow) */
export interface Project {
  id: string;
  name: string;
  folder_path: string;
  default_model: string | null;
  created_at: string | null;
  updated_at: string | null;
}
```

**Step 2: Create `projectStore.ts`**

```typescript
// src/stores/projectStore.ts
// Project state: active project folder for CLI working directory.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Project } from '@/lib/types';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
}

const [state, setState] = createStore<ProjectState>({
  projects: [],
  activeProjectId: null,
  isLoading: false,
});

/** Load all projects from the database. */
export async function loadProjects(): Promise<void> {
  setState('isLoading', true);
  try {
    const projects = await invoke<Project[]>('list_projects');
    setState('projects', projects);
    // Auto-select the first project if none selected
    if (!state.activeProjectId && projects.length > 0) {
      setState('activeProjectId', projects[0].id);
    }
  } finally {
    setState('isLoading', false);
  }
}

/** Open folder picker and create a project. Returns the new project. */
export async function pickAndCreateProject(): Promise<Project | null> {
  const folderPath = await invoke<string | null>('pick_project_folder');
  if (!folderPath) return null;

  const project = await invoke<Project>('create_project', {
    folder_path: folderPath,
  });
  setState('projects', (prev) => [project, ...prev]);
  setState('activeProjectId', project.id);
  return project;
}

/** Set the active project. */
export function setActiveProject(projectId: string): void {
  setState('activeProjectId', projectId);
}

/** Get the active project object. */
export function getActiveProject(): Project | undefined {
  return state.projects.find((p) => p.id === state.activeProjectId);
}

export { state as projectState };
```

**Step 3: Update Sidebar to show project selector**

Add a project section above the sessions header. Add imports at top:

```tsx
import { FolderOpen } from 'lucide-solid';
import { projectState, loadProjects, pickAndCreateProject } from '@/stores/projectStore';
```

Add `loadProjects()` to the existing `onMount`:
```tsx
onMount(() => {
  loadSessions();
  loadProjects();
});
```

Add a project bar above the "Sessions" header div:
```tsx
{/* Project selector */}
<div class="px-3 py-2 border-b border-border-secondary">
  <Show when={projectState.activeProjectId} fallback={
    <button
      class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() => pickAndCreateProject()}
    >
      <FolderOpen size={14} />
      <span>Open Project Folder</span>
    </button>
  }>
    {(_id) => {
      const project = () => projectState.projects.find((p) => p.id === projectState.activeProjectId);
      return (
        <button
          class="flex items-center gap-2 w-full py-1 px-2 rounded-md text-xs text-text-primary hover:bg-bg-elevated transition-colors truncate"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={() => pickAndCreateProject()}
          title={project()?.folder_path ?? ''}
        >
          <FolderOpen size={14} class="shrink-0 text-accent" />
          <span class="truncate">{project()?.name ?? 'Unknown'}</span>
        </button>
      );
    }}
  </Show>
</div>
```

**Step 4: Update session creation to pass project context**

In `MainLayout.tsx`, update the `onSend` handler to use the active project:

```tsx
import { getActiveProject } from '@/stores/projectStore';
```

The `createNewSession` call doesn't need to change yet — the session is created in the DB without a project_id for now. The project_path will be used when starting the CLI (CHI-45).

**Step 5: Call `loadProjects()` from App.tsx**

In `src/App.tsx`:
```tsx
import { loadProjects } from '@/stores/projectStore';

// In onMount, add:
loadProjects();
```

**Step 6: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint . && npx prettier --check .`
Expected: All pass

**Step 7: Commit**

```bash
git add src/stores/projectStore.ts src/lib/types.ts src/components/layout/Sidebar.tsx src/components/layout/MainLayout.tsx src/App.tsx
git commit -m "CHI-40: project selection UI — folder picker + sidebar project bar"
```

---

### Task 5: CHI-44 — SessionBridgeMap (Process Manager)

**Files:**
- Create: `src-tauri/src/bridge/manager.rs`
- Modify: `src-tauri/src/bridge/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write failing tests for SessionBridgeMap**

Create `src-tauri/src/bridge/manager.rs` with the struct definition and test module:

```rust
// src-tauri/src/bridge/manager.rs
// Session-to-process manager: maps session IDs to CliBridge instances.
// Per CHI-44: central piece for multi-session CLI process management.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use super::process::{BridgeConfig, BridgeInterface, CliBridge};
use crate::{AppError, AppResult};

/// Maps session IDs to their active CLI bridge processes.
/// Registered as Tauri managed state.
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
}

impl SessionBridgeMap {
    /// Create an empty bridge map.
    pub fn new() -> Self {
        Self {
            bridges: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Spawn a new CLI bridge for a session.
    /// If the session already has a bridge, returns an error.
    pub async fn spawn_for_session(
        &self,
        session_id: &str,
        config: BridgeConfig,
    ) -> AppResult<()> {
        let mut bridges = self.bridges.write().await;
        if bridges.contains_key(session_id) {
            return Err(AppError::Bridge(format!(
                "Session {} already has an active CLI process",
                session_id
            )));
        }

        let bridge = CliBridge::spawn(config).await?;
        bridges.insert(session_id.to_string(), Arc::new(bridge));
        tracing::info!("Spawned CLI bridge for session {}", session_id);
        Ok(())
    }

    /// Get the bridge for a session, if one exists.
    pub async fn get(&self, session_id: &str) -> Option<Arc<dyn BridgeInterface>> {
        self.bridges.read().await.get(session_id).cloned()
    }

    /// Check if a session has an active bridge.
    pub async fn has(&self, session_id: &str) -> bool {
        self.bridges.read().await.contains_key(session_id)
    }

    /// Remove and shut down a session's bridge.
    pub async fn remove(&self, session_id: &str) -> AppResult<()> {
        let bridge = self.bridges.write().await.remove(session_id);
        if let Some(bridge) = bridge {
            bridge.shutdown().await?;
            tracing::info!("Removed CLI bridge for session {}", session_id);
        }
        Ok(())
    }

    /// Shut down all active bridges. Called on app exit.
    pub async fn shutdown_all(&self) -> AppResult<()> {
        let mut bridges = self.bridges.write().await;
        for (session_id, bridge) in bridges.drain() {
            tracing::info!("Shutting down CLI bridge for session {}", session_id);
            if let Err(e) = bridge.shutdown().await {
                tracing::warn!("Failed to shut down bridge for {}: {}", session_id, e);
            }
        }
        Ok(())
    }

    /// Get count of active bridges.
    pub async fn active_count(&self) -> usize {
        self.bridges.read().await.len()
    }

    /// Insert a pre-built bridge (for testing with MockBridge).
    #[cfg(test)]
    pub async fn insert_mock(
        &self,
        session_id: &str,
        bridge: Arc<dyn BridgeInterface>,
    ) {
        self.bridges
            .write()
            .await
            .insert(session_id.to_string(), bridge);
    }
}

impl Default for SessionBridgeMap {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::process::MockBridge;
    use crate::bridge::BridgeOutput;

    #[tokio::test]
    async fn new_map_is_empty() {
        let map = SessionBridgeMap::new();
        assert_eq!(map.active_count().await, 0);
        assert!(!map.has("session-1").await);
    }

    #[tokio::test]
    async fn insert_and_get_mock_bridge() {
        let map = SessionBridgeMap::new();
        let bridge = Arc::new(MockBridge::new(vec![]));
        map.insert_mock("session-1", bridge).await;

        assert!(map.has("session-1").await);
        assert!(!map.has("session-2").await);
        assert_eq!(map.active_count().await, 1);

        let retrieved = map.get("session-1").await;
        assert!(retrieved.is_some());
    }

    #[tokio::test]
    async fn remove_shuts_down_bridge() {
        let map = SessionBridgeMap::new();
        let bridge = Arc::new(MockBridge::new(vec![]));
        map.insert_mock("session-1", bridge.clone()).await;

        map.remove("session-1").await.unwrap();
        assert!(!map.has("session-1").await);
        assert_eq!(map.active_count().await, 0);
    }

    #[tokio::test]
    async fn remove_nonexistent_is_ok() {
        let map = SessionBridgeMap::new();
        // Should not error
        map.remove("nonexistent").await.unwrap();
    }

    #[tokio::test]
    async fn shutdown_all_clears_map() {
        let map = SessionBridgeMap::new();
        map.insert_mock("s1", Arc::new(MockBridge::new(vec![]))).await;
        map.insert_mock("s2", Arc::new(MockBridge::new(vec![]))).await;
        assert_eq!(map.active_count().await, 2);

        map.shutdown_all().await.unwrap();
        assert_eq!(map.active_count().await, 0);
    }

    #[tokio::test]
    async fn get_nonexistent_returns_none() {
        let map = SessionBridgeMap::new();
        assert!(map.get("nope").await.is_none());
    }

    #[tokio::test]
    async fn send_via_retrieved_bridge() {
        let map = SessionBridgeMap::new();
        let mock = Arc::new(MockBridge::new(vec![
            BridgeOutput::ProcessExited { exit_code: Some(0) },
        ]));
        map.insert_mock("session-1", mock.clone()).await;

        let bridge = map.get("session-1").await.unwrap();
        bridge.send("hello").await.unwrap();

        let inputs = mock.captured_inputs().await;
        assert_eq!(inputs, vec!["hello"]);
    }
}
```

**Step 2: Register module in `bridge/mod.rs`**

Add after `pub mod process;`:
```rust
pub mod manager;
```

Add to re-exports:
```rust
pub use manager::SessionBridgeMap;
```

**Step 3: Register SessionBridgeMap as managed state in `main.rs`**

Add after `let cli_location = ...`:
```rust
let bridge_map = chief_wiggum_lib::bridge::SessionBridgeMap::new();
```

Add `.manage(bridge_map)` after `.manage(cli_location)`.

**Step 4: Run tests**

Run: `cargo test --lib` from `src-tauri/`
Expected: 64 + 7 new = 71+ tests pass

Run: `cargo fmt --all && cargo clippy -- -D warnings`
Expected: Clean

**Step 5: Commit**

```bash
git add src-tauri/src/bridge/manager.rs src-tauri/src/bridge/mod.rs src-tauri/src/main.rs
git commit -m "CHI-44: SessionBridgeMap — session-to-process manager with tests"
```

---

### Task 6: CHI-45 — IPC Commands for CLI Interaction

**Files:**
- Create: `src-tauri/src/commands/bridge.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create `commands/bridge.rs`**

```rust
// src-tauri/src/commands/bridge.rs
// IPC commands for controlling CLI processes via SessionBridgeMap.

use crate::bridge::{BridgeConfig, CliLocation, ProcessStatus, SessionBridgeMap};
use crate::AppError;
use tauri::State;

/// Start a CLI process for a session. Idempotent — if already running, returns Ok.
#[tauri::command]
pub async fn start_session_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    cli: State<'_, CliLocation>,
    session_id: String,
    project_path: String,
    model: String,
) -> Result<(), AppError> {
    // If already has a bridge, skip
    if bridge_map.has(&session_id).await {
        return Ok(());
    }

    let cli_path = cli.binary_path()?.to_string();

    let config = BridgeConfig {
        cli_path,
        model: Some(model),
        output_format: "stream-json".to_string(),
        working_dir: Some(project_path),
        extra_args: vec!["--verbose".to_string()],
        ..BridgeConfig::default()
    };

    bridge_map.spawn_for_session(&session_id, config).await
}

/// Send a message to the CLI process for a session.
#[tauri::command]
pub async fn send_to_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
    message: String,
) -> Result<(), AppError> {
    let bridge = bridge_map
        .get(&session_id)
        .await
        .ok_or_else(|| AppError::Bridge(format!("No CLI process for session {}", session_id)))?;

    // Send the message followed by newline (stdin to CLI)
    bridge.send(&format!("{}\n", message)).await
}

/// Stop the CLI process for a session.
#[tauri::command]
pub async fn stop_session_cli(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<(), AppError> {
    bridge_map.remove(&session_id).await
}

/// Get the CLI process status for a session.
#[tauri::command]
pub async fn get_cli_status(
    bridge_map: State<'_, SessionBridgeMap>,
    session_id: String,
) -> Result<ProcessStatus, AppError> {
    match bridge_map.get(&session_id).await {
        Some(bridge) => Ok(bridge.status().await),
        None => Ok(ProcessStatus::NotStarted),
    }
}
```

**Step 2: Register module and commands**

Add to `commands/mod.rs`:
```rust
pub mod bridge;
```

Add to `main.rs` `generate_handler![]`:
```rust
commands::bridge::start_session_cli,
commands::bridge::send_to_cli,
commands::bridge::stop_session_cli,
commands::bridge::get_cli_status,
```

**Step 3: Run tests and checks**

Run: `cargo test --lib && cargo fmt --all -- --check && cargo clippy -- -D warnings`
Expected: All pass

**Step 4: Commit**

```bash
git add src-tauri/src/commands/bridge.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "CHI-45: IPC commands for CLI interaction (start, send, stop, status)"
```

---

### Task 7: CHI-46 — Streaming Event Loop (Bridge Output → Tauri Events)

**Files:**
- Create: `src-tauri/src/bridge/event_loop.rs`
- Modify: `src-tauri/src/bridge/mod.rs`
- Modify: `src-tauri/src/commands/bridge.rs`

**Step 1: Create `bridge/event_loop.rs`**

```rust
// src-tauri/src/bridge/event_loop.rs
// Tokio task that reads BridgeOutput and emits Tauri events to the frontend.
// Per CHI-46: one task per CliBridge, exits when bridge shuts down.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::process::BridgeInterface;
use super::{BridgeEvent, BridgeOutput, MessageChunk, PermissionRequest};

/// Event payloads emitted to the frontend.

#[derive(Debug, Clone, Serialize)]
pub struct ChunkPayload {
    pub session_id: String,
    pub content: String,
    pub token_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MessageCompletePayload {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub thinking_tokens: Option<u64>,
    pub cost_cents: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliExitedPayload {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PermissionRequestPayload {
    pub session_id: String,
    pub request_id: String,
    pub tool: String,
    pub command: String,
    pub file_path: Option<String>,
    pub risk_level: String,
}

/// Spawn a tokio task that reads from a bridge and emits Tauri events.
/// Returns a JoinHandle that can be awaited or aborted.
pub fn spawn_event_loop(
    app: AppHandle,
    session_id: String,
    bridge: Arc<dyn BridgeInterface>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Event loop started for session {}", session_id);

        loop {
            match bridge.receive().await {
                Ok(Some(output)) => {
                    emit_bridge_output(&app, &session_id, output);
                }
                Ok(None) => {
                    // Channel closed — bridge shut down
                    tracing::info!("Event loop: bridge channel closed for session {}", session_id);
                    break;
                }
                Err(e) => {
                    tracing::error!("Event loop error for session {}: {}", session_id, e);
                    break;
                }
            }
        }

        tracing::info!("Event loop ended for session {}", session_id);
    })
}

/// Map a BridgeOutput to the appropriate Tauri event emission.
fn emit_bridge_output(app: &AppHandle, session_id: &str, output: BridgeOutput) {
    match output {
        BridgeOutput::Chunk(chunk) => {
            let payload = ChunkPayload {
                session_id: session_id.to_string(),
                content: chunk.content,
                token_count: chunk.token_count,
            };
            if let Err(e) = app.emit("message:chunk", &payload) {
                tracing::warn!("Failed to emit message:chunk: {}", e);
            }
        }
        BridgeOutput::Event(event) => {
            match event {
                BridgeEvent::MessageComplete {
                    role,
                    content,
                    model,
                    input_tokens,
                    output_tokens,
                    thinking_tokens,
                    cost_cents,
                } => {
                    let payload = MessageCompletePayload {
                        session_id: session_id.to_string(),
                        role: role.unwrap_or_default(),
                        content: content.unwrap_or_default(),
                        model,
                        input_tokens,
                        output_tokens,
                        thinking_tokens,
                        cost_cents,
                    };
                    if let Err(e) = app.emit("message:complete", &payload) {
                        tracing::warn!("Failed to emit message:complete: {}", e);
                    }
                }
                // Other event types logged but not yet emitted (future tasks)
                other => {
                    tracing::debug!("Bridge event (not yet mapped): {:?}", other);
                }
            }
        }
        BridgeOutput::PermissionRequired(req) => {
            let payload = PermissionRequestPayload {
                session_id: session_id.to_string(),
                request_id: req.request_id,
                tool: req.tool,
                command: req.command,
                file_path: req.file_path,
                risk_level: format!("{:?}", req.risk_level),
            };
            if let Err(e) = app.emit("permission:request", &payload) {
                tracing::warn!("Failed to emit permission:request: {}", e);
            }
        }
        BridgeOutput::ProcessExited { exit_code } => {
            let payload = CliExitedPayload {
                session_id: session_id.to_string(),
                exit_code,
            };
            if let Err(e) = app.emit("cli:exited", &payload) {
                tracing::warn!("Failed to emit cli:exited: {}", e);
            }
        }
    }
}
```

**Step 2: Register module in `bridge/mod.rs`**

Add after `pub mod manager;`:
```rust
pub mod event_loop;
```

**Step 3: Wire event loop into `start_session_cli` command**

In `commands/bridge.rs`, update `start_session_cli` to spawn the event loop after spawning the bridge:

```rust
use crate::bridge::event_loop;

// In start_session_cli, after bridge_map.spawn_for_session():
bridge_map.spawn_for_session(&session_id, config).await?;

// Start the event loop for this session
if let Some(bridge) = bridge_map.get(&session_id).await {
    event_loop::spawn_event_loop(app.clone(), session_id, bridge);
}

Ok(())
```

Also add `app: tauri::AppHandle` parameter to the command signature:

```rust
pub async fn start_session_cli(
    app: tauri::AppHandle,
    bridge_map: State<'_, SessionBridgeMap>,
    cli: State<'_, CliLocation>,
    session_id: String,
    project_path: String,
    model: String,
) -> Result<(), AppError> {
```

**Step 4: Run tests and checks**

Run: `cargo test --lib && cargo fmt --all -- --check && cargo clippy -- -D warnings`
Expected: All pass

**Step 5: Commit**

```bash
git add src-tauri/src/bridge/event_loop.rs src-tauri/src/bridge/mod.rs src-tauri/src/commands/bridge.rs
git commit -m "CHI-46: streaming event loop — bridge output to Tauri events"
```

---

### Task 8: CHI-47 — Replace Mock sendMessage with Real CLI Streaming

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Rewrite `conversationStore.ts`**

Replace the entire file:

```typescript
// src/stores/conversationStore.ts
// Conversation state: messages for active session, real CLI streaming.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Message } from '@/lib/types';
import { updateSessionTitle, getActiveSession } from '@/stores/sessionStore';
import { getActiveProject } from '@/stores/projectStore';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  /** Content being streamed for the current assistant response. */
  streamingContent: string;
  /** Whether we're currently receiving streaming chunks. */
  isStreaming: boolean;
  /** Error message if CLI fails. */
  error: string | null;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
  streamingContent: '',
  isStreaming: false,
  error: null,
});

/** Active event listener cleanup functions. */
let unlistenChunk: UnlistenFn | null = null;
let unlistenComplete: UnlistenFn | null = null;
let unlistenExited: UnlistenFn | null = null;

/** Load messages for a session from the database. */
export async function loadMessages(sessionId: string): Promise<void> {
  setState('messages', []);
  setState('isLoading', true);
  setState('error', null);
  try {
    const messages = await invoke<Message[]>('list_messages', { session_id: sessionId });
    setState('messages', messages);
  } finally {
    setState('isLoading', false);
  }
}

/** Set up Tauri event listeners for streaming. Call once on session activation. */
export async function setupEventListeners(sessionId: string): Promise<void> {
  // Clean up previous listeners
  await cleanupEventListeners();

  unlistenChunk = await listen<{
    session_id: string;
    content: string;
    token_count: number | null;
  }>('message:chunk', (event) => {
    if (event.payload.session_id !== sessionId) return;
    setState('streamingContent', (prev) => prev + event.payload.content);
    setState('isStreaming', true);
  });

  unlistenComplete = await listen<{
    session_id: string;
    role: string;
    content: string;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    thinking_tokens: number | null;
    cost_cents: number | null;
  }>('message:complete', (event) => {
    if (event.payload.session_id !== sessionId) return;

    const p = event.payload;
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: (p.role as Message['role']) || 'assistant',
      content: p.content || state.streamingContent,
      model: p.model,
      input_tokens: p.input_tokens,
      output_tokens: p.output_tokens,
      thinking_tokens: p.thinking_tokens,
      cost_cents: p.cost_cents,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    setState('messages', (prev) => [...prev, assistantMsg]);
    setState('streamingContent', '');
    setState('isStreaming', false);
    setState('isLoading', false);

    // Persist assistant message to DB
    invoke('save_message', {
      session_id: sessionId,
      id: assistantMsg.id,
      role: assistantMsg.role,
      content: assistantMsg.content,
      model: assistantMsg.model,
      input_tokens: assistantMsg.input_tokens,
      output_tokens: assistantMsg.output_tokens,
      cost_cents: assistantMsg.cost_cents,
    }).catch((err) => devWarn('Failed to persist assistant message:', err));
  });

  unlistenExited = await listen<{
    session_id: string;
    exit_code: number | null;
  }>('cli:exited', (event) => {
    if (event.payload.session_id !== sessionId) return;
    setState('isLoading', false);
    setState('isStreaming', false);
    if (event.payload.exit_code !== 0 && event.payload.exit_code !== null) {
      setState('error', `CLI exited with code ${event.payload.exit_code}`);
    }
  });
}

/** Clean up event listeners. */
export async function cleanupEventListeners(): Promise<void> {
  if (unlistenChunk) { unlistenChunk(); unlistenChunk = null; }
  if (unlistenComplete) { unlistenComplete(); unlistenComplete = null; }
  if (unlistenExited) { unlistenExited(); unlistenExited = null; }
}

/** Send a user message: persist to DB, start CLI if needed, send via PTY. */
export async function sendMessage(content: string, sessionId: string): Promise<void> {
  const msgId = crypto.randomUUID();
  const userMsg: Message = {
    id: msgId,
    session_id: sessionId,
    role: 'user',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };

  // Add to local store immediately (optimistic)
  setState('messages', (prev) => [...prev, userMsg]);
  setState('isLoading', true);
  setState('error', null);

  // Persist user message to database
  invoke('save_message', {
    session_id: sessionId,
    id: msgId,
    role: 'user',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) => devWarn('Failed to persist user message:', err));

  // Auto-title session from first message
  const session = getActiveSession();
  if (session && !session.title) {
    const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
    updateSessionTitle(sessionId, title).catch((err) =>
      devWarn('Failed to update session title:', err),
    );
  }

  // Ensure CLI is started for this session
  const project = getActiveProject();
  const projectPath = project?.folder_path ?? '.';
  const model = session?.model ?? 'claude-sonnet-4-6';

  try {
    await invoke('start_session_cli', {
      session_id: sessionId,
      project_path: projectPath,
      model,
    });

    // Set up event listeners if not already
    await setupEventListeners(sessionId);

    // Send the message to the CLI
    await invoke('send_to_cli', {
      session_id: sessionId,
      message: content,
    });
  } catch (err) {
    setState('isLoading', false);
    setState('error', `Failed to send message: ${err}`);
    devWarn('Failed to send message:', err);
  }
}

/** Clear all messages (e.g., on session change). */
export function clearMessages(): void {
  setState('messages', []);
  setState('isLoading', false);
  setState('streamingContent', '');
  setState('isStreaming', false);
  setState('error', null);
}

/** Dev-only warning logger. */
function devWarn(msg: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[conversationStore] ${msg}`, err);
  }
}

export { state as conversationState };
```

**Step 2: Update MainLayout.tsx to disable send when CLI not detected**

In `MainLayout.tsx`, update the `MessageInput` `isDisabled` prop:

```tsx
import { cliState } from '@/stores/cliStore';

// Change isDisabled={false} to:
isDisabled={!cliState.isDetected}
```

**Step 3: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint . && npx prettier --check .`
Expected: All pass

**Step 4: Commit**

```bash
git add src/stores/conversationStore.ts src/components/layout/MainLayout.tsx
git commit -m "CHI-47: replace mock sendMessage with real CLI streaming"
```

---

### Task 9: CHI-49 — Streaming Message Rendering

**Files:**
- Modify: `src/components/conversation/ConversationView.tsx`
- Modify: `src/components/conversation/MessageBubble.tsx`

**Step 1: Update ConversationView to show streaming content**

Add streaming bubble below the message list:

```tsx
import { conversationState } from '@/stores/conversationStore';

// After the <For> block and before the loading indicator <Show>, add:
<Show when={conversationState.isStreaming && conversationState.streamingContent}>
  <div class="flex justify-start">
    <div class="max-w-[85%] bg-bg-secondary border border-border-primary rounded-lg px-4 py-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-sm text-text-secondary font-medium">Assistant</span>
      </div>
      <MarkdownContent content={conversationState.streamingContent} />
      <span class="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
    </div>
  </div>
</Show>
```

Add import for `MarkdownContent`:
```tsx
import MarkdownContent from './MarkdownContent';
```

**Step 2: Update the loading indicator**

Change the loading indicator to only show when loading but NOT streaming (streaming has its own visual):

```tsx
<Show when={conversationState.isLoading && !conversationState.isStreaming}>
```

**Step 3: Add error display**

After the loading indicator, add error state:

```tsx
<Show when={conversationState.error}>
  <div class="flex justify-center">
    <div class="bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-error text-sm">
      {conversationState.error}
    </div>
  </div>
</Show>
```

**Step 4: Ensure auto-scroll tracks streaming content**

Update the `createEffect` reactive dependency to also track streaming:

```tsx
createEffect(() => {
  void conversationState.messages.length;
  void conversationState.streamingContent;
  if (isAutoScroll() && scrollRef) {
    requestAnimationFrame(() => {
      scrollRef!.scrollTop = scrollRef!.scrollHeight;
    });
  }
});
```

**Step 5: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint . && npx prettier --check .`
Expected: All pass

**Step 6: Commit**

```bash
git add src/components/conversation/ConversationView.tsx
git commit -m "CHI-49: streaming message rendering with cursor indicator"
```

---

### Task 10: Integration Verification + Tracking Updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/handover.json`

**Step 1: Run all checks**

```bash
# Rust
cd src-tauri && cargo test --lib && cargo fmt --all -- --check && cargo clippy -- -D warnings

# Frontend
npx tsc --noEmit && npx eslint . && npx prettier --check .

# Build check
npx vite build
```

Expected: All pass

**Step 2: Test manually**

Run: `npm run tauri dev`
1. App starts, StatusBar shows "Ready" or "CLI not found"
2. Click "Open Project Folder" in sidebar → native folder picker opens
3. Select a folder → project appears in sidebar
4. Type a message → if CLI is found, it starts Claude Code and streams a response
5. Response renders incrementally with blinking cursor
6. Cmd+M cycles model

**Step 3: Update Linear issues**

Mark CHI-44, CHI-45, CHI-46, CHI-47, CHI-48, CHI-49, CHI-40 as Done.

**Step 4: Update tracking files**

Update `CLAUDE.md`:
- Add CHI-48, CHI-40, CHI-44, CHI-45, CHI-46, CHI-47, CHI-49 to What's Done
- Update File Locations with new files (manager.rs, event_loop.rs, commands/bridge.rs, commands/project.rs, cliStore.ts, projectStore.ts)

Update `.claude/handover.json`:
- Mark all 7 tasks as done with file lists and notes
- Update CHI-36 epic status

**Step 5: Commit and push**

```bash
git add CLAUDE.md .claude/handover.json
git commit -m "docs: update tracking for CLI connection (CHI-36 epic)"
git push
```
