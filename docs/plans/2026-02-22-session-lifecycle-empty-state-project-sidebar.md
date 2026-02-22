# Session Lifecycle, Empty State & Project Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire session lifecycle management (switching, deletion, crash recovery), redesign the empty conversation state with sample prompts, and add a project sidebar section with recent project switching.

**Architecture:** Session switching stops the old session's CLI process before loading the new one. Process status is tracked in conversationStore and shown in StatusBar. Empty state uses clickable sample prompt cards. Project sidebar lists recent projects from projectStore below the folder picker.

**Tech Stack:** SolidJS stores, Tauri IPC (`invoke`), existing `SessionBridgeMap` + `CliBridge`, TailwindCSS v4 with SPEC-002 tokens, lucide-solid icons.

---

## Feature 1: Session Lifecycle Management (CHI-39)

### Task 1: Session Switching Cleanup (CHI-57)

**Context:** Currently `handleSelectSession` in Sidebar calls `setActiveSession(id)` + `loadMessages(id)` but does NOT stop the outgoing session's CLI process or clean up event listeners. This causes orphaned processes and missed events.

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add `switchSession` function to conversationStore**

Add a new exported function that encapsulates the full session-switch flow: stop CLI → cleanup listeners → clear state → load messages → set up listeners.

```typescript
// In src/stores/conversationStore.ts — add after sendMessage()

/** Switch to a different session: stop CLI, clean up, load new messages. */
export async function switchSession(newSessionId: string, oldSessionId: string | null): Promise<void> {
  // Stop any running CLI process for the outgoing session
  if (oldSessionId) {
    try {
      await invoke('stop_session_cli', { session_id: oldSessionId });
    } catch {
      // Process may already be stopped — that's fine
    }
  }

  // Clean up event listeners from the previous session
  await cleanupEventListeners();

  // Reset streaming/loading state
  clearMessages();

  // Load persisted messages for the new session
  await loadMessages(newSessionId);

  // Set up event listeners for the new session (catches any in-flight CLI events)
  await setupEventListeners(newSessionId);
}
```

**Step 2: Update Sidebar to use `switchSession`**

Replace the `handleSelectSession` function in Sidebar.tsx:

```typescript
// In src/components/layout/Sidebar.tsx — replace handleSelectSession

import { switchSession } from '@/stores/conversationStore';

async function handleSelectSession(sessionId: string) {
  if (sessionState.activeSessionId === sessionId) return;
  const oldId = sessionState.activeSessionId;
  setActiveSession(sessionId);
  await switchSession(sessionId, oldId);
}
```

Update the import to include `switchSession` instead of just `loadMessages, clearMessages`:

```typescript
import { switchSession, clearMessages } from '@/stores/conversationStore';
```

Remove the `loadMessages` import (no longer directly used in Sidebar).

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

Run: `cargo check`
Expected: Compiles (no backend changes)

**Step 4: Commit**

```bash
git add src/stores/conversationStore.ts src/components/layout/Sidebar.tsx
git commit -m "feat(CHI-57): add switchSession with CLI cleanup on session switch"
```

---

### Task 2: Process Status Tracking in Frontend (CHI-56)

**Context:** The frontend has no concept of whether a CLI process is running. `isLoading`/`isStreaming` flags are message-level, not process-level. We need a `processStatus` field reflecting the backend's `ProcessStatus` enum.

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add ProcessStatus type**

```typescript
// In src/lib/types.ts — add after ToolCategory

/** Process lifecycle status (mirrors Rust ProcessStatus). */
export type ProcessStatus = 'not_started' | 'starting' | 'running' | 'shutting_down' | 'exited' | 'error';
```

**Step 2: Add processStatus to ConversationState**

```typescript
// In src/stores/conversationStore.ts — update ConversationState interface

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  thinkingContent: string;
  isStreaming: boolean;
  error: string | null;
  processStatus: ProcessStatus;
}
```

Update initial state:

```typescript
const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
  streamingContent: '',
  thinkingContent: '',
  isStreaming: false,
  error: null,
  processStatus: 'not_started',
});
```

Add the import:

```typescript
import type { Message, PermissionRequest, ProcessStatus } from '@/lib/types';
```

**Step 3: Update processStatus through the event lifecycle**

In `sendMessage`, after `invoke('send_to_cli', ...)`:
```typescript
setState('processStatus', 'running');
```

