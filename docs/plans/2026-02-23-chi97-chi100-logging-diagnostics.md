# Logging & Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Logging & Diagnostics epic by adding frontend log forwarding to the backend tracing pipeline, DB query tracing for debugging, a polished diagnostic bundle export UI with consent dialog, and GitHub issue templates for structured bug reporting.

**Architecture:** The backend already has a 3-layer tracing system (console + rolling file + ring buffer) and a diagnostic bundle export command (`export_diagnostic_bundle`). This plan: (1) adds a `log_from_frontend` IPC command that routes frontend log calls into the same tracing pipeline, (2) instruments all DB query functions with `#[tracing::instrument]` for span-level tracing, (3) replaces the bare "Export Diagnostics" button in StatusBar with a proper consent dialog showing bundle preview, and (4) adds GitHub issue templates that guide users to attach diagnostic bundles.

**Tech Stack:** Tauri v2, Rust (tracing, tracing-subscriber, rusqlite), SolidJS (solid-js/store), TypeScript

**Dependencies (all DONE):**
- CHI-94 (3-Layer Tracing) — ring buffer, file logging, console logging
- CHI-95 (Log Redaction Engine) — `LogRedactor` with 7 regex rules
- CHI-96 (Diagnostic Bundle Export) — `export_bundle()` ZIP creation

**Keyboard shortcut conflict:** CHI-98 spec calls for `Cmd+Shift+D` for "Copy Debug Info" but this shortcut is already assigned to Developer Mode toggle in `src/lib/keybindings.ts:77-88`. This plan reassigns Developer Mode to `Cmd+Shift+F12` (less common, appropriate for dev tooling) and gives `Cmd+Shift+D` to Copy Debug Info per the original spec.

---

## Task 1: Frontend Logger Module

**Files:**
- Create: `src/lib/logger.ts`

**Step 1: Create the logger module**

Create `src/lib/logger.ts` with fire-and-forget IPC forwarding:

```typescript
// src/lib/logger.ts
// Frontend log forwarding to backend tracing pipeline (CHI-97).
// All calls are fire-and-forget — never block UI for logging.

import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Forward a log message to the Rust tracing pipeline via IPC.
 * In dev mode, also logs to the browser console for convenience.
 */
function forwardLog(level: LogLevel, target: string, message: string, fields?: Record<string, string>): void {
  // Dev mode: also log to browser console
  if (import.meta.env.DEV) {
    const prefix = `[${target}]`;
    const extras = fields ? JSON.stringify(fields) : '';
    switch (level) {
      case 'error': console.error(prefix, message, extras); break;
      case 'warn': console.warn(prefix, message, extras); break;
      case 'info': console.info(prefix, message, extras); break;
      case 'debug': console.debug(prefix, message, extras); break;
      case 'trace': console.debug(prefix, '(trace)', message, extras); break;
    }
  }

  // Fire-and-forget IPC — never await, never block UI
  invoke('log_from_frontend', {
    level,
    target,
    message,
    fields: fields ?? null,
  }).catch(() => {
    // Silently ignore — logging failures must not affect the app
  });
}

/** Create a scoped logger for a specific target (e.g., 'ui/conversation'). */
export function createLogger(target: string) {
  return {
    error: (message: string, fields?: Record<string, string>) => forwardLog('error', target, message, fields),
    warn: (message: string, fields?: Record<string, string>) => forwardLog('warn', target, message, fields),
    info: (message: string, fields?: Record<string, string>) => forwardLog('info', target, message, fields),
    debug: (message: string, fields?: Record<string, string>) => forwardLog('debug', target, message, fields),
    trace: (message: string, fields?: Record<string, string>) => forwardLog('trace', target, message, fields),
  };
}

/** Convenience: log an error with the error message extracted. */
export function logError(target: string, message: string, err: unknown): void {
  const errMsg = err instanceof Error ? err.message : String(err);
  forwardLog('error', target, `${message}: ${errMsg}`);
}
```

