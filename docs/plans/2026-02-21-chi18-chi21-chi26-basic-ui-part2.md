# Basic UI Part 2: Conversation View, Terminal Mode, YOLO Mode

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the conversation view with markdown rendering, integrate xterm.js terminal mode, and implement YOLO Mode auto-approve system (frontend + backend).

**Architecture:** ConversationView renders messages from a SolidJS store with markdown/code-highlighted content. TerminalPane wraps xterm.js with WebGL addon in the terminal view tab. YOLO Mode adds a `yolo_mode` flag to the Rust PermissionManager (auto-approve path) and corresponding frontend toggle/warning dialog/indicators.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, marked + marked-highlight + highlight.js (markdown/code), @xterm/xterm + addon-webgl + addon-fit (terminal), Rust/tokio (YOLO backend)

---

## Reference Docs

- **SPEC-003 §3.1** — Conversation View layout and message anatomy
- **SPEC-003 §3.4** — Terminal View layout and overlay widgets
- **SPEC-001 §7.1** — YOLO Mode specification and safety rails
- **SPEC-004 §4–6** — IPC events, data flow, type definitions
- **SPEC-002 §4** — Typography tokens (font stacks, sizes)
- **GUIDE-001 §3** — Frontend patterns (stores, components, styling)

## Existing Files to Know

| File | What it does |
|------|-------------|
| `src/stores/uiStore.ts` | UI state singleton — activeView, sidebar/panel visibility, permissionRequest |
| `src/lib/types.ts` | TypeScript IPC types — MessageRole, PermissionRequest, etc. |
| `src/lib/keybindings.ts` | Global keyboard shortcuts — Cmd+B, Cmd+1-4 |
| `src/components/layout/MainLayout.tsx` | 5-zone layout orchestrator — view tabs + content area |
| `src/components/layout/TitleBar.tsx` | Custom title bar — hamburger, drag region, window controls |
| `src/components/layout/StatusBar.tsx` | Bottom bar — status, tokens, cost |
| `src/components/conversation/MessageInput.tsx` | Auto-expanding textarea with send/stop |
| `src/components/permissions/PermissionDialog.tsx` | Permission modal — risk coloring, timeout |
| `src/styles/tokens.css` | All SPEC-002 design tokens + TailwindCSS v4 @theme |
| `src-tauri/src/bridge/permission.rs` | Rust PermissionManager — request queue, auto-allow rules, timeout |

---

## CHI-18: Conversation View with Markdown/Code Rendering

### Task 1: Install dependencies and add Message type

**Files:**
- Modify: `package.json`
- Modify: `src/lib/types.ts`

**Step 1: Install markdown + syntax highlighting packages**

Run:
```bash
npm install marked marked-highlight highlight.js
```

**Step 2: Add Message interface to types.ts**

Add after the `PermissionResponse` interface at the end of `src/lib/types.ts`:

```typescript
/** Message per SPEC-004 §6 */
export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  cost_cents: number | null;
  is_compacted: boolean;
  created_at: string;
}
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors.

---

### Task 2: Create conversationStore

**Files:**
- Create: `src/stores/conversationStore.ts`

**Step 1: Create the store**

Create `src/stores/conversationStore.ts`:

```typescript
// src/stores/conversationStore.ts
// Conversation state: messages, loading, mock responses.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import type { Message, MessageRole } from '@/lib/types';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
});

/** Add a user message and trigger a mock assistant response. */
export function sendMessage(content: string) {
  const userMsg: Message = {
    id: crypto.randomUUID(),
    session_id: 'mock-session',
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

  // Mock: simulate assistant response after 1s
  // TODO: Replace with IPC send_message command when backend is wired
  setTimeout(() => {
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      session_id: 'mock-session',
      role: 'assistant',
      content: buildMockResponse(content),
      model: 'claude-opus-4-6',
      input_tokens: 150,
      output_tokens: 200,
      thinking_tokens: 50,
      cost_cents: 3,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    setState('messages', (prev) => [...prev, assistantMsg]);
    setState('isLoading', false);
  }, 1000);
}

/** Add a message directly (used by IPC event listeners). */
export function addMessage(msg: Message) {
  setState('messages', (prev) => [...prev, msg]);
}

/** Clear all messages (e.g., on session change). */
export function clearMessages() {
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
    'Here\'s my analysis:',
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
    'Let me know if you\'d like me to proceed with the implementation.',
  ].join('\n');
}

export { state as conversationState };
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: PASS.

---

### Task 3: Create MarkdownContent component

Renders markdown to HTML with syntax-highlighted code blocks and copy buttons.