In the `sendMessage` catch block:
```typescript
setState('processStatus', 'error');
```

In `setupEventListeners`, update the `message:chunk` handler — on first chunk set running:
```typescript
// Inside message:chunk listener, after setState('isStreaming', true):
if (state.processStatus !== 'running') {
  setState('processStatus', 'running');
}
```

In the `cli:exited` handler:
```typescript
setState('processStatus', 'exited');
```

In `clearMessages`:
```typescript
setState('processStatus', 'not_started');
```

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/stores/conversationStore.ts src/lib/types.ts
git commit -m "feat(CHI-56): add processStatus tracking to conversationStore"
```

---

### Task 3: Show Process Status in StatusBar (CHI-56 continued)

**Context:** StatusBar currently shows static placeholder text. Show real process status so users know when CLI is running/idle/errored.

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`

**Step 1: Read StatusBar.tsx**

Read the file to understand current structure before modifying.

**Step 2: Add process status indicator**

Import conversationState and show a status indicator:

```typescript
import { conversationState } from '@/stores/conversationStore';
```

Add a helper for status display:

```typescript
function processStatusDisplay(status: string): { label: string; color: string } {
  switch (status) {
    case 'running':
      return { label: 'Running', color: 'var(--color-success)' };
    case 'starting':
      return { label: 'Starting...', color: 'var(--color-warning)' };
    case 'error':
      return { label: 'Error', color: 'var(--color-error)' };
    case 'shutting_down':
      return { label: 'Stopping...', color: 'var(--color-warning)' };
    default:
      return { label: 'Idle', color: 'var(--color-text-tertiary)' };
  }
}
```

In the StatusBar JSX, replace the static "Ready" text with:

```tsx
<Show when={conversationState.processStatus !== 'not_started' && conversationState.processStatus !== 'exited'}>
  <div class="flex items-center gap-1.5">
    <div
      class="w-1.5 h-1.5 rounded-full"
      classList={{ 'animate-pulse': conversationState.processStatus === 'running' }}
      style={{ background: processStatusDisplay(conversationState.processStatus).color }}
    />
    <span class="text-[10px]" style={{ color: processStatusDisplay(conversationState.processStatus).color }}>
      {processStatusDisplay(conversationState.processStatus).label}
    </span>
  </div>
</Show>
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/components/layout/StatusBar.tsx
git commit -m "feat(CHI-56): show process status indicator in StatusBar"
```

---

### Task 4: Graceful Shutdown on Session Delete (CHI-58)

**Context:** `deleteSession` in sessionStore calls `invoke('delete_session')` which only deletes from DB. It does NOT stop the CLI process. If a session has a running CLI, it becomes an orphan.

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add stopSessionCli to conversationStore**

```typescript
// In src/stores/conversationStore.ts — add after switchSession

/** Stop the CLI process for a session (if running). */
export async function stopSessionCli(sessionId: string): Promise<void> {
  try {
    await invoke('stop_session_cli', { session_id: sessionId });
  } catch {
    // Process may not be running — that's fine
  }
}
```

**Step 2: Update Sidebar delete handler**

Replace the direct `deleteSession` call in the Sidebar:

```typescript
// In Sidebar.tsx — replace the onDelete handler

import { stopSessionCli, switchSession, clearMessages } from '@/stores/conversationStore';

// In the handleDeleteSession function (replace inline onDelete):
async function handleDeleteSession(sessionId: string) {
  // Stop any running CLI process first
  await stopSessionCli(sessionId);

  // If deleting the active session, switch to the next one
  const isActive = sessionState.activeSessionId === sessionId;

  await deleteSession(sessionId);

  if (isActive) {
    const nextSession = sessionState.sessions[0];
    if (nextSession) {
      setActiveSession(nextSession.id);
      await switchSession(nextSession.id, null);
    } else {
      clearMessages();
    }
  }
}
```

Update the `SessionItem` usage:

```tsx
<SessionItem
  session={session}
  isActive={sessionState.activeSessionId === session.id}
  onSelect={() => handleSelectSession(session.id)}
  onDelete={() => handleDeleteSession(session.id)}
/>
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/stores/conversationStore.ts src/components/layout/Sidebar.tsx
git commit -m "feat(CHI-58): stop CLI process before deleting session"
```

---

### Task 5: Crash Recovery with Error UI (CHI-59)

