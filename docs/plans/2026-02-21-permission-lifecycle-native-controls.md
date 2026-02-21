# Permission Flow, App Lifecycle & Native Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the permission system end-to-end (CHI-50 + CHI-51 + CHI-52), add app shutdown cleanup (CHI-56 + CHI-60), and implement platform-native window controls (CHI-67).

**Architecture:** Three independent workstreams executed in parallel batches. Permission flow connects existing `PermissionManager` (backend) to `PermissionDialog` (frontend) via Tauri IPC + events. Lifecycle adds an app-exit handler that calls `SessionBridgeMap::shutdown_all()`. Native controls detect platform via `@tauri-apps/plugin-os` and conditionally render macOS traffic lights vs Windows/Linux buttons.

**Tech Stack:** Tauri v2 (IPC commands + events), Rust (tokio async), SolidJS 1.9 (stores + components), `@tauri-apps/plugin-os`, `tauri-plugin-os`

---

## Dependency Graph

```
CHI-50 (permission IPC backend)
  └→ CHI-51 (permission event pipeline frontend)
      └→ CHI-52 (YOLO mode IPC wiring)

CHI-56 (process lifecycle — already implemented via ProcessStatus enum)
  └→ CHI-60 (shutdown all on app quit)

CHI-67 (native window controls — independent)
```

**Batch 1 (parallel):** Task 1 (CHI-50), Task 5 (CHI-60), Task 7 (CHI-67 deps)
**Batch 2 (parallel):** Task 2 (CHI-51), Task 8 (CHI-67 UI)
**Batch 3:** Task 3 (CHI-52)
**Batch 4:** Task 4 (Integration verification + tracking)

---

## Task 1: Permission IPC Commands (CHI-50 backend)

**Files:**
- Modify: `src-tauri/src/commands/bridge.rs`
- Modify: `src-tauri/src/bridge/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Register PermissionManager as Tauri managed state**

In `src-tauri/src/main.rs`, add PermissionManager creation and `.manage()`:

```rust
// After line 36 (bridge_map creation), add:
let permission_manager = chief_wiggum_lib::bridge::PermissionManager::new();
```

Add `.manage(permission_manager)` after line 43 (`.manage(bridge_map)`).

Re-export PermissionManager from `bridge/mod.rs` if not already:

```rust
// In src-tauri/src/bridge/mod.rs, add:
pub use permission::PermissionManager;
```

**Step 2: Add `respond_permission` IPC command**

In `src-tauri/src/commands/bridge.rs`, add:

```rust
use crate::bridge::permission::{PermissionManager, PermissionResponse, PermissionAction};

/// Resolve a pending permission request with the user's action.
#[tauri::command]
pub async fn respond_permission(
    permission_manager: State<'_, PermissionManager>,
    request_id: String,
    action: String,
    pattern: Option<String>,
) -> Result<(), AppError> {
    let action = match action.as_str() {
        "Approve" => PermissionAction::Approve,
        "Deny" => PermissionAction::Deny,
        "AlwaysAllow" => PermissionAction::AlwaysAllow,
        other => return Err(AppError::Validation(format!("Invalid permission action: {}", other))),
    };

    let response = PermissionResponse {
        request_id,
        action,
        pattern,
    };

    permission_manager.respond_permission(response).await
}
```

**Step 3: Add `toggle_yolo_mode` IPC command**

In `src-tauri/src/commands/bridge.rs`, add:

```rust
/// Toggle YOLO mode for the permission system.
#[tauri::command]
pub async fn toggle_yolo_mode(
    permission_manager: State<'_, PermissionManager>,
    enable: bool,
) -> Result<(), AppError> {
    if enable {
        permission_manager.enable_yolo_mode().await;
    } else {
        permission_manager.disable_yolo_mode().await;
    }
    Ok(())
}
```

**Step 4: Add `AppError::Validation` variant if missing**

Check `src-tauri/src/lib.rs` for the `AppError` enum. If there's no `Validation` variant, add one:

```rust
#[error("Validation error: {0}")]
Validation(String),
```

**Step 5: Register new commands in main.rs**

In `src-tauri/src/main.rs`, add to the `invoke_handler`:

```rust
chief_wiggum_lib::commands::bridge::respond_permission,
chief_wiggum_lib::commands::bridge::toggle_yolo_mode,
```

**Step 6: Run tests to verify**

Run: `cargo test`
Expected: All 71+ tests pass (no new tests needed — PermissionManager already has 17 tests).

Run: `cargo clippy -- -D warnings`
Expected: No warnings.

**Step 7: Commit**

```bash
git add src-tauri/src/commands/bridge.rs src-tauri/src/bridge/mod.rs src-tauri/src/main.rs src-tauri/src/lib.rs
git commit -m "CHI-50: wire permission IPC commands (respond_permission, toggle_yolo_mode)"
```

---

## Task 2: Permission Event Pipeline (CHI-51 frontend)

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/stores/uiStore.ts`