**Step 2: Run verification**

Run: `npx tsc --noEmit`
Expected: Clean (no type errors)

**Step 3: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat: add frontend logger module for IPC log forwarding (CHI-97)"
```

---

## Task 2: Backend `log_from_frontend` IPC Command

**Files:**
- Create: `src-tauri/src/commands/logging.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create the logging command handler**

Create `src-tauri/src/commands/logging.rs`:

```rust
//! IPC commands for frontend log forwarding (CHI-97).

use std::collections::HashMap;

/// Forward a log message from the frontend into the Rust tracing pipeline.
///
/// Frontend calls this fire-and-forget — it should never block the UI.
/// Logs appear in the ring buffer, rolling file, and console alongside Rust-origin logs.
#[tauri::command(rename_all = "snake_case")]
pub async fn log_from_frontend(
    level: String,
    target: String,
    message: String,
    fields: Option<HashMap<String, String>>,
) -> Result<(), crate::AppError> {
    // Build structured fields string for the log message
    let fields_display = fields
        .as_ref()
        .map(|f| {
            f.iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    let full_message = if fields_display.is_empty() {
        message
    } else {
        format!("{} [{}]", message, fields_display)
    };

    match level.as_str() {
        "error" => tracing::error!(target: "ui", origin = %target, "{}", full_message),
        "warn" => tracing::warn!(target: "ui", origin = %target, "{}", full_message),
        "info" => tracing::info!(target: "ui", origin = %target, "{}", full_message),
        "debug" => tracing::debug!(target: "ui", origin = %target, "{}", full_message),
        "trace" => tracing::trace!(target: "ui", origin = %target, "{}", full_message),
        _ => tracing::info!(target: "ui", origin = %target, "{}", full_message),
    }

    Ok(())
}
```

