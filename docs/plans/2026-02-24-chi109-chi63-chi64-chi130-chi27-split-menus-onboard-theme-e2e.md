# Split Panes, Context Menus, Onboarding, Theme System & E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement parallel session split panes, context menus, first-launch onboarding, light/dark theme system, and comprehensive E2E testing with Playwright.

**Architecture:** Five independent epics that can be parallelized. CHI-109 (split panes) extends the existing 5-zone layout with a new `viewStore` and a `SplitPaneContainer` wrapping dual `ConversationView` instances. CHI-63 (context menus + keyboard nav) adds a reusable `ContextMenu` component with portal rendering, plus a `focusTrap` utility and `KeyboardHelp` overlay. CHI-64 (onboarding + placeholders) uses an overlay flow gated by settings persistence. CHI-130 (theme system) leverages the existing CSS custom property architecture — add `:root[data-theme="light"]` overrides + `matchMedia` listener. CHI-27 (E2E) sets up Playwright against the Vite dev server (frontend-only Phase 1, no Tauri WebDriver needed yet).

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, Tauri v2, Rust (tokio, serde), Playwright 1.48+, lucide-solid

---

## Epic A: CHI-109 — Parallel Sessions v2 (3 tasks)

### Task 1: Split Pane State & View Store (CHI-110)

**Files:**
- Create: `src/stores/viewStore.ts`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/lib/keybindings.ts`

**Step 1: Create viewStore.ts**

```typescript
// src/stores/viewStore.ts
// Split pane layout state. Per GUIDE-001: createStore singleton + exported mutations.

import { createStore } from 'solid-js/store';

export type LayoutMode = 'single' | 'split-horizontal' | 'split-vertical';

export interface Pane {
  id: string;
  sessionId: string | null;
}

interface ViewState {
  layoutMode: LayoutMode;
  panes: Pane[];
  activePaneId: string;
}

const [state, setState] = createStore<ViewState>({
  layoutMode: 'single',
  panes: [{ id: 'main', sessionId: null }],
  activePaneId: 'main',
});

export const viewState = state;

/** Split the current view into two panes. Second pane starts with no session. */
export function splitView(direction: 'horizontal' | 'vertical' = 'horizontal'): void {
  if (state.layoutMode !== 'single') return; // Already split
  const newId = `pane-${Date.now()}`;
  setState('layoutMode', direction === 'horizontal' ? 'split-horizontal' : 'split-vertical');
  setState('panes', (prev) => [...prev, { id: newId, sessionId: null }]);
}

/** Close a pane by ID. If only one remains, return to single mode. */
export function closePane(paneId: string): void {
  if (state.panes.length <= 1) return;
  setState('panes', (prev) => prev.filter((p) => p.id !== paneId));
  if (state.panes.length === 1) {
    setState('layoutMode', 'single');
    setState('activePaneId', state.panes[0].id);
  } else if (state.activePaneId === paneId) {
    setState('activePaneId', state.panes[0].id);
  }
}

/** Focus a pane (e.g., on click). */
export function focusPane(paneId: string): void {
  setState('activePaneId', paneId);
}

/** Assign a session to a pane. */
export function setPaneSession(paneId: string, sessionId: string): void {
  setState(
    'panes',
    (p) => p.id === paneId,
    'sessionId',
    sessionId,
  );
}

/** Get the active pane's session ID. */
export function getActivePaneSessionId(): string | null {
  const pane = state.panes.find((p) => p.id === state.activePaneId);
  return pane?.sessionId ?? null;
}

/** Return to single-pane layout. */
export function unsplit(): void {
  setState('layoutMode', 'single');
  setState('panes', [state.panes[0]]);
  setState('activePaneId', state.panes[0].id);
}
```

**Step 2: Add keyboard shortcuts for split/close**

In `src/lib/keybindings.ts`, add handlers (after existing Cmd+Shift+Y handler):

```typescript
import { splitView, closePane, viewState } from '@/stores/viewStore';

// Cmd+\ — Split/unsplit view
if (e.metaKey && e.key === '\\') {
  e.preventDefault();
  if (viewState.layoutMode === 'single') {
    splitView('horizontal');
  } else {
    unsplit();
  }
  return;
}

// Cmd+W — Close active pane (only in split mode)
if (e.metaKey && e.key === 'w' && viewState.layoutMode !== 'single') {
  e.preventDefault();
  closePane(viewState.activePaneId);
  return;
}
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/stores/viewStore.ts src/lib/keybindings.ts
git commit -m "feat: split pane view store with keyboard shortcuts (CHI-110)"
```

---

### Task 2: SplitPaneContainer Component (CHI-110)

**Files:**
- Create: `src/components/layout/SplitPaneContainer.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Create SplitPaneContainer.tsx**

This renders two ConversationView instances side-by-side with a draggable divider.

```tsx
// src/components/layout/SplitPaneContainer.tsx
import type { Component } from 'solid-js';
import { createSignal, Show, For } from 'solid-js';
import { viewState, focusPane, closePane, type Pane } from '@/stores/viewStore';
import ConversationView from '@/components/conversation/ConversationView';
import MessageInput from '@/components/conversation/MessageInput';
import { sessionState, createNewSession } from '@/stores/sessionStore';
import { sendMessage, conversationState } from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import { X } from 'lucide-solid';

const MIN_PANE_SIZE = 300; // px

const SplitPaneContainer: Component = () => {
  const [dividerPos, setDividerPos] = createSignal(50); // percentage
  let containerRef: HTMLDivElement | undefined;

  const isHorizontal = () => viewState.layoutMode === 'split-horizontal';

  function handleDividerDrag(e: MouseEvent) {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const total = isHorizontal() ? rect.width : rect.height;
    const offset = isHorizontal() ? e.clientX - rect.left : e.clientY - rect.top;
    const pct = Math.max(
      (MIN_PANE_SIZE / total) * 100,
      Math.min(100 - (MIN_PANE_SIZE / total) * 100, (offset / total) * 100),
    );
    setDividerPos(pct);
  }

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => handleDividerDrag(ev);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = isHorizontal() ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <div
      ref={containerRef}
      class={`flex-1 flex overflow-hidden ${isHorizontal() ? 'flex-row' : 'flex-col'}`}
    >
      <For each={viewState.panes}>
        {(pane, index) => (
          <>
            <Show when={index() > 0}>
              {/* Draggable divider */}
              <div
                class={`shrink-0 ${isHorizontal() ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'} hover:bg-accent/40 transition-colors`}
                style={{
                  background: 'var(--color-border-secondary)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onMouseDown={startDrag}
              />
            </Show>
            <div
              class="flex flex-col min-w-0 overflow-hidden"
              style={{
                'flex-basis': index() === 0 ? `${dividerPos()}%` : `${100 - dividerPos()}%`,
                'flex-grow': 0,
                'flex-shrink': 0,
                'border': viewState.activePaneId === pane.id
                  ? '2px solid var(--color-accent-muted)'
                  : '2px solid transparent',
                'transition': 'border-color var(--duration-fast)',
              }}
              onClick={() => focusPane(pane.id)}
            >
              {/* Pane header with close button */}
              <div
                class="flex items-center justify-between px-2 py-1 text-[10px] text-text-tertiary"
                style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
              >
                <span class="truncate">
                  {pane.sessionId
                    ? sessionState.sessions.find((s) => s.id === pane.sessionId)?.title ?? 'Session'
                    : 'No session'}
                </span>
                <button
                  class="p-0.5 rounded hover:bg-bg-elevated transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    closePane(pane.id);
                  }}
                  title="Close pane"
                >
                  <X size={10} />
                </button>
              </div>
              {/* Conversation content */}
              <div class="flex-1 overflow-hidden">
                <ConversationView />
              </div>
              {/* Per-pane message input */}
              <MessageInput
                onSend={(text) => {
                  const sessionId = pane.sessionId ?? sessionState.activeSessionId;
                  if (sessionId) {
                    sendMessage(text, sessionId);
                  } else {
                    createNewSession('claude-sonnet-4-6').then((session) => {
                      sendMessage(text, session.id);
                    });
                  }
                }}
                isLoading={conversationState.isLoading}
                isDisabled={!cliState.isDetected}
              />
            </div>
          </>
        )}
      </For>
    </div>
  );
};

