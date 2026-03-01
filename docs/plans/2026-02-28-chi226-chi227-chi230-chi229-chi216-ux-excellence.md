# UX Excellence — CHI-226/227/230/229/216 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver five UX Excellence improvements: Session Resume Card, Agents View, Inline Diff Apply/Reject, TitleBar/StatusBar Information Hierarchy, and Gitignore Toggle.

**Architecture:** All five tasks are independent — each can be implemented and committed separately. No task blocks another except CHI-230 which already has its IPC command (`write_file_content`) from CHI-217. Follow the order below; each section is self-contained.

**Tech Stack:** SolidJS 1.9 + Tauri v2 + Rust. Tests: Vitest + @solidjs/testing-library (frontend), `#[cfg(test)]` modules (Rust). State: `createStore` singletons. Styling: TailwindCSS v4 + CSS tokens only.

**Source of truth:** Linear issues are authoritative. Where TASKS-006 spec and Linear diverge, follow Linear.

---

## Important Context

- **Lock protocol:** No `.claude/handover.lock` exists — safe to proceed. Acquire the lock before updating `handover.json` at the end.
- **`write_file_content` IPC:** Already implemented in CHI-217. CHI-230 uses it directly — do NOT re-implement.
- **Renderer registry:** `src/lib/rendererRegistry.ts` maps language tags to SolidJS components. Used by MermaidRenderer. CHI-230 uses a different pattern (post-processing DOM manipulation) to thread `messageId` through.
- **CHI-229 note:** TASKS-006 §8 maps CHI-229 to "Actions Center UX Quality Gates". This is outdated. **Linear CHI-229 = "Information Hierarchy Redesign (TitleBar + StatusBar)"** — implement the Linear version.

---

## Part A — CHI-226: Session Resume Card

**Linear:** https://linear.app/chief-wiggum/issue/CHI-226

**What:** When returning to a session after >5 minutes of inactivity, show a resume card above the message list summarizing what was accomplished, files touched, open todos, and session cost. Card dismisses in-memory (not persisted).

**Files:**
- Create: `src/lib/resumeDetector.ts`
- Create: `src/components/conversation/SessionResumeCard.tsx`
- Create: `src/components/conversation/SessionResumeCard.test.tsx`
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/components/conversation/ConversationView.tsx`

---

### Task A1: resumeDetector — extract resume data from messages

**Files:**
- Create: `src/lib/resumeDetector.ts`
- Create: `src/lib/resumeDetector.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/resumeDetector.test.ts
import { describe, expect, it } from 'vitest';
import { extractResumeData } from './resumeDetector';
import type { Message } from './types';

function makeMsg(role: string, content: string, id = Math.random().toString()): Message {
  return { id, role: role as Message['role'], content, created_at: Date.now() };
}

describe('extractResumeData', () => {
  it('returns null when there are no assistant messages', () => {
    const result = extractResumeData([makeMsg('user', 'hello')]);
    expect(result).toBeNull();
  });

  it('extracts last assistant message preview (max 100 chars)', () => {
    const long = 'A'.repeat(150);
    const result = extractResumeData([
      makeMsg('user', 'hi'),
      makeMsg('assistant', long),
    ]);
    expect(result?.lastMessagePreview).toHaveLength(100);
  });

  it('extracts files touched from tool_use write_file blocks', () => {
    const toolUse = JSON.stringify({
      tool_name: 'Write',
      tool_use_id: 'tu1',
      tool_input: JSON.stringify({ file_path: 'src/auth/service.ts' }),
    });
    const result = extractResumeData([
      makeMsg('tool_use', toolUse),
      makeMsg('assistant', 'done'),
    ]);
    expect(result?.filesTouched).toContain('src/auth/service.ts');
  });

  it('de-duplicates file paths', () => {
    const toolUse = JSON.stringify({
      tool_name: 'Write',
      tool_use_id: 'tu1',
      tool_input: JSON.stringify({ file_path: 'src/auth/service.ts' }),
    });
    const result = extractResumeData([
      makeMsg('tool_use', toolUse),
      makeMsg('tool_use', toolUse),
      makeMsg('assistant', 'done'),
    ]);
    expect(result?.filesTouched.filter((f) => f === 'src/auth/service.ts').length).toBe(1);
  });

  it('extracts open todos from last TodoWrite', () => {
    const toolUse = JSON.stringify({
      tool_name: 'TodoWrite',
      tool_use_id: 'tu2',
      tool_input: JSON.stringify({
        todos: [
          { id: '1', content: 'Write tests', status: 'in_progress' },
          { id: '2', content: 'Update docs', status: 'completed' },
        ],
      }),
    });
    const result = extractResumeData([makeMsg('tool_use', toolUse), makeMsg('assistant', 'done')]);
    expect(result?.openTodos).toEqual(['Write tests']);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /path/to/project && npx vitest run src/lib/resumeDetector.test.ts
```

Expected: FAIL — `resumeDetector.ts` does not exist.

**Step 3: Implement `resumeDetector.ts`**

```typescript
// src/lib/resumeDetector.ts

import type { Message } from './types';

export interface SessionResume {
  lastMessagePreview: string;
  filesTouched: string[];
  openTodos: string[];
  lastTool: string | null;
}

/** Tool names that indicate file modifications. */
const FILE_TOOL_NAMES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * Derive session resume data from a message history.
 * Returns null if the session has no assistant messages (new session).
 */
export function extractResumeData(messages: Message[]): SessionResume | null {
  const hasAssistant = messages.some((m) => m.role === 'assistant');
  if (!hasAssistant) return null;

  // Last assistant message preview
  let lastMessagePreview = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastMessagePreview = messages[i].content.slice(0, 100);
      break;
    }
  }

  // Files touched (de-duplicated, in order)
  const fileSeen = new Set<string>();
  const filesTouched: string[] = [];
  let lastTool: string | null = null;

  for (const msg of messages) {
    if (msg.role !== 'tool_use') continue;
    try {
      const parsed = JSON.parse(msg.content) as {
        tool_name?: string;
        tool_input?: string;
      };
      if (!parsed.tool_name) continue;
      lastTool = parsed.tool_name;
      if (FILE_TOOL_NAMES.has(parsed.tool_name) && parsed.tool_input) {
        const input = JSON.parse(parsed.tool_input) as { file_path?: string; path?: string };
        const filePath = input.file_path ?? input.path;
        if (filePath && !fileSeen.has(filePath)) {
          fileSeen.add(filePath);
          filesTouched.push(filePath);
        }
      }
    } catch {
      // Ignore malformed tool payloads.
    }
  }

  // Open todos from last TodoWrite
  const openTodos: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'tool_use') continue;
    try {
      const parsed = JSON.parse(msg.content) as {
        tool_name?: string;
        tool_input?: string;
      };
      if (parsed.tool_name !== 'TodoWrite' || !parsed.tool_input) continue;
      const input = JSON.parse(parsed.tool_input) as {
        todos?: Array<{ content: string; status: string }>;
      };
      if (!Array.isArray(input.todos)) break;
      openTodos.push(
        ...input.todos
          .filter((t) => t.status !== 'completed')
          .map((t) => t.content)
          .slice(0, 3),
      );
      break;
    } catch {
      // Ignore.
    }
  }

  return { lastMessagePreview, filesTouched, openTodos, lastTool };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/resumeDetector.test.ts
```

Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add src/lib/resumeDetector.ts src/lib/resumeDetector.test.ts
git commit -m "CHI-226: add resumeDetector — extracts files, todos, preview from messages"
```

---

### Task A2: SessionResumeCard component

**Files:**
- Create: `src/components/conversation/SessionResumeCard.tsx`
- Create: `src/components/conversation/SessionResumeCard.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/conversation/SessionResumeCard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import SessionResumeCard from './SessionResumeCard';

const baseResume = {
  lastMessagePreview: 'Added JWT refresh token logic',
  filesTouched: ['src/auth/service.ts', 'src/auth/types.ts'],
  openTodos: ['Write tests', 'Update docs'],
  lastTool: 'Write',
};

describe('SessionResumeCard', () => {
  it('renders last message preview', () => {
    const { getByText } = render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));
    expect(getByText(/Added JWT refresh token logic/)).toBeTruthy();
  });

  it('shows files touched count and paths', () => {
    const { getByText } = render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));
    expect(getByText(/src\/auth\/service\.ts/)).toBeTruthy();
  });

  it('shows open todos', () => {
    const { getByText } = render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));
    expect(getByText(/Write tests/)).toBeTruthy();
  });

  it('calls onDismiss when dismiss button clicked', async () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={onDismiss}
        onContinue={() => {}}
      />
    ));
    getByLabelText('Dismiss resume card').click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onContinue when Continue button clicked', async () => {
    const onContinue = vi.fn();
    const { getByRole } = render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={onContinue}
      />
    ));
    getByRole('button', { name: /Continue/i }).click();
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/conversation/SessionResumeCard.test.tsx
```

Expected: FAIL.

**Step 3: Implement `SessionResumeCard.tsx`**

```tsx
// src/components/conversation/SessionResumeCard.tsx
// Session resume card — pinned above message list when returning to an inactive session.
// CHI-226. Card is in-memory only; dismiss resets on next >5-min gap.

import type { Component } from 'solid-js';
import { Show, For, createSignal } from 'solid-js';
import { X, ChevronDown, ChevronUp } from 'lucide-solid';
import type { SessionResume } from '@/lib/resumeDetector';

interface SessionResumeCardProps {
  resume: SessionResume;
  resumedAgo: string;       // e.g. "3 hours ago"
  projectName?: string;
  costDisplay?: string;     // e.g. "$2.47"
  onDismiss: () => void;
  onContinue: () => void;
}

const SessionResumeCard: Component<SessionResumeCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const visibleFiles = () =>
    expanded() ? props.resume.filesTouched : props.resume.filesTouched.slice(0, 4);
  const extraFiles = () => Math.max(0, props.resume.filesTouched.length - 4);

  return (
    <div
      class="mx-3 mb-2 rounded-lg animate-fade-in"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-primary)',
        'box-shadow': 'var(--shadow-sm)',
      }}
      role="region"
      aria-label="Session resumed"
    >
      {/* Header row */}
      <div
        class="flex items-center justify-between px-3 py-2 rounded-t-lg"
        style={{
          background: 'rgba(232, 130, 90, 0.07)',
          'border-bottom': '1px solid var(--color-border-secondary)',
        }}
      >
        <div class="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>📋</span>
          <span class="font-medium" style={{ color: 'var(--color-accent)' }}>
            Resumed
          </span>
          <span>{props.resumedAgo}</span>
          <Show when={props.projectName}>
            <span>·</span>
            <span>{props.projectName}</span>
          </Show>
          <Show when={props.costDisplay}>
            <span>·</span>
            <span>{props.costDisplay} spent</span>
          </Show>
        </div>
        <button
          class="flex items-center justify-center w-5 h-5 rounded transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          onClick={props.onDismiss}
          aria-label="Dismiss resume card"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div class="px-3 py-2.5 space-y-2">
        {/* Last message preview */}
        <div class="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>Last message: </span>
          <Show
            when={expanded()}
            fallback={
              <button
                class="italic"
                onClick={() => setExpanded(true)}
                style={{ color: 'var(--color-text-secondary)' }}
                title="Show full message"
              >
                "{props.resume.lastMessagePreview}"
              </button>
            }
          >
            <span class="italic">"{props.resume.lastMessagePreview}"</span>
          </Show>
        </div>

        {/* Files touched */}
        <Show when={props.resume.filesTouched.length > 0}>
          <div class="text-xs">
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              Files touched ({props.resume.filesTouched.length}):{' '}
            </span>
            <For each={visibleFiles()}>
              {(file, i) => (
                <>
                  <span class="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {file}
                  </span>
                  <Show when={i() < visibleFiles().length - 1}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}> · </span>
                  </Show>
                </>
              )}
            </For>
            <Show when={!expanded() && extraFiles() > 0}>
              <span style={{ color: 'var(--color-text-tertiary)' }}> +{extraFiles()} more</span>
            </Show>
          </div>
        </Show>

        {/* Open todos */}
        <Show when={props.resume.openTodos.length > 0}>
          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              Open todos ({props.resume.openTodos.length}):
            </span>
            <For each={props.resume.openTodos}>
              {(todo) => (
                <span style={{ color: 'var(--color-text-secondary)' }}>✗ {todo}</span>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Action row */}
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-b-lg"
        style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          onClick={props.onContinue}
        >
          Continue ▸
        </button>
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          onClick={() => setExpanded((v) => !v)}
        >
          <Show when={expanded()} fallback={<ChevronDown size={11} />}>
            <ChevronUp size={11} />
          </Show>
          <span>{expanded() ? 'Show less' : 'Show full summary'}</span>
        </button>
      </div>
    </div>
  );
};

export default SessionResumeCard;
```

**Step 4: Run tests**

```bash
npx vitest run src/components/conversation/SessionResumeCard.test.tsx
```

Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add src/components/conversation/SessionResumeCard.tsx src/components/conversation/SessionResumeCard.test.tsx
git commit -m "CHI-226: add SessionResumeCard component"
```

---

### Task A3: Wire dismiss state + show card in ConversationView

**Files:**
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Extend sessionStore**

Add to `SessionState` interface and store (top of file after existing state):

```typescript
// Add to SessionState interface:
interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
  dismissedResumeSessions: Set<string>;          // CHI-226: in-memory dismiss state
  sessionLastActiveAt: Record<string, number>;   // CHI-226: last activity timestamp
}