**Files:**
- Create: `src/components/conversation/MarkdownContent.tsx`
- Modify: `src/styles/tokens.css` (add markdown content styles)

**Step 1: Add markdown content styles to tokens.css**

Add at the end of `src/styles/tokens.css` before the closing `@media` rule (before `@media (prefers-reduced-motion: reduce)`):

```css
/* ============================================================
 * Markdown content rendered via innerHTML (SPEC-002 §4)
 * Cannot use Tailwind classes — content is HTML from marked.
 * ============================================================ */

.markdown-content {
  font-size: var(--text-base);
  line-height: var(--text-base--line-height);
  color: var(--color-text-primary);
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-top: 16px;
  margin-bottom: 8px;
}

.markdown-content h1 {
  font-size: var(--text-2xl);
  line-height: var(--text-2xl--line-height);
}

.markdown-content h2 {
  font-size: var(--text-xl);
  line-height: var(--text-xl--line-height);
}

.markdown-content h3 {
  font-size: var(--text-lg);
  line-height: var(--text-lg--line-height);
}

.markdown-content p {
  margin-bottom: 8px;
}

.markdown-content ul,
.markdown-content ol {
  margin-bottom: 8px;
  padding-left: 20px;
}

.markdown-content ul {
  list-style-type: disc;
}

.markdown-content ol {
  list-style-type: decimal;
}

.markdown-content li {
  margin-bottom: 4px;
}

.markdown-content blockquote {
  border-left: 3px solid var(--color-border-primary);
  padding-left: 12px;
  margin-bottom: 8px;
  color: var(--color-text-secondary);
  font-style: italic;
}

.markdown-content a {
  color: var(--color-text-link);
  text-decoration: underline;
}

.markdown-content code {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background-color: var(--color-bg-inset);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.markdown-content pre {
  position: relative;
  margin-bottom: 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-secondary);
  overflow: hidden;
}

.markdown-content pre code {
  display: block;
  padding: 12px;
  overflow-x: auto;
  background-color: var(--color-bg-inset);
  font-size: 13px;
  line-height: 20px;
}

.markdown-content pre .copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: var(--font-ui);
  color: var(--color-text-tertiary);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms;
}

.markdown-content pre:hover .copy-btn {
  opacity: 1;
}

.markdown-content pre .copy-btn:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
}

.markdown-content strong {
  font-weight: 600;
}

.markdown-content em {
  font-style: italic;
}

.markdown-content hr {
  border: none;
  border-top: 1px solid var(--color-border-secondary);
  margin: 12px 0;
}
```

**Step 2: Create MarkdownContent component**

Create `src/components/conversation/MarkdownContent.tsx`:

```tsx
// src/components/conversation/MarkdownContent.tsx
// Renders markdown string to HTML with syntax-highlighted code blocks.
// Uses marked + highlight.js. Code blocks get copy buttons via DOM post-processing.
// Styles in src/styles/tokens.css under .markdown-content.

import type { Component } from 'solid-js';
import { createEffect, onCleanup } from 'solid-js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

// Configure marked with highlight.js integration
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

interface MarkdownContentProps {
  content: string;
}

const MarkdownContent: Component<MarkdownContentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  const html = () => marked.parse(props.content) as string;

  // Post-process: add copy buttons to code blocks
  createEffect(() => {
    const _html = html(); // track dependency
    if (!containerRef) return;

    // Use requestAnimationFrame to ensure DOM is updated
    const rafId = requestAnimationFrame(() => {
      containerRef!.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return; // already has button

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
          const code = pre.querySelector('code')?.textContent || '';
          navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        });
        pre.appendChild(btn);
      });
    });

    onCleanup(() => cancelAnimationFrame(rafId));
  });

  return <div ref={containerRef} class="markdown-content" innerHTML={html()} />;
};

export default MarkdownContent;
```

**Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: PASS.

---

### Task 4: Create MessageBubble component

**Files:**
- Create: `src/components/conversation/MessageBubble.tsx`

**Step 1: Create the component**

Create `src/components/conversation/MessageBubble.tsx`:

```tsx
// src/components/conversation/MessageBubble.tsx
// Individual message display per SPEC-003 §3.1 message anatomy.
// Role label, model badge, markdown content, timestamp + cost footer.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import type { Message } from '@/lib/types';
import MarkdownContent from './MarkdownContent';

interface MessageBubbleProps {
  message: Message;
}

/** Map role to display label */
function roleLabel(role: string): string {
  switch (role) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'tool_use':
      return 'Tool Use';
    case 'tool_result':
      return 'Tool Result';
    default:
      return role;
  }
}

/** Map model ID to badge label + color class */
function modelBadgeInfo(model: string): { label: string; colorClass: string } {
  if (model.includes('opus'))
    return { label: 'Opus', colorClass: 'bg-model-opus/20 text-model-opus' };
  if (model.includes('sonnet'))
    return { label: 'Sonnet', colorClass: 'bg-model-sonnet/20 text-model-sonnet' };
  if (model.includes('haiku'))
    return { label: 'Haiku', colorClass: 'bg-model-haiku/20 text-model-haiku' };
  return { label: model, colorClass: 'bg-bg-elevated text-text-secondary' };
}

/** Format ISO timestamp to HH:MM */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const MessageBubble: Component<MessageBubbleProps> = (props) => {
  const isUser = () => props.message.role === 'user';
  const isSystem = () =>
    props.message.role === 'system' ||
    props.message.role === 'tool_use' ||
    props.message.role === 'tool_result';

  const bgClass = () => {
    if (isUser()) return 'bg-accent-muted border border-accent/20';
    if (isSystem()) return 'bg-bg-inset border border-border-secondary';
    return 'bg-bg-secondary border border-border-primary';
  };

  return (
    <div class={isUser() ? 'flex justify-end' : 'flex justify-start'}>
      <div class={`max-w-[85%] rounded-lg px-4 py-3 ${bgClass()}`}>
        {/* Role label + model badge */}
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm text-text-secondary font-medium">
            {roleLabel(props.message.role)}
          </span>
          <Show when={props.message.model}>
            {(model) => {
              const info = modelBadgeInfo(model());
              return (
                <span class={`px-1.5 py-0.5 rounded text-xs font-mono ${info.colorClass}`}>
                  {info.label}
                </span>
              );
            }}
          </Show>
        </div>

        {/* Content: user messages as plain text, others as markdown */}
        <Show
          when={!isUser()}
          fallback={
            <p class="text-text-primary text-base whitespace-pre-wrap">{props.message.content}</p>
          }
        >
          <MarkdownContent content={props.message.content} />
        </Show>

        {/* Footer: timestamp + cost */}
        <div class="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
          <span>{formatTime(props.message.created_at)}</span>
          <Show when={props.message.cost_cents != null && props.message.cost_cents! > 0}>
            <span class="font-mono">
              ${((props.message.cost_cents ?? 0) / 100).toFixed(4)}
            </span>
          </Show>
          <Show when={props.message.input_tokens != null}>
            <span class="font-mono">
              {props.message.input_tokens}+{props.message.output_tokens} tok
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: PASS.

---

### Task 5: Create ConversationView and wire into MainLayout

**Files:**
- Create: `src/components/conversation/ConversationView.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Create ConversationView component**

Create `src/components/conversation/ConversationView.tsx`:

```tsx
// src/components/conversation/ConversationView.tsx
// Scrollable message list with auto-scroll, empty state, and loading indicator.
// Per SPEC-003 §3.1: primary interaction surface.

import type { Component } from 'solid-js';
import { createEffect, createSignal, Show, For } from 'solid-js';
import { conversationState } from '@/stores/conversationStore';
import MessageBubble from './MessageBubble';

const ConversationView: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  const [isAutoScroll, setIsAutoScroll] = createSignal(true);

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    const _msgs = conversationState.messages.length; // track dependency
    if (isAutoScroll() && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  // Detect manual scroll — pause auto-scroll when user scrolls up
  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScroll(atBottom);
  }

  return (
    <div ref={scrollRef} class="flex-1 overflow-y-auto" onScroll={handleScroll}>
      <Show
        when={conversationState.messages.length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center h-full text-text-tertiary">
            <p class="text-lg mb-2">No messages yet</p>
            <p class="text-sm">Type a message below to start a conversation</p>
          </div>
        }
      >
        <div class="p-4 space-y-4">
          <For each={conversationState.messages}>
            {(msg) => <MessageBubble message={msg} />}
          </For>

          {/* Loading indicator */}
          <Show when={conversationState.isLoading}>
            <div class="flex justify-start">
              <div class="bg-bg-secondary border border-border-primary rounded-lg px-4 py-3">
                <span class="text-sm text-text-secondary">Thinking...</span>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default ConversationView;
```

**Step 2: Wire ConversationView into MainLayout**

In `src/components/layout/MainLayout.tsx`, make these changes:

**a)** Add imports at the top (after existing imports):

```typescript
import ConversationView from '@/components/conversation/ConversationView';
import { sendMessage } from '@/stores/conversationStore';
```

**b)** Replace the view content area placeholder (the `<div class="flex-1 overflow-auto">` block containing the centered placeholder text, approximately lines 62-74) with:

```tsx
          {/* View content area */}
          <div class="flex-1 flex flex-col overflow-hidden">
            <Show when={uiState.activeView === 'conversation'}>
              <ConversationView />
            </Show>
            <Show when={uiState.activeView === 'agents'}>
              <div class="flex items-center justify-center h-full">
                <p class="text-text-tertiary text-sm">Agent dashboard (future)</p>
              </div>
            </Show>
            <Show when={uiState.activeView === 'diff'}>
              <div class="flex items-center justify-center h-full">
                <p class="text-text-tertiary text-sm">Diff review (future)</p>
              </div>
            </Show>
            <Show when={uiState.activeView === 'terminal'}>
              <div class="flex items-center justify-center h-full">
                <p class="text-text-tertiary text-sm">Terminal (CHI-21)</p>
              </div>
            </Show>
          </div>
```

**c)** Update the MessageInput `onSend` handler (replace the empty callback):

```tsx
          <Show when={uiState.activeView === 'conversation'}>
            <MessageInput
              onSend={(text) => {
                sendMessage(text);
              }}
              isLoading={false}
              isDisabled={false}
            />
          </Show>
```

**Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`
Expected: All PASS.

Run: `npx vite build`
Expected: Build succeeds. Check that no import errors.

---

### Task 6: Verify all checks and commit CHI-18

**Step 1: Run all frontend checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/ && npx prettier --check src/ && npx vite build
```
Expected: All PASS. Fix any issues before proceeding.

**Step 2: Run Rust checks (ensure nothing broken)**

Run:
```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings
```
Expected: All 55 tests pass, no clippy warnings.

**Step 3: Commit**

```bash
git add src/components/conversation/ConversationView.tsx \
        src/components/conversation/MarkdownContent.tsx \
        src/components/conversation/MessageBubble.tsx \
        src/stores/conversationStore.ts \
        src/lib/types.ts \
        src/styles/tokens.css \
        src/components/layout/MainLayout.tsx \
        package.json package-lock.json
git commit -m "CHI-18: implement conversation view with markdown/code rendering

- ConversationView: scrollable message list with auto-scroll and empty state
- MessageBubble: role labels, model badges, timestamp/cost footer
- MarkdownContent: marked + highlight.js rendering with code block copy buttons
- conversationStore: message state management with mock responses
- Message type added to types.ts per SPEC-004 §6"
```

---

## CHI-21: Terminal Mode with xterm.js + WebGL

### Task 7: Install xterm.js dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install xterm.js packages**

Run:
```bash
npm install @xterm/xterm @xterm/addon-webgl @xterm/addon-fit
```

These are the xterm.js v5 packages:
- `@xterm/xterm` — core terminal emulator
- `@xterm/addon-webgl` — GPU-accelerated renderer
- `@xterm/addon-fit` — auto-resize terminal to fit container

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task 8: Create TerminalPane and wire into MainLayout

**Files:**
- Create: `src/components/terminal/TerminalPane.tsx`
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/lib/keybindings.ts`

**Step 1: Create TerminalPane component**

Create `src/components/terminal/TerminalPane.tsx`:

```tsx
// src/components/terminal/TerminalPane.tsx
// xterm.js terminal per SPEC-003 §3.4 and SPEC-001 §6.5.
// WebGL addon for GPU-accelerated rendering, fit addon for auto-resize.
// Theme matches SPEC-002 dark theme colors.
// TODO: Connect to PTY via IPC when backend commands are wired.

import type { Component } from 'solid-js';
import { onMount, onCleanup } from 'solid-js';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/** xterm.js theme mapped to SPEC-002 design tokens */
const terminalTheme = {
  background: '#010409',
  foreground: '#e6edf3',
  cursor: '#e8825a',
  cursorAccent: '#010409',
  selectionBackground: '#30363d80',
  selectionForeground: '#e6edf3',
  black: '#0d1117',
  red: '#f85149',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#a371f7',
  cyan: '#56d4dd',
  white: '#e6edf3',
  brightBlack: '#6e7681',
  brightRed: '#f85149',
  brightGreen: '#3fb950',
  brightYellow: '#d29922',
  brightBlue: '#58a6ff',
  brightMagenta: '#a371f7',
  brightCyan: '#56d4dd',
  brightWhite: '#ffffff',
};

