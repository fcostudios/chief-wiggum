# Basic UI Part 3: Session Persistence, Model Selector, Cross-Platform Packaging

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire sessions to SQLite via Tauri IPC commands, implement sidebar navigation with real session list, add a model selector dropdown, and configure cross-platform packaging with a release workflow.

**Architecture:** Backend IPC commands bridge the existing SQLite `db/queries.rs` layer to the SolidJS frontend via Tauri's `invoke()` mechanism. The `Database` struct becomes Tauri managed state, accessible in every command handler. Frontend stores call IPC commands and maintain reactive state. The release workflow uses `tauri-apps/tauri-action` to build platform-specific installers.

**Tech Stack:** Tauri v2 managed state + IPC commands, rusqlite, SolidJS stores, `@tauri-apps/api/core` invoke, GitHub Actions

---

## CHI-22: Session Persistence and Sidebar Navigation

### Task 1: Add Serialize to row types + new query functions

**Files:**
- Modify: `src-tauri/src/db/queries.rs`

**Step 1: Add serde derives to row types**

At the top of `queries.rs`, add `use serde::{Serialize, Deserialize};` if not already present (serde is already in Cargo.toml).

Change the three row type derives from:
```rust
#[derive(Debug, Clone)]
```
to:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
```

Apply this to `ProjectRow`, `SessionRow`, and `MessageRow`.

**Step 2: Add `list_sessions` query function**

Add after the `update_session_cost` function (around line 137):

```rust
pub fn list_sessions(db: &Database) -> Result<Vec<SessionRow>, AppError> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, model, status, parent_session_id,
                    context_tokens, total_input_tokens, total_output_tokens, total_cost_cents,
                    created_at, updated_at
             FROM sessions ORDER BY updated_at DESC NULLS LAST",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SessionRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    model: row.get(3)?,
                    status: row.get(4)?,
                    parent_session_id: row.get(5)?,
                    context_tokens: row.get(6)?,
                    total_input_tokens: row.get(7)?,
                    total_output_tokens: row.get(8)?,
                    total_cost_cents: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}
```

**Step 3: Add `delete_session` query function**

Add after `list_sessions`:

```rust
pub fn delete_session(db: &Database, id: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        // Delete child records first (no ON DELETE CASCADE in schema)
        conn.execute("DELETE FROM cost_events WHERE session_id = ?1", rusqlite::params![id])?;
        conn.execute("DELETE FROM agents WHERE session_id = ?1", rusqlite::params![id])?;
        conn.execute("DELETE FROM messages WHERE session_id = ?1", rusqlite::params![id])?;
        conn.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    })
}
```

**Step 4: Add `update_session_title` query function**

Add after `delete_session`:

```rust
pub fn update_session_title(db: &Database, id: &str, title: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET title = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id, title],
        )?;
        Ok(())
    })
}
```

**Step 5: Add tests for new query functions**

Add these tests inside the `#[cfg(test)] mod tests` block:

```rust
#[test]
fn list_sessions_ordered_by_updated() {
    let db = test_db();
    insert_project(&db, "p1", "Proj", "/proj").unwrap();
    insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
    insert_session(&db, "s2", Some("p1"), "claude-opus-4-6").unwrap();

    let sessions = list_sessions(&db).unwrap();
    assert_eq!(sessions.len(), 2);
    // s2 was inserted last, so it should be first (most recently updated)
    assert_eq!(sessions[0].id, "s2");
}

#[test]
fn delete_session_cascades() {
    let db = test_db();
    insert_project(&db, "p1", "Proj", "/proj").unwrap();
    insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
    insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();

    delete_session(&db, "s1").unwrap();

    assert!(get_session(&db, "s1").unwrap().is_none());
    assert!(list_messages(&db, "s1").unwrap().is_empty());
}

#[test]
fn update_session_title_works() {
    let db = test_db();
    insert_project(&db, "p1", "Proj", "/proj").unwrap();
    insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

    update_session_title(&db, "s1", "My Chat").unwrap();

    let session = get_session(&db, "s1").unwrap().unwrap();
    assert_eq!(session.title.as_deref(), Some("My Chat"));
}

#[test]
fn list_sessions_empty_when_none() {
    let db = test_db();
    let sessions = list_sessions(&db).unwrap();
    assert!(sessions.is_empty());
}
```