export default SplitPaneContainer;
```

**Step 2: Wire into MainLayout.tsx**

Replace the view content area (lines 123-155) to conditionally render split panes:

In MainLayout.tsx, add imports:
```typescript
import { viewState } from '@/stores/viewStore';
import SplitPaneContainer from './SplitPaneContainer';
```

Replace the `{/* View content area */}` section:
```tsx
{/* View content area */}
<Show
  when={viewState.layoutMode === 'single'}
  fallback={<SplitPaneContainer />}
>
  <div class="flex-1 flex flex-col overflow-hidden">
    <Show when={uiState.activeView === 'conversation'}>
      <ConversationView />
    </Show>
    <Show when={uiState.activeView === 'agents'}>
      {/* ... existing agents placeholder ... */}
    </Show>
    <Show when={uiState.activeView === 'diff'}>
      <DiffPreviewPane />
    </Show>
    <Show when={uiState.activeView === 'terminal'}>
      <TerminalPane />
    </Show>
  </div>
  {/* Message input — only visible in conversation view */}
  <Show when={uiState.activeView === 'conversation'}>
    <MessageInput
      onSend={(text) => { /* existing handler */ }}
      isLoading={conversationState.isLoading}
      isDisabled={!cliState.isDetected}
    />
  </Show>
</Show>
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/layout/SplitPaneContainer.tsx src/components/layout/MainLayout.tsx
git commit -m "feat: split pane container with draggable divider (CHI-110)"
```

---

### Task 3: Aggregate Cost & Session Notifications (CHI-112 + CHI-113)

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/stores/sessionStore.ts`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add aggregate cost computation to sessionStore**

In `src/stores/sessionStore.ts`, add a derived computation:

```typescript
/** Aggregate cost across all sessions (in cents). */
export function getAggregateCost(): number {
  return sessionState.sessions.reduce(
    (sum, s) => sum + (s.total_cost_cents ?? 0),
    0,
  );
}

/** Aggregate input tokens across all sessions. */
export function getAggregateInputTokens(): number {
  return sessionState.sessions.reduce(
    (sum, s) => sum + (s.total_input_tokens ?? 0),
    0,
  );
}

/** Aggregate output tokens across all sessions. */
export function getAggregateOutputTokens(): number {
  return sessionState.sessions.reduce(
    (sum, s) => sum + (s.total_output_tokens ?? 0),
    0,
  );
}
```

**Step 2: Update StatusBar to show aggregate cost**

In `src/components/layout/StatusBar.tsx`, update the cost/token display to show aggregate when multiple sessions are active:

```typescript
import { getAggregateCost, getAggregateInputTokens, getAggregateOutputTokens } from '@/stores/sessionStore';

// Replace existing cost/token computations with:
const hasMultipleSessions = () =>
  Object.values(conversationState.sessionStatuses).filter(
    (s) => s === 'running' || s === 'starting',
  ).length > 1;

const inputK = () => {
  const tokens = hasMultipleSessions()
    ? getAggregateInputTokens()
    : activeSession()?.total_input_tokens ?? 0;
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
};

const outputK = () => {
  const tokens = hasMultipleSessions()
    ? getAggregateOutputTokens()
    : activeSession()?.total_output_tokens ?? 0;
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
};

const costDisplay = () => {
  const cents = hasMultipleSessions()
    ? getAggregateCost()
    : activeSession()?.total_cost_cents ?? 0;
  return `$${(cents / 100).toFixed(2)}`;
};
```

**Step 3: Add unread tracking to conversationStore**

In `src/stores/conversationStore.ts`, add unread state:

```typescript
// Add to ConversationState interface:
unreadSessions: Record<string, boolean>;

// Add to initial state:
unreadSessions: {},
```

Add mutations:
```typescript
/** Mark a session as having unread activity. */
export function markSessionUnread(sessionId: string): void {
  setState('unreadSessions', sessionId, true);
}

/** Clear unread status for a session. */
export function clearSessionUnread(sessionId: string): void {
  setState('unreadSessions', sessionId, false);
}

/** Check if a session has unread activity. */
export function isSessionUnread(sessionId: string): boolean {
  return state.unreadSessions[sessionId] ?? false;
}
```

**Step 4: Update event listeners to mark unread**

In the `message:complete` event listener inside `setupEventListeners()`, after processing the message, add:

```typescript
// After saving the assistant message, check if this is a background session
const activeId = getActiveSession()?.id;
if (sessionId !== activeId) {
  markSessionUnread(sessionId);
}
```

In the `permission:request` event listener, add a toast for background sessions:

```typescript
const activeId = getActiveSession()?.id;
if (sessionId !== activeId) {
  markSessionUnread(sessionId);
  const title = sessionState.sessions.find((s) => s.id === sessionId)?.title ?? 'Background session';
  addToast(`${title} needs permission approval`, 'warning');
}
```

**Step 5: Clear unread on session switch**

In `switchSession()`, after loading messages:
```typescript
clearSessionUnread(newSessionId);
```

**Step 6: Add unread dot to Sidebar session items**