**Depends on:** Task 1 (needs `respond_permission` command to exist)

**Step 1: Add `permission:request` listener in conversationStore.ts**

In `setupEventListeners()`, add a fourth listener after `unlistenExited`:

```typescript
// At module top, add:
let unlistenPermission: UnlistenFn | null = null;

// Import showPermissionDialog:
import { showPermissionDialog } from '@/stores/uiStore';
import type { PermissionRequest } from '@/lib/types';
```

Inside `setupEventListeners(sessionId)`, after the `cli:exited` listener block:

```typescript
  unlistenPermission = await listen<{
    session_id: string;
    request_id: string;
    tool: string;
    command: string;
    file_path: string | null;
    risk_level: string;
  }>('permission:request', (event) => {
    if (event.payload.session_id !== sessionId) return;
    const req: PermissionRequest = {
      request_id: event.payload.request_id,
      tool: event.payload.tool,
      command: event.payload.command,
      file_path: event.payload.file_path,
      risk_level: event.payload.risk_level as PermissionRequest['risk_level'],
    };
    showPermissionDialog(req);
  });
```

In `cleanupEventListeners()`, add cleanup:

```typescript
  if (unlistenPermission) {
    unlistenPermission();
    unlistenPermission = null;
  }
```

**Step 2: Wire PermissionDialog response to IPC in MainLayout.tsx**

Replace the TODO in MainLayout.tsx (lines 129-132):

```typescript
// Add import at top:
import { invoke } from '@tauri-apps/api/core';

// Replace the onRespond handler:
<PermissionDialog
  request={request()}
  onRespond={async (action: PermissionAction) => {
    const req = request();
    dismissPermissionDialog();
    try {
      await invoke('respond_permission', {
        request_id: req.request_id,
        action,
        pattern: null,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[MainLayout] Failed to resolve permission:', err);
      }
    }
  }}
/>
```

Note: `invoke` may already be imported — check first and only add if missing.

**Step 3: Run checks**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npx eslint src/`
Expected: Clean.

Run: `npx prettier --check src/`
Expected: Clean (run `--write` first if needed).

**Step 4: Commit**

```bash
git add src/stores/conversationStore.ts src/components/layout/MainLayout.tsx
git commit -m "CHI-51: permission event pipeline — listen for requests, wire dialog responses"
```

---

## Task 3: YOLO Mode IPC Wiring (CHI-52)

**Files:**
- Modify: `src/stores/uiStore.ts`

**Depends on:** Task 1 (needs `toggle_yolo_mode` command to exist)

**Step 1: Wire IPC calls in uiStore.ts**

Replace the TODO comments (lines 62 and 68):

```typescript
// Add import at top:
import { invoke } from '@tauri-apps/api/core';
```

Replace `enableYoloMode()`:

```typescript
/** Enable YOLO mode (called after user confirms warning). */
export function enableYoloMode() {
  setState('yoloMode', true);
  setState('yoloDialogVisible', false);
  invoke('toggle_yolo_mode', { enable: true }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to enable YOLO mode:', err);
    }
  });
}
```

Replace `disableYoloMode()`:

```typescript
/** Disable YOLO mode. */
export function disableYoloMode() {
  setState('yoloMode', false);
  invoke('toggle_yolo_mode', { enable: false }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to disable YOLO mode:', err);
    }
  });
}
```

**Step 2: Run checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`
Expected: All clean.