**Step 6: Run tests**

Run: `cargo test -p chief-wiggum`
Expected: All tests pass (existing 12 + 4 new = 16 query tests, 63 total)

**Step 7: Commit**

```bash
git add src-tauri/src/db/queries.rs
git commit -m "CHI-22: add Serialize to row types + list/delete/title query functions"
```

---

### Task 2: Create Tauri IPC commands module

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod commands;`)
- Modify: `src-tauri/src/main.rs` (managed state + invoke handler)

**Step 1: Create `src-tauri/src/commands/mod.rs`**

```rust
//! IPC command handlers (one file per domain).
//! Command handlers are thin: validate input → call business logic → format output.
//! Per GUIDE-001 §2.3 and SPEC-004 §4.1.

pub mod session;
```

**Step 2: Create `src-tauri/src/commands/session.rs`**

```rust
//! Session and message IPC commands per SPEC-004 §4.1.
//! All commands return `Result<T, AppError>` — AppError serializes as a string.

use crate::db::queries::{self, MessageRow, SessionRow};
use crate::db::Database;
use crate::AppError;
use tauri::State;

#[tauri::command]
pub fn create_session(
    db: State<'_, Database>,
    model: String,
) -> Result<SessionRow, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    queries::insert_session(&db, &id, None, &model)?;
    queries::get_session(&db, &id)?
        .ok_or_else(|| AppError::Other("Session not found after creation".to_string()))
}

#[tauri::command]
pub fn list_all_sessions(db: State<'_, Database>) -> Result<Vec<SessionRow>, AppError> {
    queries::list_sessions(&db)
}

#[tauri::command]
pub fn get_session(
    db: State<'_, Database>,
    session_id: String,
) -> Result<SessionRow, AppError> {
    queries::get_session(&db, &session_id)?
        .ok_or_else(|| AppError::Other(format!("Session {} not found", session_id)))
}

#[tauri::command]
pub fn delete_session(
    db: State<'_, Database>,
    session_id: String,
) -> Result<(), AppError> {
    queries::delete_session(&db, &session_id)
}

#[tauri::command]
pub fn update_session_title(
    db: State<'_, Database>,
    session_id: String,
    title: String,
) -> Result<(), AppError> {
    queries::update_session_title(&db, &session_id, &title)
}

#[tauri::command]
pub fn save_message(
    db: State<'_, Database>,
    session_id: String,
    id: String,
    role: String,
    content: String,
    model: Option<String>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cost_cents: Option<i64>,
) -> Result<(), AppError> {
    queries::insert_message(
        &db,
        &id,
        &session_id,
        &role,
        &content,
        model.as_deref(),
        input_tokens,
        output_tokens,
        cost_cents,
    )
}