**Context:** The `cli:exited` handler sets a string error message on non-zero exit, but there's no retry mechanism. Users should see a clear error state with a "Retry" button.

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Add lastUserMessage to state for retry**

```typescript
// In src/stores/conversationStore.ts — update ConversationState

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  thinkingContent: string;
  isStreaming: boolean;
  error: string | null;
  processStatus: ProcessStatus;
  lastUserMessage: string | null;
}
```

Update initial state — add `lastUserMessage: null`.

In `sendMessage`, save the content before sending:
```typescript
setState('lastUserMessage', content);
```

In `clearMessages`, reset it:
```typescript
setState('lastUserMessage', null);
```

**Step 2: Add retryLastMessage function**

```typescript
// In src/stores/conversationStore.ts — add after stopSessionCli

/** Retry the last failed message. */
export async function retryLastMessage(sessionId: string): Promise<void> {
  const lastMsg = state.lastUserMessage;
  if (!lastMsg) return;

  // Clear the error state
  setState('error', null);
  setState('processStatus', 'not_started');

  // Remove the last user message from the display (it will be re-added by sendMessage)
  // Don't remove from DB — it's already persisted
  setState('messages', (prev) => {
    const lastUserIdx = prev.findLastIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return prev;
    return prev.slice(0, lastUserIdx);
  });

  await sendMessage(lastMsg, sessionId);
}
```

**Step 3: Update ConversationView error display with Retry button**

Replace the error `<Show>` block in ConversationView.tsx:

```tsx
{/* Error display with retry */}
<Show when={conversationState.error}>
  <div class="flex justify-center animate-fade-in">
    <div
      class="rounded-lg px-4 py-3 text-sm flex items-center gap-3"
      style={{
        background: 'rgba(248, 81, 73, 0.08)',
        border: '1px solid rgba(248, 81, 73, 0.2)',
        color: 'var(--color-error)',
      }}
    >
      <span>{conversationState.error}</span>
      <Show when={conversationState.lastUserMessage}>
        <button
          class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'rgba(248, 81, 73, 0.15)',
            color: 'var(--color-error)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(248, 81, 73, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(248, 81, 73, 0.15)';
          }}
          onClick={() => {
            const sessionId = conversationState.messages[0]?.session_id;
            if (sessionId) retryLastMessage(sessionId);
          }}
        >
          Retry
        </button>
      </Show>
    </div>
  </div>
</Show>
```

Add the import:
```typescript
import { conversationState, retryLastMessage } from '@/stores/conversationStore';
```

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/stores/conversationStore.ts src/components/conversation/ConversationView.tsx
git commit -m "feat(CHI-59): add crash recovery with retry button on CLI failure"
```

---

## Feature 2: Empty State Redesign (CHI-80)

### Task 6: Empty State with Sample Prompt Cards

**Context:** Current empty state shows a simple `>_` icon with "Ready to go" text. Redesign to include the app icon, 3 clickable sample prompt cards, and CLI status integration. The sample prompts should trigger `sendMessage` when clicked.

**Files:**
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Read the current empty state code**

Already read above. The empty state is inline in ConversationView.tsx within a `<Show fallback={...}>` block.

**Step 2: Create the sample prompts data**

```typescript
// In ConversationView.tsx — add before the component