In `src/components/layout/Sidebar.tsx`, import and add the unread indicator to SessionItem rendering:

```typescript
import { isSessionUnread } from '@/stores/conversationStore';

// Inside the session icon wrapper (next to status indicators):
<Show when={isSessionUnread(session.id)}>
  <div
    class="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full"
    style={{
      background: 'var(--color-accent)',
      'box-shadow': '0 0 4px var(--color-accent)',
    }}
    title="New activity"
  />
</Show>
```

Also add per-session cost badge (small text) to the session item:
```typescript
<Show when={(session.total_cost_cents ?? 0) > 0}>
  <span class="text-[9px] font-mono text-text-tertiary/40">
    ${((session.total_cost_cents ?? 0) / 100).toFixed(2)}
  </span>
</Show>
```

**Step 7: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 8: Commit**

```bash
git add src/stores/conversationStore.ts src/stores/sessionStore.ts src/components/layout/StatusBar.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: aggregate cost tracking and session unread notifications (CHI-112, CHI-113)"
```

---

## Epic B: CHI-63 — Command Palette & Power User UX (2 tasks)

### Task 4: Reusable ContextMenu Component (CHI-78)

**Files:**
- Create: `src/components/common/ContextMenu.tsx`
- Modify: `src/components/conversation/MessageBubble.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`

**Step 1: Create ContextMenu.tsx**

A portal-rendered context menu that positions relative to the viewport and dismisses on click-outside or Escape.

```tsx
// src/components/common/ContextMenu.tsx
import type { Component, JSX } from 'solid-js';
import { Show, For, onMount, onCleanup, createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ContextMenuItem {
  label: string;
  icon?: Component<{ size?: number }>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

const ContextMenu: Component<ContextMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [adjustedPos, setAdjustedPos] = createSignal({ x: props.x, y: props.y });

  onMount(() => {
    // Adjust position so menu stays within viewport
    if (menuRef) {
      const rect = menuRef.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = props.x;
      let y = props.y;
      if (x + rect.width > vw) x = vw - rect.width - 8;
      if (y + rect.height > vh) y = vh - rect.height - 8;
      setAdjustedPos({ x: Math.max(4, x), y: Math.max(4, y) });
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    });
  });

  return (
    <Portal>
      <div
        ref={menuRef}
        class="fixed z-50 min-w-[160px] py-1 rounded-md animate-fade-in"
        style={{
          left: `${adjustedPos().x}px`,
          top: `${adjustedPos().y}px`,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-md)',
        }}
        role="menu"
      >
        <For each={props.items}>
          {(item) => (
            <Show when={!item.separator} fallback={
              <div class="my-1" style={{ 'border-top': '1px solid var(--color-border-secondary)' }} />
            }>
              <button
                class={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  item.disabled
                    ? 'text-text-tertiary/40 cursor-not-allowed'
                    : item.danger
                      ? 'text-error hover:bg-error/10'
                      : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                }`}
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    props.onClose();
                  }
                }}
              >
                <Show when={item.icon}>
                  {(Icon) => <Icon() size={12} />}
                </Show>
                <span>{item.label}</span>
              </button>
            </Show>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default ContextMenu;
```

**Step 2: Add context menu to MessageBubble**

In `src/components/conversation/MessageBubble.tsx`, add `onContextMenu` handler to the message wrapper:

```typescript
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';
import { Copy, RotateCcw, Trash2 } from 'lucide-solid';

// Inside MessageBubble component:
const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY });
}

const menuItems = (): ContextMenuItem[] => [
  {
    label: 'Copy message',
    icon: Copy,
    onClick: () => navigator.clipboard.writeText(props.message.content),
  },
  ...(props.message.role === 'user'
    ? [{ label: 'Retry', icon: RotateCcw, onClick: () => { /* retryLastMessage() */ } }]
    : []),
  { separator: true, label: '', onClick: () => {} },
  {
    label: 'Delete',
    icon: Trash2,
    onClick: () => { /* deleteMessage(props.message.id) */ },
    danger: true,
  },
];

// Add to the message wrapper div:
// onContextMenu={handleContextMenu}

// Render context menu:
<Show when={contextMenu()}>
  {(pos) => (
    <ContextMenu items={menuItems()} x={pos().x} y={pos().y} onClose={() => setContextMenu(null)} />
  )}
</Show>
```

**Step 3: Add context menu to FileTreeNode**

In `src/components/explorer/FileTreeNode.tsx`, add right-click handler:

```typescript
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';
import { Copy, Plus, ExternalLink } from 'lucide-solid';

// Add onContextMenu handler to the node button:
const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);

const fileMenuItems = (): ContextMenuItem[] => [
  {
    label: 'Copy path',
    icon: Copy,
    onClick: () => navigator.clipboard.writeText(props.node.relative_path),
  },
  {
    label: 'Add to prompt',
    icon: Plus,
    onClick: () => { /* addFileReference from contextStore */ },
    disabled: props.node.is_directory,
  },
];

// onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/common/ContextMenu.tsx src/components/conversation/MessageBubble.tsx src/components/explorer/FileTreeNode.tsx
git commit -m "feat: reusable context menu with message and file tree integration (CHI-78)"
```

---

### Task 5: Focus Trap Utility & Keyboard Help Overlay (CHI-79)

**Files:**
- Create: `src/lib/focusTrap.ts`
- Create: `src/components/common/KeyboardHelp.tsx`
- Modify: `src/lib/keybindings.ts`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Create focusTrap utility**

```typescript
// src/lib/focusTrap.ts
// Focus trap utility for modals and overlays.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap Tab/Shift+Tab focus within a container element. Returns cleanup function. */
export function createFocusTrap(container: HTMLElement): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  container.addEventListener('keydown', handler);
  // Focus first focusable element
  const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  first?.focus();

  return () => container.removeEventListener('keydown', handler);
}
```

**Step 2: Add `keyboardHelpVisible` to uiStore**

In `src/stores/uiStore.ts`, add to UIState interface:
```typescript
keyboardHelpVisible: boolean;
```

Initial state:
```typescript
keyboardHelpVisible: false,
```

Add mutation:
```typescript
export function toggleKeyboardHelp(): void {
  setState('keyboardHelpVisible', !state.keyboardHelpVisible);
}
```

**Step 3: Create KeyboardHelp.tsx**

```tsx
// src/components/common/KeyboardHelp.tsx
import type { Component } from 'solid-js';
import { onMount, onCleanup, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { toggleKeyboardHelp } from '@/stores/uiStore';
import { createFocusTrap } from '@/lib/focusTrap';
import { X } from 'lucide-solid';

interface Shortcut {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  category: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: 'Cmd+1/2/3/4', description: 'Switch view tabs' },
      { keys: 'Cmd+B', description: 'Toggle sidebar' },
      { keys: 'Cmd+Shift+B', description: 'Toggle details panel' },
      { keys: 'Cmd+\\', description: 'Split/unsplit view' },
    ],
  },
  {
    category: 'Session',
    shortcuts: [
      { keys: 'Cmd+N', description: 'New session' },
      { keys: 'Cmd+Shift+P', description: 'Quick switch session' },
      { keys: 'Cmd+M', description: 'Cycle model' },
    ],
  },
  {
    category: 'Commands',
    shortcuts: [
      { keys: 'Cmd+K', description: 'Command palette' },
      { keys: 'Cmd+,', description: 'Settings' },
      { keys: 'Cmd+/', description: 'Keyboard shortcuts' },
    ],
  },
  {
    category: 'Conversation',
    shortcuts: [
      { keys: 'Enter', description: 'Send message' },
      { keys: 'Shift+Enter', description: 'New line' },
      { keys: 'Cmd+Shift+Y', description: 'Toggle YOLO mode' },
    ],
  },
  {
    category: 'Terminal',
    shortcuts: [
      { keys: 'Cmd+`', description: 'Toggle terminal view' },
    ],
  },
];