// Add to initial store value:
const [state, setState] = createStore<SessionState>({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  dismissedResumeSessions: new Set(),
  sessionLastActiveAt: {},
});
```

Add these exported functions after the existing exports:

```typescript
const RESUME_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Mark a session as having recent activity (call on each message send/receive). */
export function touchSessionActivity(sessionId: string): void {
  setState('sessionLastActiveAt', sessionId, Date.now());
  // If session becomes active again, clear dismissed flag so next gap works
  // (dismissed flag is for THIS gap only)
}

/** Check if a resume card should be shown for a session. */
export function shouldShowResumeCard(sessionId: string, messageCount: number): boolean {
  if (messageCount === 0) return false;
  if (state.dismissedResumeSessions.has(sessionId)) return false;
  const lastActive = state.sessionLastActiveAt[sessionId];
  if (!lastActive) return false; // No recorded activity yet — session just started
  return Date.now() - lastActive > RESUME_THRESHOLD_MS;
}

/** Dismiss the resume card for a session (in-memory, resets on next gap). */
export function dismissResume(sessionId: string): void {
  setState('dismissedResumeSessions', (prev) => new Set([...prev, sessionId]));
}

/** Clear dismissed flag (e.g., when user sends a new message). */
export function clearDismissed(sessionId: string): void {
  setState('dismissedResumeSessions', (prev) => {
    const next = new Set(prev);
    next.delete(sessionId);
    return next;
  });
}
```

**Step 2: Integrate in ConversationView**

Add imports:
```typescript
import {
  shouldShowResumeCard,
  dismissResume,
  clearDismissed,
  touchSessionActivity,
} from '@/stores/sessionStore';
import SessionResumeCard from './SessionResumeCard';
import { extractResumeData } from '@/lib/resumeDetector';
import { projectState } from '@/stores/projectStore';
```

Add derived signals inside `ConversationView` component:
```typescript
const activeSessionId = () => sessionState.activeSessionId;

const resumeData = () => {
  const sid = activeSessionId();
  if (!sid) return null;
  const msgs = conversationState.messages;
  if (!shouldShowResumeCard(sid, msgs.length)) return null;
  return extractResumeData(msgs);
};

const resumedAgo = () => {
  const sid = activeSessionId();
  if (!sid) return '';
  const lastActive = sessionState.sessionLastActiveAt[sid];
  if (!lastActive) return '';
  const diffMs = Date.now() - lastActive;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.floor(diffHr / 24)} days ago`;
};
```

Track activity: add a `createEffect` in ConversationView:
```typescript
// Touch activity when messages arrive
createEffect(() => {
  const msgs = conversationState.messages;
  const sid = activeSessionId();
  if (sid && msgs.length > 0) {
    touchSessionActivity(sid);
  }
});
```

Also call `clearDismissed(sid)` inside the `sendMessage` handler in ConversationView (when user sends a new message).

Add the card above the message list. In ConversationView's JSX, before the virtualizer div:
```tsx
<Show when={resumeData()}>
  {(data) => (
    <SessionResumeCard
      resume={data()}
      resumedAgo={resumedAgo()}
      projectName={projectState.activeProjectId ? 'Project' : undefined}
      costDisplay={
        sessionState.sessions.find((s) => s.id === activeSessionId())?.total_cost_cents
          ? `$${((sessionState.sessions.find((s) => s.id === activeSessionId())!.total_cost_cents!) / 100).toFixed(2)}`
          : undefined
      }
      onDismiss={() => {
        const sid = activeSessionId();
        if (sid) dismissResume(sid);
      }}
      onContinue={() => {
        // Focus message input — dispatch a custom event
        document.getElementById('message-input')?.focus();
      }}
    />
  )}
</Show>
```

**Step 3: Run TypeScript checks**

```bash
npx tsc --noEmit
```

Fix any type errors. Then:

```bash
npx vitest run src/
npx eslint . --max-warnings 0
```

**Step 4: Commit**

```bash
git add src/stores/sessionStore.ts src/components/conversation/ConversationView.tsx
git commit -m "CHI-226: wire session resume card — dismiss state + ConversationView integration"
```

---

## Part B — CHI-227: Agents View — Parallel Session Manager