const TerminalPane: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  let terminal: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
    if (!containerRef) return;

    terminal = new Terminal({
      fontSize: 14,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
      theme: terminalTheme,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: false,
      scrollback: 10000,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef);

    // Try WebGL addon — falls back to canvas if unavailable
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not supported — canvas renderer works fine
    }

    fitAddon.fit();

    // Auto-resize on container size change
    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
    });
    resizeObserver.observe(containerRef);

    // Write welcome message
    // TODO: Replace with actual PTY output when IPC is connected
    terminal.writeln('\x1b[1;38;2;232;130;90m Chief Wiggum Terminal \x1b[0m');
    terminal.writeln('');
    terminal.writeln(
      '\x1b[38;2;110;118;129mTerminal ready. Connect a session to begin.\x1b[0m',
    );
    terminal.writeln('');
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    terminal?.dispose();
  });

  return (
    <div
      ref={containerRef}
      class="flex-1 w-full h-full"
      style={{ 'background-color': '#010409' }}
    />
  );
};

export default TerminalPane;
```

**Step 2: Add Cmd+\` keybinding for terminal toggle**

In `src/lib/keybindings.ts`, add after the `// Cmd+Shift+B` block (after line 37) and before the `// Cmd+1/2/3/4` section:

```typescript
  // Cmd+` — toggle terminal view
  if (e.code === 'Backquote' && !e.shiftKey) {
    e.preventDefault();
    const { uiState } = await import('@/stores/uiStore');
    if (uiState.activeView === 'terminal') {
      setActiveView('conversation');
    } else {
      setActiveView('terminal');
    }
    return;
  }
```

Wait — `handleGlobalKeyDown` is synchronous but dynamic `import()` is async. Let's restructure. Actually, since `uiStore` is already imported, we can just access `uiState` directly. Update the import at the top to include `uiState`:

In `src/lib/keybindings.ts`, change the import line to:

```typescript
import {
  toggleSidebar,
  toggleDetailsPanel,
  setActiveView,
  uiState,
  type ActiveView,
} from '@/stores/uiStore';
```

Then add the shortcut (after the Cmd+Shift+B block, before Cmd+1/2/3/4):

```typescript
  // Cmd+` — toggle terminal view
  if (e.code === 'Backquote' && !e.shiftKey) {
    e.preventDefault();
    setActiveView(uiState.activeView === 'terminal' ? 'conversation' : 'terminal');
    return;
  }
```

**Step 3: Wire TerminalPane into MainLayout**

In `src/components/layout/MainLayout.tsx`, add the import at the top:

```typescript
import TerminalPane from '@/components/terminal/TerminalPane';
```

Replace the terminal view placeholder (the `<Show when={uiState.activeView === 'terminal'}>` block with the centered "Terminal (CHI-21)" text) with:

```tsx
            <Show when={uiState.activeView === 'terminal'}>
              <TerminalPane />
            </Show>
```

**Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/ && npx vite build`
Expected: All PASS. Build succeeds. Note: bundle size will increase due to xterm.js + WebGL.

---

### Task 9: Verify and commit CHI-21

**Step 1: Run all checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/ && npx prettier --check src/ && npx vite build
```
Expected: All PASS.

**Step 2: Run Rust checks (ensure nothing broken)**

Run:
```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings
```
Expected: All pass.

**Step 3: Commit**

```bash
git add src/components/terminal/TerminalPane.tsx \
        src/components/layout/MainLayout.tsx \
        src/lib/keybindings.ts \
        package.json package-lock.json
git commit -m "CHI-21: integrate terminal mode with xterm.js + WebGL

- TerminalPane: xterm.js v5 with WebGL addon for GPU-accelerated rendering
- FitAddon auto-resizes terminal to container via ResizeObserver
- Theme mapped to SPEC-002 dark palette (16 ANSI colors + cursor)
- Cmd+backtick toggles between conversation and terminal views
- Welcome message displayed (PTY connection wired later via IPC)"
```

---

## CHI-26: YOLO Mode (Auto-Approve All Permission Requests)

### Task 10: Add yolo_mode to Rust PermissionManager with unit tests

**Files:**
- Modify: `src-tauri/src/bridge/permission.rs`

**Step 1: Write the failing tests**

Add at the end of the `mod tests` block in `src-tauri/src/bridge/permission.rs` (before the final closing `}`):

```rust
    #[tokio::test]
    async fn yolo_mode_default_off() {
        let manager = PermissionManager::new();
        assert!(!manager.is_yolo_mode().await);
    }

    #[tokio::test]
    async fn yolo_mode_enable_disable() {
        let manager = PermissionManager::new();
        assert!(!manager.is_yolo_mode().await);

        manager.enable_yolo_mode().await;
        assert!(manager.is_yolo_mode().await);

        manager.disable_yolo_mode().await;
        assert!(!manager.is_yolo_mode().await);
    }

    #[tokio::test]
    async fn yolo_mode_auto_approves_everything() {
        let manager = PermissionManager::new();
        manager.enable_yolo_mode().await;

        // Even "dangerous" commands are auto-approved in YOLO mode
        let req = make_request("Bash", "rm -rf /");
        let result = manager.request_permission(req).await.unwrap();
        assert_eq!(result, PermissionAction::Approve);

        // Nothing is pending — request never queued
        assert_eq!(manager.pending_count().await, 0);
    }

    #[tokio::test]
    async fn yolo_mode_does_not_affect_rules() {
        let manager = PermissionManager::new();
        manager.enable_yolo_mode().await;

        // YOLO auto-approves but does NOT create allow rules
        let req = make_request("Bash", "ls");
        let _ = manager.request_permission(req).await.unwrap();
        assert!(manager.rules().await.is_empty());
    }