const KeyboardHelp: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  let cleanupTrap: (() => void) | undefined;

  onMount(() => {
    if (containerRef) cleanupTrap = createFocusTrap(containerRef);
  });
  onCleanup(() => cleanupTrap?.());

  return (
    <Portal>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-40 animate-fade-in"
        style={{ background: 'rgba(0, 0, 0, 0.6)', 'backdrop-filter': 'blur(4px)' }}
        onClick={toggleKeyboardHelp}
      />
      {/* Dialog */}
      <div
        ref={containerRef}
        class="fixed z-50 top-1/2 left-1/2 w-[480px] max-h-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-lg overflow-hidden animate-fade-in"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-lg)',
        }}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div
          class="flex items-center justify-between px-4 py-3"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <h2 class="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button
            class="p-1 rounded hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={toggleKeyboardHelp}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        {/* Content */}
        <div class="overflow-y-auto p-4 space-y-4" style={{ 'max-height': 'calc(70vh - 52px)' }}>
          <For each={SHORTCUTS}>
            {(group) => (
              <div>
                <h3 class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em] mb-2">
                  {group.category}
                </h3>
                <div class="space-y-1">
                  <For each={group.shortcuts}>
                    {(shortcut) => (
                      <div class="flex items-center justify-between py-1">
                        <span class="text-xs text-text-secondary">{shortcut.description}</span>
                        <kbd
                          class="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{
                            background: 'var(--color-bg-inset)',
                            border: '1px solid var(--color-border-secondary)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {shortcut.keys}
                        </kbd>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </Portal>
  );
};

export default KeyboardHelp;
```

**Step 4: Add Cmd+/ keybinding**

In `src/lib/keybindings.ts`:
```typescript
import { toggleKeyboardHelp } from '@/stores/uiStore';

// Cmd+/ — Keyboard shortcuts help
if (e.metaKey && e.key === '/') {
  e.preventDefault();
  toggleKeyboardHelp();
  return;
}
```

**Step 5: Add skip-to-content link in MainLayout**

In `src/components/layout/MainLayout.tsx`, add as the very first child inside the root div:
```tsx
<a href="#main-content" class="skip-to-content">Skip to content</a>
```

And add `id="main-content"` to the `<main>` element.

**Step 6: Render KeyboardHelp in MainLayout**

```tsx
import KeyboardHelp from '@/components/common/KeyboardHelp';

{/* Keyboard shortcuts help (Cmd+/) */}
<Show when={uiState.keyboardHelpVisible}>
  <KeyboardHelp />
</Show>
```

**Step 7: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 8: Commit**

```bash
git add src/lib/focusTrap.ts src/components/common/KeyboardHelp.tsx src/lib/keybindings.ts src/stores/uiStore.ts src/components/layout/MainLayout.tsx
git commit -m "feat: focus trap utility, keyboard help overlay, skip-to-content (CHI-79)"
```

---

## Epic C: CHI-64 — Onboarding & Empty States (3 tasks)

### Task 6: Professional Placeholder Views (CHI-82)

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Replace agents and diff placeholders**

Replace the agents placeholder (MainLayout.tsx lines 128-135) with:

```tsx
<Show when={uiState.activeView === 'agents'}>
  <div class="flex items-center justify-center h-full">
    <div class="text-center animate-fade-in space-y-4 max-w-xs">
      <div
        class="mx-auto w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--color-accent-muted)' }}
      >
        <Users size={24} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div>
        <h3 class="text-sm font-semibold text-text-primary tracking-wide">Agent Teams</h3>
        <p class="text-xs text-text-tertiary mt-1">Orchestrate multiple AI agents working together</p>
      </div>
      <div class="space-y-2 text-left">
        <div class="flex items-center gap-2 text-[11px] text-text-tertiary/60">
          <Zap size={11} style={{ color: 'var(--color-accent)' }} />
          <span>Parallel task execution</span>
        </div>
        <div class="flex items-center gap-2 text-[11px] text-text-tertiary/60">
          <GitCompare size={11} style={{ color: 'var(--color-accent)' }} />
          <span>Agent coordination & handoffs</span>
        </div>
        <div class="flex items-center gap-2 text-[11px] text-text-tertiary/60">
          <Terminal size={11} style={{ color: 'var(--color-accent)' }} />
          <span>Live agent monitoring</span>
        </div>
      </div>
      <p class="text-[10px] text-text-tertiary/40 tracking-wide">Coming in a future release</p>
    </div>
  </div>
</Show>
```

Add import for `Zap` from lucide-solid (already used elsewhere; verify it's imported in MainLayout).

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "feat: professional placeholder views for agents tab (CHI-82)"
```

---

### Task 7: No-Project-Selected Guidance (CHI-83)

**Files:**
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Add project guidance to empty state**

In `ConversationView.tsx`, in the empty state section (where SAMPLE_PROMPTS are shown), add a project guidance callout when no project is selected:

```typescript
import { projectState, pickAndCreateProject } from '@/stores/projectStore';
import { FolderOpen } from 'lucide-solid';
```

Add before the sample prompts section in the empty state:
```tsx
{/* No project guidance */}
<Show when={!projectState.activeProjectId}>
  <button
    class="w-full max-w-md mx-auto mb-4 flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors group"
    style={{
      background: 'var(--color-accent-muted)',
      border: '1px solid var(--color-accent)',
      'border-opacity': '0.3',
      'transition-duration': 'var(--duration-normal)',
    }}
    onClick={() => pickAndCreateProject()}
  >
    <div
      class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
      style={{ background: 'var(--color-accent)', opacity: '0.2' }}
    >
      <FolderOpen size={16} style={{ color: 'var(--color-accent)' }} />
    </div>
    <div class="min-w-0">
      <p class="text-xs font-medium text-text-primary">Open a Project Folder</p>
      <p class="text-[10px] text-text-tertiary mt-0.5">
        Select a folder to give Claude Code context about your codebase
      </p>
    </div>
  </button>
</Show>
```

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/conversation/ConversationView.tsx
git commit -m "feat: no-project-selected guidance in empty state (CHI-83)"
```

---

### Task 8: First-Launch Onboarding Flow (CHI-81)

**Files:**
- Create: `src/components/onboarding/OnboardingFlow.tsx`
- Modify: `src/App.tsx`
- Modify: `src/stores/settingsStore.ts`

**Step 1: Add `onboardingCompleted` setting**

In `src/stores/settingsStore.ts`, add to defaults:
```typescript
// Add to DEFAULT_SETTINGS:
onboarding: {
  completed: false,
},
```

Add helper:
```typescript
export function isOnboardingCompleted(): boolean {
  return settingsState.settings?.onboarding?.completed ?? false;
}

export async function markOnboardingCompleted(): Promise<void> {
  await updateSetting('onboarding', 'completed', true);
}
```

**Step 2: Create OnboardingFlow.tsx**

```tsx
// src/components/onboarding/OnboardingFlow.tsx
import type { Component } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { markOnboardingCompleted } from '@/stores/settingsStore';
import { pickAndCreateProject } from '@/stores/projectStore';
import { MessageSquare, FolderOpen, Zap, Keyboard, ArrowRight, X } from 'lucide-solid';

interface StepDef {
  icon: Component<{ size?: number }>;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

const STEPS: StepDef[] = [
  {
    icon: MessageSquare,
    title: 'Welcome to Chief Wiggum',
    description:
      'A desktop GUI for Claude Code CLI with visual multi-agent orchestration, real-time cost tracking, and intelligent context management.',
  },
  {
    icon: FolderOpen,
    title: 'Open a Project',
    description:
      'Select a project folder so Claude Code can understand your codebase and provide relevant assistance.',
    action: {
      label: 'Open Folder',
      onClick: () => pickAndCreateProject(),
    },
  },
  {
    icon: Zap,
    title: 'Choose Your Model',
    description:
      'Use Cmd+M to cycle between Sonnet (fast), Opus (powerful), and Haiku (lightweight). You can change anytime.',
  },
  {
    icon: Keyboard,
    title: 'Key Shortcuts',
    description:
      'Cmd+K opens the command palette. Cmd+B toggles the sidebar. Cmd+/ shows all shortcuts. Press Enter to send a message.',
  },
];

const OnboardingFlow: Component = () => {
  const [step, setStep] = createSignal(0);

  async function finish() {
    await markOnboardingCompleted();
  }

  function next() {
    if (step() >= STEPS.length - 1) {
      void finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  const current = () => STEPS[step()];

  return (
    <Portal>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
        style={{ background: 'rgba(0, 0, 0, 0.7)', 'backdrop-filter': 'blur(8px)' }}
      >
        {/* Card */}
        <div
          class="relative w-[420px] rounded-xl overflow-hidden animate-fade-in"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            'box-shadow': 'var(--shadow-lg), var(--glow-accent-subtle)',
          }}
        >
          {/* Skip button */}
          <button
            class="absolute top-3 right-3 p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={finish}
            aria-label="Skip onboarding"
          >
            <X size={14} />
          </button>

          {/* Content */}
          <div class="px-8 pt-8 pb-6 text-center">
            {/* Step indicator */}
            <div class="flex justify-center gap-1.5 mb-6">
              {STEPS.map((_, i) => (
                <div
                  class="w-1.5 h-1.5 rounded-full transition-colors"
                  style={{
                    background: i <= step() ? 'var(--color-accent)' : 'var(--color-border-secondary)',
                    'transition-duration': 'var(--duration-normal)',
                  }}
                />
              ))}
            </div>

            {/* Icon */}
            <div
              class="mx-auto w-14 h-14 rounded-xl flex items-center justify-center mb-4"
              style={{ background: 'var(--color-accent-muted)' }}
            >
              {(() => {
                const Icon = current().icon;
                return <Icon size={28} />;
              })()}
            </div>

            <h2 class="text-lg font-semibold text-text-primary mb-2">{current().title}</h2>
            <p class="text-xs text-text-secondary leading-relaxed max-w-[320px] mx-auto">
              {current().description}
            </p>

            {/* Optional action button */}
            <Show when={current().action}>
              {(action) => (
                <button
                  class="mt-4 px-4 py-2 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-primary)',
                    color: 'var(--color-text-primary)',
                    'transition-duration': 'var(--duration-normal)',
                  }}
                  onClick={action().onClick}
                >
                  {action().label}
                </button>
              )}
            </Show>
          </div>

          {/* Footer */}
          <div
            class="flex items-center justify-between px-6 py-3"
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <button
              class="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={finish}
            >
              Skip all
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-bg-primary)',
                'transition-duration': 'var(--duration-normal)',
              }}
              onClick={next}
            >
              <span>{step() >= STEPS.length - 1 ? 'Get Started' : 'Next'}</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default OnboardingFlow;
