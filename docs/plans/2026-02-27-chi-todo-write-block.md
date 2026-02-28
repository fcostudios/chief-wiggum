# TodoWrite Progress Block Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the raw JSON `ToolUseBlock` for `TodoWrite` tool calls with a rich, reactive checklist UI that shows task status inline in the conversation, plus a compact task-progress badge in the StatusBar while the agent is running.

**Architecture:** Special-case `TodoWrite` inside the existing `ToolUseBlock` dispatcher using a `<Show fallback>` pattern (SolidJS compliant). `TodoWriteBlock` is a self-contained component that parses `message.content → tool_input → todos[]` and renders a collapsible checklist. The StatusBar reads `conversationState.messages` via a `createMemo` and derives `{done, total}` counts — no new stores.

**Tech Stack:** SolidJS 1.9, `lucide-solid` icons (already imported), `@solid-primitives/i18n` (already wired), `@solidjs/testing-library` + Vitest for tests.

---

## Visual Target

```
Collapsed:
┌─[✦]─ Tasks  ·  1/3 done  ·  [⟳ 1]  ▶ ┐
└────────────────────────────────────────┘

Expanded:
┌─[✦]─ Tasks  ·  1/3 done           ▼ ─┐
│ ✓  Fix cli:exited handler             │  ← green
│ ⟳  Run frontend checks                │  ← yellow spinner
│ ○  Write unit tests                   │  ← muted gray
└────────────────────────────────────────┘

StatusBar (left section, while running):
 • Running  ✓ 1/3  [0 active]  [▶ 2 running]
```

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/lib/types.ts` |
| Modify | `src/locales/en.json` |
| Modify | `src/locales/es.json` |
| **Create** | `src/components/conversation/TodoWriteBlock.tsx` |
| **Create** | `src/components/conversation/TodoWriteBlock.test.tsx` |
| Modify | `src/components/conversation/ToolUseBlock.tsx` |
| **Create** | `src/components/conversation/ToolUseBlock.test.tsx` |
| Modify | `src/components/layout/StatusBar.tsx` |
| Modify | `src/components/layout/StatusBar.test.tsx` |

---

## Task 1: Add `TodoItem` type to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts` (after `ToolCategory` type on line 84)

**Step 1: Open `src/lib/types.ts` and locate the `ToolCategory` type (line 84)**

It reads:
```typescript
/** Tool classification category for color-coding. */
export type ToolCategory = 'file' | 'bash' | 'neutral';
```

**Step 2: Add the two new interfaces immediately after that line**

```typescript
/** A single todo item from a TodoWrite tool call. */
export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** Parsed payload of a TodoWrite tool_input JSON string. */
export interface TodoWriteData {
  todos: TodoItem[];
}
```

**Step 3: Run typecheck to confirm no breakage**

```bash
cd /Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum
npx tsc --noEmit 2>&1 | head -20
```
Expected: zero errors.

**Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add TodoItem and TodoWriteData types for TodoWrite block"
```

---

## Task 2: Add i18n strings

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`

### `en.json`

**Step 1: Open `src/locales/en.json`. Find the closing `}` of the `"statusBar"` object (around line 28).**

After the `"statusBar"` block's closing `}` and before the `"sidebar"` block, add:

```json
  "todoBlock": {
    "header": "Tasks",
    "progress": "{{ done }}/{{ total }} done",
    "allDone": "All {{ n }} done",
    "empty": "No tasks",
    "taskProgress": "Task progress"
  },
```

Also, inside `"statusBar"` (after `"exportDiagnostics"` line), add:

```json
    "taskProgress": "Task progress"
```

### `es.json`

**Step 2: Open `src/locales/es.json`. Mirror the same two additions:**

After the `"statusBar"` block, add:
```json
  "todoBlock": {
    "header": "Tareas",
    "progress": "{{ done }}/{{ total }} listas",
    "allDone": "Todas completadas ({{ n }})",
    "empty": "Sin tareas",
    "taskProgress": "Progreso de tareas"
  },
```

Inside `"statusBar"`, add:
```json
    "taskProgress": "Progreso de tareas"
```

**Step 3: Run typecheck to confirm JSON is valid**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: zero errors.

**Step 4: Commit**

```bash
git add src/locales/en.json src/locales/es.json
git commit -m "feat: add i18n strings for TodoWriteBlock and StatusBar task badge"
```