const SAMPLE_PROMPTS = [
  {
    title: 'Explain this codebase',
    description: 'Get a high-level overview of the project structure and architecture',
    prompt: 'Give me a high-level overview of this codebase. What does it do, how is it structured, and what are the key files?',
  },
  {
    title: 'Find and fix a bug',
    description: 'Describe a bug and let Claude investigate and propose a fix',
    prompt: 'Help me debug an issue I\'m seeing. Let me describe what\'s happening...',
  },
  {
    title: 'Write a new feature',
    description: 'Describe what you want to build and Claude will plan and implement it',
    prompt: 'I want to add a new feature. Here\'s what it should do...',
  },
];
```

**Step 3: Replace the empty state (CLI detected case)**

Replace the `when={cliState.isDetected}` branch content with:

```tsx
<div class="text-center max-w-md mx-auto px-4">
  {/* App branding */}
  <div
    class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
    style={{
      background:
        'linear-gradient(135deg, rgba(232, 130, 90, 0.12) 0%, rgba(232, 130, 90, 0.04) 100%)',
      border: '1px solid rgba(232, 130, 90, 0.15)',
      'box-shadow': 'var(--glow-accent-subtle)',
    }}
  >
    <span class="text-xl" style={{ 'line-height': '1', color: 'var(--color-accent)' }}>
      CW
    </span>
  </div>
  <p
    class="text-sm font-medium text-text-primary mb-1"
    style={{ 'letter-spacing': '-0.01em' }}
  >
    Chief Wiggum
  </p>
  <p class="text-xs text-text-tertiary/60 mb-6 tracking-wide">
    What would you like to work on?
  </p>

  {/* Sample prompt cards */}
  <div class="space-y-2">
    <For each={SAMPLE_PROMPTS}>
      {(sample) => (
        <button
          class="w-full text-left px-3.5 py-2.5 rounded-lg transition-all group"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(232, 130, 90, 0.3)';
            e.currentTarget.style.background = 'var(--color-bg-elevated)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
            e.currentTarget.style.background = 'var(--color-bg-secondary)';
          }}
          onClick={() => handleSamplePrompt(sample.prompt)}
        >
          <p class="text-xs font-medium text-text-primary mb-0.5 group-hover:text-accent transition-colors">
            {sample.title}
          </p>
          <p class="text-[11px] text-text-tertiary/70 leading-relaxed">
            {sample.description}
          </p>
        </button>
      )}
    </For>
  </div>
</div>
```

**Step 4: Add the handleSamplePrompt function**

```typescript
// In ConversationView.tsx — imports
import { sessionState } from '@/stores/sessionStore';
import { sendMessage } from '@/stores/conversationStore';

// Inside the component, before return:
function handleSamplePrompt(prompt: string) {
  const sessionId = sessionState.activeSessionId;
  if (!sessionId) return;
  sendMessage(prompt, sessionId);
}
```

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```bash
git add src/components/conversation/ConversationView.tsx
git commit -m "feat(CHI-80): redesign empty state with sample prompt cards"
```

---

## Feature 3: Project Sidebar Section (CHI-41)

### Task 7: Recent Projects List in Sidebar

**Context:** The Sidebar currently shows a single project folder picker button. Add a section below it showing recent projects (max 5) with click-to-switch. The `projectStore` already loads projects from DB via `loadProjects()` and has `setActiveProject()`.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/stores/projectStore.ts`

**Step 1: Read projectStore for available APIs**

Already read above. Key APIs: `projectState.projects`, `projectState.activeProjectId`, `setActiveProject()`, `loadProjects()`, `pickAndCreateProject()`.

**Step 2: Add switchProject function to projectStore**

```typescript
// In src/stores/projectStore.ts — add after setActiveProject

/** Switch to a different project and update last_opened_at. */
export async function switchProject(projectId: string): Promise<void> {
  setState('activeProjectId', projectId);
  // Update last_opened_at in the backend (best-effort)
  invoke('update_project_last_opened', { project_id: projectId }).catch(() => {
    // Backend command doesn't exist yet — we'll add it. For now, just switch locally.
  });
}
```

Actually, looking at the existing code, we don't have an `update_project_last_opened` command. Let's keep it simple for now and just switch locally. The project ordering already works by `last_opened_at DESC`.

Simpler approach — just use `setActiveProject`:

```typescript
// No new function needed in projectStore — setActiveProject is sufficient.
```

**Step 3: Add project list section in Sidebar**

Replace the project selector `<div>` section in Sidebar.tsx with an expanded version that shows recent projects:

```tsx
{/* Project section */}
<div style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
  {/* Project header */}
  <div class="flex items-center justify-between px-3 py-2">
    <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
      Projects
    </span>
    <button
      class="p-0.5 rounded text-text-tertiary hover:text-accent transition-colors"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() => pickAndCreateProject()}
      aria-label="Add project folder"
      title="Open project folder"
    >
      <FolderOpen size={12} />
    </button>
  </div>

  {/* Recent projects list (max 5) */}
  <div class="px-2 pb-2">
    <Show
      when={projectState.projects.length > 0}
      fallback={
        <button
          class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-elevated/50 transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={() => pickAndCreateProject()}
        >
          <Plus size={11} />
          <span class="tracking-wide">Open a project folder</span>
        </button>
      }
    >
      <div class="space-y-0.5">
        <For each={projectState.projects.slice(0, 5)}>
          {(project) => (
            <button
              class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs transition-all truncate"
              style={{
                'transition-duration': 'var(--duration-fast)',
                background:
                  projectState.activeProjectId === project.id
                    ? 'var(--color-bg-elevated)'
                    : 'transparent',
                color:
                  projectState.activeProjectId === project.id
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (projectState.activeProjectId !== project.id) {
                  e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (projectState.activeProjectId !== project.id) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
              onClick={() => setActiveProject(project.id)}
              title={project.path}
            >
              <FolderOpen
                size={12}
                class="shrink-0"
                style={{
                  color:
                    projectState.activeProjectId === project.id
                      ? 'var(--color-accent)'
                      : 'var(--color-text-tertiary)',
                }}
              />
              <span class="truncate">{project.name}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  </div>
</div>
```