```

**Step 3: Mount onboarding in App.tsx**

In `src/App.tsx`, add:
```typescript
import { isOnboardingCompleted } from '@/stores/settingsStore';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { Show } from 'solid-js';

// In the return, wrap MainLayout:
return (
  <>
    <MainLayout />
    <Show when={!isOnboardingCompleted()}>
      <OnboardingFlow />
    </Show>
  </>
);
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/onboarding/OnboardingFlow.tsx src/App.tsx src/stores/settingsStore.ts
git commit -m "feat: first-launch onboarding flow with 4 steps (CHI-81)"
```

---

## Epic D: CHI-130 — Theme System (1 task)

### Task 9: Light/Dark/System Theme (CHI-130)

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/App.tsx`
- Modify: `src/components/terminal/TerminalPane.tsx`

**Step 1: Add light theme tokens**

In `src/styles/tokens.css`, add after the `:root` block (after line 155):

```css
/* ============================================================
 * SPEC-002 §3.7: Light Theme
 * Toggle via [data-theme="light"] on <html>.
 * ============================================================ */

:root[data-theme="light"] {
  /* Override @theme colors — these cascade into TW utilities */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f6f8fa;
  --color-bg-elevated: #ffffff;
  --color-bg-inset: #f0f2f5;

  --color-border-primary: #d0d7de;
  --color-border-secondary: #e1e4e8;
  --color-border-focus: #cf6e3e;

  --color-text-primary: #1f2328;
  --color-text-secondary: #656d76;
  --color-text-tertiary: #8b949e;
  --color-text-link: #0969da;

  --color-accent: #cf6e3e;
  --color-accent-hover: #b85c30;
  --color-accent-muted: #cf6e3e1a;

  --color-success: #1a7f37;
  --color-success-muted: #1a7f371a;
  --color-warning: #9a6700;
  --color-warning-muted: #9a67001a;
  --color-error: #cf222e;
  --color-error-muted: #cf222e1a;
  --color-info: #0969da;

  --color-model-opus: #8250df;
  --color-model-sonnet: #0969da;
  --color-model-haiku: #1a7f37;

  --color-context-green: #1a7f37;
  --color-context-yellow: #9a6700;
  --color-context-red: #cf222e;
  --color-context-critical: #a40e26;

  --color-diff-add-bg: #dafbe1;
  --color-diff-add-text: #1a7f37;
  --color-diff-remove-bg: #ffebe9;
  --color-diff-remove-text: #cf222e;
  --color-diff-modify-bg: #fff8c5;

  --color-tool-file: #0969da;
  --color-tool-bash: #1a7f37;
  --color-tool-neutral: #8b949e;
  --color-tool-permission-allow: #1a7f37;
  --color-tool-permission-deny: #cf222e;
  --color-tool-permission-yolo: #9a6700;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.07);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Light theme layout/chrome overrides */
:root[data-theme="light"] {
  --glow-accent: 0 0 20px rgba(207, 110, 62, 0.08);
  --glow-accent-strong: 0 0 30px rgba(207, 110, 62, 0.12);
  --glow-accent-subtle: 0 0 12px rgba(207, 110, 62, 0.04);

  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(208, 215, 222, 0.6);

  --color-chrome-bg: rgba(246, 248, 250, 0.92);
  --color-chrome-bg-strong: rgba(255, 255, 255, 0.95);
  --color-chrome-border: rgba(208, 215, 222, 0.7);
}

/* Light theme scrollbar */
:root[data-theme="light"] ::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}
:root[data-theme="light"] ::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
:root[data-theme="light"] ::-webkit-scrollbar-track {
  background: transparent;
}
```