**Step 2: Register in `commands/mod.rs`**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod logging;
```

**Step 3: Register in `main.rs`**

Add to the `invoke_handler` list:

```rust
chief_wiggum_lib::commands::logging::log_from_frontend,
```

**Step 4: Run tests**

Run: `cargo test -p chief-wiggum && cargo clippy -- -D warnings`
Expected: All tests pass, no warnings

**Step 5: Commit**

```bash
git add src-tauri/src/commands/logging.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat: add log_from_frontend IPC command for frontend log forwarding (CHI-97)"
```

---

## Task 3: Replace Console Calls with Logger in Stores

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/stores/fileStore.ts`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/stores/slashStore.ts`
- Modify: `src/stores/actionStore.ts`
- Modify: `src/stores/projectStore.ts`
- Modify: `src/stores/contextStore.ts`

**Step 1: Replace `console.*` calls in each store**

For each store, add a scoped logger import and replace `console.error` / `console.warn` calls. Pattern:

```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('ui/storeName');
```

Then replace:
- `console.error('[conversationStore] Failed to persist thinking:', err)` → `log.error('Failed to persist thinking', { error: String(err) })`
- `console.warn('[sessionStore] Failed to refresh session:', err)` → `log.warn('Failed to refresh session', { error: String(err) })`

**Replacements per store:**

**`conversationStore.ts`** — target: `ui/conversation` — 13 replacements:
- Line 175: `console.error('[conversationStore] Failed to persist thinking:', err)` → `log.error('Failed to persist thinking', { error: String(err) })`
- Line 194: `console.error('[conversationStore] Failed to clear stale cli_session_id:', err)` → `log.error('Failed to clear stale cli_session_id', { error: String(err) })`
- Line 240: `console.error('[conversationStore] Failed to persist assistant message:', err)` → `log.error('Failed to persist assistant message', { error: String(err) })`
- Line 245: `console.error('[conversationStore] Failed to refresh session cost:', err)` → `log.error('Failed to refresh session cost', { error: String(err) })`
- Line 301: `console.error('[conversationStore] Failed to persist fallback assistant message:', err)` → `log.error('Failed to persist fallback assistant message', { error: String(err) })`
- Line 389: `console.error('[conversationStore] Failed to persist tool_use:', err)` → `log.error('Failed to persist tool_use', { error: String(err) })`
- Line 431: `console.error('[conversationStore] Failed to persist tool_result:', err)` → `log.error('Failed to persist tool_result', { error: String(err) })`
- Line 745: `console.error('[conversationStore] Failed to persist permission record:', err)` → `log.error('Failed to persist permission record', { error: String(err) })`
- Line 781: `console.error('[conversationStore] Failed to drain buffer:', err)` → `log.error('Failed to drain buffer', { error: String(err) })`
- Line 845: `console.error('[conversationStore] Failed to persist replayed message:', err)` → `log.error('Failed to persist replayed message', { error: String(err) })`
- Line 890: `console.error('[conversationStore] Failed to persist replayed tool_use:', err)` → `log.error('Failed to persist replayed tool_use', { error: String(err) })`
- Line 931: `console.error('[conversationStore] Failed to persist replayed tool_result:', err)` → `log.error('Failed to persist replayed tool_result', { error: String(err) })`
- Line 962: `console.warn(...)` in `devWarn` helper → Replace the `devWarn` function body to use `log.warn(msg, { error: String(err) })`

**`sessionStore.ts`** — target: `ui/session` — 1 replacement:
- Line 103: `if (import.meta.env.DEV) console.warn(...)` → `log.warn('Failed to refresh session', { error: String(err) })`

**`fileStore.ts`** — target: `ui/files` — 6 replacements:
- Lines 119, 211, 226, 254, 289, 319, 414

**`uiStore.ts`** — target: `ui/state` — 4 replacements:
- Lines 123, 134, 154, 165

**`slashStore.ts`** — target: `ui/slash` — 3 replacements:
- Lines 123, 135, 156

**`actionStore.ts`** — target: `ui/actions` — 4 replacements:
- Lines 50, 71, 82, 99

**`projectStore.ts`** — target: `ui/projects` — 2 replacements:
- Lines 35, 45

**`contextStore.ts`** — target: `ui/context` — 1 replacement:
- Line 116

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/stores/*.ts
git commit -m "feat: replace console.* with structured logger across all stores (CHI-97)"
```

---

## Task 4: DB Query Tracing with `#[tracing::instrument]`

**Files:**
- Modify: `src-tauri/src/db/queries.rs`

**Step 1: Add `#[tracing::instrument]` to all public functions**

Rules:
- Target: `"db/queries"` for all spans
- **Always skip** the `db` parameter (contains a Mutex, not Debug-friendly)
- **Always skip** `conn` parameter (for `update_session_pinned`)
- Log entity IDs (project/session/message IDs) as span fields
- **No content** logged — `content`, `title`, `name`, `path` are skipped (privacy)
- CREATE/UPDATE/DELETE operations at `level = "info"`, GET/LIST at `level = "debug"`

Add to each function. Here is the complete list:

```rust
// Projects

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn insert_project(db: &Database, id: &str, name: &str, path: &str) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn get_project(db: &Database, id: &str) -> Result<Option<ProjectRow>, AppError> {

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn list_projects(db: &Database) -> Result<Vec<ProjectRow>, AppError> {

// Sessions

#[tracing::instrument(target = "db/queries", level = "info", skip(db, model))]
pub fn insert_session(
    db: &Database,
    id: &str,
    project_id: Option<&str>,
    model: &str,
) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn get_session(db: &Database, id: &str) -> Result<Option<SessionRow>, AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_session_cost(
    db: &Database,
    session_id: &str,
    input_tokens: i64,
    output_tokens: i64,
    cost_cents: i64,
) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn list_sessions(db: &Database) -> Result<Vec<SessionRow>, AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn delete_session(db: &Database, id: &str) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn count_session_messages(db: &Database, session_id: &str) -> Result<i64, AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn duplicate_session_metadata_only(
    db: &Database,
    source_id: &str,
    new_id: &str,
) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(db, title))]
pub fn update_session_title(db: &Database, id: &str, title: &str) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_session_model(db: &Database, id: &str, model: &str) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_session_cli_id(
    db: &Database,
    id: &str,
    cli_session_id: &str,
) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "info", skip(conn))]
pub fn update_session_pinned(
    conn: &rusqlite::Connection,
    session_id: &str,
    pinned: bool,
) -> Result<(), rusqlite::Error> {

// Messages

#[tracing::instrument(target = "db/queries", level = "info", skip(db, content, model))]
pub fn insert_message(
    db: &Database,
    id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    model: Option<&str>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cost_cents: Option<i64>,
) -> Result<(), AppError> {

#[tracing::instrument(target = "db/queries", level = "debug", skip(db))]
pub fn list_messages(db: &Database, session_id: &str) -> Result<Vec<MessageRow>, AppError> {

// Cost Events

#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn insert_cost_event(
    db: &Database,
    session_id: &str,
    agent_id: Option<&str>,
    model: &str,
    input_tokens: i64,
    output_tokens: i64,
    cost_cents: i64,
    event_type: Option<&str>,
) -> Result<(), AppError> {
```

**Step 2: Run tests**

Run: `cargo test -p chief-wiggum && cargo clippy -- -D warnings`
Expected: All 16 existing query tests pass. No warnings. The `#[tracing::instrument]` attribute is purely additive — it wraps each function call in a tracing span without changing logic.

**Step 3: Commit**

```bash
git add src-tauri/src/db/queries.rs
git commit -m "feat: add tracing instrumentation to all DB query functions (CHI-99)"
```

---

## Task 5: Diagnostics Store

**Files:**
- Create: `src/stores/diagnosticsStore.ts`

**Step 1: Create the diagnostics store**

```typescript
// src/stores/diagnosticsStore.ts
// State management for diagnostic bundle export (CHI-98).

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/lib/logger';
import type { BundleExportResult } from '@/lib/types';

const log = createLogger('ui/diagnostics');

interface DiagnosticsState {
  /** Whether the export dialog is open. */
  dialogOpen: boolean;
  /** Whether an export is currently in progress. */
  exporting: boolean;
  /** The last export result (for showing success state). */
  lastResult: BundleExportResult | null;
  /** Error message if export failed. */
  error: string | null;
}

const [state, setState] = createStore<DiagnosticsState>({
  dialogOpen: false,
  exporting: false,
  lastResult: null,
  error: null,
});

export { state as diagnosticsState };

/** Open the export consent dialog. */
export function openExportDialog(): void {
  setState({ dialogOpen: true, error: null, lastResult: null });
}

/** Close the export dialog. */
export function closeExportDialog(): void {
  setState({ dialogOpen: false });
}

/** Run the diagnostic bundle export via IPC. */
export async function exportDiagnosticBundle(): Promise<BundleExportResult | null> {
  setState({ exporting: true, error: null });
  try {
    const result = await invoke<BundleExportResult>('export_diagnostic_bundle');
    setState({ exporting: false, lastResult: result });
    log.info('Diagnostic bundle exported', {
      path: result.path,
      size: String(result.size_bytes),
      entries: String(result.log_entry_count),
    });
    return result;
  } catch (err) {
    const message = `Export failed: ${String(err)}`;
    setState({ exporting: false, error: message });
    log.error('Diagnostic bundle export failed', { error: String(err) });
    return null;
  }
}

/** Copy a one-liner debug info string to clipboard. */
export async function copyDebugInfo(): Promise<string> {
  const info = [
    `Chief Wiggum v${__APP_VERSION__}`,
    navigator.platform,
    `${navigator.language}`,
    `${window.screen.width}x${window.screen.height}`,
  ].join(' | ');

  try {
    await navigator.clipboard.writeText(info);
    log.info('Debug info copied to clipboard');
  } catch (err) {
    log.warn('Failed to copy debug info', { error: String(err) });
  }
  return info;
}

// Declare the global constant injected by Vite define
declare const __APP_VERSION__: string;
```