---

## Task 3: Create `TodoWriteBlock` component

**Files:**
- Create: `src/components/conversation/TodoWriteBlock.tsx`
- Create: `src/components/conversation/TodoWriteBlock.test.tsx`

### Step 1: Write the failing test first

Create `src/components/conversation/TodoWriteBlock.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string, vars?: Record<string, unknown>) => {
    if (key === 'todoBlock.header') return 'Tasks';
    if (key === 'todoBlock.progress') return `${String(vars?.done)}/${String(vars?.total)} done`;
    if (key === 'todoBlock.allDone') return `All ${String(vars?.n)} done`;
    if (key === 'todoBlock.empty') return 'No tasks';
    return key;
  },
}));

// Import AFTER mocks
import { TodoWriteBlock } from './TodoWriteBlock';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMsg(todos: Array<{ content: string; status: string; activeForm: string }>): Message {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    role: 'tool_use',
    content: JSON.stringify({
      tool_name: 'TodoWrite',
      tool_input: JSON.stringify({ todos }),
    }),
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('TodoWriteBlock', () => {
  it('renders collapsed by default showing Tasks header and progress', () => {
    const msg = makeMsg([
      { content: 'Fix bug', status: 'completed', activeForm: 'Fixing bug' },
      { content: 'Run tests', status: 'in_progress', activeForm: 'Running tests' },
      { content: 'Update docs', status: 'pending', activeForm: 'Updating docs' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('1/3 done')).toBeInTheDocument();
    // Items must not be visible while collapsed
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument();
  });

  it('sets aria-expanded="false" on toggle button when collapsed', () => {
    const msg = makeMsg([{ content: 'Task', status: 'pending', activeForm: 'Task' }]);
    render(() => <TodoWriteBlock message={msg} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to show all items when header button is clicked', () => {
    const msg = makeMsg([
      { content: 'Fix bug', status: 'completed', activeForm: 'Fixing bug' },
      { content: 'Run tests', status: 'pending', activeForm: 'Running tests' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('Run tests')).toBeInTheDocument();
  });

  it('sets aria-expanded="true" after expanding', () => {
    const msg = makeMsg([{ content: 'Task', status: 'pending', activeForm: 'Task' }]);
    render(() => <TodoWriteBlock message={msg} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses back on second click', () => {
    const msg = makeMsg([{ content: 'Fix bug', status: 'pending', activeForm: 'Fixing bug' }]);
    render(() => <TodoWriteBlock message={msg} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn); // expand
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    fireEvent.click(btn); // collapse
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument();
  });

  it('shows "All N done" header when all tasks are completed', () => {
    const msg = makeMsg([
      { content: 'Step 1', status: 'completed', activeForm: 'Doing step 1' },
      { content: 'Step 2', status: 'completed', activeForm: 'Doing step 2' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    expect(screen.getByText('All 2 done')).toBeInTheDocument();
  });

  it('renders each expanded item with correct data-status attribute', () => {
    const msg = makeMsg([
      { content: 'Done task', status: 'completed', activeForm: 'Done' },
      { content: 'Active task', status: 'in_progress', activeForm: 'Active' },
      { content: 'Waiting task', status: 'pending', activeForm: 'Waiting' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    fireEvent.click(screen.getByRole('button'));

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('data-status', 'completed');
    expect(items[1]).toHaveAttribute('data-status', 'in_progress');
    expect(items[2]).toHaveAttribute('data-status', 'pending');
  });

  it('shows "No tasks" text when expanded with empty todos array', () => {
    const msg = makeMsg([]);
    render(() => <TodoWriteBlock message={msg} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('renders gracefully with malformed JSON content — does not throw', () => {
    const badMsg: Message = {
      id: 'msg-bad',
      session_id: 'session-1',
      role: 'tool_use',
      content: 'not valid { json }',
      model: null,
      input_tokens: null,
      output_tokens: null,
      thinking_tokens: null,
      cost_cents: null,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };
    // Must not throw — renders "Tasks" header with 0 items
    expect(() => render(() => <TodoWriteBlock message={badMsg} />)).not.toThrow();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('shows in_progress badge pill on header when items are in progress', () => {
    const msg = makeMsg([
      { content: 'Active', status: 'in_progress', activeForm: 'Active' },
      { content: 'Waiting', status: 'pending', activeForm: 'Waiting' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    // Badge shows "⟳ 1" for 1 in_progress item
    expect(screen.getByText(/⟳ 1/)).toBeInTheDocument();
  });
});
```