**Linear:** https://linear.app/chief-wiggum/issue/CHI-227

**What:** Replace the "Agent Teams — Coming soon" placeholder in the Agents tab with a real parallel session manager grid: 2-column card layout showing all sessions with status, cost, last message preview, and Focus/Stop/Split actions.

**Files:**
- Create: `src/components/agents/SessionCard.tsx`
- Create: `src/components/agents/AgentsView.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Note on last message preview:** ConversationView only loads the active session's messages. Background sessions have no messages in the store. We'll show the session title as the preview for background sessions (already stored in `Session.title`). An enhancement for a future task would be to load the last message from DB.

---

### Task B1: SessionCard component

**Files:**
- Create: `src/components/agents/SessionCard.tsx`
- Create: `src/components/agents/SessionCard.test.tsx`

**Step 1: Write failing test**

```typescript
// src/components/agents/SessionCard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import SessionCard from './SessionCard';

const baseSession = {
  id: 'sess-1',
  title: 'Refactoring auth module',
  model: 'claude-sonnet-4-6',
  total_cost_cents: 463,
  cli_session_id: null,
  created_at: Date.now() - 3 * 3600 * 1000,
  updated_at: Date.now() - 3 * 3600 * 1000,
  project_id: null,
  pinned: false,
  message_count: null,
};