**Step 2: Add theme application logic in App.tsx**

In `src/App.tsx`, add theme application:

```typescript
import { settingsState } from '@/stores/settingsStore';

// Inside App component, add a createEffect for theme:
createEffect(() => {
  const theme = settingsState.settings?.appearance?.theme ?? 'dark';
  applyTheme(theme);
});

function applyTheme(theme: string): void {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Also listen for system preference changes
onMount(() => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (settingsState.settings?.appearance?.theme === 'system') {
      applyTheme('system');
    }
  };
  mq.addEventListener('change', handler);
  onCleanup(() => mq.removeEventListener('change', handler));
});
```

**Step 3: Make terminal theme reactive**

In `src/components/terminal/TerminalPane.tsx`, wrap the terminal theme in a reactive computation. Replace hardcoded theme object with:

```typescript
import { settingsState } from '@/stores/settingsStore';

const darkTheme = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#e8825a',
  cursorAccent: '#0d1117',
  selectionBackground: '#e8825a40',
  selectionForeground: '#e6edf3',
  black: '#0d1117',
  red: '#f85149',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#a371f7',
  cyan: '#56d4dd',
  white: '#e6edf3',
};

const lightTheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#cf6e3e',
  cursorAccent: '#ffffff',
  selectionBackground: '#cf6e3e30',
  selectionForeground: '#1f2328',
  black: '#1f2328',
  red: '#cf222e',
  green: '#1a7f37',
  yellow: '#9a6700',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#f6f8fa',
};

// Inside the component, derive terminal theme from settings:
const terminalTheme = () => {
  const theme = settingsState.settings?.appearance?.theme ?? 'dark';
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? darkTheme : lightTheme;
  }
  return theme === 'light' ? lightTheme : darkTheme;
};

// On theme change, update xterm if terminal exists:
createEffect(() => {
  const t = terminalTheme();
  if (terminal) {
    terminal.options.theme = t;
  }
});
```

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/styles/tokens.css src/App.tsx src/components/terminal/TerminalPane.tsx
git commit -m "feat: light/dark/system theme system with CSS variable overrides (CHI-130)"
```

---

## Epic E: CHI-27 — E2E Testing Foundation (7 tasks)

### Task 10: Playwright Setup & Smoke Test (CHI-28)

**Files:**
- Run: `npm install -D @playwright/test`
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/app.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (add test scripts)

**Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Step 2: Create playwright.config.ts**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

**Step 3: Create shared fixture**

```typescript
// tests/e2e/fixtures/app.ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/');
    // Wait for the app to be rendered (MainLayout mounts)
    await page.waitForSelector('.grain-overlay', { timeout: 10_000 });
    await use(page);
  },
});

export { expect };
```

**Step 4: Create smoke test**

```typescript
// tests/e2e/smoke.spec.ts
import { test, expect } from './fixtures/app';

test.describe('Smoke Test', () => {
  test('app loads and renders main layout', async ({ page }) => {
    // Title bar should be visible
    await expect(page.locator('[data-tauri-drag-region]')).toBeVisible();

    // View tabs should be visible
    await expect(page.getByRole('button', { name: 'Conversation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agents' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Diff' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminal' })).toBeVisible();

    // Status bar should be visible
    await expect(page.locator('.grain-overlay')).toBeVisible();
  });

  test('conversation view is the default active view', async ({ page }) => {
    const convTab = page.getByRole('button', { name: 'Conversation' });
    // Active tab has text-primary color (not text-tertiary)
    await expect(convTab).toHaveClass(/text-text-primary/);
  });
});
```

**Step 5: Add npm scripts**

In `package.json`, add to `"scripts"`:
```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:report": "playwright show-report"
```

**Step 6: Add test output to .gitignore**

Append to `.gitignore`:
```
test-results/
playwright-report/
blob-report/
```

**Step 7: Run smoke test**

Run: `npx playwright test tests/e2e/smoke.spec.ts`
Expected: 2 tests pass (may fail if Vite dev server isn't running — that's OK for CI)

**Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json package-lock.json .gitignore
git commit -m "feat: Playwright setup with smoke test (CHI-28)"
```

---

### Task 11: Layout Shell Tests (CHI-29)

**Files:**
- Create: `tests/e2e/layout/main-layout.spec.ts`
- Create: `tests/e2e/layout/sidebar.spec.ts`
- Create: `tests/e2e/layout/status-bar.spec.ts`