### Step 2: Run the test to confirm it fails

```bash
npx vitest run src/components/conversation/TodoWriteBlock.test.tsx 2>&1 | tail -15
```
Expected: FAIL — `TodoWriteBlock` module not found.

### Step 3: Create `src/components/conversation/TodoWriteBlock.tsx`

```tsx
// src/components/conversation/TodoWriteBlock.tsx
// Rich checklist renderer for TodoWrite tool calls.
// Replaces raw JSON ToolUseBlock when tool_name === 'TodoWrite'.
// Per SPEC-004 §6 — message.content is ToolUseData JSON; tool_input is TodoWriteData JSON.

import type { Component } from 'solid-js';
import { createSignal, For, Show, Switch, Match } from 'solid-js';
import { ChevronDown, ChevronRight, CheckCircle, Circle, Loader } from 'lucide-solid';
import { t } from '@/stores/i18nStore';
import type { Message, TodoItem } from '@/lib/types';

// ── Parsing helpers ──────────────────────────────────────────────────────────

/** Parse todos array from a TodoWrite tool_input JSON string. Returns [] on any failure. */
function parseTodos(toolInput: string): TodoItem[] {
  try {
    const parsed = JSON.parse(toolInput) as { todos?: unknown };
    if (Array.isArray(parsed.todos)) {
      return parsed.todos as TodoItem[];
    }
  } catch {
    // malformed — return empty, no throw
  }
  return [];
}

/** Count todos by status. */
function todoCounts(todos: TodoItem[]): { done: number; inProgress: number } {
  return {
    done: todos.filter((item) => item.status === 'completed').length,
    inProgress: todos.filter((item) => item.status === 'in_progress').length,
  };
}

/** Text color token per status. */
function statusColor(status: TodoItem['status']): string {
  switch (status) {
    case 'completed':
      return 'var(--color-success)';
    case 'in_progress':
      return 'var(--color-warning)';
    case 'pending':
      return 'var(--color-text-tertiary)';
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** Icon for each status. Spinner uses CSS animation only — no JS dependency. */
const StatusIcon: Component<{ status: TodoItem['status'] }> = (props) => (
  <Switch>
    <Match when={props.status === 'completed'}>
      <CheckCircle size={12} color="var(--color-success)" />
    </Match>
    <Match when={props.status === 'in_progress'}>
      <div
        class="w-3 h-3 rounded-full border-2 animate-spin shrink-0"
        style={{
          'border-color': 'var(--color-warning)',
          'border-top-color': 'transparent',
        }}
        role="img"
        aria-label="in progress"
      />
    </Match>
    <Match when={props.status === 'pending'}>
      <Circle size={12} color="var(--color-text-tertiary)" />
    </Match>
  </Switch>
);

// ── Main component ───────────────────────────────────────────────────────────

export const TodoWriteBlock: Component<{ message: Message }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  /** Parse todos from message content every time message changes. */
  const todos = (): TodoItem[] => {
    try {
      const data = JSON.parse(props.message.content) as { tool_input?: string };
      return parseTodos(data.tool_input ?? '');
    } catch {
      return [];
    }
  };

  const counts = () => todoCounts(todos());
  const total = () => todos().length;

  /** Header label: "1/3 done", "All 3 done", or "Tasks" for empty. */
  const progressLabel = () => {
    if (total() === 0) return '';
    if (counts().done === total()) return t('todoBlock.allDone', { n: total() });
    return t('todoBlock.progress', { done: counts().done, total: total() });
  };

  return (
    <div class="flex justify-start">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-primary)',
        }}
      >
        <div class="flex">
          {/* Left accent stripe — warm amber for todo/planning context */}
          <div class="w-[3px] shrink-0" style={{ background: 'var(--color-accent)' }} />

          <div class="flex-1 min-w-0">
            {/* ── Header (always visible) ── */}
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded()}
              aria-label={`${expanded() ? 'Collapse' : 'Expand'} task list`}
            >
              {/* ✦ plan indicator */}
              <span style={{ color: 'var(--color-accent)', 'font-size': '10px', 'flex-shrink': '0' }}>
                ✦
              </span>

              {/* "Tasks" label */}
              <span
                class="text-xs font-semibold shrink-0"
                style={{ color: 'var(--color-accent)', 'font-family': 'var(--font-ui)' }}
              >
                {t('todoBlock.header')}
              </span>

              {/* "X/Y done" or "All N done" */}
              <Show when={progressLabel()}>
                <span
                  class="text-xs flex-1 truncate"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {progressLabel()}
                </span>
              </Show>
              <Show when={!progressLabel()}>
                <span class="flex-1" />
              </Show>

              {/* ⟳ N badge — only shown when collapsed and in_progress items exist */}
              <Show when={!expanded() && counts().inProgress > 0}>
                <span
                  class="text-[10px] px-1 py-0.5 rounded shrink-0"
                  style={{
                    color: 'var(--color-warning)',
                    background: 'var(--color-warning-muted)',
                    'font-family': 'var(--font-mono)',
                  }}
                >
                  {`⟳ ${counts().inProgress}`}
                </span>
              </Show>

              {/* Chevron */}
              <Show
                when={expanded()}
                fallback={<ChevronRight size={14} color="var(--color-text-tertiary)" class="shrink-0" />}
              >
                <ChevronDown size={14} color="var(--color-text-tertiary)" class="shrink-0" />
              </Show>
            </button>

            {/* ── Expanded item list ── */}
            <Show when={expanded()}>
              <div
                class="px-3 pb-2 pt-1 border-t"
                style={{ 'border-color': 'var(--color-border-secondary)' }}
                role="list"
                aria-label="Task list"
              >
                <For each={todos()}>
                  {(item) => (
                    <div
                      class="flex items-start gap-2.5 py-1.5"
                      role="listitem"
                      data-status={item.status}
                    >
                      <div class="mt-0.5 shrink-0">
                        <StatusIcon status={item.status} />
                      </div>
                      <span
                        class="text-xs leading-relaxed"
                        style={{ color: statusColor(item.status) }}
                      >
                        {item.content}
                      </span>
                    </div>
                  )}
                </For>

                <Show when={todos().length === 0}>
                  <p class="text-xs py-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('todoBlock.empty')}
                  </p>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### Step 4: Run tests to confirm they pass

```bash
npx vitest run src/components/conversation/TodoWriteBlock.test.tsx 2>&1 | tail -20
```
Expected: all 10 tests PASS.

### Step 5: Commit

```bash
git add src/components/conversation/TodoWriteBlock.tsx \
        src/components/conversation/TodoWriteBlock.test.tsx