#[tauri::command]
pub fn list_messages(
    db: State<'_, Database>,
    session_id: String,
) -> Result<Vec<MessageRow>, AppError> {
    queries::list_messages(&db, &session_id)
}
```

**Note:** The command `list_all_sessions` is named differently from the query `list_sessions` to avoid a naming collision with the `queries::get_session` import. Tauri registers commands by function name.

**Step 3: Add `commands` module to `lib.rs`**

In `src-tauri/src/lib.rs`, add after `pub mod db;`:

```rust
pub mod commands;
```

**Step 4: Update `main.rs` — managed state + invoke handler**

Replace the entire contents of `src-tauri/src/main.rs` with:

```rust
// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Initialize tracing subscriber for structured logging per GUIDE-001 §2.5
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting Chief Wiggum v{}", env!("CARGO_PKG_VERSION"));

    // Initialize SQLite database — required for session persistence (CHI-22)
    let db = chief_wiggum_lib::db::Database::open_default()
        .expect("Failed to initialize database");
    tracing::info!("Database initialized at {:?}", db.path());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            chief_wiggum_lib::commands::session::create_session,
            chief_wiggum_lib::commands::session::list_all_sessions,
            chief_wiggum_lib::commands::session::get_session,
            chief_wiggum_lib::commands::session::delete_session,
            chief_wiggum_lib::commands::session::update_session_title,
            chief_wiggum_lib::commands::session::save_message,
            chief_wiggum_lib::commands::session::list_messages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chief Wiggum");
}
```

**Step 5: Run checks**

Run: `cargo test -p chief-wiggum && cargo clippy -p chief-wiggum -- -D warnings`
Expected: All tests pass, no clippy warnings.

**Step 6: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "CHI-22: create IPC commands module with session/message handlers"
```

---

### Task 3: Add Session type to TypeScript + create sessionStore

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/stores/sessionStore.ts`

**Step 1: Add Session interface to `types.ts`**

Add after the `Message` interface (end of file):

```typescript
/** Session per SPEC-004 §6 — matches Rust SessionRow */
export interface Session {
  id: string;
  project_id: string | null;
  title: string | null;
  model: string;
  status: string | null;
  parent_session_id: string | null;
  context_tokens: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
}
```

**Step 2: Create `src/stores/sessionStore.ts`**

```typescript
// src/stores/sessionStore.ts
// Session state: session list, active session, CRUD operations.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Session } from '@/lib/types';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
}

const [state, setState] = createStore<SessionState>({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
});

/** Load all sessions from the database. Called on app start. */
export async function loadSessions(): Promise<void> {
  setState('isLoading', true);
  try {
    const sessions = await invoke<Session[]>('list_all_sessions');
    setState('sessions', sessions);
  } finally {
    setState('isLoading', false);
  }
}

/** Create a new session and make it active. */
export async function createNewSession(model: string): Promise<Session> {
  const session = await invoke<Session>('create_session', { model });
  setState('sessions', (prev) => [session, ...prev]);
  setState('activeSessionId', session.id);
  return session;
}

/** Switch to an existing session. Does NOT load messages — caller must do that. */
export function setActiveSession(sessionId: string): void {
  setState('activeSessionId', sessionId);
}

/** Delete a session and switch to the next one. */
export async function deleteSession(sessionId: string): Promise<void> {
  await invoke('delete_session', { session_id: sessionId });
  setState('sessions', (prev) => prev.filter((s) => s.id !== sessionId));
  if (state.activeSessionId === sessionId) {
    setState('activeSessionId', state.sessions[0]?.id ?? null);
  }
}

/** Update session title (e.g., auto-title from first message). */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await invoke('update_session_title', { session_id: sessionId, title });
  setState(
    'sessions',
    (s) => s.id === sessionId,
    'title',
    title,
  );
}

/** Get the active session object. */
export function getActiveSession(): Session | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}

export { state as sessionState };
```

**Step 3: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`
Expected: All checks pass.

**Step 4: Commit**

```bash
git add src/lib/types.ts src/stores/sessionStore.ts
git commit -m "CHI-22: add Session type and sessionStore with IPC calls"
```

---

### Task 4: Update conversationStore for session integration

**Files:**
- Modify: `src/stores/conversationStore.ts`

**Step 1: Rewrite `conversationStore.ts`**

Replace the entire file with:

```typescript
// src/stores/conversationStore.ts
// Conversation state: messages for active session, send + persist via IPC.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Message } from '@/lib/types';
import { updateSessionTitle, getActiveSession } from '@/stores/sessionStore';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
});

/** Load messages for a session from the database. */
export async function loadMessages(sessionId: string): Promise<void> {
  setState('messages', []);
  setState('isLoading', true);
  try {
    const messages = await invoke<Message[]>('list_messages', { session_id: sessionId });
    setState('messages', messages);
  } finally {
    setState('isLoading', false);
  }
}

/** Send a user message: add to store, persist to DB, trigger mock response. */
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

  setState('messages', (prev) => [...prev, userMsg]);
  setState('isLoading', true);

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
  }).catch((err) => tracing('Failed to persist user message:', err));

  // Auto-title session from first message
  const session = getActiveSession();
  if (session && !session.title) {
    const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
    updateSessionTitle(sessionId, title).catch((err) =>
      tracing('Failed to update session title:', err),
    );
  }

  // Mock: simulate assistant response after 1s
  // TODO: Replace with IPC send_message command when PTY bridge is wired
  setTimeout(() => {
    const assistantId = crypto.randomUUID();
    const model = session?.model ?? 'claude-sonnet-4-6';
    const assistantMsg: Message = {
      id: assistantId,
      session_id: sessionId,
      role: 'assistant',
      content: buildMockResponse(content),
      model,
      input_tokens: 150,
      output_tokens: 200,
      thinking_tokens: 50,
      cost_cents: 3,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    setState('messages', (prev) => [...prev, assistantMsg]);
    setState('isLoading', false);

    // Persist assistant message
    invoke('save_message', {
      session_id: sessionId,
      id: assistantId,
      role: 'assistant',
      content: assistantMsg.content,
      model,
      input_tokens: 150,
      output_tokens: 200,
      cost_cents: 3,
    }).catch((err) => tracing('Failed to persist assistant message:', err));
  }, 1000);
}

/** Clear all messages (e.g., on session change). */
export function clearMessages(): void {
  setState('messages', []);
  setState('isLoading', false);
}

/** Build a mock response demonstrating various markdown features. */
function buildMockResponse(userContent: string): string {
  return [
    `I received your message and I'll help with that.`,
    '',
    `> ${userContent.split('\n')[0]}`,
    '',
    "Here's my analysis:",
    '',
    '- First, I reviewed the relevant files',
    '- Then I identified the changes needed',
    '- The implementation follows existing patterns',
    '',
    '```typescript',
    '// Example code block',
    'function processRequest(input: string): Result {',
    '  const parsed = parseInput(input);',
    '  return validate(parsed);',
    '}',
    '```',
    '',
    "Let me know if you'd like me to proceed with the implementation.",
  ].join('\n');
}