```

**Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -- yolo`
Expected: FAIL — `is_yolo_mode`, `enable_yolo_mode`, `disable_yolo_mode` methods do not exist.

**Step 3: Implement yolo_mode in PermissionManager**

In `src-tauri/src/bridge/permission.rs`, make these changes:

**a)** Add `yolo_mode` field to `PermissionManager` struct (after `timeout` field, around line 97):

```rust
    /// YOLO mode flag: when true, all requests are auto-approved (SPEC-001 §7.1).
    yolo_mode: Arc<RwLock<bool>>,
```

**b)** Initialize in `new()` (add after `timeout` initialization, around line 113):

```rust
            yolo_mode: Arc::new(RwLock::new(false)),
```

**c)** Initialize in `with_timeout()` (add after `timeout` initialization, around line 123):

```rust
            yolo_mode: Arc::new(RwLock::new(false)),
```

**d)** Add YOLO mode methods (after `with_timeout()`, before `is_auto_allowed()`):

```rust
    /// Check if YOLO mode is active.
    pub async fn is_yolo_mode(&self) -> bool {
        *self.yolo_mode.read().await
    }

    /// Enable YOLO mode — auto-approve all permission requests.
    /// WARNING: This bypasses all permission dialogs. See SPEC-001 §7.1.
    pub async fn enable_yolo_mode(&self) {
        *self.yolo_mode.write().await = true;
        tracing::warn!("[YOLO] YOLO mode enabled — all permissions will be auto-approved");
    }

    /// Disable YOLO mode — return to normal permission flow.
    pub async fn disable_yolo_mode(&self) {
        *self.yolo_mode.write().await = false;
        tracing::info!("[YOLO] YOLO mode disabled — returning to normal permission flow");
    }
```

**e)** Add YOLO check at the start of `request_permission()` (after the function signature, before the auto-allow check, around line 157):

```rust
        // YOLO mode: auto-approve immediately without queuing
        if self.is_yolo_mode().await {
            tracing::info!(
                "[YOLO] Auto-approved: tool={}, command={}",
                request.tool,
                request.command
            );
            return Ok(PermissionAction::Approve);
        }
```

**Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: All tests pass (including 4 new YOLO tests).

Run: `cd src-tauri && cargo clippy -- -D warnings`
Expected: No warnings.

---

### Task 11: Add yoloMode to uiStore and create YoloWarningDialog

**Files:**
- Modify: `src/stores/uiStore.ts`
- Create: `src/components/permissions/YoloWarningDialog.tsx`
- Modify: `src/lib/keybindings.ts`

**Step 1: Add yoloMode to uiStore**

In `src/stores/uiStore.ts`:

**a)** Add `yoloMode` and `yoloDialogVisible` to the `UIState` interface:

```typescript
interface UIState {
  sidebarVisible: boolean;
  detailsPanelVisible: boolean;
  activeView: ActiveView;
  permissionRequest: PermissionRequest | null;
  yoloMode: boolean;
  yoloDialogVisible: boolean;
}
```

**b)** Add defaults to the initial state:

```typescript
const [state, setState] = createStore<UIState>({
  sidebarVisible: true,
  detailsPanelVisible: true,
  activeView: 'conversation',
  permissionRequest: null,
  yoloMode: false,
  yoloDialogVisible: false,
});
```

**c)** Add mutation functions (after `dismissPermissionDialog`):

```typescript
/** Show the YOLO mode warning dialog. */
export function showYoloDialog() {
  setState('yoloDialogVisible', true);
}

/** Dismiss the YOLO warning dialog without enabling. */
export function dismissYoloDialog() {
  setState('yoloDialogVisible', false);
}

/** Enable YOLO mode (called after user confirms warning). */
export function enableYoloMode() {
  setState('yoloMode', true);
  setState('yoloDialogVisible', false);
  // TODO: invoke('toggle_yolo_mode', { enable: true }) when IPC is connected
}

/** Disable YOLO mode. */
export function disableYoloMode() {
  setState('yoloMode', false);
  // TODO: invoke('toggle_yolo_mode', { enable: false }) when IPC is connected
}

/** Toggle YOLO mode — shows warning dialog if enabling, disables immediately if on. */
export function toggleYoloMode() {
  if (state.yoloMode) {
    disableYoloMode();
  } else {
    showYoloDialog();
  }
}
```