Import `setActiveProject` from projectStore:

```typescript
import {
  projectState,
  loadProjects,
  pickAndCreateProject,
  setActiveProject,
} from '@/stores/projectStore';
```

Remove the old project selector `<div class="px-3 py-2.5">` block and its `activeProject()` helper function (replaced by inline logic).

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(CHI-41): add recent projects list in sidebar"
```

---

## Feature 4: New Session in handleNewSession (cleanup)

### Task 8: Clean up new session creation flow

**Context:** `handleNewSession` in Sidebar calls `clearMessages()` + `createNewSession()` but doesn't stop any running CLI. It also doesn't set up event listeners. Wire it through the same session lifecycle.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Update handleNewSession**

```typescript
async function handleNewSession() {
  const oldId = sessionState.activeSessionId;
  // Stop any running CLI for the current session
  if (oldId) {
    await stopSessionCli(oldId);
  }
  await cleanupEventListeners();
  clearMessages();
  await createNewSession('claude-sonnet-4-6');
}
```

Import `cleanupEventListeners` from conversationStore:

```typescript
import { switchSession, stopSessionCli, clearMessages, cleanupEventListeners } from '@/stores/conversationStore';
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(CHI-57): stop CLI on new session creation"
```

---

## Verification & Final Steps

### Task 9: Full Build Verification

**Step 1: Run Rust checks**

```bash
cd src-tauri && cargo check && cargo test && cargo clippy -- -D warnings
```

Expected: All 75+ tests pass, no warnings.

**Step 2: Run frontend checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

Expected: All clean.

**Step 3: Manual test plan**

1. Open app, send a message, verify StatusBar shows "Running" during CLI execution
2. Switch to a different session while CLI is running → verify old CLI stops (no orphan process)
3. Delete a session with running CLI → verify process stops, next session activates
4. Force a CLI error (e.g., disconnect network) → verify error display with "Retry" button
5. Click Retry → verify message is resent
6. Empty state: new session shows sample prompt cards
7. Click a sample prompt → verify it sends the message
8. Project sidebar: shows recent projects, click to switch
9. Add a new project via the folder icon

**Step 4: Final commit (if any formatting fixes needed)**

```bash
npx prettier --write src/stores/conversationStore.ts src/components/layout/Sidebar.tsx src/components/conversation/ConversationView.tsx
git add -A && git commit -m "chore: format after session lifecycle implementation"
```

---

## Summary

| Task | Issue | Files Modified | Description |
|------|-------|----------------|-------------|
| 1 | CHI-57 | conversationStore.ts, Sidebar.tsx | switchSession with CLI cleanup |
| 2 | CHI-56 | conversationStore.ts, types.ts | processStatus state tracking |
| 3 | CHI-56 | StatusBar.tsx | Process status indicator in StatusBar |
| 4 | CHI-58 | conversationStore.ts, Sidebar.tsx | Stop CLI before session delete |
| 5 | CHI-59 | conversationStore.ts, ConversationView.tsx | Crash recovery with retry button |
| 6 | CHI-80 | ConversationView.tsx | Empty state with sample prompt cards |
| 7 | CHI-41 | Sidebar.tsx | Recent projects list in sidebar |
| 8 | CHI-57 | Sidebar.tsx | Clean up new session creation flow |
| 9 | — | All | Full build verification + manual testing |

**No backend changes needed** — all existing IPC commands (`stop_session_cli`, `send_to_cli`, `list_projects`) already support the required operations. All changes are frontend-only.

**No DB migration needed** — `sessions.status` column already exists, `projects` table already has `last_opened_at`.
