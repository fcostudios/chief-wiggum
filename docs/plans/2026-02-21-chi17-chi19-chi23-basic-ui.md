# CHI-17, CHI-19, CHI-23: Basic UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the 5-zone application layout shell, message input component, and permission dialog — the foundational UI that all subsequent features mount into.

**Architecture:** CSS flexbox layout with 5 zones (TitleBar, Sidebar, MainContent, DetailsPanel, StatusBar). SolidJS reactive stores drive panel visibility. Custom title bar with `decorations: false` for cross-platform consistency. Permission dialog uses modal overlay with focus trap and keyboard shortcuts.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4 with SPEC-002 tokens, Lucide Icons, @tauri-apps/api for window controls

**Specs to reference:**
- SPEC-003 §2 (Global Layout), §3.1 (Message Input), §3.7 (Permission Dialog), §6.3 (Permission State Machine)
- SPEC-002 (all layout constants, component tokens, accessibility)
- SPEC-001 §7 (Permission System), §10.1–10.4 (UI Layout, Keybindings)
- SPEC-004 §2 (File Structure), §4.1 (IPC Commands), §6 (Types)
- GUIDE-001 (Coding Standards — component structure, store pattern, no inline styles except dynamic values)

---

## Part A: CHI-17 — Main Layout Shell (5-zone structure)

### Task 1: Install dependencies and create UI store

**Files:**
- Modify: `package.json`
- Create: `src/stores/uiStore.ts`

**Step 1: Install lucide-solid and @tauri-apps/api**

```bash
npm install lucide-solid @tauri-apps/api
```

`lucide-solid` — Icon library per SPEC-002 §9 ("Lucide Icons, MIT licensed, tree-shakeable").
`@tauri-apps/api` — Tauri frontend API for window controls and IPC.

**Step 2: Create `src/stores/uiStore.ts`**

This store manages panel visibility, active view, and permission dialog state. Follows the store pattern from GUIDE-001 §3.3: module-level `createStore`, read-only exports, mutation via exported functions.

```typescript
// src/stores/uiStore.ts
// UI state: panel visibility, active view, modal stack.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import type { PermissionRequest } from '@/lib/types';

export type ActiveView = 'conversation' | 'agents' | 'diff' | 'terminal';

interface UIState {
  sidebarVisible: boolean;
  detailsPanelVisible: boolean;
  activeView: ActiveView;
  permissionRequest: PermissionRequest | null;
}

const [state, setState] = createStore<UIState>({
  sidebarVisible: true,
  detailsPanelVisible: true,
  activeView: 'conversation',
  permissionRequest: null,
});

export function toggleSidebar() {
  setState('sidebarVisible', (prev) => !prev);
}

export function toggleDetailsPanel() {
  setState('detailsPanelVisible', (prev) => !prev);
}

export function setActiveView(view: ActiveView) {
  setState('activeView', view);
}

export function showPermissionDialog(request: PermissionRequest) {
  setState('permissionRequest', request);
}

export function dismissPermissionDialog() {
  setState('permissionRequest', null);
}

export { state as uiState };
```

**Step 3: Add PermissionRequest type to `src/lib/types.ts`**

Append to the existing file — mirrors the Rust `PermissionRequest` struct from `src-tauri/src/bridge/permission.rs`:

```typescript
/** Permission request from CLI bridge (mirrors Rust PermissionRequest) */
export interface PermissionRequest {
  request_id: string;
  tool: string;
  command: string;
  file_path: string | null;
  risk_level: 'low' | 'medium' | 'high';
}

/** Permission response action (mirrors Rust PermissionAction) */
export type PermissionAction = 'Approve' | 'Deny' | 'AlwaysAllow';

/** Permission response sent back to backend */
export interface PermissionResponse {
  request_id: string;
  action: PermissionAction;
  pattern: string | null;
}
```

**Step 4: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass with no errors.

---

### Task 2: Create TitleBar component

**Files:**
- Create: `src/components/layout/TitleBar.tsx`
- Modify: `src-tauri/tauri.conf.json` (set `decorations: false`)
- Modify: `src-tauri/capabilities/default.json` (add window permissions)

**Step 1: Update Tauri config — remove native decorations**

In `src-tauri/tauri.conf.json`, add `"decorations": false` to the window config:

```json
{
  "app": {
    "windows": [
      {
        "title": "Chief Wiggum",
        "width": 1200,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 640,
        "resizable": true,
        "fullscreen": false,
        "decorations": false
      }
    ]
  }
}
```