git commit -m "feat: add TodoWriteBlock rich checklist renderer for TodoWrite tool calls"
```

---

## Task 4: Wire `ToolUseBlock` to delegate to `TodoWriteBlock`

**Files:**
- Modify: `src/components/conversation/ToolUseBlock.tsx`
- Create: `src/components/conversation/ToolUseBlock.test.tsx`

### Step 1: Write the failing test first

Create `src/components/conversation/ToolUseBlock.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

// Mock TodoWriteBlock so we can assert it's used without rendering its internals
vi.mock('./TodoWriteBlock', () => ({
  TodoWriteBlock: () => <div data-testid="todo-write-block">Todo Block</div>,
}));

// Import AFTER mocks
import { ToolUseBlock } from './ToolUseBlock';

function makeMsg(toolName: string, toolInput: string): Message {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    role: 'tool_use',
    content: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

describe('ToolUseBlock', () => {
  it('delegates to TodoWriteBlock for TodoWrite tool calls', () => {
    const msg = makeMsg('TodoWrite', JSON.stringify({ todos: [] }));
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.getByTestId('todo-write-block')).toBeInTheDocument();
  });

  it('does NOT render TodoWriteBlock for Bash tool calls', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'ls -la' }));
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.queryByTestId('todo-write-block')).not.toBeInTheDocument();
  });

  it('renders default expand button for non-TodoWrite tool calls', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'npm test' }));
    render(() => <ToolUseBlock message={msg} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-label', 'Expand Bash tool use');
  });

  it('does NOT render TodoWriteBlock for Read tool calls', () => {
    const msg = makeMsg('Read', JSON.stringify({ file_path: '/src/foo.ts' }));
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.queryByTestId('todo-write-block')).not.toBeInTheDocument();
  });

  it('expands default block to show tool input on click', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'cargo test' }));
    render(() => <ToolUseBlock message={msg} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    // Tool input JSON is visible in expanded <code> block
    expect(screen.getByText(/cargo test/)).toBeInTheDocument();
  });
});
```

### Step 2: Run test to confirm it fails

```bash
npx vitest run src/components/conversation/ToolUseBlock.test.tsx 2>&1 | tail -15
```
Expected: FAIL — `TodoWriteBlock` delegation test fails because it's not wired yet.

### Step 3: Modify `src/components/conversation/ToolUseBlock.tsx`

**3a.** Add the import at the top of the file, right after the existing imports (after line 3 where `Message, ToolUseData, ToolCategory` are imported):

```typescript
import { TodoWriteBlock } from './TodoWriteBlock';
```

**3b.** Wrap the entire return statement in a `<Show>` that delegates to `TodoWriteBlock` when `tool_name === 'TodoWrite'`.

The existing component signature ends at:
```typescript
export const ToolUseBlock: Component<ToolUseBlockProps> = (props) => {
  const data = () => parseToolUseContent(props.message.content);
  const category = () => classifyTool(data().tool_name);
  const color = () => toolColor(category());
  const summary = () => toolSummary(data().tool_name, data().tool_input);

  const [expanded, setExpanded] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start">
```

Change it to:

```typescript
export const ToolUseBlock: Component<ToolUseBlockProps> = (props) => {
  const data = () => parseToolUseContent(props.message.content);
  const category = () => classifyTool(data().tool_name);
  const color = () => toolColor(category());
  const summary = () => toolSummary(data().tool_name, data().tool_input);

  const [expanded, setExpanded] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <Show when={data().tool_name !== 'TodoWrite'} fallback={<TodoWriteBlock message={props.message} />}>
      <div class="flex justify-start">
```

**3c.** Close the `<Show>` tag at the very end of the component, replacing the final `);` with:

```tsx
      </div>
    </Show>
  );