/** Minimal tracing helper — logs to console in dev, noop in prod. */
function tracing(msg: string, err: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[conversationStore] ${msg}`, err);
  }
}

export { state as conversationState };
```

**Key changes from original:**
- `sendMessage` now takes `sessionId` parameter
- Messages are persisted to DB via `invoke('save_message')`
- Auto-titles session from first user message
- Mock response uses session's model
- Added `loadMessages(sessionId)` for session switching
- `tracing()` helper for dev-only logging (avoids GUIDE-001 §5.2 `console.log` in prod)

**Step 2: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: Pass. Note `sendMessage` signature changed — `MainLayout.tsx` will be updated in Task 6.

If tsc fails due to MainLayout calling `sendMessage(text)` with the old 1-arg signature, that's expected. We'll fix it in Task 6.

**Step 3: Commit**

```bash
git add src/stores/conversationStore.ts
git commit -m "CHI-22: update conversationStore with IPC persistence and session support"
```

---

### Task 5: Rewrite Sidebar with real session list

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Replace `Sidebar.tsx` entirely**

```typescript
// src/components/layout/Sidebar.tsx
// Left sidebar (240px) per SPEC-003 §2 Z2.
// Displays real session list from sessionStore, supports create/switch/delete.

import type { Component } from 'solid-js';
import { For, Show, onMount } from 'solid-js';
import { Plus, Trash2, MessageSquare } from 'lucide-solid';
import type { Session } from '@/lib/types';
import {
  sessionState,
  loadSessions,
  createNewSession,
  setActiveSession,
  deleteSession,
} from '@/stores/sessionStore';
import { loadMessages, clearMessages } from '@/stores/conversationStore';

/** Format a timestamp as relative time (e.g., "2m ago", "1h ago"). */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map model ID to short display label. */
function modelLabel(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('haiku')) return 'Haiku';
  return 'Sonnet';
}

/** Map model ID to badge color class. */
function modelColorClass(model: string): string {
  if (model.includes('opus')) return 'text-model-opus';
  if (model.includes('haiku')) return 'text-model-haiku';
  return 'text-model-sonnet';
}

const Sidebar: Component = () => {
  onMount(() => {
    loadSessions();
  });

  async function handleNewSession() {
    clearMessages();
    await createNewSession('claude-sonnet-4-6');
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionState.activeSessionId === sessionId) return;
    setActiveSession(sessionId);
    await loadMessages(sessionId);
  }

  return (
    <nav class="flex flex-col h-full" aria-label="Sidebar">
      {/* Sessions header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-secondary">
        <span class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Sessions
        </span>
        <span class="text-xs text-text-tertiary">{sessionState.sessions.length}</span>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <Show
          when={sessionState.sessions.length > 0}
          fallback={
            <p class="text-xs text-text-tertiary px-2 py-4 text-center">
              No sessions yet. Click below to start one.
            </p>
          }
        >
          <div class="space-y-1">
            <For each={sessionState.sessions}>
              {(session) => (
                <SessionItem
                  session={session}
                  isActive={sessionState.activeSessionId === session.id}
                  onSelect={() => handleSelectSession(session.id)}
                  onDelete={() => deleteSession(session.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* New session button */}
      <div class="p-2 border-t border-border-secondary">
        <button
          class="flex items-center justify-center gap-2 w-full py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={handleNewSession}
          aria-label="New session"
        >
          <Plus size={14} />
          <span>New Session</span>
        </button>
      </div>
    </nav>
  );
};

/** Individual session item in the sidebar list. */
const SessionItem: Component<{
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = (props) => {
  return (
    <div
      class={`group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
        props.isActive
          ? 'bg-bg-elevated text-text-primary'
          : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
      }`}
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={props.onSelect}
      role="button"
      tabindex="0"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect();
        }
      }}
    >
      <MessageSquare size={14} class="mt-0.5 shrink-0 text-text-tertiary" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1">
          <span class="text-xs font-medium truncate">
            {props.session.title || 'New Session'}
          </span>
          <span class={`text-[10px] shrink-0 ${modelColorClass(props.session.model)}`}>
            {modelLabel(props.session.model)}
          </span>
        </div>
        <span class="text-[10px] text-text-tertiary">
          {formatRelativeTime(props.session.updated_at)}
        </span>
      </div>
      <button
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-error transition-opacity"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
        aria-label="Delete session"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

export default Sidebar;
```

**Step 2: Run frontend checks**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: May have tsc error from MainLayout's `sendMessage(text)` call — fixed in Task 6.

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "CHI-22: rewrite sidebar with real session list and navigation"
```

---

### Task 6: Wire session flow in MainLayout + verify

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Update MainLayout imports**

Add to the existing imports at the top of `MainLayout.tsx`:

```typescript
import { sessionState, createNewSession } from '@/stores/sessionStore';
```

And update the `conversationStore` import to use the new signature:

```typescript
import { sendMessage, conversationState } from '@/stores/conversationStore';
```

**Step 2: Update the MessageInput onSend handler**

Find the `<MessageInput>` block (around line 87-94) and replace it with:

```typescript
<MessageInput
  onSend={(text) => {
    const sessionId = sessionState.activeSessionId;
    if (sessionId) {
      sendMessage(text, sessionId);
    } else {
      createNewSession('claude-sonnet-4-6').then((session) => {
        sendMessage(text, session.id);
      });
    }
  }}
  isLoading={conversationState.isLoading}
  isDisabled={false}