**Step 2: Update capabilities — add window permissions**

In `src-tauri/capabilities/default.json`, add window permissions so the frontend can minimize/maximize/close:

```json
{
  "identifier": "default",
  "description": "Default capability set for Chief Wiggum",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-set-focus",
    "core:window:allow-start-dragging",
    "shell:allow-open",
    "shell:allow-execute",
    "shell:default"
  ]
}
```

**Step 3: Create `src/components/layout/TitleBar.tsx`**

Custom title bar — 40px height per SPEC-002. Drag region in center spacer. Window controls on right. Hamburger toggle on left.

```tsx
// src/components/layout/TitleBar.tsx
// Custom title bar (40px) per SPEC-003 §2 Z1.
// Left: hamburger (sidebar toggle) + app name.
// Right: window controls (minimize, maximize, close).
// Center spacer: data-tauri-drag-region for window dragging.

import type { Component } from 'solid-js';
import { Menu, Minus, Maximize2, X } from 'lucide-solid';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toggleSidebar } from '@/stores/uiStore';

const TitleBar: Component = () => {
  const appWindow = getCurrentWindow();

  return (
    <header
      class="flex items-center bg-bg-secondary border-b border-border-primary select-none"
      style={{ height: 'var(--title-bar-height)' }}
    >
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
      </div>

      {/* Center: drag region */}
      <div class="flex-1 h-full" data-tauri-drag-region />

      {/* Right: window controls */}
      <div class="flex items-center">
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
      </div>
    </header>
  );
};

export default TitleBar;
```

**Step 4: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass. (Build verification deferred to Task 6 when layout is assembled.)

---

### Task 3: Create Sidebar component

**Files:**
- Create: `src/components/layout/Sidebar.tsx`

**Step 1: Create `src/components/layout/Sidebar.tsx`**

Left sidebar — 240px per SPEC-002. Contains session list placeholder and "New Session" button. Transitions width for smooth show/hide.

```tsx
// src/components/layout/Sidebar.tsx
// Left sidebar (240px) per SPEC-003 §2 Z2.
// Sections: Sessions list (placeholder), New Session button.
// Width managed by parent via uiState.sidebarVisible.

import type { Component } from 'solid-js';
import { Plus } from 'lucide-solid';

const Sidebar: Component = () => {
  return (
    <nav class="flex flex-col h-full" aria-label="Sidebar">
      {/* Sessions header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-secondary">
        <span class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Sessions
        </span>
      </div>

      {/* Session list — placeholder */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <p class="text-xs text-text-tertiary px-2 py-4 text-center">No active sessions</p>
      </div>

      {/* New session button */}
      <div class="p-2 border-t border-border-secondary">
        <button
          class="flex items-center justify-center gap-2 w-full py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          aria-label="New session"
        >
          <Plus size={14} />
          <span>New Session</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
```

**Step 2: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass.

---

### Task 4: Create StatusBar component

**Files:**
- Create: `src/components/layout/StatusBar.tsx`

**Step 1: Create `src/components/layout/StatusBar.tsx`**

Bottom status bar — 32px per SPEC-002. Three zones: left (status), center (tokens), right (cost).

```tsx
// src/components/layout/StatusBar.tsx
// Status bar (32px) per SPEC-003 §2 Z5.
// Left: agent/model status. Center: token usage. Right: cost pill.

import type { Component } from 'solid-js';

const StatusBar: Component = () => {
  return (
    <footer
      class="flex items-center justify-between px-3 bg-bg-secondary border-t border-border-primary text-xs text-text-secondary font-mono select-none"
      style={{ height: 'var(--status-bar-height)' }}
      role="status"
    >
      {/* Left: status */}
      <span>Ready</span>

      {/* Center: token usage */}
      <span class="text-text-tertiary">&ndash; / &ndash;</span>

      {/* Right: cost */}
      <span>$0.00</span>
    </footer>
  );
};

export default StatusBar;
```

**Step 2: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass.

---

### Task 5: Create DetailsPanel component

**Files:**
- Create: `src/components/layout/DetailsPanel.tsx`

**Step 1: Create `src/components/layout/DetailsPanel.tsx`**

Right details panel — 280px per SPEC-002. Collapsible sections for Context and Cost. Uses local signals for section collapse state per GUIDE-001 (no IPC calls inside stores for UI-only state).