```

The closing structure becomes:
```tsx
            </Show>
          </div>
        </div>
      </div>
    </Show>        {/* ← new closing tag */}
  );
};
```

### Step 4: Run tests to confirm they pass

```bash
npx vitest run src/components/conversation/ToolUseBlock.test.tsx 2>&1 | tail -20
```
Expected: all 5 tests PASS.

### Step 5: Run full conversation component tests to check no regressions

```bash
npx vitest run src/components/conversation/ 2>&1 | tail -20
```
Expected: all pass.

### Step 6: Commit

```bash
git add src/components/conversation/ToolUseBlock.tsx \
        src/components/conversation/ToolUseBlock.test.tsx
git commit -m "feat: delegate TodoWrite tool calls to TodoWriteBlock in ToolUseBlock"
```

---

## Task 5: Add StatusBar task-progress badge

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/StatusBar.test.tsx`

### Context

The StatusBar already imports `conversationState` (line 9) but only uses `processStatus` and `sessionStatuses`. We'll add a `createMemo` that scans `conversationState.messages` for the most-recent `TodoWrite` call and derives `{done, total}` counts, then show a compact badge only while `processStatus === 'running'`.

### Step 1: Write the failing tests

Open `src/components/layout/StatusBar.test.tsx`.

**1a.** At the top (before existing `let mock...` declarations), add:

```typescript
import type { Message } from '@/lib/types';
let mockMessages: Message[] = [];
```

**1b.** Inside the `vi.mock('@/stores/conversationStore', ...)` factory (around line 41-50), add the `messages` getter:

Find this block:
```typescript
vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get processStatus() {
      return mockProcessStatus;
    },
    get sessionStatuses() {
      return mockSessionStatuses;
    },
  },
}));
```

Replace with:
```typescript
vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get processStatus() {
      return mockProcessStatus;
    },
    get sessionStatuses() {
      return mockSessionStatuses;
    },
    get messages() {
      return mockMessages;
    },
  },
}));
```

**1c.** Inside `beforeEach`, add `mockMessages = [];` after `mockRecentActionEvents = [];`.

**1d.** Also extend the `vi.mock('@/stores/i18nStore', ...)` factory (around line 75-84) to handle the new key. Find the `return key;` fallback and add before it:

```typescript
    if (key === 'statusBar.taskProgress') return 'Task progress';
```

**1e.** At the end of the `describe('StatusBar', ...)` block, add these new tests (before the closing `}`):