**Step 2: Add `__APP_VERSION__` define to `vite.config.ts`**

In `vite.config.ts`, add to the `defineConfig`:

```typescript
define: {
  __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
},
```

**Step 3: Run verification**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/stores/diagnosticsStore.ts vite.config.ts
git commit -m "feat: add diagnosticsStore for export state management (CHI-98)"
```

---

## Task 6: Export Consent Dialog Component

**Files:**
- Create: `src/components/diagnostics/ExportDialog.tsx`

**Step 1: Create the ExportDialog component**

```tsx
// src/components/diagnostics/ExportDialog.tsx
// Consent dialog for diagnostic bundle export (CHI-98).
// Shows what's included, privacy assurance, and export/cancel actions.

import type { Component } from 'solid-js';
import { Show, createEffect, onCleanup } from 'solid-js';
import {
  diagnosticsState,
  closeExportDialog,
  exportDiagnosticBundle,
} from '@/stores/diagnosticsStore';
import { addToast } from '@/stores/toastStore';

const ExportDialog: Component = () => {
  let dialogRef: HTMLDivElement | undefined;

  // Focus trap + Escape to close
  createEffect(() => {
    if (!diagnosticsState.dialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeExportDialog();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));

    // Auto-focus the dialog
    requestAnimationFrame(() => dialogRef?.focus());
  });

  async function handleExport(): Promise<void> {
    const result = await exportDiagnosticBundle();
    if (result) {
      closeExportDialog();
      const sizeMb = (result.size_bytes / 1024 / 1024).toFixed(2);
      addToast(
        `Diagnostic bundle exported (${result.log_entry_count} logs, ${sizeMb} MB)`,
        'success',
        {
          label: 'Copy Path',
          onClick: () => {
            navigator.clipboard
              .writeText(result.path)
              .then(() => addToast('Copied path to clipboard', 'success'))
              .catch(() => addToast('Failed to copy path', 'error'));
          },
        },
      );
    }
  }

  return (
    <Show when={diagnosticsState.dialogOpen}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        style={{ 'background-color': 'rgba(0, 0, 0, 0.5)' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeExportDialog();
        }}
      >
        {/* Dialog */}
        <div
          ref={dialogRef}
          class="rounded-lg shadow-xl max-w-md w-full mx-4 outline-none"
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-primary)',
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
          {/* Header */}
          <div
            class="px-5 py-4"
            style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
          >
            <h2
              id="export-dialog-title"
              class="text-base font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Export Diagnostic Bundle
            </h2>
            <p
              class="text-xs mt-1"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Creates a ZIP file for bug reports and support.
            </p>
          </div>

          {/* Content — what's included */}
          <div class="px-5 py-4 space-y-3">
            <p
              class="text-sm font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              The bundle includes:
            </p>
            <ul class="text-xs space-y-1.5 ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              <li class="flex items-start gap-2">
                <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                <span>Application logs (last ~10 minutes)</span>
              </li>
              <li class="flex items-start gap-2">
                <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                <span>System info (OS, app version, architecture)</span>
              </li>
              <li class="flex items-start gap-2">
                <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                <span>Redaction summary (what was sanitized)</span>
              </li>
            </ul>

            {/* Privacy assurance */}
            <div
              class="rounded-md px-3 py-2.5 text-xs"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <span class="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Privacy:
              </span>{' '}
              API keys, emails, tokens, and local file paths are automatically redacted before export.
              No conversation content is included.
            </div>

            {/* Error state */}
            <Show when={diagnosticsState.error}>
              <div
                class="rounded-md px-3 py-2 text-xs"
                style={{
                  background: 'rgba(248, 81, 73, 0.1)',
                  color: 'var(--color-error)',
                }}
              >
                {diagnosticsState.error}
              </div>
            </Show>
          </div>

          {/* Actions */}
          <div
            class="px-5 py-3 flex justify-end gap-2"
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <button
              class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-elevated)',
              }}
              onClick={closeExportDialog}
              disabled={diagnosticsState.exporting}
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                color: 'var(--color-text-inverse)',
                background: 'var(--color-accent)',
                opacity: diagnosticsState.exporting ? '0.6' : '1',
              }}
              onClick={() => void handleExport()}
              disabled={diagnosticsState.exporting}
            >
              {diagnosticsState.exporting ? 'Exporting...' : 'Export & Open Folder'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ExportDialog;
```

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/diagnostics/ExportDialog.tsx
git commit -m "feat: add ExportDialog consent component (CHI-98)"
```

---

## Task 7: Wire ExportDialog into MainLayout + Update StatusBar

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/components/layout/StatusBar.tsx`

**Step 1: Add ExportDialog to MainLayout**

Import and render `ExportDialog` alongside other modals in `MainLayout.tsx`:

```tsx
import ExportDialog from '@/components/diagnostics/ExportDialog';
```

Add `<ExportDialog />` after the existing modals (e.g., after `PermissionDialog`, `CommandPalette`, etc.).

**Step 2: Update StatusBar to open dialog instead of direct export**

In `StatusBar.tsx`, replace the inline `handleExportDiagnostics` function and its button with a button that opens the dialog:

1. Remove the `handleExportDiagnostics` async function (lines 58-78)
2. Remove the `import { invoke } from '@tauri-apps/api/core'` (no longer needed if only used for diagnostics)
3. Remove `import type { BundleExportResult, ProcessStatus } from '@/lib/types'` — keep `ProcessStatus` import
4. Add: `import { openExportDialog } from '@/stores/diagnosticsStore';`
5. Replace the "Export Diagnostics" button's `onClick` handler:

```tsx
<button
  class="px-2 py-0.5 rounded transition-colors"
  style={{
    'font-size': '10px',
    color: 'var(--color-text-secondary)',
    background: 'transparent',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = 'var(--color-bg-elevated)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = 'transparent';
  }}
  onClick={openExportDialog}
  title="Export diagnostic bundle for bug reports"
>
  Export Diagnostics
</button>
```

Note: Check if `invoke` is still used elsewhere in StatusBar. If not, remove the import. The `addToast` import can also be removed if no longer used directly in StatusBar.

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/layout/MainLayout.tsx src/components/layout/StatusBar.tsx
git commit -m "feat: wire ExportDialog into MainLayout, update StatusBar button (CHI-98)"
```

---

## Task 8: Reassign Developer Mode Keybinding + Add Copy Debug Info

**Files:**
- Modify: `src/lib/keybindings.ts`

**Step 1: Reassign Developer Mode from Cmd+Shift+D to Cmd+Shift+F12**

In `src/lib/keybindings.ts`, change the Developer Mode toggle shortcut:

Replace:
```typescript
  // Cmd+Shift+D — toggle Developer mode (blocked while agent is responding)
  if (e.code === 'KeyD' && e.shiftKey) {
```

With:
```typescript
  // Cmd+Shift+F12 — toggle Developer mode (blocked while agent is responding)
  if (e.code === 'F12' && e.shiftKey) {
```

**Step 2: Add Cmd+Shift+D for Copy Debug Info**

Add a new keybinding block (before the Cmd+M handler):

```typescript
  // Cmd+Shift+D — copy debug info to clipboard (quick diagnostics)
  if (e.code === 'KeyD' && e.shiftKey) {
    e.preventDefault();
    void copyDebugInfo().then((info) => {
      addToast(`Copied: ${info}`, 'success');
    });
    return;
  }
```

Add imports at the top of the file:
```typescript
import { copyDebugInfo } from '@/stores/diagnosticsStore';
import { addToast } from '@/stores/toastStore';
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/lib/keybindings.ts
git commit -m "feat: reassign Dev Mode to Cmd+Shift+F12, add Cmd+Shift+D for debug info (CHI-98)"
```

---

## Task 9: GitHub Issue Templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

**Step 1: Create bug report template**

Create `.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug Report
description: Report a bug or unexpected behavior in Chief Wiggum
title: "[Bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting a bug! Please fill in the details below.

        **Tip:** Press `Cmd+Shift+D` (macOS) or `Ctrl+Shift+D` (Windows/Linux) in the app to copy your system info to the clipboard.

  - type: textarea
    id: description
    attributes:
      label: Description
      description: A clear description of the bug.
      placeholder: Describe what happened and what you expected to happen.
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: Step-by-step instructions to trigger the bug.
      placeholder: |
        1. Open a session
        2. Send a message with...
        3. Click on...
        4. See error...
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What did you expect to happen?

  - type: textarea
    id: environment
    attributes:
      label: Environment
      description: Paste your debug info here (Cmd+Shift+D to copy).
      placeholder: "Chief Wiggum v0.1.0 | macOS | en-US | 2560x1440"
    validations:
      required: true

  - type: textarea
    id: diagnostics
    attributes:
      label: Diagnostic Bundle
      description: |
        If possible, export a diagnostic bundle (StatusBar → Export Diagnostics) and attach the ZIP file.
        The bundle contains redacted logs and system info — no conversation content or API keys.
      placeholder: Drag and drop the .zip file here, or describe any error during export.

  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: If applicable, add screenshots to help explain the issue.

  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - "Low — cosmetic issue"
        - "Medium — feature partially broken"
        - "High — feature completely broken"
        - "Critical — app crashes or data loss"
    validations:
      required: true
```

**Step 2: Create feature request template**

Create `.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature Request
description: Suggest a new feature or enhancement for Chief Wiggum
title: "[Feature] "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem or Motivation
      description: What problem does this feature solve? What's the use case?
      placeholder: I'm always frustrated when...
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: Describe your ideal solution. How should it work?
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: Have you considered any alternative solutions or workarounds?

  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Add any other context, mockups, or references.
```

**Step 3: Create config file**

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: true
contact_links:
  - name: Documentation
    url: https://github.com/fcostudios/chief-wiggum/tree/main/docs
    about: Browse the project documentation
```

**Step 4: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "feat: add GitHub issue templates with diagnostic bundle guidance (CHI-100)"
```

---

## Verification

1. `cargo check` — Rust compiles
2. `cargo test` — All tests pass (existing 142 + instrumentation doesn't break anything)
3. `cargo clippy -- -D warnings` — No warnings
4. `npx tsc --noEmit` — TypeScript clean
5. `npx eslint .` — No lint errors
6. `npx vite build` — Build succeeds

**Manual verification:**

7. **Frontend log forwarding (CHI-97):**
   - Open DevTools console
   - Trigger an error (e.g., switch to a non-existent session)
   - Verify log appears in both browser console (dev mode) and the backend ring buffer (export a diagnostic bundle and check `logs.jsonl` for entries with `target: "ui"`)

8. **DB query tracing (CHI-99):**
   - Set `RUST_LOG=db/queries=debug` env var
   - Start the app, create a session, send a message
   - Verify console output shows span entries like `insert_session{id="..." project_id=Some("...")}`

9. **Export dialog (CHI-98):**
   - Click "Export Diagnostics" in StatusBar → consent dialog appears
   - Verify privacy text, bundle contents preview
   - Click "Export & Open Folder" → ZIP created, toast with path shown
   - Press `Cmd+Shift+D` → debug info copied to clipboard (toast confirms)
   - Press `Cmd+Shift+F12` → Developer Mode toggles (reassigned shortcut)

10. **GitHub templates (CHI-100):**
    - Go to repo → Issues → New Issue
    - Verify both Bug Report and Feature Request templates appear
    - Bug Report template has environment and diagnostic bundle sections