**Step 2: Create YoloWarningDialog component**

Create `src/components/permissions/YoloWarningDialog.tsx`:

```tsx
// src/components/permissions/YoloWarningDialog.tsx
// Warning dialog shown before enabling YOLO Mode per SPEC-001 §7.1.
// Must clearly communicate risks. User must explicitly click "Enable" to confirm.
// Keyboard: Enter = confirm, Escape = cancel.

import type { Component } from 'solid-js';
import { onMount, onCleanup } from 'solid-js';
import { Zap, AlertTriangle } from 'lucide-solid';
import { enableYoloMode, dismissYoloDialog } from '@/stores/uiStore';

const YoloWarningDialog: Component = () => {
  let dialogRef: HTMLDivElement | undefined;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismissYoloDialog();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      enableYoloMode();
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
    // Focus cancel button first (safer default)
    const cancelBtn = dialogRef?.querySelector<HTMLElement>('[data-cancel]');
    cancelBtn?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Enable YOLO Mode"
    >
      <div
        ref={dialogRef}
        class="w-full max-w-[480px] bg-bg-elevated rounded-lg shadow-md border-l-4 border-l-warning"
      >
        {/* Header */}
        <div class="flex items-center gap-2 px-6 pt-5 pb-3">
          <Zap size={20} class="text-warning" />
          <h2 class="text-xl font-semibold text-text-primary">Enable YOLO Mode</h2>
        </div>

        {/* Warning content */}
        <div class="px-6 pb-4">
          <div class="flex items-start gap-3 p-3 rounded-md bg-warning-muted mb-4">
            <AlertTriangle size={16} class="text-warning mt-0.5 shrink-0" />
            <div class="text-sm text-text-primary">
              <p class="font-medium mb-2">This will auto-approve ALL permission requests:</p>
              <ul class="space-y-1 text-text-secondary">
                <li>File writes, modifications, and deletions</li>
                <li>Arbitrary bash/shell command execution</li>
                <li>Network requests and MCP tool calls</li>
              </ul>
            </div>
          </div>

          <p class="text-sm text-text-secondary mb-3">
            Recommended only for throwaway branches, sandboxed environments, or tasks you fully
            trust.
          </p>

          <p class="text-sm text-text-secondary">
            You can exit YOLO Mode at any time with the same toggle, Escape, or Emergency Stop.
          </p>
        </div>

        {/* Footer: action buttons */}
        <div class="flex items-center justify-end gap-2 px-6 pb-5">
          <button
            data-cancel
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={dismissYoloDialog}
          >
            Cancel
            <kbd class="ml-1.5 text-xs text-text-tertiary">Esc</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-white bg-warning hover:brightness-110 transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={enableYoloMode}
          >
            <span class="flex items-center gap-1.5">
              <Zap size={14} />
              Enable YOLO Mode
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default YoloWarningDialog;
```

**Step 3: Add Cmd+Shift+Y keybinding**

In `src/lib/keybindings.ts`, add the import for `toggleYoloMode`:

```typescript
import {
  toggleSidebar,
  toggleDetailsPanel,
  setActiveView,
  uiState,
  toggleYoloMode,
  type ActiveView,
} from '@/stores/uiStore';
```

Add the shortcut after the Cmd+\` block (before the `// Cmd+1/2/3/4` section):

```typescript
  // Cmd+Shift+Y — toggle YOLO mode
  if (e.code === 'KeyY' && e.shiftKey) {
    e.preventDefault();
    toggleYoloMode();
    return;
  }
```

**Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: PASS.

---

### Task 12: Update TitleBar and StatusBar for YOLO indicators

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Add YOLO toggle button to TitleBar**

In `src/components/layout/TitleBar.tsx`:

**a)** Add imports:

```typescript
import { Menu, Minus, Maximize2, X, Zap } from 'lucide-solid';
import { toggleSidebar, uiState, toggleYoloMode } from '@/stores/uiStore';
```

(Replace the existing `import { Menu, Minus, Maximize2, X }` and `import { toggleSidebar }` lines.)

**b)** Add the YOLO toggle button after the app name `<span>` (after line 30, before the drag region):

```tsx
        <Show when={uiState.yoloMode}>
          <span class="px-2 py-0.5 rounded text-xs font-medium bg-warning-muted text-warning animate-pulse">
            YOLO
          </span>
        </Show>
```