**Step 3: Commit**

```bash
git add src/stores/uiStore.ts
git commit -m "CHI-52: wire YOLO mode frontend toggle to backend IPC"
```

---

## Task 4: Verify Permission Integration End-to-End

**Files:** None — verification only.

**Step 1: Run full backend checks**

```bash
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```

Expected: All pass.

**Step 2: Run full frontend checks**

```bash
npx tsc --noEmit
npx eslint src/
npx prettier --check src/
npx vite build
```

Expected: All pass.

**Step 3: Trace the full flow**

Verify the data flow is complete:
1. Backend `event_loop.rs:124-136` emits `permission:request` event
2. Frontend `conversationStore.ts` receives event, calls `showPermissionDialog(req)`
3. `uiStore.ts` sets `permissionRequest` state
4. `MainLayout.tsx` renders `<PermissionDialog>` via `<Show when={uiState.permissionRequest}>`
5. User clicks Approve/Deny/AlwaysAllow → `onRespond` calls `invoke('respond_permission', ...)`
6. Backend `commands/bridge.rs` calls `PermissionManager::respond_permission()`
7. `PermissionManager` resolves the waiting oneshot channel → CLI proceeds

---

## Task 5: Shutdown All CLI on App Quit (CHI-56 + CHI-60)

**Files:**
- Modify: `src-tauri/src/main.rs`

**Step 1: Add `on_window_event` handler for close**

Tauri v2 uses `.on_window_event()` on the Builder. Add before `.run()`:

```rust
// Replace .run(tauri::generate_context!()) with:
.setup(|app| {
    let bridge_map_handle = app.state::<chief_wiggum_lib::bridge::SessionBridgeMap>().inner().clone();

    // Save the bridge map for the close handler
    let bridge_map_for_close = bridge_map_handle.clone();

    // Listen for window close events
    let main_window = app.get_webview_window("main").expect("main window not found");
    main_window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let bridge_map = bridge_map_for_close.clone();
            // Spawn blocking task to shut down all bridges
            tauri::async_runtime::block_on(async move {
                tracing::info!("App closing — shutting down all CLI processes");
                if let Err(e) = bridge_map.shutdown_all().await {
                    tracing::warn!("Error during shutdown: {}", e);
                }
                tracing::info!("All CLI processes shut down");
            });
        }
    });

    Ok(())
})
.run(tauri::generate_context!())
.expect("error while running Chief Wiggum");
```

Wait — `SessionBridgeMap` needs to be `Clone` for this. Let's check: it wraps `Arc<RwLock<HashMap<...>>>`, and `Arc` is `Clone`. But the struct itself doesn't derive `Clone`. We need to add it.

**Step 2: Add `Clone` to SessionBridgeMap**

In `src-tauri/src/bridge/manager.rs`:

```rust
// Change:
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
}

// To:
#[derive(Clone)]
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
}
```

Also add `Clone` to the `Default` derive if needed (it already implements `Default` manually, which is fine).

**Step 3: Run tests**

Run: `cargo test`
Expected: All tests pass (including 7 SessionBridgeMap tests).

Run: `cargo clippy -- -D warnings`
Expected: Clean.

**Step 4: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/src/bridge/manager.rs
git commit -m "CHI-60: shutdown all CLI processes on app quit"
```

---

## Task 6: Mark CHI-56 as Complete (No Code Needed)

**CHI-56 asks for a "Process lifecycle state machine".**

This is **already implemented** in `src-tauri/src/bridge/process.rs`:

```rust
pub enum ProcessStatus {
    NotStarted,
    Starting,
    Running,
    ShuttingDown,
    Exited(Option<i32>),
    Error(String),
}
```

The full lifecycle is managed:
- `NotStarted` → `Starting` → `Running` (in `CliBridge::spawn()`)
- `Running` → `ShuttingDown` → `Exited` (in `shutdown()`)
- `Running` → `Exited` (process monitor detects exit)
- Any → `Error` (on PTY/process errors)

No code changes needed. Just update tracking files to mark CHI-56 done.

---

## Task 7: Native Window Controls — Dependencies (CHI-67 part 1)

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/main.rs`