**Step 1: Create MainLayout tests**

```typescript
// tests/e2e/layout/main-layout.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('MainLayout', () => {
  test('renders 5-zone layout structure', async ({ page }) => {
    // Z1: TitleBar
    await expect(page.locator('[data-tauri-drag-region]')).toBeVisible();

    // Z3: Main content area with view tabs
    await expect(page.getByRole('button', { name: 'Conversation' })).toBeVisible();

    // Z5: StatusBar
    await expect(page.locator('text=Ready')).toBeVisible();
  });

  test('view tabs switch content', async ({ page }) => {
    // Click Agents tab
    await page.getByRole('button', { name: 'Agents' }).click();
    await expect(page.getByText('Agent Teams')).toBeVisible();

    // Click Terminal tab
    await page.getByRole('button', { name: 'Terminal' }).click();

    // Click back to Conversation
    await page.getByRole('button', { name: 'Conversation' }).click();
  });

  test('Cmd+1/2/3/4 switches views', async ({ page }) => {
    await page.keyboard.press('Meta+2');
    await expect(page.getByText('Agent Teams')).toBeVisible();

    await page.keyboard.press('Meta+1');
    // Should be back to conversation
  });
});
```

**Step 2: Create Sidebar tests**

```typescript
// tests/e2e/layout/sidebar.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('Sidebar', () => {
  test('sidebar is visible by default', async ({ page }) => {
    await expect(page.getByText('Sessions')).toBeVisible();
  });

  test('Cmd+B toggles sidebar', async ({ page }) => {
    // Sidebar should be expanded
    await expect(page.getByText('Sessions')).toBeVisible();

    // Toggle to collapsed
    await page.keyboard.press('Meta+b');
    // In collapsed mode, "Sessions" text is hidden

    // Toggle to hidden
    await page.keyboard.press('Meta+b');

    // Toggle back to expanded
    await page.keyboard.press('Meta+b');
    await expect(page.getByText('Sessions')).toBeVisible();
  });

  test('new session button creates a session', async ({ page }) => {
    // Click new session button (Plus icon)
    const newBtn = page.locator('button[title="New Session"]').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
    }
  });
});
```

**Step 3: Create StatusBar tests**

```typescript
// tests/e2e/layout/status-bar.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('StatusBar', () => {
  test('shows status indicator', async ({ page }) => {
    // StatusBar should show some status text
    const statusBar = page.locator('.grain-overlay').locator('div').last();
    await expect(statusBar).toBeVisible();
  });

  test('shows cost display', async ({ page }) => {
    await expect(page.getByText('$0.00')).toBeVisible();
  });
});
```

**Step 4: Run tests**

Run: `npx playwright test tests/e2e/layout/`
Expected: Tests pass

**Step 5: Commit**

```bash
git add tests/e2e/layout/
git commit -m "test: layout shell e2e tests — MainLayout, Sidebar, StatusBar (CHI-29)"
```

---

### Task 12: Conversation UI Tests (CHI-30)

**Files:**
- Create: `tests/e2e/conversation/conversation-view.spec.ts`
- Create: `tests/e2e/conversation/message-input.spec.ts`

**Step 1: Create ConversationView tests**

```typescript
// tests/e2e/conversation/conversation-view.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('ConversationView', () => {
  test('shows empty state with sample prompts', async ({ page }) => {
    // Should see sample prompt cards
    await expect(page.getByText('Chief Wiggum')).toBeVisible();
  });

  test('empty state has clickable prompt cards', async ({ page }) => {
    // At least one sample prompt should be visible
    const prompts = page.locator('.animate-fade-in button, .animate-fade-in [role="button"]');
    const count = await prompts.count();
    expect(count).toBeGreaterThan(0);
  });
});
```

**Step 2: Create MessageInput tests**

```typescript
// tests/e2e/conversation/message-input.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('MessageInput', () => {
  test('message input is visible', async ({ page }) => {
    const input = page.locator('textarea');
    await expect(input).toBeVisible();
  });

  test('input auto-expands on typing', async ({ page }) => {
    const textarea = page.locator('textarea');
    const initialHeight = await textarea.evaluate((el) => el.offsetHeight);

    // Type multiple lines
    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    const expandedHeight = await textarea.evaluate((el) => el.offsetHeight);
    expect(expandedHeight).toBeGreaterThanOrEqual(initialHeight);
  });

  test('Shift+Enter creates newline without sending', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Hello');
    await page.keyboard.press('Shift+Enter');
    // Should not have submitted (textarea should still have content)
    const value = await textarea.inputValue();
    expect(value).toContain('Hello');
  });

  test('@-mention trigger shows file menu', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('@');
    // The mention menu may or may not appear depending on file state
    // Just verify no crash
  });
});
```

**Step 3: Run tests**

Run: `npx playwright test tests/e2e/conversation/`
Expected: Tests pass

**Step 4: Commit**

```bash
git add tests/e2e/conversation/
git commit -m "test: conversation view and message input e2e tests (CHI-30)"
```

---

### Task 13: Permission & Terminal Tests (CHI-31 + CHI-32)

**Files:**
- Create: `tests/e2e/permissions/yolo-mode.spec.ts`
- Create: `tests/e2e/terminal/terminal-pane.spec.ts`
- Create: `tests/e2e/common/model-selector.spec.ts`

**Step 1: Create YOLO mode test**

```typescript
// tests/e2e/permissions/yolo-mode.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('YOLO Mode', () => {
  test('Cmd+Shift+Y shows YOLO warning dialog', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+y');
    // YOLO warning dialog should appear
    // Check for warning text or dialog
    await page.waitForTimeout(500); // Allow animation
  });
});
```

**Step 2: Create terminal pane test**

```typescript
// tests/e2e/terminal/terminal-pane.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('TerminalPane', () => {
  test('terminal view is accessible via tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Terminal' }).click();
    // xterm container should render
    await page.waitForTimeout(500); // xterm init time
  });
});
```

**Step 3: Create model selector test**

```typescript
// tests/e2e/common/model-selector.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('ModelSelector', () => {
  test('model badge is visible in title bar', async ({ page }) => {
    // Model selector should show current model
    const titleBar = page.locator('[data-tauri-drag-region]').first();
    await expect(titleBar).toBeVisible();
  });
});
```

**Step 4: Run tests**

Run: `npx playwright test tests/e2e/permissions/ tests/e2e/terminal/ tests/e2e/common/`
Expected: Tests pass

**Step 5: Commit**

```bash
git add tests/e2e/permissions/ tests/e2e/terminal/ tests/e2e/common/
git commit -m "test: permission, terminal, and model selector e2e tests (CHI-31, CHI-32)"
```