```typescript
  // ── Task progress badge ───────────────────────────────────────────────────

  function makeTodoMsg(todos: Array<{ content: string; status: string; activeForm: string }>): Message {
    return {
      id: 'msg-todo',
      session_id: 's1',
      role: 'tool_use',
      content: JSON.stringify({
        tool_name: 'TodoWrite',
        tool_input: JSON.stringify({ todos }),
      }),
      model: null,
      input_tokens: null,
      output_tokens: null,
      thinking_tokens: null,
      cost_cents: null,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };
  }

  it('shows task badge "✓ 1/3" when process is running and TodoWrite messages exist', () => {
    mockProcessStatus = 'running';
    mockMessages = [
      makeTodoMsg([
        { content: 'Fix bug', status: 'completed', activeForm: 'Fixing' },
        { content: 'Run tests', status: 'in_progress', activeForm: 'Running' },
        { content: 'Update docs', status: 'pending', activeForm: 'Updating' },
      ]),
    ];
    render(() => <StatusBar />);
    expect(screen.getByText('✓ 1/3')).toBeInTheDocument();
  });

  it('does not show task badge when process is not running', () => {
    mockProcessStatus = 'not_started';
    mockMessages = [
      makeTodoMsg([
        { content: 'Fix bug', status: 'completed', activeForm: 'Fixing' },
      ]),
    ];
    render(() => <StatusBar />);
    expect(screen.queryByText(/✓ \d+\/\d+/)).not.toBeInTheDocument();
  });

  it('does not show task badge when no TodoWrite messages exist', () => {
    mockProcessStatus = 'running';
    mockMessages = [];
    render(() => <StatusBar />);
    expect(screen.queryByText(/✓ \d+\/\d+/)).not.toBeInTheDocument();
  });

  it('shows "✓ 3/3" badge when all tasks completed and process running', () => {
    mockProcessStatus = 'running';
    mockMessages = [
      makeTodoMsg([
        { content: 'Step 1', status: 'completed', activeForm: 'Doing 1' },
        { content: 'Step 2', status: 'completed', activeForm: 'Doing 2' },
        { content: 'Step 3', status: 'completed', activeForm: 'Doing 3' },
      ]),
    ];
    render(() => <StatusBar />);
    expect(screen.getByText('✓ 3/3')).toBeInTheDocument();
  });

  it('uses the LAST TodoWrite message when multiple exist', () => {
    mockProcessStatus = 'running';
    mockMessages = [
      // First call: 0/2 done
      makeTodoMsg([
        { content: 'Task A', status: 'pending', activeForm: 'Doing A' },
        { content: 'Task B', status: 'pending', activeForm: 'Doing B' },
      ]),
      // Second call (latest): 1/2 done
      makeTodoMsg([
        { content: 'Task A', status: 'completed', activeForm: 'Did A' },
        { content: 'Task B', status: 'pending', activeForm: 'Doing B' },
      ]),
    ];
    render(() => <StatusBar />);
    expect(screen.getByText('✓ 1/2')).toBeInTheDocument();
    expect(screen.queryByText('✓ 0/2')).not.toBeInTheDocument();
  });
```

### Step 2: Run the new tests to confirm they fail

```bash
npx vitest run src/components/layout/StatusBar.test.tsx 2>&1 | grep -E 'FAIL|task badge|✓'
```
Expected: the 5 new badge tests FAIL; existing tests still pass.

### Step 3: Modify `src/components/layout/StatusBar.tsx`

**3a.** Add the `TodoItem` type import. Find the existing import on line 13:
```typescript
import type { ProcessStatus } from '@/lib/types';
```
Change to:
```typescript
import type { ProcessStatus, TodoItem } from '@/lib/types';
```

**3b.** Add the two memos after the existing `runningActionCount` memo (around line 85).

Find:
```typescript
  const runningActionCount = () => runningActions().length;
```

After that line, add:

```typescript
  /** Scan messages for the most-recent TodoWrite call and return its todos, or null. */
  const latestTodos = createMemo<TodoItem[] | null>(() => {
    const msgs = conversationState.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.role === 'tool_use') {
        try {
          const d = JSON.parse(msg.content) as { tool_name?: string; tool_input?: string };
          if (d.tool_name === 'TodoWrite' && typeof d.tool_input === 'string') {
            const inp = JSON.parse(d.tool_input) as { todos?: unknown };
            if (Array.isArray(inp.todos) && inp.todos.length > 0) {
              return inp.todos as TodoItem[];
            }
          }
        } catch {
          // skip malformed messages
        }
      }
    }
    return null;
  });

  /** Derive {done, total} counts — only truthy while processStatus === 'running'. */
  const todoBadge = createMemo<{ done: number; total: number } | null>(() => {
    if (conversationState.processStatus !== 'running') return null;
    const todos = latestTodos();
    if (!todos) return null;
    const done = todos.filter((item) => item.status === 'completed').length;
    return { done, total: todos.length };
  });
```

**3c.** Add the badge element to the JSX. Find the existing backgroundRunningCount badge (around line 178-189):

```tsx
        <Show when={backgroundRunningCount() > 0}>
          <span
            class="font-mono px-1 py-0.5 rounded"
            style={{
              'font-size': '9px',
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-elevated)',
            }}
          >
            {t('statusBar.nActive', { n: backgroundRunningCount() })}
          </span>
        </Show>
```

Immediately **after** that `</Show>`, add:

```tsx
        <Show when={todoBadge()}>
          <span
            class="font-mono px-1 py-0.5 rounded"
            style={{
              'font-size': '9px',
              color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-elevated)',
            }}
            title={t('statusBar.taskProgress')}
            aria-label={`Task progress: ${todoBadge()!.done} of ${todoBadge()!.total} done`}
          >
            {`✓ ${todoBadge()!.done}/${todoBadge()!.total}`}
          </span>
        </Show>
```

### Step 4: Run all StatusBar tests

```bash
npx vitest run src/components/layout/StatusBar.test.tsx 2>&1 | tail -20
```
Expected: all tests pass (existing + 5 new badge tests).

### Step 5: Commit

```bash
git add src/components/layout/StatusBar.tsx \
        src/components/layout/StatusBar.test.tsx
git commit -m "feat: add task progress badge to StatusBar during active agent turns"
```

---

## Task 6: Full verification

**Step 1: Run the full frontend test suite**

```bash
npx vitest run 2>&1 | tail -30
```
Expected: all files pass — no regressions. Newly added test files appear in the summary.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1
```
Expected: zero errors.

**Step 3: ESLint**

```bash
npx eslint src/components/conversation/TodoWriteBlock.tsx \
           src/components/conversation/ToolUseBlock.tsx \
           src/components/layout/StatusBar.tsx 2>&1
```
Expected: zero warnings or errors.

**Step 4: Prettier**

```bash
npx prettier --check src/components/conversation/TodoWriteBlock.tsx \
             src/components/conversation/ToolUseBlock.tsx \
             src/components/layout/StatusBar.tsx \
             src/locales/en.json src/locales/es.json 2>&1
```
If any formatting issues: `npx prettier --write <file>`, then re-check.

**Step 5: Final commit (if formatting fixes needed)**

```bash
git add -p
git commit -m "chore: format TodoWriteBlock, ToolUseBlock, StatusBar"
```

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| 1 | `TodoWrite` tool calls in conversation render a collapsible checklist, not raw JSON |
| 2 | Collapsed state shows "Tasks · X/Y done" and a `⟳ N` in-progress pill |
| 3 | Clicking expands inline to show all items with status-colored text |
| 4 | Second click collapses back; aria-expanded toggles correctly |
| 5 | "All N done" shown when all tasks complete |
| 6 | All other tool calls (Bash, Read, Edit, etc.) still render original `ToolUseBlock` |
| 7 | StatusBar shows `✓ X/Y` badge only while `processStatus === 'running'` with todos present |
| 8 | StatusBar badge uses the most-recent `TodoWrite` call in the current session |
| 9 | Malformed JSON in tool_input does not crash the app |
| 10 | All new tests pass; full suite has zero regressions |
| 11 | TypeScript strict check passes, ESLint clean, Prettier formatted |

---

## What was NOT implemented (YAGNI)

- No new store slice — `conversationStore` unchanged
- No floating overlay — deferred; better suited for multi-session tracking in a future epic
- No toast integration — confirmed wrong pattern for repeated state updates
- No click-to-toggle individual task status — todos are read-only (owned by the agent)
- No persistence of expanded/collapsed state across HMR — in-memory `createSignal` is sufficient