**Step 1: Install `@tauri-apps/plugin-os` (frontend)**

```bash
npm install @tauri-apps/plugin-os
```

**Step 2: Add `tauri-plugin-os` to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-os = "2"
```

**Step 3: Register the plugin in main.rs**

After `.plugin(tauri_plugin_dialog::init())`, add:

```rust
.plugin(tauri_plugin_os::init())
```

**Step 4: Add capability permission**

In `src-tauri/capabilities/default.json`, add to the `permissions` array:

```json
"os:default"
```

**Step 5: Verify it builds**

```bash
cargo check
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/capabilities/default.json src-tauri/src/main.rs
git commit -m "CHI-67: add tauri-plugin-os dependency for platform detection"
```

---

## Task 8: Native Window Controls — Platform UI (CHI-67 part 2)

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`
- Modify: `src-tauri/tauri.conf.json`

**Depends on:** Task 7 (needs `@tauri-apps/plugin-os` installed)

**Step 1: Enable native traffic lights via Tauri config**

Per SPEC-003 §10.1, macOS should show real native traffic lights via `titleBarStyle: "overlay"`. This is a Tauri v2 feature that overlays native window controls on the webview while keeping `decorations: false` behavior on Windows/Linux.

In `src-tauri/tauri.conf.json`, update the window config:

```json
"windows": [
  {
    "title": "Chief Wiggum",
    "width": 1200,
    "height": 800,
    "minWidth": 1024,
    "minHeight": 640,
    "resizable": true,
    "fullscreen": false,
    "decorations": true,
    "titleBarStyle": "overlay",
    "hiddenTitle": true
  }
]
```

Key changes:
- `decorations: true` — re-enables native window chrome
- `titleBarStyle: "overlay"` — on macOS, shows native traffic lights overlaid on webview; on Windows/Linux, the native title bar is hidden and we render custom buttons
- `hiddenTitle: true` — hides the native title text (we render our own "Chief Wiggum")

**How this works per platform:**
- **macOS:** Native traffic lights appear at top-left corner of the webview. We add a 70px spacer to avoid overlapping them. No custom close/min/max buttons needed.
- **Windows/Linux:** `titleBarStyle: "overlay"` hides the native title bar, giving us a frameless window just like `decorations: false`. We keep our custom minimize/maximize/close buttons on the right.

**Step 2: Update TitleBar.tsx with platform detection**

```tsx
// src/components/layout/TitleBar.tsx
// Custom title bar (40px) per SPEC-003 §2 Z1.
// macOS: native traffic lights via titleBarStyle overlay (70px spacer).
// Windows/Linux: minimize, maximize, close buttons on the right.
// Center spacer: data-tauri-drag-region for window dragging.

import type { Component } from 'solid-js';
import { Show, createSignal, onMount } from 'solid-js';
import { Menu, Minus, Maximize2, X, Zap } from 'lucide-solid';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { toggleSidebar, uiState, toggleYoloMode } from '@/stores/uiStore';
import ModelSelector from '@/components/common/ModelSelector';

const TitleBar: Component = () => {
  const appWindow = getCurrentWindow();
  const [isMac, setIsMac] = createSignal(false);

  onMount(() => {
    setIsMac(platform() === 'macos');
  });

  return (
    <header
      class="flex items-center bg-bg-secondary border-b border-border-primary select-none"
      style={{ height: 'var(--title-bar-height)' }}
    >
      {/* macOS: spacer for native traffic lights (rendered by OS via titleBarStyle overlay) */}
      <Show when={isMac()}>
        <div class="w-[70px] shrink-0" />
      </Show>

      {/* Left: sidebar toggle + app name */}
      <div class="flex items-center gap-2 px-3">
        <button
          class="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
        <span class="text-md font-semibold text-text-primary">Chief Wiggum</span>
        <Show when={uiState.yoloMode}>
          <span class="px-2 py-0.5 rounded text-xs font-medium bg-warning-muted text-warning animate-pulse">
            YOLO
          </span>
        </Show>
      </div>

      {/* Center: model selector + drag region */}
      <div class="flex-1 h-full flex items-center justify-center" data-tauri-drag-region>
        <ModelSelector />
      </div>

      {/* Right: YOLO toggle + window controls */}
      <div class="flex items-center">
        <button
          class={`flex items-center justify-center w-12 h-full transition-colors ${
            uiState.yoloMode
              ? 'text-warning bg-warning-muted'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleYoloMode}
          aria-label={uiState.yoloMode ? 'Disable YOLO Mode' : 'Enable YOLO Mode'}
          title={
            uiState.yoloMode
              ? 'YOLO Mode active (Cmd+Shift+Y)'
              : 'Enable YOLO Mode (Cmd+Shift+Y)'
          }
        >
          <Zap size={14} />
        </button>

        {/* Windows/Linux: right-side window controls (macOS uses native traffic lights) */}
        <Show when={!isMac()}>
          <button
            class="flex items-center justify-center w-12 h-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => appWindow.minimize()}
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            class="flex items-center justify-center w-12 h-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => appWindow.toggleMaximize()}
            aria-label="Maximize"
          >
            <Maximize2 size={14} />
          </button>
          <button
            class="flex items-center justify-center w-12 h-full text-text-secondary hover:text-text-primary hover:bg-error-muted transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => appWindow.close()}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </Show>
      </div>
    </header>
  );
};