describe('SessionCard', () => {
  it('renders session title', () => {
    const { getByText } = render(() => (
      <SessionCard
        session={baseSession}
        status="running"
        isActive={false}
        onFocus={() => {}}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    expect(getByText(/Refactoring auth module/)).toBeTruthy();
  });

  it('shows running status indicator', () => {
    const { getByRole } = render(() => (
      <SessionCard
        session={baseSession}
        status="running"
        isActive={false}
        onFocus={() => {}}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    expect(getByRole('img', { name: /running/i })).toBeTruthy();
  });

  it('shows cost display', () => {
    const { getByText } = render(() => (
      <SessionCard
        session={baseSession}
        status="idle"
        isActive={false}
        onFocus={() => {}}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    expect(getByText('$4.63')).toBeTruthy();
  });

  it('calls onFocus when Focus button clicked', () => {
    const onFocus = vi.fn();
    const { getByRole } = render(() => (
      <SessionCard
        session={baseSession}
        status="idle"
        isActive={false}
        onFocus={onFocus}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    getByRole('button', { name: /Focus/i }).click();
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('calls onStop when Stop button clicked', () => {
    const onStop = vi.fn();
    const { getByRole } = render(() => (
      <SessionCard
        session={baseSession}
        status="running"
        isActive={false}
        onFocus={() => {}}
        onStop={onStop}
        onSplit={() => {}}
      />
    ));
    getByRole('button', { name: /Stop/i }).click();
    expect(onStop).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/agents/SessionCard.test.tsx
```

Expected: FAIL.

**Step 3: Create `src/components/agents/` directory and implement SessionCard**

```tsx
// src/components/agents/SessionCard.tsx
// Session card for the Agents view parallel session manager (CHI-227).

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import type { Session } from '@/lib/types';
import type { ProcessStatus } from '@/lib/types';

interface SessionCardProps {
  session: Session;
  status: ProcessStatus;
  isActive: boolean;
  lastMessage?: string;   // Last assistant message preview (80 chars)
  onFocus: () => void;
  onStop: () => void;
  onSplit: () => void;
}

function statusDot(status: ProcessStatus): { color: string; pulse: boolean; label: string } {
  switch (status) {
    case 'running':
    case 'starting':
      return { color: 'var(--color-success)', pulse: true, label: 'Running' };
    case 'error':
      return { color: 'var(--color-error)', pulse: false, label: 'Error' };
    default:
      return { color: 'var(--color-text-tertiary)', pulse: false, label: 'Idle' };
  }
}

function formatAge(updatedAt: number): string {
  const diffMs = Date.now() - updatedAt;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const SessionCard: Component<SessionCardProps> = (props) => {
  const dot = () => statusDot(props.status);
  const costDisplay = () =>
    props.session.total_cost_cents
      ? `$${(props.session.total_cost_cents / 100).toFixed(2)}`
      : '$0.00';

  return (
    <div
      class="flex flex-col rounded-lg overflow-hidden transition-all"
      style={{
        background: props.isActive ? 'rgba(232, 130, 90, 0.07)' : 'var(--color-bg-elevated)',
        border: props.isActive
          ? '1px solid rgba(232, 130, 90, 0.3)'
          : '1px solid var(--color-border-secondary)',
        'box-shadow': props.isActive ? '0 0 0 1px rgba(232, 130, 90, 0.1)' : 'none',
        'transition-duration': 'var(--duration-fast)',
      }}
    >
      {/* Status row */}
      <div class="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div class="flex items-center gap-1.5">
          <div
            class="w-2 h-2 rounded-full"
            classList={{ 'animate-pulse': dot().pulse }}
            style={{
              background: dot().color,
              'box-shadow': dot().pulse ? `0 0 4px ${dot().color}` : 'none',
            }}
            role="img"
            aria-label={`Status: ${dot().label}`}
          />
          <span class="text-[11px] font-medium" style={{ color: dot().color }}>
            {dot().label}
          </span>
        </div>
        <Show when={props.status === 'running' || props.status === 'starting'}>
          <button
            class="px-1.5 py-0.5 rounded text-[10px] transition-colors"
            style={{
              color: 'var(--color-error)',
              background: 'rgba(248,81,73,0.08)',
              border: '1px solid rgba(248,81,73,0.15)',
            }}
            onClick={props.onStop}
            aria-label="Stop session"
          >
            Stop
          </button>
        </Show>
      </div>

      {/* Session title */}
      <div class="px-3 pb-1">
        <p class="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
          {props.session.title || 'New Session'}
        </p>
        <p class="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-tertiary)' }}>
          {props.session.model}
        </p>
      </div>

      {/* Last message preview */}
      <Show when={props.lastMessage}>
        <div
          class="mx-3 mb-2 px-2 py-1.5 rounded text-[11px] italic"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {props.lastMessage!.slice(0, 80)}
          {props.lastMessage!.length > 80 ? '…' : ''}
        </div>
      </Show>

      {/* Metadata */}
      <div
        class="px-3 py-1.5 flex items-center gap-2 text-[10px]"
        style={{
          color: 'var(--color-text-tertiary)',
          'border-top': '1px solid var(--color-border-secondary)',
        }}
      >
        <span class="font-mono">{costDisplay()}</span>
        <span>·</span>
        <span>{formatAge(props.session.updated_at)}</span>
      </div>

      {/* Action buttons */}
      <div
        class="flex items-center gap-1.5 px-3 py-2"
        style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          onClick={props.onFocus}
        >
          Focus ▸
        </button>
        <button
          class="px-2 py-1 rounded text-[11px] transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-inset)'; }}
          onClick={props.onSplit}
          title="Open alongside current session"
        >
          Split ⊞
        </button>
      </div>
    </div>
  );
};

export default SessionCard;
```

**Step 4: Run tests**

```bash
npx vitest run src/components/agents/SessionCard.test.tsx
```

Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add src/components/agents/
git commit -m "CHI-227: add SessionCard component for parallel session manager"
```

---

### Task B2: AgentsView + wire into MainLayout

**Files:**
- Create: `src/components/agents/AgentsView.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Create AgentsView**

```tsx
// src/components/agents/AgentsView.tsx
// Parallel session manager grid — CHI-227.
// Shows all open sessions as cards; actions: Focus, Stop, Split, New.

import type { Component } from 'solid-js';
import { For, Show, createMemo } from 'solid-js';
import { Users } from 'lucide-solid';
import { sessionState, setActiveSession, createNewSession } from '@/stores/sessionStore';
import { conversationState, getSessionStatus, stopSessionCli } from '@/stores/conversationStore';
import { setActiveView } from '@/stores/uiStore';
import { splitView } from '@/stores/viewStore';
import SessionCard from './SessionCard';

const AgentsView: Component = () => {
  const sessions = () => sessionState.sessions;
  const activeId = () => sessionState.activeSessionId;

  // Keep at most 4 for the 2×2 grid (overflow scrolls)
  const visibleSessions = createMemo(() => sessions().slice(0, 4));

  async function handleFocus(sessionId: string) {
    setActiveSession(sessionId);
    setActiveView('conversation');
  }

  async function handleStop(sessionId: string) {
    await stopSessionCli(sessionId);
  }

  async function handleSplit(sessionId: string) {
    const currentId = activeId();
    if (currentId && currentId !== sessionId) {
      splitView(currentId, sessionId);
      setActiveView('conversation');
    }
  }

  async function handleNewParallel() {
    const session = await createNewSession('claude-sonnet-4-6');
    const currentId = activeId();
    if (currentId) {
      splitView(currentId, session.id);
    }
    setActiveView('conversation');
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto p-4 gap-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Users size={16} style={{ color: 'var(--color-accent)' }} />
          <span class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Parallel Sessions
          </span>
          <span
            class="text-xs px-1.5 py-0.5 rounded-full font-mono"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {sessions().length}
          </span>
        </div>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          onClick={() => void handleNewParallel()}
        >
          + New Parallel Session
        </button>
      </div>

      {/* Keyboard shortcuts strip */}
      <div
        class="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 rounded-lg text-[10px]"
        style={{
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-tertiary)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        <span><kbd class="font-mono">Cmd+\</kbd> Split panes</span>
        <span><kbd class="font-mono">Cmd+N</kbd> New session</span>
        <span><kbd class="font-mono">Cmd+[</kbd> Focus left pane</span>
        <span><kbd class="font-mono">Cmd+]</kbd> Focus right pane</span>
      </div>

      {/* Session grid */}
      <Show
        when={sessions().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center flex-1 gap-3 text-center">
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-accent-muted)' }}
            >
              <Users size={24} style={{ color: 'var(--color-accent)' }} />
            </div>
            <p class="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              No sessions yet
            </p>
            <p class="text-xs max-w-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Start a parallel session to run multiple Claude conversations simultaneously.
            </p>
          </div>
        }
      >
        <div class="grid grid-cols-2 gap-3 auto-rows-min">
          <For each={visibleSessions()}>
            {(session) => (
              <SessionCard
                session={session}
                status={getSessionStatus(session.id)}
                isActive={session.id === activeId()}
                onFocus={() => void handleFocus(session.id)}
                onStop={() => void handleStop(session.id)}
                onSplit={() => void handleSplit(session.id)}
              />
            )}
          </For>
          {/* Empty slot card — shown when fewer than 4 sessions */}
          <Show when={sessions().length < 4}>
            <div
              class="flex flex-col items-center justify-center gap-3 rounded-lg p-4 text-center cursor-pointer transition-colors"
              style={{
                border: '1.5px dashed var(--color-border-primary)',
                color: 'var(--color-text-tertiary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)';
                (e.currentTarget as HTMLElement).style.color = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-primary)';
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)';
              }}
              onClick={() => void handleNewParallel()}
              role="button"
              aria-label="Start another session"
              tabIndex={0}
            >
              <span class="text-2xl">+</span>
              <div>
                <p class="text-xs font-medium">Start another session</p>
                <p class="text-[10px] mt-0.5">
                  Run sessions in parallel for different tasks
                </p>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default AgentsView;
```

**Step 2: Modify MainLayout.tsx**

Replace the inline agents placeholder (lines 139-181 in current file):
```tsx
// OLD:
<Show when={uiState.activeView === 'agents'}>
  <div class="flex items-center justify-center h-full px-6">
    {/* ...placeholder JSX... */}
  </div>
</Show>

// NEW:
<Show when={uiState.activeView === 'agents'}>
  <AgentsView />
</Show>
```

Add the import:
```typescript
import AgentsView from '@/components/agents/AgentsView';
```

Also: check if `stopSessionCli` is exported from `conversationStore`. If not, add the export:
```typescript
/** Stop the CLI process for a given session (best-effort). */
export async function stopSessionCli(sessionId: string): Promise<void> {
  try {
    await invoke('stop_session_cli', { session_id: sessionId });
    setSessionStatus(sessionId, 'exited');
  } catch {
    // Process may not exist
  }
}
```

**Step 3: Run checks**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

**Step 4: Commit**

```bash
git add src/components/agents/AgentsView.tsx src/components/layout/MainLayout.tsx src/stores/conversationStore.ts
git commit -m "CHI-227: replace agents placeholder with parallel session manager grid"
```

---

## Part C — CHI-230: Inline Diff Accept/Reject

**Linear:** https://linear.app/chief-wiggum/issue/CHI-230

**What:** When an assistant message contains a unified diff code block, show Apply / Reject / Open in Diff buttons below it. Apply reads the target file, patches it, and writes back using the existing `write_file_content` IPC (from CHI-217). Applied/rejected state tracked in-memory in `conversationStore`.

**Prerequisite check:** `write_file_content` IPC exists in `src-tauri/src/commands/files.rs` ✓ (implemented in CHI-217).

**Files:**
- Create: `src/lib/diffApplicator.ts`
- Create: `src/lib/diffApplicator.test.ts`
- Create: `src/components/conversation/InlineDiffBlock.tsx`
- Create: `src/components/conversation/InlineDiffBlock.test.tsx`
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/conversation/MarkdownContent.tsx`

**Dependency:** `npm install diff @types/diff`

---

### Task C1: Install diff package + implement diffApplicator

**Step 1: Install package**

```bash
npm install diff @types/diff
```

**Step 2: Write failing test**

```typescript
// src/lib/diffApplicator.test.ts
import { describe, expect, it } from 'vitest';
import { applyDiff, extractFilePath, isDiffBlock } from './diffApplicator';

const UNIFIED_DIFF = `--- a/src/auth/service.ts
+++ b/src/auth/service.ts
@@ -1,5 +1,6 @@
 import { sessions } from './store';
-const token = sessions.get(userId);
+import jwt from 'jsonwebtoken';
+const token = await jwt.sign({ userId }, secret);
 export { token };`;

describe('isDiffBlock', () => {
  it('detects unified diff by --- a/ pattern', () => {
    expect(isDiffBlock('diff', UNIFIED_DIFF)).toBe(true);
  });

  it('detects diff blocks by language tag', () => {
    expect(isDiffBlock('diff', 'anything')).toBe(true);
  });

  it('returns false for non-diff content', () => {
    expect(isDiffBlock('typescript', 'const x = 1;')).toBe(false);
  });
});

describe('extractFilePath', () => {
  it('extracts file path from --- a/ line', () => {
    expect(extractFilePath(UNIFIED_DIFF)).toBe('src/auth/service.ts');
  });

  it('returns null if no path found', () => {
    expect(extractFilePath('not a diff')).toBeNull();
  });
});

describe('applyDiff', () => {
  it('applies a unified diff to original content', () => {
    const original = `import { sessions } from './store';
const token = sessions.get(userId);
export { token };`;
    const result = applyDiff(original, UNIFIED_DIFF);
    expect(result).toContain("import jwt from 'jsonwebtoken'");
    expect(result).not.toContain('sessions.get(userId)');
  });

  it('returns null when patch cannot be applied', () => {
    const incompatibleOriginal = 'completely different content';
    const result = applyDiff(incompatibleOriginal, UNIFIED_DIFF);
    expect(result).toBeNull();
  });
});
```

**Step 3: Run to verify it fails**

```bash
npx vitest run src/lib/diffApplicator.test.ts
```

Expected: FAIL.

**Step 4: Implement diffApplicator**

```typescript
// src/lib/diffApplicator.ts
// Pure utilities for parsing and applying unified diffs.
// Uses the `diff` npm package (https://www.npmjs.com/package/diff).

import { applyPatch } from 'diff';

/** True when a code block is a unified diff (by lang tag or content). */
export function isDiffBlock(lang: string, code: string): boolean {
  if (lang === 'diff') return true;
  return /^--- a\/.+\n\+\+\+ b\/.+/m.test(code);
}

/**
 * Extract the target file path from `--- a/path/to/file` line.
 * Returns null if not found.
 */
export function extractFilePath(diffText: string): string | null {
  const match = /^--- a\/(.+)$/m.exec(diffText);
  return match ? match[1].trim() : null;
}

/**
 * Apply a unified diff to original file content.
 * Returns the patched content, or null if patching fails.
 */
export function applyDiff(original: string, diffText: string): string | null {
  try {
    const result = applyPatch(original, diffText);
    if (result === false) return null;
    return result;
  } catch {
    return null;
  }
}
```

**Step 5: Run tests**

```bash
npx vitest run src/lib/diffApplicator.test.ts
```

Expected: PASS (5 tests).

**Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/diffApplicator.ts src/lib/diffApplicator.test.ts
git commit -m "CHI-230: add diffApplicator — parse and apply unified diffs"
```

---

### Task C2: diffStates in conversationStore

**Files:**
- Modify: `src/stores/conversationStore.ts`

**Step 1: Add to ConversationState interface and store**

```typescript
// Add to ConversationState interface:
diffStates: Record<string, 'pending' | 'applied' | 'rejected'>;

// Add to initial store value:
diffStates: {},
```

**Step 2: Export mutation function**

```typescript
/** Set applied/rejected state for a diff block. Key: `${messageId}:${blockIndex}`. */
export function setDiffState(
  key: string,
  state: 'applied' | 'rejected',
): void {
  setState('diffStates', key, state);
}
```

**Step 3: Export read accessor**

```typescript
export function getDiffState(key: string): 'pending' | 'applied' | 'rejected' {
  return conversationState.diffStates[key] ?? 'pending';
}
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/stores/conversationStore.ts
git commit -m "CHI-230: add diffStates map to conversationStore"
```

---

### Task C3: InlineDiffBlock component

**Files:**
- Create: `src/components/conversation/InlineDiffBlock.tsx`
- Create: `src/components/conversation/InlineDiffBlock.test.tsx`

**Step 1: Write failing test**

```typescript
// src/components/conversation/InlineDiffBlock.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@solidjs/testing-library';
import InlineDiffBlock from './InlineDiffBlock';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('ok') }));
vi.mock('@/stores/conversationStore', () => ({
  getDiffState: vi.fn().mockReturnValue('pending'),
  setDiffState: vi.fn(),
  conversationState: { diffStates: {} },
}));
vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));
vi.mock('@/stores/projectStore', () => ({ projectState: { activeProjectId: 'proj-1' } }));

const DIFF = `--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n`;

describe('InlineDiffBlock', () => {
  it('renders the diff code', () => {
    const { container } = render(() => (
      <InlineDiffBlock code={DIFF} diffKey="msg1:0" />
    ));
    expect(container.textContent).toContain('old');
  });

  it('shows Apply, Reject, and Open in Diff buttons when pending', () => {
    const { getByRole } = render(() => (
      <InlineDiffBlock code={DIFF} diffKey="msg1:0" />
    ));
    expect(getByRole('button', { name: /Apply/i })).toBeTruthy();
    expect(getByRole('button', { name: /Reject/i })).toBeTruthy();
    expect(getByRole('button', { name: /Open in Diff/i })).toBeTruthy();
  });

  it('shows Applied chip when state is applied', () => {
    const { getDiffState } = await import('@/stores/conversationStore');
    vi.mocked(getDiffState).mockReturnValue('applied');
    const { getByText } = render(() => (
      <InlineDiffBlock code={DIFF} diffKey="msg1:1" />
    ));
    expect(getByText(/Applied/)).toBeTruthy();
  });

  it('shows Rejected chip when state is rejected', () => {
    const { getDiffState } = await import('@/stores/conversationStore');
    vi.mocked(getDiffState).mockReturnValue('rejected');
    const { getByText } = render(() => (
      <InlineDiffBlock code={DIFF} diffKey="msg1:2" />
    ));
    expect(getByText(/Rejected/)).toBeTruthy();
  });

  it('calls setDiffState rejected when Reject clicked', async () => {
    const { setDiffState } = await import('@/stores/conversationStore');
    vi.mocked(setDiffState).mockClear();
    const { getDiffState } = await import('@/stores/conversationStore');
    vi.mocked(getDiffState).mockReturnValue('pending');
    const { getByRole } = render(() => (
      <InlineDiffBlock code={DIFF} diffKey="msg1:3" />
    ));
    getByRole('button', { name: /Reject/i }).click();
    expect(setDiffState).toHaveBeenCalledWith('msg1:3', 'rejected');
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run src/components/conversation/InlineDiffBlock.test.tsx
```

Expected: FAIL.

**Step 3: Implement InlineDiffBlock**

```tsx
// src/components/conversation/InlineDiffBlock.tsx
// Inline diff block with Apply / Reject / Open in Diff action buttons (CHI-230).
// Renders diff with syntax highlighting and action buttons below.

import type { Component } from 'solid-js';
import { Show, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { getDiffState, setDiffState } from '@/stores/conversationStore';
import { addToast } from '@/stores/toastStore';
import { projectState } from '@/stores/projectStore';
import { setActiveView } from '@/stores/uiStore';
import { extractFilePath, applyDiff } from '@/lib/diffApplicator';

interface InlineDiffBlockProps {
  code: string;
  diffKey: string; // `${messageId}:${blockIndex}`
}

const InlineDiffBlock: Component<InlineDiffBlockProps> = (props) => {
  const [isApplying, setIsApplying] = createSignal(false);
  const state = () => getDiffState(props.diffKey);
  const filePath = () => extractFilePath(props.code);

  async function handleApply() {
    const path = filePath();
    const projectId = projectState.activeProjectId;
    if (!path || !projectId) return;

    setIsApplying(true);
    try {
      // Read current file content
      const fileContent = await invoke<{ content: string }>('read_project_file', {
        project_id: projectId,
        relative_path: path,
      });

      // Apply the diff
      const patched = applyDiff(fileContent.content, props.code);
      if (patched === null) {
        addToast(
          'Could not apply — file has changed. Open in Diff to review.',
          'error',
        );
        return;
      }

      // Write back
      await invoke('write_file_content', {
        project_id: projectId,
        relative_path: path,
        content: patched,
      });

      setDiffState(props.diffKey, 'applied');
      addToast(`Applied to ${path}`, 'success');
    } catch (err) {
      addToast(`Failed to apply: ${String(err)}`, 'error');
    } finally {
      setIsApplying(false);
    }
  }

  function handleReject() {
    setDiffState(props.diffKey, 'rejected');
  }

  function handleOpenInDiff() {
    setActiveView('diff');
  }

  // Render diff with highlighted lines
  const lines = () =>
    props.code.split('\n').map((line) => {
      let color = 'var(--color-text-secondary)';
      let bg = 'transparent';
      if (line.startsWith('+') && !line.startsWith('+++')) {
        color = 'var(--color-success)';
        bg = 'rgba(63, 185, 80, 0.08)';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        color = 'var(--color-error)';
        bg = 'rgba(248, 81, 73, 0.08)';
      } else if (line.startsWith('@@')) {
        color = 'var(--color-accent)';
      }
      return { text: line, color, bg };
    });

  return (
    <div
      class="my-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--color-border-secondary)' }}
    >
      {/* File path header */}
      <Show when={filePath()}>
        <div
          class="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono"
          style={{
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-tertiary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          <span>📄</span>
          <span>{filePath()}</span>
        </div>
      </Show>

      {/* Diff content */}
      <pre
        class="overflow-x-auto text-xs font-mono p-3"
        style={{ background: 'var(--color-bg-inset)', margin: 0 }}
      >
        {lines().map((line) => (
          <div style={{ background: line.bg, color: line.color, 'white-space': 'pre' }}>
            {line.text}
          </div>
        ))}
      </pre>

      {/* Action row */}
      <div
        class="flex items-center gap-2 px-3 py-2"
        style={{
          background: 'var(--color-bg-secondary)',
          'border-top': '1px solid var(--color-border-secondary)',
        }}
      >
        <Show
          when={state() === 'pending'}
          fallback={
            <Show
              when={state() === 'applied'}
              fallback={
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    background: 'var(--color-bg-elevated)',
                  }}
                >
                  ✗ Rejected
                </span>
              }
            >
              <span
                class="text-xs px-2 py-0.5 rounded-full"
                style={{
                  color: 'var(--color-success)',
                  background: 'rgba(63, 185, 80, 0.1)',
                }}
              >
                ✓ Applied
              </span>
            </Show>
          }
        >
          <button
            class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
            style={{
              background: filePath() ? 'var(--color-success)' : 'var(--color-bg-elevated)',
              color: filePath() ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
              cursor: filePath() ? 'pointer' : 'not-allowed',
              opacity: isApplying() ? '0.6' : '1',
            }}
            onClick={() => void handleApply()}
            disabled={!filePath() || isApplying()}
            aria-label={`Apply to ${filePath() ?? 'unknown file'}`}
            title={!filePath() ? 'File not found in project' : `Apply to ${filePath()}`}
          >
            {isApplying() ? '⏳' : '✓'} Apply
            <Show when={filePath()}>
              <span style={{ opacity: '0.7' }}> to {filePath()!.split('/').pop()}</span>
            </Show>
          </button>

          <button
            class="px-2.5 py-1 rounded text-xs transition-colors"
            style={{
              color: 'var(--color-error)',
              background: 'rgba(248,81,73,0.08)',
              border: '1px solid rgba(248,81,73,0.15)',
            }}
            onClick={handleReject}
            aria-label="Reject this diff"
          >
            ✗ Reject
          </button>

          <button
            class="ml-auto px-2 py-1 rounded text-xs transition-colors"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-elevated)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            onClick={handleOpenInDiff}
            aria-label="Open in Diff view"
          >
            ↗ Open in Diff
          </button>
        </Show>
      </div>
    </div>
  );
};

export default InlineDiffBlock;
```

**Step 4: Run tests**

```bash
npx vitest run src/components/conversation/InlineDiffBlock.test.tsx
```

Expected: PASS (5 tests). Fix any import/mock issues.

**Step 5: Commit**

```bash
git add src/components/conversation/InlineDiffBlock.tsx src/components/conversation/InlineDiffBlock.test.tsx
git commit -m "CHI-230: add InlineDiffBlock component with Apply/Reject/Open actions"
```

---

### Task C4: Wire diff detection into MarkdownContent

**Files:**
- Modify: `src/components/conversation/MarkdownContent.tsx`

**Step 1: Add `messageId` prop and diff detection**

The approach: diff blocks render normally via hljs (return `false` from the renderer to use default). In the post-processing `createEffect`, after the existing `pre` loop, find diff blocks by either `language-diff` class or matching `--- a/` pattern, then mount `InlineDiffBlock` below each one.

**Changes to MarkdownContent.tsx:**

1. Add `messageId?: string` to `MarkdownContentProps`:
```typescript
interface MarkdownContentProps {
  content: string;
  messageId?: string;
}
```

2. Add import:
```typescript
import { render as solidRender } from 'solid-js/web';
import InlineDiffBlock from './InlineDiffBlock';
import { isDiffBlock } from '@/lib/diffApplicator';
```

3. In the post-processing `createEffect`, after the existing `pre.forEach` loop and before the table/renderer loops, add:

```typescript
// Detect diff blocks and mount InlineDiffBlock action buttons below them
let diffBlockIdx = 0;
containerRef!.querySelectorAll('pre').forEach((pre) => {
  const codeEl = pre.querySelector('code');
  const code = codeEl?.textContent || '';
  const langMatch = codeEl?.className.match(/language-([A-Za-z0-9_+-]+)/);
  const lang = langMatch ? langMatch[1] : '';

  if (!isDiffBlock(lang, code)) return;
  // Don't add buttons if already mounted
  if (pre.nextElementSibling?.hasAttribute('data-cw-diff-buttons')) return;

  const diffKey = `${props.messageId ?? 'unknown'}:${diffBlockIdx}`;
  diffBlockIdx++;

  const buttonContainer = document.createElement('div');
  buttonContainer.setAttribute('data-cw-diff-buttons', 'true');
  pre.parentNode?.insertBefore(buttonContainer, pre.nextSibling);

  const dispose = solidRender(
    () => <InlineDiffBlock code={code} diffKey={diffKey} />,
    buttonContainer,
  );
  rendererDisposers.push(dispose);
});
```

4. Pass `messageId` wherever `MarkdownContent` is called. Trace the call chain:
   - `MarkdownContent` is called from `MessageBubble.tsx`
   - Add `messageId={message.id}` to the `<MarkdownContent>` usage in MessageBubble

**Step 2: Find MessageBubble and add messageId**

```bash
grep -n "MarkdownContent" src/components/conversation/MessageBubble.tsx
```

In `MessageBubble.tsx`, find all `<MarkdownContent content={...} />` calls and add `messageId={message.id}` (or equivalent prop that has the message ID).

**Step 3: Run checks**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

**Step 4: Manual test**

Start the app. Ask Claude to make a code change that produces a `diff` block. Verify:
- Apply/Reject/Open in Diff buttons appear below the diff
- Apply writes the file (check file content changes)
- Reject shows "✗ Rejected" chip
- Applied state persists through scroll recycling

**Step 5: Commit**

```bash
git add src/components/conversation/MarkdownContent.tsx src/components/conversation/MessageBubble.tsx
git commit -m "CHI-230: detect diff blocks in MarkdownContent, mount InlineDiffBlock actions"
```

---

## Part D — CHI-229: Information Hierarchy Redesign (TitleBar + StatusBar)

**Linear:** https://linear.app/chief-wiggum/issue/CHI-229

**Note:** TASKS-006 §8 maps CHI-229 to "Actions Center UX Quality Gates" — this is outdated. **Linear CHI-229 is the TitleBar/StatusBar redesign.** Follow the Linear issue.

**What:** Reduce TitleBar from 7+ elements to 4 (window controls, project name, status chip, settings gear). Reduce StatusBar to 3 visible elements (mode text, token count, cost pill with popover). Move YOLO/DEV badge from TitleBar to StatusBar left.

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`

---

### Task D1: TitleBar redesign

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`

**Current TitleBar elements (left → right):**
1. macOS spacer (70px)
2. "Chief Wiggum" + YOLO/DEV badge [LEFT]
3. ModelSelector [CENTER]
4. Details toggle button [RIGHT]
5. Settings gear [RIGHT]
6. Permission tier cycle [RIGHT]
7. Win controls (not Mac) [RIGHT]

**Target TitleBar (per Linear CHI-229):**
1. macOS spacer (70px)
2. Project name chip [LEFT] — shows active project or "Chief Wiggum" if none
3. Status chip — model + running state [CENTER] — click opens ModelSelector popover
4. Settings gear [RIGHT]
5. Win controls (not Mac) [RIGHT]

**Removed from TitleBar:**
- "Chief Wiggum" text → removed (redundant with app icon)
- YOLO/DEV badge → moved to StatusBar left
- Details panel toggle → Cmd+Shift+B still works; remove button
- Permission tier cycle → move to StatusBar or Settings

**Status chip variants:**
- `○ claude-sonnet-4-6` — idle, gray dot
- `● Responding...` — running, green pulse dot
- `⚠ Permission needed` — amber dot
- `✗ CLI not found` — red dot

**Step 1: Rewrite TitleBar.tsx**

Key changes to make:
```tsx
// 1. Import projectState for project name:
import { projectState } from '@/stores/projectStore';

// 2. Remove: toggleDetailsPanel import (no longer used in TitleBar)
// 3. Keep: cyclePermissionTier, openSettings, getPermissionTier
// 4. Add: createMemo for status chip

const statusChip = createMemo(() => {
  if (!cliState.isDetected) {
    return { dot: '✗', label: 'CLI not found', color: 'var(--color-error)', pulse: false };
  }
  const status = conversationState.processStatus;
  if (status === 'running' || conversationState.isStreaming) {
    return { dot: '●', label: 'Responding…', color: 'var(--color-success)', pulse: true };
  }
  const model = activeSession()?.model ?? 'claude-sonnet-4-6';
  return { dot: '○', label: model, color: 'var(--color-text-tertiary)', pulse: false };
});
```

Replace the JSX body with:
```tsx
<header ...>
  {/* macOS spacer */}
  <Show when={isMac()}>
    <div class="w-[70px] shrink-0" />
  </Show>

  {/* Left: project name (or app name fallback) */}
  <div class="flex items-center gap-2 px-3">
    <span
      class="text-sm font-semibold tracking-tight"
      style={{ color: 'var(--color-text-primary)', 'letter-spacing': '-0.02em' }}
    >
      {projectState.activeProjectId
        ? (projectState.projects?.find((p) => p.id === projectState.activeProjectId)?.name ?? 'Chief Wiggum')
        : 'Chief Wiggum'}
    </span>
  </div>

  {/* Center: status chip + drag region */}
  <div class="flex-1 h-full flex items-center justify-center" data-tauri-drag-region>
    <button
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-secondary)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-primary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-secondary)'; }}
      onClick={openModelSelector}   // use existing ModelSelector logic
      aria-label={`Status: ${statusChip().label}. Click to change model.`}
      title="Click to change model"
    >
      <span
        class="text-[9px]"
        classList={{ 'animate-pulse': statusChip().pulse }}
        style={{ color: statusChip().color }}
      >
        {statusChip().dot}
      </span>
      <span class="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
        {statusChip().label}
      </span>
    </button>
    {/* ModelSelector renders as a popover when open */}
    <ModelSelector />
  </div>

  {/* Right: settings gear + win controls */}
  <div class="flex items-center">
    <button
      class="flex items-center justify-center w-10 h-full text-text-tertiary hover:text-text-primary transition-colors"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={openSettings}
      aria-label="Open settings"
      title="Open settings (Cmd+,)"
    >
      <Settings size={13} />
    </button>

    {/* Win controls (unchanged) */}
    <Show when={!isMac()}>
      {/* ... existing Win controls ... */}
    </Show>
  </div>
</header>
```

**Note:** You need to check how `ModelSelector` currently works and whether it exposes an `openModelSelector()` function or manages its own open state. If it renders as an always-visible selector, you'll need to add a trigger prop. Inspect `src/components/common/ModelSelector.tsx` and adjust accordingly.

**Step 2: Run checks**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

**Step 3: Commit**

```bash
git add src/components/layout/TitleBar.tsx
git commit -m "CHI-229: redesign TitleBar — 4 elements, status chip, project name"
```

---

### Task D2: StatusBar progressive disclosure + add i18n strings

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`

**Current StatusBar (9+ elements):**
Left: YOLO/DEV mode · process status dot · background running count · todo badge · actions popover
Center: token display
Right: export button · cost pill · aggregate cost

**Target StatusBar (3 visible by default):**
Left: YOLO/DEV mode text + sessions pill (click → existing sessions popover)
Center: token count only
Right: cost pill (click → cost breakdown popover with session/today/weekly costs; Export in overflow)

**Step 1: Add cost popover state to uiStore**

```typescript
// Add to UIState interface:
costPopoverOpen: boolean;

// Add to initial store:
costPopoverOpen: false,

// Export toggle:
export function toggleCostPopover(): void {
  setState('costPopoverOpen', (v) => !v);
}
export function closeCostPopover(): void {
  setState('costPopoverOpen', false);
}
```

**Step 2: Add i18n strings to en.json**

```json
"status.idle": "Idle",
"status.responding": "Responding…",
"status.permissionNeeded": "Permission needed",
"status.cliNotFound": "CLI not found",
"status.runningCount": "{{count}} running",
"cost.today": "Today",
"cost.thisWeek": "This week",
"titlebar.noProject": "Chief Wiggum"
```

And equivalent Spanish in es.json:
```json
"status.idle": "Inactivo",
"status.responding": "Respondiendo…",
"status.permissionNeeded": "Permiso requerido",
"status.cliNotFound": "CLI no encontrado",
"status.runningCount": "{{count}} activos",
"cost.today": "Hoy",
"cost.thisWeek": "Esta semana",
"titlebar.noProject": "Chief Wiggum"
```

**Step 3: Redesign StatusBar**

Key changes:
- Remove: todo badge (move to internal indicator or remove for now)
- Remove: separate export button (move to cost popover)
- Keep: YOLO/DEV mode text (already on left)
- Keep: process status, but merge with sessions pill
- Add: cost breakdown popover on cost pill click

The cost breakdown popover (new):
```tsx
<Show when={uiState.costPopoverOpen}>
  <div
    ref={costPopoverRef}
    class="absolute right-0 bottom-8 z-40 w-[220px] rounded-lg overflow-hidden animate-fade-in"
    style={{
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border-primary)',
      'box-shadow': 'var(--shadow-lg)',
    }}
  >
    <div class="px-3 py-2 space-y-2 text-xs">
      <div class="flex justify-between">
        <span style={{ color: 'var(--color-text-tertiary)' }}>Session cost</span>
        <span class="font-mono" style={{ color: 'var(--color-text-primary)' }}>{costDisplay()}</span>
      </div>
      {/* Today / week totals would need cost aggregation (out of scope for now — show placeholders) */}
    </div>
    <div style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
      <button
        class="w-full px-3 py-2 text-left text-xs transition-colors"
        style={{ color: 'var(--color-text-tertiary)' }}
        onClick={() => { openExportDialog(); closeCostPopover(); }}
      >
        Export Diagnostics
      </button>
    </div>
  </div>
</Show>
```

**Step 4: Run full checks**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0 && npx prettier --check .
```

**Step 5: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/stores/uiStore.ts src/locales/en.json src/locales/es.json
git commit -m "CHI-229: StatusBar progressive disclosure, cost popover, i18n strings"
```

---

## Part E — CHI-216: Gitignore Toggle

**Linear:** https://linear.app/chief-wiggum/issue/CHI-216

**What:** Add an Eye/EyeOff toggle button in the FileTree header to show/hide gitignored files. When shown, gitignored files appear at 50% opacity with a `⦻` badge. State persisted per project in localStorage. Cmd+Shift+I shortcut.

**Files:**
- Modify: `src-tauri/src/files/scanner.rs`
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src/lib/types.ts`
- Modify: `src/stores/fileStore.ts`
- Modify: `src/components/explorer/FileTree.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`
- Modify: `src/lib/keybindings.ts`

---

### Task E1: Backend — add is_gitignored field + show_ignored param

**Files:**
- Modify: `src-tauri/src/files/scanner.rs`
- Modify: `src-tauri/src/commands/files.rs`

**Step 1: Write Rust unit tests**

In `src-tauri/src/files/scanner.rs`, add to the existing `#[cfg(test)]` module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_gitignore_project() -> TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        fs::write(root.join(".gitignore"), "*.log\nbuild/\n").expect("write gitignore");
        fs::write(root.join("main.rs"), "fn main() {}").expect("write main");
        fs::write(root.join("debug.log"), "log content").expect("write log");
        fs::create_dir(root.join("build")).expect("mkdir build");
        fs::write(root.join("build").join("output.bin"), "binary").expect("write build");
        dir
    }

    #[test]
    fn list_files_hides_gitignored_by_default() {
        let dir = setup_gitignore_project();
        let nodes = list_files(dir.path(), None, None).expect("list");
        let names: Vec<&str> = nodes.iter().map(|n| n.name.as_str()).collect();
        assert!(!names.contains(&"debug.log"), "gitignored file should be hidden by default");
        assert!(names.contains(&"main.rs"));
    }

    #[test]
    fn list_files_shows_gitignored_when_flag_set() {
        let dir = setup_gitignore_project();
        let nodes = list_files_with_ignored(dir.path(), None, None).expect("list");
        let names: Vec<&str> = nodes.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"debug.log"), "gitignored file should appear when show_ignored=true");
    }

    #[test]
    fn gitignored_files_have_is_gitignored_true() {
        let dir = setup_gitignore_project();
        let nodes = list_files_with_ignored(dir.path(), None, None).expect("list");
        let log_node = nodes.iter().find(|n| n.name == "debug.log");
        assert!(log_node.is_some(), "debug.log should be present");
        assert!(log_node.unwrap().is_gitignored, "debug.log should be marked as gitignored");
    }

    #[test]
    fn non_gitignored_files_have_is_gitignored_false() {
        let dir = setup_gitignore_project();
        let nodes = list_files_with_ignored(dir.path(), None, None).expect("list");
        let main_node = nodes.iter().find(|n| n.name == "main.rs");
        assert!(main_node.is_some());
        assert!(!main_node.unwrap().is_gitignored);
    }
}
```

**Step 2: Run to verify tests fail**

```bash
cd src-tauri && cargo test -- --test-output immediate 2>&1 | grep -E "FAILED|test.*gitignore"
```

Expected: compile error (functions don't exist yet).

**Step 3: Implement scanner changes**

In `src-tauri/src/files/mod.rs`, add `is_gitignored` field to `FileNode`:

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileNode {
    pub name: String,
    pub relative_path: String,
    pub node_type: String,
    pub size: Option<u64>,
    pub is_gitignored: bool,   // NEW: true when file is gitignored (only set when show_ignored=true)
}
```

In `src-tauri/src/files/scanner.rs`:

1. Keep existing `list_files()` as the default (gitignore-filtered) function, but add `is_gitignored: false` to all returned nodes.

2. Add new `list_files_with_ignored()` function that:
   - Uses `WalkBuilder` with `.git_ignore(false)` (disables gitignore filtering)
   - Builds a `Gitignore` matcher from the project root
   - Sets `is_gitignored: true` for matched paths

```rust
use ignore::{gitignore::GitignoreBuilder, WalkBuilder};

/// List files including gitignored ones, marking which files are ignored.
pub fn list_files_with_ignored(
    project_root: &std::path::Path,
    relative_path: Option<&str>,
    max_depth: Option<usize>,
) -> Result<Vec<FileNode>, AppError> {
    // Build gitignore matcher
    let mut builder = GitignoreBuilder::new(project_root);
    let gitignore_path = project_root.join(".gitignore");
    if gitignore_path.exists() {
        builder.add(gitignore_path);
    }
    let gitignore = builder.build().unwrap_or_else(|_| ignore::gitignore::Gitignore::empty());

    let scan_root = match relative_path {
        Some(p) if !p.is_empty() => project_root.join(p),
        _ => project_root.to_path_buf(),
    };

    let mut walk_builder = WalkBuilder::new(&scan_root);
    walk_builder
        .git_ignore(false)    // Don't filter gitignored files
        .git_global(false)
        .git_exclude(false)
        .hidden(false)
        .max_depth(max_depth.or(Some(1)));

    let mut nodes: Vec<FileNode> = Vec::new();
    for entry in walk_builder.build().flatten() {
        let path = entry.path();
        if path == scan_root {
            continue;
        }
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let relative = path
            .strip_prefix(project_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let is_gitignored = gitignore
            .matched_path_or_any_parents(path, path.is_dir())
            .is_ignore();
        let node_type = if path.is_dir() { "Directory" } else { "File" }.to_string();
        let size = if path.is_file() {
            std::fs::metadata(path).ok().map(|m| m.len())
        } else {
            None
        };

        nodes.push(FileNode { name, relative_path: relative, node_type, size, is_gitignored });
    }

    nodes.sort_by(|a, b| {
        let a_dir = a.node_type == "Directory";
        let b_dir = b.node_type == "Directory";
        b_dir.cmp(&a_dir).then(a.name.cmp(&b.name))
    });

    Ok(nodes)
}
```

Also update existing `list_files()` to set `is_gitignored: false` on all returned nodes.

**Step 4: Update `files.rs` IPC command**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn list_project_files(
    db: State<'_, Database>,
    project_id: String,
    relative_path: Option<String>,
    max_depth: Option<usize>,
    show_ignored: Option<bool>,  // NEW param (default false)
) -> Result<Vec<FileNode>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);

    if show_ignored.unwrap_or(false) {
        scanner::list_files_with_ignored(project_root, relative_path.as_deref(), max_depth)
    } else {
        scanner::list_files(project_root, relative_path.as_deref(), max_depth)
    }
}
```

**Step 5: Run Rust tests**

```bash
cd src-tauri && cargo test files:: -- --test-output immediate
```

Expected: PASS (4 new gitignore tests).

Also:

```bash
cargo clippy -- -D warnings && cargo fmt --check
```

**Step 6: Commit**

```bash
git add src-tauri/src/files/ src-tauri/src/commands/files.rs
git commit -m "CHI-216: backend — add is_gitignored field and show_ignored param to list_project_files"
```

---

### Task E2: fileStore — showIgnoredFiles signal + localStorage persistence

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/fileStore.ts`

**Step 1: Update FileNode type**

In `src/lib/types.ts`, add `is_gitignored` to the `FileNode` interface:

```typescript
export interface FileNode {
  name: string;
  relative_path: string;
  node_type: 'File' | 'Directory';
  size: number | null;
  is_gitignored: boolean;  // NEW
}
```

**Step 2: Add showIgnoredFiles to fileStore**

Add to `FileState` interface:
```typescript
showIgnoredFiles: boolean;
```

Add to initial state (with localStorage persistence):
```typescript
function loadShowIgnored(projectId: string | null): boolean {
  if (!projectId) return false;
  try {
    return localStorage.getItem(`cw:showIgnored:${projectId}`) === 'true';
  } catch {
    return false;
  }
}

// In createStore:
showIgnoredFiles: false,
```

Add exported mutations:
```typescript
/** Toggle show/hide gitignored files. Persisted per project in localStorage. */
export function toggleShowIgnoredFiles(projectId: string): void {
  const next = !fileState.showIgnoredFiles;
  setState('showIgnoredFiles', next);
  try {
    localStorage.setItem(`cw:showIgnored:${projectId}`, String(next));
  } catch {
    // localStorage unavailable
  }
  // Reload file tree with new setting
  void loadRootFiles(projectId);
}

/** Load persisted toggle state for a project. Call when project changes. */
export function loadShowIgnoredForProject(projectId: string): void {
  const persisted = loadShowIgnored(projectId);
  setState('showIgnoredFiles', persisted);
}
```

**Step 3: Update loadRootFiles / loadChildren to pass show_ignored**

In `fileStore.ts`, find the `invoke('list_project_files', ...)` calls and add `show_ignored: fileState.showIgnoredFiles`:

```typescript
const nodes = await invoke<FileNode[]>('list_project_files', {
  project_id: projectId,
  relative_path: path ?? null,
  max_depth: 1,
  show_ignored: fileState.showIgnoredFiles,   // NEW
});
```

**Step 4: In FileTree, load persisted state on project change**

In `FileTree.tsx`'s `createEffect`:
```typescript
createEffect(() => {
  const pid = projectId();
  if (pid) {
    loadShowIgnoredForProject(pid);   // Load persisted toggle
    loadRootFiles(pid);
  }
});
```

**Step 5: Run TypeScript checks**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add src/lib/types.ts src/stores/fileStore.ts src/components/explorer/FileTree.tsx
git commit -m "CHI-216: fileStore showIgnoredFiles signal + localStorage persistence per project"
```

---

### Task E3: FileTree toggle button + FileTreeNode visual treatment

**Files:**
- Modify: `src/components/explorer/FileTree.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`

**Step 1: Add Eye/EyeOff toggle button to FileTree header**

At the top of FileTree's JSX, add a header row with the toggle button. Currently there's no header — add one before the search input div:

```tsx
import { Eye, EyeOff } from 'lucide-solid';
import { fileState, toggleShowIgnoredFiles } from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';

// In FileTree JSX, before the search input:
<div class="flex items-center justify-between px-2 pt-1.5 pb-1">
  <span
    class="text-[10px] uppercase tracking-[0.08em] font-semibold"
    style={{ color: 'var(--color-text-tertiary)' }}
  >
    {t('explorer.files')}
  </span>
  <Show when={projectId()}>
    <button
      class="flex items-center justify-center w-5 h-5 rounded transition-colors"
      style={{
        color: fileState.showIgnoredFiles
          ? 'var(--color-accent)'
          : 'var(--color-text-tertiary)',
        background: fileState.showIgnoredFiles
          ? 'rgba(232, 130, 90, 0.1)'
          : 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = fileState.showIgnoredFiles
          ? 'var(--color-accent)'
          : 'var(--color-text-tertiary)';
      }}
      onClick={() => {
        const pid = projectId();
        if (pid) toggleShowIgnoredFiles(pid);
      }}
      aria-label={
        fileState.showIgnoredFiles ? 'Hide gitignored files' : 'Show gitignored files (Cmd+Shift+I)'
      }
      title={
        fileState.showIgnoredFiles
          ? 'Hide ignored files'
          : 'Show ignored files (Cmd+Shift+I)'
      }
    >
      <Show when={fileState.showIgnoredFiles} fallback={<Eye size={11} />}>
        <EyeOff size={11} />
      </Show>
    </button>
  </Show>
</div>
```

**Step 2: Add visual treatment to FileTreeNode for gitignored files**

In `FileTreeNode.tsx`, add a computed signal and style:

```tsx
const isGitignored = () => props.node.is_gitignored === true && fileState.showIgnoredFiles;

// Apply to the main node button/div — add opacity and badge:
<div
  class="flex items-center gap-1 w-full text-left"
  classList={{ 'opacity-50': isGitignored() }}
  ...
>
  {/* Existing file icon/name ... */}
  <Show when={isGitignored()}>
    <span
      class="ml-0.5 text-[9px]"
      style={{ color: 'var(--color-text-tertiary)' }}
      title="Ignored by .gitignore"
      aria-label="This file is ignored by .gitignore"
    >
      ⦻
    </span>
  </Show>
</div>
```

Also add hover tooltip text for ignored files:
```tsx
// In the hover tooltip content, show "Ignored by .gitignore" when gitignored
```

**Step 3: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

**Step 4: Commit**

```bash
git add src/components/explorer/FileTree.tsx src/components/explorer/FileTreeNode.tsx
git commit -m "CHI-216: FileTree toggle button + FileTreeNode opacity+badge for gitignored files"
```

---

### Task E4: Register Cmd+Shift+I keyboard shortcut

**Files:**
- Modify: `src/lib/keybindings.ts`

**Step 1: Add import and handler**

In `keybindings.ts`:

```typescript
import { fileState, toggleShowIgnoredFiles } from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
```

Add to `handleGlobalKeyDown`, after the existing Cmd+Shift+R handler:

```typescript
// Cmd+Shift+I — toggle show gitignored files in file explorer
if (e.code === 'KeyI' && e.shiftKey) {
  e.preventDefault();
  const pid = projectState.activeProjectId;
  if (pid) {
    toggleShowIgnoredFiles(pid);
  }
  return;
}
```

**Step 2: Run checks**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

**Step 3: Run all frontend checks**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . --max-warnings 0 && npx prettier --check .
```

**Step 4: Run all Rust checks**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

**Step 5: Commit**

```bash
git add src/lib/keybindings.ts
git commit -m "CHI-216: register Cmd+Shift+I shortcut for gitignore toggle"
```

---

## Final Steps: Handover Protocol

After all 5 parts are committed:

**Step 1: Acquire handover lock**

Check for lock: `ls .claude/handover.lock`. If absent, write it:

```json
{
  "owner": "claude-code",
  "task_id": "CHI-226/227/230/229/216",
  "acquired_at": "<now ISO>",
  "expires_at": "<now+1h ISO>",
  "note": "Updating handover.json after UX Excellence batch"
}
```

**Step 2: Update handover.json**

For each completed task, update `tasks.CHI-N.status = "done"`, add `completed_at` and `files`. Update `recommended_next` and `last_updated`.

**Step 3: Release lock**

1. Check `.claude/deltas/` — apply any pending deltas to `handover.json`.
2. Delete `.claude/handover.lock`.

**Step 4: Update CLAUDE.md**

Remove completed tasks from the Active / Backlog table. Add new recommended next tasks.

---

## Quick Reference — Files Modified Per Task

| Task | New Files | Modified Files |
|------|-----------|----------------|
| CHI-226 | `resumeDetector.ts`, `SessionResumeCard.tsx` | `sessionStore.ts`, `ConversationView.tsx` |
| CHI-227 | `agents/SessionCard.tsx`, `agents/AgentsView.tsx` | `MainLayout.tsx`, `conversationStore.ts` |
| CHI-230 | `diffApplicator.ts`, `InlineDiffBlock.tsx` | `conversationStore.ts`, `MarkdownContent.tsx`, `MessageBubble.tsx` |
| CHI-229 | — | `TitleBar.tsx`, `StatusBar.tsx`, `uiStore.ts`, `en.json`, `es.json` |
| CHI-216 | — | `scanner.rs`, `commands/files.rs`, `types.ts`, `fileStore.ts`, `FileTree.tsx`, `FileTreeNode.tsx`, `keybindings.ts` |