```tsx
// src/components/layout/DetailsPanel.tsx
// Right details panel (280px) per SPEC-003 §2 Z4.
// Sections: Context Meter (placeholder), Cost Breakdown (placeholder).
// Each section is a collapsible accordion.

import type { Component } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';

interface SectionProps {
  title: string;
  children: any;
  defaultOpen?: boolean;
}

const CollapsibleSection: Component<SectionProps> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);

  return (
    <section class="border-b border-border-secondary">
      <button
        class="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider hover:bg-bg-elevated transition-colors"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open()}
      >
        <Show when={open()} fallback={<ChevronRight size={12} />}>
          <ChevronDown size={12} />
        </Show>
        {props.title}
      </button>
      <Show when={open()}>
        <div class="px-3 pb-3">{props.children}</div>
      </Show>
    </section>
  );
};

const DetailsPanel: Component = () => {
  return (
    <aside class="flex flex-col h-full overflow-y-auto" aria-label="Details panel">
      <CollapsibleSection title="Context">
        {/* Placeholder — ContextMeter goes here (CHI-22) */}
        <div class="flex items-center justify-between text-xs text-text-tertiary">
          <span>Tokens</span>
          <span class="font-mono">&ndash; / &ndash;</span>
        </div>
        <div class="mt-2 h-2 bg-bg-inset rounded-full overflow-hidden">
          <div class="h-full w-0 bg-success rounded-full" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Cost">
        {/* Placeholder — CostTracker details go here */}
        <div class="flex items-center justify-between text-xs text-text-tertiary">
          <span>Session total</span>
          <span class="font-mono">$0.00</span>
        </div>
      </CollapsibleSection>
    </aside>
  );
};

export default DetailsPanel;
```

**Step 2: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass.

---

### Task 6: Create MainLayout and update App.tsx

**Files:**
- Create: `src/components/layout/MainLayout.tsx`
- Modify: `src/App.tsx`

**Step 1: Create `src/components/layout/MainLayout.tsx`**

The orchestrating component — assembles 5 zones using flexbox. Sidebar and DetailsPanel visibility driven by uiStore. Uses CSS transitions per SPEC-002 §8 (`--duration-slow` for panel toggle). Inner content wrapper prevents text reflow during sidebar/panel transitions.

```tsx
// src/components/layout/MainLayout.tsx
// 5-zone layout per SPEC-003 §2:
// Z1: TitleBar (top, fixed height)
// Z2: Sidebar (left, togglable)
// Z3: Main Content (center, flexible)
// Z4: DetailsPanel (right, togglable)
// Z5: StatusBar (bottom, fixed height)

import type { Component } from 'solid-js';
import { onMount, onCleanup } from 'solid-js';
import { uiState } from '@/stores/uiStore';
import { handleGlobalKeyDown } from '@/lib/keybindings';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import DetailsPanel from './DetailsPanel';

const MainLayout: Component = () => {
  // Global keyboard shortcuts (Cmd+B, Cmd+Shift+B, Cmd+1/2/3/4)
  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  return (
    <div class="h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
      <TitleBar />

      <div class="flex-1 flex overflow-hidden">
        {/* Z2: Sidebar — transitions width for smooth show/hide */}
        <div
          class="bg-bg-secondary border-r border-border-primary overflow-hidden transition-[width] shrink-0"
          style={{
            width: uiState.sidebarVisible ? 'var(--sidebar-width)' : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            'border-right-width': uiState.sidebarVisible ? '1px' : '0px',
          }}
        >
          {/* Inner wrapper maintains full width during transition */}
          <div style={{ width: 'var(--sidebar-width)' }}>
            <Sidebar />
          </div>
        </div>

        {/* Z3: Main Content */}
        <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* View tabs — placeholder for now */}
          <div class="flex items-center gap-1 px-3 border-b border-border-secondary bg-bg-primary">
            <ViewTab label="Conversation" view="conversation" />
            <ViewTab label="Agents" view="agents" />
            <ViewTab label="Diff" view="diff" />
            <ViewTab label="Terminal" view="terminal" />
          </div>

          {/* View content area */}
          <div class="flex-1 overflow-auto">
            <div class="flex items-center justify-center h-full">
              <p class="text-text-tertiary text-sm">
                {uiState.activeView === 'conversation'
                  ? 'Conversation view (CHI-18)'
                  : uiState.activeView === 'agents'
                    ? 'Agent dashboard (future)'
                    : uiState.activeView === 'diff'
                      ? 'Diff review (future)'
                      : 'Terminal (CHI-21)'}
              </p>
            </div>
          </div>

          {/* Message input goes here — added in CHI-19 (Task 8) */}
        </main>

        {/* Z4: Details Panel — transitions width for smooth show/hide */}
        <div
          class="bg-bg-secondary border-l border-border-primary overflow-hidden transition-[width] shrink-0"
          style={{
            width: uiState.detailsPanelVisible ? 'var(--details-panel-width)' : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            'border-left-width': uiState.detailsPanelVisible ? '1px' : '0px',
          }}
        >
          <div style={{ width: 'var(--details-panel-width)' }}>
            <DetailsPanel />
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  );
};

/** View tab button — highlights active view with accent border */
const ViewTab: Component<{ label: string; view: string }> = (props) => {
  const isActive = () => uiState.activeView === props.view;

  return (
    <button
      class={`px-3 py-2 text-xs transition-colors ${
        isActive()
          ? 'text-text-primary border-b-2 border-accent'
          : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
      }`}
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() =>
        import('@/stores/uiStore').then((m) =>
          m.setActiveView(props.view as import('@/stores/uiStore').ActiveView),
        )
      }
    >
      {props.label}
    </button>
  );
};

export default MainLayout;
```