/>
```

Note: `conversationState` is imported from `conversationStore`, and `isLoading` is now wired up (was hardcoded `false` before).

**Step 3: Run all checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`

If prettier fails, fix with: `npx prettier --write src/`

Run: `cargo test -p chief-wiggum && cargo clippy -p chief-wiggum -- -D warnings`

Run: `npx vite build`

Expected: All checks pass, build succeeds.

**Step 4: Commit CHI-22**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "CHI-22: wire session flow in MainLayout, complete session persistence"
```

---

## CHI-20: Model Selector (Opus/Sonnet/Haiku)

### Task 7: Add model update query + IPC command

**Files:**
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add `update_session_model` query to `queries.rs`**

Add after `update_session_title`:

```rust
pub fn update_session_model(db: &Database, id: &str, model: &str) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sessions SET model = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id, model],
        )?;
        Ok(())
    })
}
```

Add test:

```rust
#[test]
fn update_session_model_works() {
    let db = test_db();
    insert_project(&db, "p1", "Proj", "/proj").unwrap();
    insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();

    update_session_model(&db, "s1", "claude-opus-4-6").unwrap();

    let session = get_session(&db, "s1").unwrap().unwrap();
    assert_eq!(session.model, "claude-opus-4-6");
}
```

**Step 2: Add `update_session_model` command to `session.rs`**

Add at the end of the file:

```rust
#[tauri::command]
pub fn update_session_model(
    db: State<'_, Database>,
    session_id: String,
    model: String,
) -> Result<(), AppError> {
    queries::update_session_model(&db, &session_id, &model)
}
```

**Step 3: Register command in `main.rs`**

Add to the `generate_handler!` macro:

```rust
chief_wiggum_lib::commands::session::update_session_model,
```

**Step 4: Run Rust checks**

Run: `cargo test -p chief-wiggum && cargo clippy -p chief-wiggum -- -D warnings`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src-tauri/src/db/queries.rs src-tauri/src/commands/session.rs src-tauri/src/main.rs
git commit -m "CHI-20: add update_session_model query and IPC command"
```

---

### Task 8: Create ModelSelector component + wire into TitleBar

**Files:**
- Create: `src/components/common/ModelSelector.tsx`
- Modify: `src/components/layout/TitleBar.tsx`
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/lib/keybindings.ts`

**Step 1: Add `changeSessionModel` to `sessionStore.ts`**

Add after the `updateSessionTitle` function:

```typescript
/** Change the model for the active session. */
export async function changeSessionModel(model: string): Promise<void> {
  const sessionId = state.activeSessionId;
  if (!sessionId) return;
  await invoke('update_session_model', { session_id: sessionId, model });
  setState(
    'sessions',
    (s) => s.id === sessionId,
    'model',
    model,
  );
}

/** Cycle through models: Sonnet → Opus → Haiku → Sonnet. */
export function cycleModel(): void {
  const session = getActiveSession();
  if (!session) return;
  const cycle: Record<string, string> = {
    'claude-sonnet-4-6': 'claude-opus-4-6',
    'claude-opus-4-6': 'claude-haiku-4-5',
    'claude-haiku-4-5': 'claude-sonnet-4-6',
  };
  const next = cycle[session.model] ?? 'claude-sonnet-4-6';
  changeSessionModel(next);
}
```

**Step 2: Create `src/components/common/ModelSelector.tsx`**

```typescript
// src/components/common/ModelSelector.tsx
// Model selector dropdown per SPEC-003 §2.1 (TitleBar center area).
// Shows current model with badge, dropdown with 3 options.

import type { Component } from 'solid-js';
import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { sessionState, changeSessionModel, getActiveSession } from '@/stores/sessionStore';

interface ModelOption {
  id: string;
  label: string;
  colorClass: string;
  bgClass: string;
}

const MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    colorClass: 'text-model-sonnet',
    bgClass: 'bg-model-sonnet/20',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    colorClass: 'text-model-opus',
    bgClass: 'bg-model-opus/20',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    colorClass: 'text-model-haiku',
    bgClass: 'bg-model-haiku/20',
  },
];

const ModelSelector: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false);
  let dropdownRef: HTMLDivElement | undefined;

  // Close dropdown on click outside
  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
  });
  onCleanup(() => {
    document.removeEventListener('mousedown', handleClickOutside);
  });

  function currentModel(): ModelOption {
    const session = getActiveSession();
    return MODELS.find((m) => m.id === session?.model) ?? MODELS[0];
  }

  function handleSelect(modelId: string) {
    changeSessionModel(modelId);
    setIsOpen(false);
  }

  return (
    <div ref={dropdownRef} class="relative">
      <button
        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors hover:bg-bg-elevated"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen());
        }}
        disabled={!sessionState.activeSessionId}
        aria-label="Select model"
        aria-expanded={isOpen()}
      >
        <span
          class={`inline-block w-2 h-2 rounded-full ${currentModel().bgClass} ${currentModel().colorClass}`}
          style={{ 'background-color': 'currentColor' }}
        />
        <span class="text-text-primary font-medium">{currentModel().label}</span>
        <ChevronDown size={12} class="text-text-tertiary" />
      </button>

      <Show when={isOpen()}>
        <div class="absolute top-full left-0 mt-1 w-44 bg-bg-elevated border border-border-primary rounded-lg shadow-lg overflow-hidden z-50">
          <For each={MODELS}>
            {(model) => (
              <button
                class={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${
                  model.id === currentModel().id
                    ? 'bg-accent-muted text-text-primary'
                    : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                }`}
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={() => handleSelect(model.id)}
              >
                <span
                  class={`inline-block w-2 h-2 rounded-full ${model.colorClass}`}
                  style={{ 'background-color': 'currentColor' }}
                />
                <span>{model.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ModelSelector;
```

**Step 3: Wire ModelSelector into TitleBar**

In `TitleBar.tsx`, add the import:

```typescript
import ModelSelector from '@/components/common/ModelSelector';
```

Replace the center drag region:

```typescript
{/* Center: drag region */}
<div class="flex-1 h-full" data-tauri-drag-region />
```

With:

```typescript
{/* Center: model selector + drag region */}
<div class="flex-1 h-full flex items-center justify-center" data-tauri-drag-region>
  <ModelSelector />
</div>
```

**Step 4: Add Cmd+M keybinding**

In `src/lib/keybindings.ts`, add the import:

```typescript
import { cycleModel } from '@/stores/sessionStore';
```

Add after the `Cmd+Shift+Y` block (around line 53):

```typescript
// Cmd+M — cycle model (Sonnet → Opus → Haiku → Sonnet)
if (e.code === 'KeyM' && !e.shiftKey) {
  e.preventDefault();
  cycleModel();
  return;
}
```

**Step 5: Run all checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`

If prettier fails: `npx prettier --write src/`

Run: `npx vite build`
Expected: Build succeeds.

**Step 6: Commit CHI-20**

```bash
git add src/components/common/ModelSelector.tsx src/components/layout/TitleBar.tsx src/stores/sessionStore.ts src/lib/keybindings.ts
git commit -m "CHI-20: implement model selector dropdown with Cmd+M cycling"
```

---

## CHI-24: Cross-Platform Packaging

### Task 9: Configure platform-specific bundle settings

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Update the `bundle` section in `tauri.conf.json`**

Replace the current `bundle` block:

```json
"bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
```

With:

```json
"bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "DeveloperTool",
    "shortDescription": "Desktop GUI for Claude Code CLI",
    "longDescription": "Chief Wiggum wraps Claude Code CLI in a polished desktop GUI with multi-agent orchestration, real-time cost tracking, and intelligent context management.",
    "copyright": "Copyright 2026 FcoStudios",
    "macOS": {
      "minimumSystemVersion": "11.0"
    },
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    },
    "linux": {
      "categories": ["Development", "Utility"],
      "section": "devel"
    }
  }
```

**Step 2: Verify build configuration**

Run: `npx vite build` (frontend bundle must succeed first)
Run: `cargo build -p chief-wiggum --release` (verify Rust compiles in release mode)

Expected: Both commands succeed. Note: full `cargo tauri build` requires platform-specific signing and is tested in CI.

**Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "CHI-24: configure platform-specific bundle metadata"
```

---

### Task 10: Create release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create the release workflow**

```yaml
# .github/workflows/release.yml
# Release workflow: builds platform-specific installers and creates a GitHub release.
# Triggered on version tags (v*). Creates a draft release with all artifacts.
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    name: Build / ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            target: universal-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: windows-latest
            target: x86_64-pc-windows-msvc
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install system dependencies (Ubuntu)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target == 'universal-apple-darwin' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - run: npm ci

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Chief Wiggum ${{ github.ref_name }}'
          releaseBody: |
            ## Chief Wiggum ${{ github.ref_name }}

            Download the installer for your platform below.

            ### Installation
            - **macOS**: Download the `.dmg`, open it, and drag Chief Wiggum to Applications
            - **Windows**: Download the `.msi` installer and run it
            - **Linux**: Download the `.AppImage`, make it executable (`chmod +x`), and run it
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.target == 'universal-apple-darwin' && '--target universal-apple-darwin' || '' }}
```

**Step 2: Verify workflow syntax**

Run: `cat .github/workflows/release.yml | head -5`
Expected: File exists and is valid YAML.

**Step 3: Commit CHI-24**

```bash
git add .github/workflows/release.yml
git commit -m "CHI-24: add release workflow for cross-platform packaging"
```

---

### Task 11: Final verification and push

**Step 1: Run all checks**

```bash
npx tsc --noEmit && npx eslint src/ && npx prettier --check src/
cargo test -p chief-wiggum && cargo clippy -p chief-wiggum -- -D warnings
npx vite build
```

Expected: All pass.

**Step 2: Update tracking files**

Update `.claude/handover.json`:
- CHI-22: status `"done"`, files list, notes
- CHI-20: status `"done"`, files list, notes
- CHI-24: status `"done"`, files list, notes
- CHI-7 epic notes: "All 9 tasks done. Epic complete."
- CHI-5 epic status: `"done"`
- recommended_next: Phase 2 tasks

Update `CLAUDE.md`:
- Add CHI-22, CHI-20, CHI-24 to What's Done table
- Update What's Next: "Epic CHI-7: Basic UI — **Complete.**"
- Update File Locations with new files (`commands/`, `sessionStore.ts`, `ModelSelector.tsx`)

**Step 3: Update Linear**

Mark CHI-22, CHI-20, CHI-24 as Done in Linear.

**Step 4: Commit and push**

```bash
git add .claude/handover.json CLAUDE.md
git commit -m "CHI-22/20/24: update tracking files — Phase 1 Foundation complete"
git push
```

---

## Deferred Items (Not in Scope)

These features are referenced in specs but intentionally deferred from Phase 1:

- **Project management**: projects table, project sidebar tree view (Phase 2)
- **Session forking**: `fork_session` command (Phase 2)
- **Session search**: full-text search by content/date/model (Phase 2)
- **Session export**: markdown/JSON export (SPEC-005, Phase 2)
- **Virtual scrolling**: for long session/message lists (Phase 2 perf)
- **Auto-updater**: Tauri updater plugin integration (Phase 2)
- **Code signing**: macOS/Windows signing certificates (pre-release)
- **Effort slider**: low/medium/high/max effort parameter (Phase 2)
- **Fast Mode toggle**: Opus 4.6 Fast Mode (Phase 2)
- **Settings screen**: default model, effort, theme preferences (Phase 2)
- **`safeInvoke` wrapper**: IPC error handling utility (Phase 2, when logging system exists)