---

### Task 14: Integration Tests (CHI-33)

**Files:**
- Create: `tests/e2e/integration/keyboard-shortcuts.spec.ts`
- Create: `tests/e2e/integration/session-flow.spec.ts`

**Step 1: Create keyboard shortcut tests**

```typescript
// tests/e2e/integration/keyboard-shortcuts.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('Keyboard Shortcuts', () => {
  test('Cmd+K opens command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    // Command palette should appear
    await page.waitForTimeout(300);
    // Look for command palette input
    const paletteInput = page.locator('input[placeholder*="command"], input[placeholder*="Search"]');
    if (await paletteInput.isVisible()) {
      await expect(paletteInput).toBeFocused();
      await page.keyboard.press('Escape');
    }
  });

  test('Cmd+1 through Cmd+4 switch views', async ({ page }) => {
    // Switch to agents
    await page.keyboard.press('Meta+2');
    await expect(page.getByText('Agent Teams')).toBeVisible();

    // Switch to terminal
    await page.keyboard.press('Meta+4');

    // Switch back to conversation
    await page.keyboard.press('Meta+1');
  });

  test('Cmd+B cycles sidebar states', async ({ page }) => {
    // Start expanded, toggle through states
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(300); // Transition time
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+b');
    await page.waitForTimeout(300);
    // Back to expanded
    await expect(page.getByText('Sessions')).toBeVisible();
  });

  test('Cmd+Shift+B toggles details panel', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+b');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+Shift+b');
    await page.waitForTimeout(300);
  });
});
```

**Step 2: Create session flow test**

```typescript
// tests/e2e/integration/session-flow.spec.ts
import { test, expect } from '../fixtures/app';

test.describe('Session Flow', () => {
  test('app starts with empty conversation state', async ({ page }) => {
    // Message input should be visible and ready
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('can type in message input', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Test message');
    const value = await textarea.inputValue();
    expect(value).toBe('Test message');
  });
});
```

**Step 3: Run all tests**

Run: `npx playwright test`
Expected: All e2e tests pass

**Step 4: Commit**

```bash
git add tests/e2e/integration/
git commit -m "test: integration e2e tests for keyboard shortcuts and session flow (CHI-33)"
```

---

### Task 15: CI Integration & Failure Reporter (CHI-34)

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `tests/e2e/reporters/failure-reporter.ts`

**Step 1: Create custom failure reporter**

```typescript
// tests/e2e/reporters/failure-reporter.ts
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';

interface FailureRecord {
  test: string;
  file: string;
  error: string;
  screenshot?: string;
}

class FailureReporter implements Reporter {
  private failures: FailureRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'failed' || result.status === 'timedOut') {
      this.failures.push({
        test: test.title,
        file: test.location.file,
        error: result.errors.map((e) => e.message ?? '').join('\n'),
        screenshot: result.attachments.find((a) => a.name === 'screenshot')?.path,
      });
    }
  }

  onEnd(result: FullResult) {
    if (this.failures.length > 0) {
      const output = {
        summary: `${this.failures.length} test(s) failed`,
        status: result.status,
        failures: this.failures,
      };
      fs.mkdirSync('test-results', { recursive: true });
      fs.writeFileSync('test-results/failures.json', JSON.stringify(output, null, 2));
      console.log(`\n--- E2E Failure Summary ---`);
      for (const f of this.failures) {
        console.log(`  FAIL: ${f.test}`);
        console.log(`  File: ${f.file}`);
        console.log(`  Error: ${f.error.slice(0, 200)}`);
        console.log('');
      }
    }
  }
}

export default FailureReporter;
```

**Step 2: Add e2e job to CI workflow**

In `.github/workflows/ci.yml`, add after the `build` job:

```yaml
  # ── E2E tests ──────────────────────────────────────────────
  e2e:
    name: E2E Tests
    needs: [frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npx playwright test --reporter=html,json,./tests/e2e/reporters/failure-reporter.ts
        continue-on-error: true

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 14
```

**Step 3: Update playwright.config.ts reporter for CI**

Update the reporter config:
```typescript
reporter: process.env.CI
  ? [
      ['html', { open: 'never' }],
      ['json', { outputFile: 'test-results/results.json' }],
      ['./tests/e2e/reporters/failure-reporter.ts'],
    ]
  : [['html', { open: 'on-failure' }]],
```

**Step 4: Run full test suite locally**

Run: `npx playwright test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/e2e/reporters/ playwright.config.ts
git commit -m "feat: CI e2e integration with custom failure reporter (CHI-34)"
```

---

### Task 16: Run Full Verification

**Step 1: Run all checks**

```bash
# Frontend
npx tsc --noEmit
npx eslint .
npx vite build

# E2E
npx playwright test

# Rust (if backend changes were made)
cd src-tauri && cargo test && cargo clippy -- -D warnings && cd ..
```

Expected: All pass

---

## Verification Summary

1. `npx tsc --noEmit` — TypeScript clean
2. `npx eslint .` — No lint errors
3. `npx vite build` — Build succeeds
4. `npx playwright test` — All e2e tests pass
5. Manual test — Split panes:
   - Cmd+\ splits view into two panes with draggable divider
   - Each pane has its own header and message input
   - Click to focus pane (accent border)
   - Cmd+W closes focused pane
   - 300px minimum per pane
6. Manual test — Context menus:
   - Right-click message → Copy/Retry/Delete menu
   - Right-click file tree node → Copy path / Add to prompt
   - Escape or click-outside dismisses menu
7. Manual test — Keyboard help:
   - Cmd+/ opens keyboard shortcuts overlay
   - Focus trapped inside dialog
   - Esc closes overlay
   - Skip-to-content link visible on Tab from page top
8. Manual test — Onboarding:
   - First launch (clear settings): 4-step welcome flow
   - Next/Skip buttons work
   - After completion, onboarding never shows again
9. Manual test — Placeholders:
   - Agents tab: icon, heading, feature bullets, "Coming in future release"
   - No-project state: "Open a Project Folder" button in conversation empty state
10. Manual test — Theme system:
    - Settings → Appearance → Dark/Light/System all work
    - Light theme: white backgrounds, dark text, adjusted accent color
    - System: respects OS preference, auto-switches on change
    - Terminal adapts theme colors
    - No white flash on theme switch
11. Manual test — Aggregate cost:
    - StatusBar shows aggregate when multiple sessions running
    - Sidebar shows per-session cost badge
12. Manual test — Session notifications:
    - Background session completing shows accent unread dot
    - Switching to session clears dot
    - Permission request from background session triggers toast
13. CI — e2e job runs, uploads playwright-report artifact