**Step 2: Update `src/App.tsx`**

Replace the placeholder with MainLayout:

```tsx
// src/App.tsx
import type { Component } from 'solid-js';
import MainLayout from '@/components/layout/MainLayout';

const App: Component = () => {
  return <MainLayout />;
};

export default App;
```

**Step 3: Create `src/lib/keybindings.ts`**

Global keyboard shortcut handler. Extracted to its own module for testability per GUIDE-001.

```typescript
// src/lib/keybindings.ts
// Global keyboard shortcuts per SPEC-003 §2.
// Cmd+B: toggle sidebar. Cmd+Shift+B: toggle details panel.
// Cmd+1/2/3/4: switch active view.

import {
  toggleSidebar,
  toggleDetailsPanel,
  setActiveView,
  type ActiveView,
} from '@/stores/uiStore';

const viewMap: Record<string, ActiveView> = {
  Digit1: 'conversation',
  Digit2: 'agents',
  Digit3: 'diff',
  Digit4: 'terminal',
};

export function handleGlobalKeyDown(e: KeyboardEvent): void {
  // Use metaKey on macOS, ctrlKey elsewhere
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  // Cmd+B — toggle sidebar
  if (e.code === 'KeyB' && !e.shiftKey) {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // Cmd+Shift+B — toggle details panel
  if (e.code === 'KeyB' && e.shiftKey) {
    e.preventDefault();
    toggleDetailsPanel();
    return;
  }

  // Cmd+1/2/3/4 — switch view
  if (viewMap[e.code]) {
    e.preventDefault();
    setActiveView(viewMap[e.code]);
  }
}
```

**Step 4: Run full verification**

```bash
npm run typecheck
npm run lint
npm run format
npm run build
```

Expected: All pass. `vite build` produces the CSS + JS bundle without errors.

**Step 5: Visual verification**

```bash
npm run dev
```