Also add `Show` to the imports from `solid-js`:

```typescript
import type { Component } from 'solid-js';
import { Show } from 'solid-js';
```

**c)** Add the YOLO toggle button in the window controls area, before the minimize button:

```tsx
        <button
          class={`flex items-center justify-center w-12 h-full transition-colors ${
            uiState.yoloMode
              ? 'text-warning bg-warning-muted'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleYoloMode}
          aria-label={uiState.yoloMode ? 'Disable YOLO Mode' : 'Enable YOLO Mode'}
          title={uiState.yoloMode ? 'YOLO Mode active (Cmd+Shift+Y)' : 'Enable YOLO Mode (Cmd+Shift+Y)'}
        >
          <Zap size={14} />
        </button>
```

**Step 2: Add YOLO indicator to StatusBar**

In `src/components/layout/StatusBar.tsx`:

**a)** Add imports:

```typescript
import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { uiState } from '@/stores/uiStore';
```

**b)** Replace the left `<span>Ready</span>` with:

```tsx
      {/* Left: status */}
      <Show when={uiState.yoloMode} fallback={<span>Ready</span>}>
        <span class="text-warning font-semibold">YOLO MODE</span>
      </Show>
```

**Step 3: Wire YoloWarningDialog into MainLayout**

In `src/components/layout/MainLayout.tsx`:

**a)** Add import:

```typescript
import YoloWarningDialog from '@/components/permissions/YoloWarningDialog';
```

**b)** Add the dialog after the PermissionDialog `<Show>` block (before the closing `</div>` of the root element):

```tsx
      {/* YOLO warning dialog */}
      <Show when={uiState.yoloDialogVisible}>
        <YoloWarningDialog />
      </Show>
```

**Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/ && npx prettier --check src/`
Expected: All PASS.

---

### Task 13: Verify all checks and commit CHI-26

**Step 1: Run all frontend checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/ && npx prettier --check src/ && npx vite build
```
Expected: All PASS.

**Step 2: Run all Rust checks**

Run:
```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings
```
Expected: All tests pass (59 total — 55 existing + 4 new YOLO tests). No clippy warnings.

**Step 3: Commit**

```bash
git add src-tauri/src/bridge/permission.rs \
        src/stores/uiStore.ts \
        src/lib/keybindings.ts \
        src/components/permissions/YoloWarningDialog.tsx \
        src/components/layout/TitleBar.tsx \
        src/components/layout/StatusBar.tsx \
        src/components/layout/MainLayout.tsx
git commit -m "CHI-26: implement YOLO Mode (auto-approve all permission requests)

Backend:
- PermissionManager gains yolo_mode field with enable/disable/is methods
- YOLO mode auto-approves all requests immediately with [YOLO] log prefix
- 4 new unit tests for YOLO behavior

Frontend:
- YoloWarningDialog: mandatory confirmation with risk explanation
- TitleBar: Zap toggle button + pulsing YOLO badge when active
- StatusBar: 'YOLO MODE' indicator in warning color
- Cmd+Shift+Y keyboard shortcut to toggle
- Session-scoped: resets on app restart"
```

---

## Post-Completion

**Step 1: Push all commits**

```bash
git push origin main
```

**Step 2: Update tracking files**

Update `.claude/handover.json`:
- CHI-18: status → "done", add files list and notes
- CHI-21: status → "done", add files list and notes
- CHI-26: status → "done", add files list and notes
- CHI-7 epic notes: "CHI-17, CHI-18, CHI-19, CHI-21, CHI-23, CHI-26 done"
- recommended_next: ["CHI-20", "CHI-22", "CHI-24"]

Update `CLAUDE.md`:
- Add CHI-18, CHI-21, CHI-26 to What's Done table
- Update CHI-7 remaining tasks in What's Next

**Step 3: Update Linear**

Mark CHI-18, CHI-21, CHI-26 as Done in Linear.

---

## Deferred Items (Not In Scope)

These acceptance criteria items are noted but deferred:

- **CHI-18**: Virtual scrolling for >100 messages (premature optimization — add when perf data exists)
- **CHI-18**: Collapsible thinking blocks and plan blocks (needs IPC streaming to be meaningful)
- **CHI-18**: Collapsible tool use blocks with mini-diff (needs IPC + diff infrastructure)
- **CHI-21**: Split view (GUI + Terminal side-by-side) — significant layout rework, separate task
- **CHI-21**: Full PTY connection — requires IPC commands module (separate task)
- **CHI-26**: IPC commands (`toggle_yolo_mode`, `yolo_mode:changed` event) — waiting for commands module
- **CHI-26**: Auto-approved action toast notifications — requires toast/notification system