export default TitleBar;
```

**Step 3: Run checks**

```bash
npx tsc --noEmit
npx eslint src/
npx prettier --check src/
```

Expected: All clean.

**Step 4: Commit**

```bash
git add src/components/layout/TitleBar.tsx src-tauri/tauri.conf.json
git commit -m "CHI-67: native window controls — macOS traffic lights via overlay, Win/Linux custom buttons"
```

---

## Task 9: Integration Verification + Tracking Updates

**Files:**
- Modify: `CLAUDE.md` — update What's Done table
- Modify: `.claude/handover.json` — mark CHI-50, CHI-51, CHI-52, CHI-56, CHI-60, CHI-67 done

**Step 1: Full verification**

```bash
cargo test
cargo clippy -- -D warnings
cargo fmt --check
npx tsc --noEmit
npx eslint src/
npx prettier --check src/
npx vite build
```

Expected: Everything passes.

**Step 2: Update tracking files**

Update `CLAUDE.md` What's Done table with:
- CHI-50: Wire permission IPC commands — **Done**
- CHI-51: Permission event pipeline — **Done**
- CHI-52: Wire YOLO mode to backend IPC — **Done**
- CHI-56: Process lifecycle state machine — **Done** (already existed)
- CHI-60: Shutdown all CLI on app quit — **Done**
- CHI-67: Native window controls — **Done**

Mark epics:
- CHI-37 (Permission Flow Live): **Done** (all 3 tasks)
- CHI-39 (Session Lifecycle): **Partial** (CHI-56, CHI-60 done; CHI-57, CHI-58, CHI-59 todo)

Update `.claude/handover.json` with completion status for all tasks.

**Step 3: Commit and push**

```bash
git add CLAUDE.md .claude/handover.json
git commit -m "docs: update tracking for permission flow, lifecycle, native controls completion"
git push origin main
```

---

## Summary

| Task | Linear Issue(s) | Epic | What |
|------|----------------|------|------|
| 1 | CHI-50 | CHI-37 | Permission IPC commands (backend) |
| 2 | CHI-51 | CHI-37 | Permission event pipeline (frontend) |
| 3 | CHI-52 | CHI-37 | YOLO mode IPC wiring |
| 4 | — | — | Permission integration verification |
| 5 | CHI-56 + CHI-60 | CHI-39 | App lifecycle shutdown |
| 6 | CHI-56 | CHI-39 | Mark lifecycle state machine done (no code) |
| 7 | CHI-67 (part 1) | CHI-61 | Install tauri-plugin-os |
| 8 | CHI-67 (part 2) | CHI-61 | Platform-aware TitleBar UI |
| 9 | — | — | Tracking + push |

**Parallel execution:** Tasks 1, 5, 7 can run in parallel (Batch 1). Tasks 2 and 8 in parallel (Batch 2). Task 3 after Task 1. Task 9 last.