Open `http://localhost:1420` in a browser. You should see:
- Dark background (#0D1117)
- Title bar at top with "Chief Wiggum" text
- Sidebar on left showing "Sessions" header and "No active sessions" placeholder
- Main content area with view tabs (Conversation, Agents, Diff, Terminal)
- Details panel on right with Context and Cost sections
- Status bar at bottom with "Ready", "– / –", "$0.00"

Stop the dev server when done.

---

### Task 7: Verify all checks and commit CHI-17

**Step 1: Run all checks**

```bash
npm run typecheck && npm run lint && npm run format:check
```

If format:check fails, run `npm run format` first, then re-check.

```bash
cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings && cargo test
```

All 55 Rust tests should still pass. Clippy should be clean.

**Step 2: Commit**

```bash
git add src/stores/uiStore.ts src/components/layout/TitleBar.tsx src/components/layout/Sidebar.tsx src/components/layout/StatusBar.tsx src/components/layout/DetailsPanel.tsx src/components/layout/MainLayout.tsx src/App.tsx src/lib/keybindings.ts src/lib/types.ts src-tauri/tauri.conf.json src-tauri/capabilities/default.json package.json package-lock.json
git commit -m "CHI-17: build main layout shell with 5-zone structure

5-zone layout: TitleBar (40px), Sidebar (240px, togglable), MainContent
(flex), DetailsPanel (280px, togglable), StatusBar (32px). Custom title
bar with drag region and window controls. Panel transitions use SPEC-002
animation tokens. Global keyboard shortcuts: Cmd+B sidebar, Cmd+Shift+B
details panel, Cmd+1-4 view switching. uiStore manages panel state.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Part B: CHI-19 — Message Input Component

### Task 8: Create MessageInput with auto-resize textarea

**Files:**
- Create: `src/components/conversation/MessageInput.tsx`

**Step 1: Create `src/components/conversation/MessageInput.tsx`**

Multi-line textarea with auto-resize (80px min, 300px max per SPEC-003 §3.1). Enter sends, Shift+Enter inserts newline. Send/cancel buttons. Character count. Disabled state.

```tsx
// src/components/conversation/MessageInput.tsx
// Message input per SPEC-003 §3.1.
// Auto-expanding textarea (80–300px). Enter sends, Shift+Enter newline.
// Send button with loading state. Cancel button while responding.
// Character count indicator. Disabled when no CLI bridge connected.

import type { Component } from 'solid-js';
import { createSignal, Show, onCleanup } from 'solid-js';
import { Send, Square } from 'lucide-solid';

interface MessageInputProps {
  onSend: (content: string) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [content, setContent] = createSignal('');
  let textareaRef: HTMLTextAreaElement | undefined;

  // Auto-resize textarea between min and max height
  function adjustHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    const scrollHeight = textareaRef.scrollHeight;
    textareaRef.style.height = `${Math.min(Math.max(scrollHeight, 80), 300)}px`;
  }

  function handleInput(e: InputEvent) {
    const target = e.target as HTMLTextAreaElement;
    setContent(target.value);
    adjustHeight();
  }

  function handleSend() {
    const text = content().trim();
    if (!text || props.isLoading || props.isDisabled) return;
    props.onSend(text);
    setContent('');
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = '80px';
    }
  }

  function handleCancel() {
    props.onCancel?.();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Enter (without Shift) sends the message
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Cmd/Ctrl+Enter always sends (force send)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Focus textarea when component mounts
  const focusTimeout = setTimeout(() => textareaRef?.focus(), 0);
  onCleanup(() => clearTimeout(focusTimeout));

  const charCount = () => content().length;
  const canSend = () => content().trim().length > 0 && !props.isLoading && !props.isDisabled;

  return (
    <div
      class={`border-t border-border-primary bg-bg-secondary px-4 py-3 ${
        props.isDisabled ? 'opacity-50' : ''
      }`}
    >
      {/* Textarea */}
      <div class="relative">
        <textarea
          ref={textareaRef}
          class="w-full resize-none rounded-md border border-border-primary bg-bg-primary px-3 py-2 text-md text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none font-ui"
          style={{ 'min-height': '80px', 'max-height': '300px' }}
          placeholder={props.isDisabled ? 'No CLI bridge connected' : 'Type your message...'}
          disabled={props.isDisabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Message input"
        />
      </div>

      {/* Footer: character count + buttons */}
      <div class="flex items-center justify-between mt-2">
        {/* Left: character count */}
        <span class="text-xs text-text-tertiary font-mono">
          <Show when={charCount() > 0}>{charCount()} chars</Show>
        </span>

        {/* Right: action buttons */}
        <div class="flex items-center gap-2">
          <Show when={props.isLoading}>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-error bg-error-muted hover:bg-error/20 transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={handleCancel}
              aria-label="Cancel response"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          </Show>

          <button
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              canSend()
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
            }`}
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleSend}
            disabled={!canSend()}
            aria-label="Send message"
          >
            <Send size={12} />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
```

**Step 2: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass.

---

### Task 9: Wire MessageInput into layout

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Update MainLayout — add MessageInput below main content**

In `MainLayout.tsx`, import MessageInput and render it at the bottom of the main content area, inside `<main>`, only when `activeView === 'conversation'`:

Add this import at the top:

```typescript
import { Show } from 'solid-js';
import MessageInput from '@/components/conversation/MessageInput';
```

Replace the comment `{/* Message input goes here — added in CHI-19 (Task 8) */}` with:

```tsx
          {/* Message input — only visible in conversation view */}
          <Show when={uiState.activeView === 'conversation'}>
            <MessageInput
              onSend={(content) => {
                /* TODO: wire to IPC send_message command */
              }}
              isLoading={false}
              isDisabled={false}
            />
          </Show>
```

**Step 2: Run full verification**

```bash
npm run typecheck && npm run lint && npm run format:check
```

If format fails, run `npm run format` first.

```bash
npm run build
```

Expected: vite build succeeds.

**Step 3: Visual verification**

```bash
npm run dev
```

Open `http://localhost:1420`. You should see:
- The 5-zone layout from CHI-17
- At the bottom of the main content area: a textarea with "Type your message..." placeholder
- Below the textarea: a "Send" button (disabled/grayed out when textarea is empty)
- Type text → character count appears, Send button turns orange
- Press Enter → textarea clears, character count resets
- The textarea should auto-expand as you type multiple lines (up to ~300px)

Stop the dev server.

---

### Task 10: Commit CHI-19

**Step 1: Run all checks**

```bash
npm run typecheck && npm run lint && npm run format:check
cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings && cargo test
```

Expected: All pass.

**Step 2: Commit**

```bash
git add src/components/conversation/MessageInput.tsx src/components/layout/MainLayout.tsx
git commit -m "CHI-19: build message input component with send controls

Auto-expanding textarea (80-300px) with Enter to send, Shift+Enter for
newline, Cmd/Ctrl+Enter force send. Send button with loading/disabled
states. Cancel (Stop) button during responses. Character count. Focus
management with auto-focus on mount.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Part C: CHI-23 — Permission Dialog UI

### Task 11: Create PermissionDialog component

**Files:**
- Create: `src/components/permissions/PermissionDialog.tsx`

**Step 1: Create `src/components/permissions/PermissionDialog.tsx`**

Modal dialog per SPEC-003 §3.7. Shows tool, command, risk level. Three action buttons with keyboard shortcuts. Focus trap. Timeout countdown (60s auto-deny). Risk-level color stripe on left. Tool-type badge coloring.

```tsx
// src/components/permissions/PermissionDialog.tsx
// Permission dialog per SPEC-003 §3.7 and SPEC-001 §7.
// Modal: blocks all interaction until resolved.
// Risk-level stripe: green (low), amber (medium), red (high).
// Tool-type badge: blue (file ops), amber (bash), purple (MCP).
// Keyboard: Y=approve, N=deny, A=always allow, Escape=deny.
// Timeout: 60s auto-deny with countdown bar.
// Focus trap: Tab cycles within dialog.

import type { Component } from 'solid-js';
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { ShieldAlert } from 'lucide-solid';
import type { PermissionRequest, PermissionAction } from '@/lib/types';

interface PermissionDialogProps {
  request: PermissionRequest;
  onRespond: (action: PermissionAction) => void;
}

const TIMEOUT_SECONDS = 60;

/** Map risk level to border color class */
function riskBorderColor(level: string): string {
  switch (level) {
    case 'low':
      return 'border-l-success';
    case 'medium':
      return 'border-l-warning';
    case 'high':
      return 'border-l-error';
    default:
      return 'border-l-border-primary';
  }
}

/** Map risk level to badge styling */
function riskBadge(level: string): { bg: string; text: string; label: string } {
  switch (level) {
    case 'low':
      return { bg: 'bg-success-muted', text: 'text-success', label: 'Low Risk' };
    case 'medium':
      return { bg: 'bg-warning-muted', text: 'text-warning', label: 'Medium Risk' };
    case 'high':
      return { bg: 'bg-error-muted', text: 'text-error', label: 'High Risk' };
    default:
      return { bg: 'bg-bg-elevated', text: 'text-text-secondary', label: level };
  }
}

/** Map tool type to badge color */
function toolBadge(tool: string): { bg: string; text: string } {
  const t = tool.toLowerCase();
  if (t.includes('bash') || t.includes('shell') || t.includes('command')) {
    return { bg: 'bg-warning-muted', text: 'text-warning' }; // amber
  }
  if (t.includes('mcp')) {
    return { bg: 'bg-[#a371f733]', text: 'text-[#a371f7]' }; // purple (model-opus)
  }
  // Default: file operations → blue
  return { bg: 'bg-[#58a6ff33]', text: 'text-info' };
}

const PermissionDialog: Component<PermissionDialogProps> = (props) => {
  const [timeLeft, setTimeLeft] = createSignal(TIMEOUT_SECONDS);
  let dialogRef: HTMLDivElement | undefined;

  // --- Timeout countdown ---
  const timer = setInterval(() => {
    setTimeLeft((prev) => {
      if (prev <= 1) {
        clearInterval(timer);
        props.onRespond('Deny');
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  onCleanup(() => clearInterval(timer));

  // --- Keyboard shortcuts ---
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      props.onRespond('Approve');
    } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
      e.preventDefault();
      props.onRespond('Deny');
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      props.onRespond('AlwaysAllow');
    }

    // Focus trap
    if (e.key === 'Tab' && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Focus first button
    const firstBtn = dialogRef?.querySelector<HTMLElement>('button');
    firstBtn?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  const risk = () => riskBadge(props.request.risk_level);
  const tool = () => toolBadge(props.request.tool);
  const timeoutPercent = () => (timeLeft() / TIMEOUT_SECONDS) * 100;

  return (
    // Overlay — does NOT close on click (security-critical modal)
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Permission required"
    >
      <div
        ref={dialogRef}
        class={`w-full max-w-[560px] bg-bg-elevated rounded-lg shadow-md border-l-4 ${riskBorderColor(props.request.risk_level)}`}
      >
        {/* Header */}
        <div class="flex items-center gap-2 px-6 pt-5 pb-3">
          <ShieldAlert size={20} class="text-warning" />
          <h2 class="text-xl font-semibold text-text-primary">Permission Required</h2>
        </div>

        {/* Content */}
        <div class="px-6 pb-4">
          {/* Tool type badge */}
          <div class="flex items-center gap-2 mb-3">
            <span class={`px-2 py-0.5 rounded text-xs font-medium ${tool().bg} ${tool().text}`}>
              {props.request.tool}
            </span>
            <span class={`px-2 py-0.5 rounded text-xs font-medium ${risk().bg} ${risk().text}`}>
              {risk().label}
            </span>
          </div>

          {/* Command display */}
          <div class="rounded-md bg-bg-inset border border-border-secondary p-3 mb-3">
            <code class="text-sm font-mono text-text-primary break-all">
              {props.request.command}
            </code>
          </div>

          {/* File path (if present) */}
          <Show when={props.request.file_path}>
            <div class="text-xs text-text-secondary mb-3">
              <span class="text-text-tertiary">Path: </span>
              <span class="font-mono">{props.request.file_path}</span>
            </div>
          </Show>

          {/* Timeout indicator */}
          <div class="mb-4">
            <div class="flex items-center justify-between text-xs text-text-tertiary mb-1">
              <span>Auto-deny in</span>
              <span class="font-mono">{timeLeft()}s</span>
            </div>
            <div class="h-1 bg-bg-inset rounded-full overflow-hidden">
              <div
                class="h-full bg-warning rounded-full transition-all ease-linear"
                style={{
                  width: `${timeoutPercent()}%`,
                  'transition-duration': '1000ms',
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer: action buttons */}
        <div class="flex items-center justify-end gap-2 px-6 pb-5">
          <button
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onRespond('Deny')}
          >
            Deny
            <kbd class="ml-1.5 text-xs text-text-tertiary">N</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onRespond('AlwaysAllow')}
          >
            Always Allow
            <kbd class="ml-1.5 text-xs text-text-tertiary">A</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-white bg-accent hover:bg-accent-hover transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onRespond('Approve')}
          >
            Allow Once
            <kbd class="ml-1.5 text-xs text-white/60">Y</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
```

**Step 2: Run verification**

```bash
npm run typecheck
npm run lint
```

Expected: Both pass.

---

### Task 12: Wire PermissionDialog into layout

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Update MainLayout — render PermissionDialog when active**

Add these imports at the top of `MainLayout.tsx`:

```typescript
import PermissionDialog from '@/components/permissions/PermissionDialog';
import { uiState, dismissPermissionDialog } from '@/stores/uiStore';
import type { PermissionAction } from '@/lib/types';
```

Note: `uiState` is already imported. Just add `dismissPermissionDialog` to the existing import.

At the end of the outermost `<div>` (after `<StatusBar />`), add the permission dialog:

```tsx
      {/* Permission dialog — rendered above everything when a request is pending */}
      <Show when={uiState.permissionRequest}>
        {(request) => (
          <PermissionDialog
            request={request()}
            onRespond={(action: PermissionAction) => {
              // TODO: wire to IPC respond_permission command
              // For now, just dismiss the dialog
              dismissPermissionDialog();
            }}
          />
        )}
      </Show>
```

**Step 2: Run full verification**

```bash
npm run typecheck && npm run lint && npm run format:check
```

If format fails, run `npm run format` first.

```bash
npm run build
```

Expected: vite build succeeds.

**Step 3: Visual verification (optional — mock permission request)**

To test the dialog visually, you can temporarily add a test trigger. In MainLayout, add a button inside the status bar area or use the browser console. Here's a quick way:

Add to `StatusBar.tsx` temporarily (remove before commit):

```tsx
import { showPermissionDialog } from '@/stores/uiStore';

// In the footer element, add:
<button
  class="text-xs text-accent"
  onClick={() =>
    showPermissionDialog({
      request_id: 'test-1',
      tool: 'Bash',
      command: 'npm install jsonwebtoken',
      file_path: null,
      risk_level: 'medium',
    })
  }
>
  Test Permission
</button>
```

Run `npm run dev`, click "Test Permission" in the status bar. You should see:
- Modal overlay darkens the background
- Dialog with amber left border (medium risk)
- "Bash" badge in amber, "Medium Risk" badge
- Command in code block: `npm install jsonwebtoken`
- Countdown timer from 60s
- Three buttons: Deny (N), Always Allow (A), Allow Once (Y)
- Press Y, N, A, or Escape to dismiss

**Remove the test button from StatusBar.tsx before committing.**

---

### Task 13: Final verification and commit CHI-23

**Step 1: Ensure test button is removed from StatusBar**

`StatusBar.tsx` should be clean — no test imports or buttons.

**Step 2: Run all checks**

```bash
npm run typecheck && npm run lint && npm run format:check
cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings && cargo test
```

Expected: All pass. 55 Rust tests pass.

**Step 3: Commit**

```bash
git add src/components/permissions/PermissionDialog.tsx src/components/layout/MainLayout.tsx src/lib/types.ts src/stores/uiStore.ts
git commit -m "CHI-23: build permission dialog UI component

Modal dialog intercepts when permission needed. Shows tool type badge
(blue/amber/purple), risk level stripe (green/amber/red), command in
code block, file path. Buttons: Deny (N), Always Allow (A), Allow Once
(Y) with keyboard shortcuts. Focus trap tabs within dialog. 60-second
timeout auto-denies with countdown progress bar. Accessible: aria-modal,
aria-label, focus management.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 14: Push and update tracking

**Step 1: Push to remote**

```bash
git push origin main
```

**Step 2: Update Linear issues**

Mark CHI-17, CHI-19, CHI-23 as Done in Linear.

**Step 3: Update handover.json**

Set CHI-17, CHI-19, CHI-23 to `"done"` with file lists and notes. Update recommended_next.

**Step 4: Update CLAUDE.md**

Add CHI-17, CHI-19, CHI-23 to the "What's Done" table. Update "What's Next" to show remaining CHI-7 tasks (CHI-18, CHI-20, CHI-21, CHI-22, CHI-24, CHI-26).

---

## File Summary

### New files created:
```
src/stores/uiStore.ts                              # UI state management
src/lib/keybindings.ts                              # Global keyboard shortcuts
src/components/layout/TitleBar.tsx                   # Custom title bar (40px)
src/components/layout/Sidebar.tsx                    # Left sidebar (240px)
src/components/layout/StatusBar.tsx                  # Bottom status bar (32px)
src/components/layout/DetailsPanel.tsx               # Right details panel (280px)
src/components/layout/MainLayout.tsx                 # 5-zone layout orchestrator
src/components/conversation/MessageInput.tsx         # Message textarea + controls
src/components/permissions/PermissionDialog.tsx      # Permission approval modal
```

### Modified files:
```
src/App.tsx                                         # Renders MainLayout
src/lib/types.ts                                    # Added PermissionRequest/Action types
src-tauri/tauri.conf.json                           # decorations: false
src-tauri/capabilities/default.json                 # Window permissions added
package.json                                        # lucide-solid, @tauri-apps/api added
```

### Dependencies added:
```
lucide-solid          # Icon library (SPEC-002 §9)
@tauri-apps/api       # Tauri frontend API (window controls, future IPC)
```
