# Phase 2 Batch 3 — UX Polish & Interactions

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add smooth streaming, toast notifications, micro-interactions, per-message cost, session sections, permission records, titlebar redesign, and session quick-switcher.

**Architecture:** 8 issues organized by dependency order. Infrastructure first (toasts, typewriter buffer), then UI polish (copy feedback, per-message cost, titlebar), then sidebar features (session sections, quick-switcher), then inline permission records.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, lucide-solid icons, Tauri v2, Rust/SQLite (for session pinning migration)

---

## Task 1: CHI-74 — Toast Notification System

Toast infrastructure used by many subsequent tasks. Fixed bottom-right container, max 3 visible, 4 variants.

**Files:**
- Create: `src/stores/toastStore.ts`
- Create: `src/components/common/ToastContainer.tsx`
- Modify: `src/styles/tokens.css` — add slide-in/out keyframes
- Modify: `src/components/layout/MainLayout.tsx` — render `<ToastContainer />`

### Step 1: Add toast keyframe animations to tokens.css

Add after the existing `typing-bounce` keyframe (around line 247):

```css
@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slide-out-right {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
```

And add utility classes after the existing `.animate-typing-bounce` class:

```css
.animate-slide-in-right {
  animation: slide-in-right 0.3s var(--ease-default) forwards;
}

.animate-slide-out-right {
  animation: slide-out-right 0.3s var(--ease-default) forwards;
}
```

### Step 2: Create toastStore.ts

```typescript
// src/stores/toastStore.ts
// Toast notification state. Max 3 visible, auto-dismiss timers.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
  dismissing?: boolean;
}

interface ToastState {
  toasts: Toast[];
}

const [state, setState] = createStore<ToastState>({
  toasts: [],
});

const timers = new Map<string, ReturnType<typeof setTimeout>>();

const AUTO_DISMISS_MS: Record<ToastVariant, number | null> = {
  success: 5000,
  info: 5000,
  warning: 10000,
  error: null, // persistent — user must dismiss
};

/** Add a toast notification. Returns the toast ID. */
export function addToast(
  message: string,
  variant: ToastVariant = 'info',
  action?: Toast['action'],
): string {
  const id = crypto.randomUUID();
  const toast: Toast = { id, message, variant, action };

  setState('toasts', (prev) => {
    // Keep max 3 — remove oldest if full
    const updated = [...prev, toast];
    if (updated.length > 3) {
      const removed = updated.shift()!;
      clearTimer(removed.id);
    }
    return updated;
  });

  // Auto-dismiss timer
  const ms = AUTO_DISMISS_MS[variant];
  if (ms) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), ms),
    );
  }

  return id;
}

/** Dismiss a toast with slide-out animation. */
export function dismissToast(id: string): void {
  clearTimer(id);
  // Mark as dismissing for exit animation
  setState('toasts', (t) => t.id === id, 'dismissing', true);
  // Remove after animation completes
  setTimeout(() => {
    setState('toasts', (prev) => prev.filter((t) => t.id !== id));
  }, 300);
}

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export { state as toastState };
```

### Step 3: Create ToastContainer.tsx

```typescript
// src/components/common/ToastContainer.tsx
// Fixed bottom-right toast container. Renders up to 3 toasts with enter/exit animations.

import type { Component } from 'solid-js';
import { For } from 'solid-js';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-solid';
import { toastState, dismissToast, type ToastVariant } from '@/stores/toastStore';

function variantColor(variant: ToastVariant): string {
  switch (variant) {
    case 'success': return 'var(--color-success)';
    case 'warning': return 'var(--color-warning)';
    case 'error': return 'var(--color-error)';
    case 'info': return 'var(--color-text-link)';
  }
}

function VariantIcon(props: { variant: ToastVariant }) {
  const color = () => variantColor(props.variant);
  switch (props.variant) {
    case 'success': return <CheckCircle size={14} color={color()} />;
    case 'warning': return <AlertTriangle size={14} color={color()} />;
    case 'error': return <XCircle size={14} color={color()} />;
    case 'info': return <Info size={14} color={color()} />;
  }
}

const ToastContainer: Component = () => {
  return (
    <div
      class="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      style={{ 'max-width': '360px', 'min-width': '280px' }}
      role="region"
      aria-label="Notifications"
    >
      <For each={toastState.toasts}>
        {(toast) => (
          <div
            class={toast.dismissing ? 'animate-slide-out-right' : 'animate-slide-in-right'}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
              'border-left': `3px solid ${variantColor(toast.variant)}`,
              'border-radius': '8px',
              'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div class="flex items-start gap-2.5 px-3 py-2.5">
              <div class="mt-0.5 shrink-0">
                <VariantIcon variant={toast.variant} />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-text-primary leading-relaxed">{toast.message}</p>
                {toast.action && (
                  <button
                    class="mt-1.5 text-[11px] font-medium transition-colors"
                    style={{ color: variantColor(toast.variant) }}
                    onClick={toast.action.onClick}
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                class="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};

export default ToastContainer;
```

### Step 4: Add ToastContainer to MainLayout

In `src/components/layout/MainLayout.tsx`, add import and render:

```typescript
// Add import at top (after CommandPalette import):
import ToastContainer from '@/components/common/ToastContainer';

// Add just before closing </div> of root (after CommandPalette Show block, before line 186):
<ToastContainer />
```

### Step 5: Verify

Run: `npx tsc --noEmit && npx eslint src/stores/toastStore.ts src/components/common/ToastContainer.tsx src/components/layout/MainLayout.tsx src/styles/tokens.css`

Expected: No errors.

### Step 6: Commit

```bash
git add src/stores/toastStore.ts src/components/common/ToastContainer.tsx src/components/layout/MainLayout.tsx src/styles/tokens.css
git commit -m "feat(CHI-74): toast notification system with auto-dismiss and slide animations"
```

---

## Task 2: CHI-73 — Smooth Streaming Text (Typewriter Buffer)

Buffer incoming chunks and flush at ~5ms intervals for smooth typewriter rendering instead of jarring chunk-by-chunk display.

**Files:**
- Create: `src/lib/typewriterBuffer.ts`
- Modify: `src/stores/conversationStore.ts` — route chunks through buffer

### Step 1: Create typewriterBuffer.ts

```typescript
// src/lib/typewriterBuffer.ts
// Character buffer for smooth streaming text rendering (CHI-73).
// Buffers incoming chunks and flushes at ~5ms intervals.
// Respects prefers-reduced-motion by bypassing buffering.

import { createSignal } from 'solid-js';

export interface TypewriterBuffer {
  /** Push new content into the buffer. */
  push(text: string): void;
  /** Get the currently rendered content (reactive SolidJS signal). */
  rendered: () => string;
  /** Reset the buffer and rendered content. */
  reset(): void;
  /** Flush all remaining buffered content immediately. */
  flush(): void;
}

export function createTypewriterBuffer(flushIntervalMs = 5): TypewriterBuffer {
  const [rendered, setRendered] = createSignal('');
  let buffer = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function startTimer() {
    if (timer || prefersReducedMotion) return;
    timer = setInterval(() => {
      if (buffer.length === 0) {
        stopTimer();
        return;
      }
      // Adaptive drain: flush more chars when buffer is large to prevent lag
      const drainSize = buffer.length > 200 ? Math.ceil(buffer.length / 4) : buffer.length > 50 ? 10 : 3;
      const chunk = buffer.slice(0, drainSize);
      buffer = buffer.slice(drainSize);
      setRendered((prev) => prev + chunk);
    }, flushIntervalMs);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function push(text: string) {
    if (prefersReducedMotion) {
      // No buffering — append directly
      setRendered((prev) => prev + text);
      return;
    }
    buffer += text;
    startTimer();
  }

  function reset() {
    stopTimer();
    buffer = '';
    setRendered('');
  }

  function flush() {
    stopTimer();
    if (buffer.length > 0) {
      setRendered((prev) => prev + buffer);
      buffer = '';
    }
  }

  return { push, rendered, reset, flush };
}
```

### Step 2: Integrate into conversationStore

In `src/stores/conversationStore.ts`:

1. Import the buffer at the top:
```typescript
import { createTypewriterBuffer } from '@/lib/typewriterBuffer';
```

2. Create the buffer instance after the store declaration (around line 38):
```typescript
/** Typewriter buffer for smooth streaming rendering (CHI-73). */
const typewriter = createTypewriterBuffer();
```

3. In the `message:chunk` listener (around line 75), replace direct concatenation:
```typescript
// OLD:
setState('streamingContent', (prev) => prev + event.payload.content);

// NEW:
typewriter.push(event.payload.content);
```

4. In the `message:complete` handler (around line 128), flush the buffer before using content:
```typescript
// Add before the line `const finalContent = p.content || state.streamingContent;`:
typewriter.flush();
const finalContent = p.content || typewriter.rendered();
```

5. In the `cli:exited` handler (around line 197), flush the buffer:
```typescript
// Add before the line `const accumulated = state.streamingContent;`:
typewriter.flush();
const accumulated = typewriter.rendered();
```

6. In `clearMessages()`, reset the buffer:
```typescript
// Add inside clearMessages():
typewriter.reset();
```

7. Export the typewriter rendered signal for ConversationView:
```typescript
export { typewriter };
```

### Step 3: Update ConversationView to use typewriter

In `src/components/conversation/ConversationView.tsx`:

1. Import typewriter:
```typescript
import { conversationState, retryLastMessage, sendMessage, typewriter } from '@/stores/conversationStore';
```

2. Update the auto-scroll effect to track typewriter signal instead of streamingContent:
```typescript
// Change line 44:
void typewriter.rendered();  // was: void conversationState.streamingContent;
```

3. Update streaming content Show condition and rendering:
```typescript
// Change line 196:
<Show when={conversationState.isStreaming && typewriter.rendered()}>
  {/* ... inside, change line 210: */}
  <MarkdownContent content={typewriter.rendered()} />
```

### Step 4: Verify

Run: `npx tsc --noEmit && npx eslint src/lib/typewriterBuffer.ts src/stores/conversationStore.ts src/components/conversation/ConversationView.tsx`

Expected: No errors.

### Step 5: Commit

```bash
git add src/lib/typewriterBuffer.ts src/stores/conversationStore.ts src/components/conversation/ConversationView.tsx
git commit -m "feat(CHI-73): typewriter buffer for smooth streaming text rendering"
```

---

## Task 3: CHI-68 — Titlebar Redesign

Reorganize TitleBar with platform-aware layout. Add settings gear. Clean up structure.

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`

### Step 1: Redesign TitleBar

Replace the full TitleBar component. Key changes:
- Remove sidebar toggle (Cmd+B and collapsed icon-rail handle this now)
- Add Settings gear icon (toggles DetailsPanel for now)
- macOS layout: `[70px traffic spacer][app name + badges][center drag: model selector][gear][permission tier]`
- Windows layout: `[app name + badges][center drag: model selector][gear][permission tier][window buttons]`

In `src/components/layout/TitleBar.tsx`:

1. Add `Settings` to lucide imports:
```typescript
import { Minus, Maximize2, X, Zap, Shield, ShieldCheck, Settings } from 'lucide-solid';
```

2. Add `toggleDetailsPanel` to uiStore imports:
```typescript
import {
  uiState,
  cyclePermissionTier,
  getPermissionTier,
  toggleDetailsPanel,
} from '@/stores/uiStore';
```

3. Remove the sidebar toggle button entirely (the `<button>` with `onClick={toggleSidebar}` and the `Menu` icon). Remove the `toggleSidebar` import and `Menu` from lucide imports.

4. Add settings gear button before the permission tier button:
```tsx
{/* Settings gear — toggles details panel */}
<button
  class="flex items-center justify-center w-10 h-full text-text-tertiary hover:text-text-primary transition-colors"
  style={{ 'transition-duration': 'var(--duration-fast)' }}
  onClick={toggleDetailsPanel}
  aria-label="Toggle settings panel"
  title="Toggle details panel (Cmd+Shift+B)"
>
  <Settings size={13} />
</button>
```

5. Simplify app name display — remove the sidebar toggle, keep just:
```tsx
<div class="flex items-center gap-2.5 px-3">
  <span
    class="text-sm font-semibold tracking-tight text-text-primary"
    style={{ 'letter-spacing': '-0.02em' }}
  >
    Chief Wiggum
  </span>
  {/* YOLO and DEV badges remain unchanged */}
</div>
```

### Step 2: Verify

Run: `npx tsc --noEmit && npx eslint src/components/layout/TitleBar.tsx`

Expected: No errors.

### Step 3: Commit

```bash
git add src/components/layout/TitleBar.tsx
git commit -m "feat(CHI-68): titlebar redesign with settings gear and cleaner layout"
```

---

## Task 4: CHI-75 — Copy Feedback & Hover Micro-interactions

Add clipboard-to-check icon swap on copy, message hover effects, session hover border slide, button press scale.

**Files:**
- Modify: `src/components/conversation/MarkdownContent.tsx` — copy icon swap
- Modify: `src/components/conversation/MessageBubble.tsx` — hover luminance
- Modify: `src/components/layout/Sidebar.tsx` — session hover border
- Modify: `src/styles/tokens.css` — utility classes

### Step 1: Add utility classes to tokens.css

Add after the existing `.animate-slide-out-right` class:

```css
/* Micro-interaction utilities (CHI-75) */
.press-feedback:active {
  transform: scale(0.97);
  transition: transform 100ms ease;
}

.hover-lift {
  transition: background 150ms ease;
}
.hover-lift:hover {
  filter: brightness(1.08);
}
```

### Step 2: Upgrade copy button in MarkdownContent.tsx

In `src/components/conversation/MarkdownContent.tsx`, update the copy button creation (around lines 45-56). Replace the text-based "Copy"/"Copied!" with SVG icon swap:

```typescript
const btn = document.createElement('button');
btn.className = 'copy-btn';
btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
btn.addEventListener('click', () => {
  const code = pre.querySelector('code')?.textContent || '';
  navigator.clipboard.writeText(code);
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  btn.style.color = 'var(--color-success)';
  setTimeout(() => {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    btn.style.color = '';
  }, 2000);
});
pre.appendChild(btn);
```

### Step 3: Add hover effect to MessageBubble

In `src/components/conversation/MessageBubble.tsx`, add `hover-lift` class to the message container div (line 84):

```typescript
class="max-w-[85%] rounded-lg px-4 py-3 relative hover-lift"
```

### Step 4: Add hover border slide to session items in Sidebar

In `src/components/layout/Sidebar.tsx`, in the `SessionItem` component, add a hover-activated left border element. Add after the existing active indicator `Show` block (around line 443):

```tsx
{/* Hover border slide (only when NOT active) */}
<Show when={!props.isActive}>
  <div
    class="absolute left-0 top-1.5 bottom-1.5 rounded-full transition-all"
    style={{
      width: '0px',
      background: 'var(--color-accent)',
      opacity: '0',
      'transition-duration': 'var(--duration-fast)',
    }}
    classList={{
      'group-hover:!w-[2px] group-hover:!opacity-40': true,
    }}
  />
</Show>
```

**Note:** Since TailwindCSS v4 may not generate dynamic `group-hover:` utilities with `!` modifier, use inline style approach with `onMouseEnter`/`onMouseLeave` on the parent instead — set the border div width/opacity via a ref. Alternatively, give the border div a data attribute and use CSS:

Actually, simpler approach — add to the existing `onMouseEnter`/`onMouseLeave` handlers on the SessionItem container (lines 403-414). The container already has `class="group"`. Add a ref to the border element and toggle its style in the hover handlers.

### Step 5: Verify

Run: `npx tsc --noEmit && npx eslint src/components/conversation/MarkdownContent.tsx src/components/conversation/MessageBubble.tsx src/components/layout/Sidebar.tsx`

Expected: No errors.

### Step 6: Commit

```bash
git add src/components/conversation/MarkdownContent.tsx src/components/conversation/MessageBubble.tsx src/components/layout/Sidebar.tsx src/styles/tokens.css
git commit -m "feat(CHI-75): copy icon swap, message hover, session border slide, press feedback"
```

---

## Task 5: CHI-55 — Per-message Token/Cost in MessageBubble

Show formatted footer with timestamp, token count, and cost. Add hover Copy/Retry buttons.

**Files:**
- Modify: `src/components/conversation/MessageBubble.tsx`

### Step 1: Rewrite the footer section

In `src/components/conversation/MessageBubble.tsx`:

1. Add imports:
```typescript
import { Component, Show, createSignal } from 'solid-js';
import { Copy, RotateCcw, Check } from 'lucide-solid';
import { addToast } from '@/stores/toastStore';
```

2. Add a token formatter helper (after `formatTime`):
```typescript
/** Format token count as K notation */
function formatTokens(input: number | null, output: number | null): string | null {
  const total = (input ?? 0) + (output ?? 0);
  if (total === 0) return null;
  return total >= 1000 ? `${(total / 1000).toFixed(1)}K tokens` : `${total} tokens`;
}

/** Format cost in dollars */
function formatCost(cents: number | null): string | null {
  if (!cents || cents <= 0) return null;
  return `$${(cents / 100).toFixed(2)}`;
}
```

3. Replace the footer section (lines 149-163) with:

```tsx
{/* Footer: timestamp + tokens + cost + hover actions */}
<div class="group/footer flex items-center gap-2 mt-2">
  <div
    class="flex items-center gap-1.5 font-mono"
    style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)', opacity: '0.6' }}
  >
    <span>{formatTime(props.message.created_at)}</span>
    <Show when={!isUser() && formatTokens(props.message.input_tokens, props.message.output_tokens)}>
      {(tokens) => (
        <>
          <span style={{ opacity: '0.4' }}>·</span>
          <span>{tokens()}</span>
        </>
      )}
    </Show>
    <Show when={!isUser() && formatCost(props.message.cost_cents)}>
      {(cost) => (
        <>
          <span style={{ opacity: '0.4' }}>·</span>
          <span>{cost()}</span>
        </>
      )}
    </Show>
  </div>

  {/* Hover actions — Copy + Retry (assistant only) */}
  <Show when={!isUser() && !isSystem() && props.message.role === 'assistant'}>
    <div class="flex items-center gap-1 opacity-0 group-hover/footer:opacity-100 transition-opacity" style={{ 'transition-duration': 'var(--duration-fast)' }}>
      <CopyButton content={props.message.content} />
    </div>
  </Show>
</div>
```

4. Add a `CopyButton` sub-component inside the file:

```tsx
const CopyButton: Component<{ content: string }> = (props) => {
  const [copied, setCopied] = createSignal(false);
  return (
    <button
      class="p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors press-feedback"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() => {
        navigator.clipboard.writeText(props.content);
        setCopied(true);
        addToast('Copied to clipboard', 'success');
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label="Copy message"
      title="Copy message"
    >
      <Show when={copied()} fallback={<Copy size={11} />}>
        <Check size={11} color="var(--color-success)" />
      </Show>
    </button>
  );
};
```

### Step 2: Verify

Run: `npx tsc --noEmit && npx eslint src/components/conversation/MessageBubble.tsx`

Expected: No errors.

### Step 3: Commit

```bash
git add src/components/conversation/MessageBubble.tsx
git commit -m "feat(CHI-55): per-message token/cost display with copy button and toast feedback"
```

---

## Task 6: CHI-85 — Session Sections (Pinned, Recent, Older)

Group sessions into collapsible sections. Requires DB migration for `pinned` column.

**Files:**
- Modify: `src-tauri/src/db/migrations.rs` — migration v3: add `pinned` column
- Modify: `src-tauri/src/db/queries.rs` — update `SessionRow`, add `update_session_pinned`
- Modify: `src-tauri/src/commands/session.rs` — add `toggle_session_pinned` IPC
- Modify: `src-tauri/src/main.rs` — register new command
- Modify: `src/lib/types.ts` — add `pinned` to `Session`
- Modify: `src/stores/sessionStore.ts` — add `toggleSessionPinned()`
- Modify: `src/components/layout/Sidebar.tsx` — grouped sections with collapsible headers

### Step 1: DB migration v3

In `src-tauri/src/db/migrations.rs`, add after the version 2 migration (after line 113):

```rust
Migration {
    version: 3,
    description: "Add pinned column to sessions for section grouping",
    sql: "ALTER TABLE sessions ADD COLUMN pinned BOOLEAN DEFAULT 0;",
},
```

### Step 2: Update SessionRow in queries.rs

In `src-tauri/src/db/queries.rs`, find the `SessionRow` struct and add:

```rust
pub pinned: Option<bool>,
```

Update ALL `SELECT` queries that read from sessions to include `pinned`. This includes:
- `list_sessions` — add `pinned` to SELECT columns
- `create_session` — ensure `pinned` is returned (will be DEFAULT 0)
- `get_session` (if any) — add `pinned`
- `get_session_cost` — add `pinned`

Add a new query function:

```rust
pub fn update_session_pinned(
    conn: &Connection,
    session_id: &str,
    pinned: bool,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE sessions SET pinned = ?1 WHERE id = ?2",
        rusqlite::params![pinned, session_id],
    )?;
    Ok(())
}
```

### Step 3: Add IPC command

In `src-tauri/src/commands/session.rs`, add:

```rust
#[tauri::command]
pub async fn toggle_session_pinned(
    db: State<'_, Database>,
    session_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        queries::update_session_pinned(conn, &session_id, pinned)
            .map_err(AppError::Database)
    })
}
```

### Step 4: Register command in main.rs

In `src-tauri/src/main.rs`, add `commands::session::toggle_session_pinned` to the `.invoke_handler(tauri::generate_handler![...])` list.

### Step 5: Update frontend types

In `src/lib/types.ts`, add to the `Session` interface:

```typescript
pinned: boolean | null;
```

### Step 6: Add toggleSessionPinned to sessionStore

In `src/stores/sessionStore.ts`, add:

```typescript
/** Toggle the pinned state of a session. */
export async function toggleSessionPinned(sessionId: string): Promise<void> {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const newPinned = !session.pinned;
  await invoke('toggle_session_pinned', { session_id: sessionId, pinned: newPinned });
  setState('sessions', (s) => s.id === sessionId, 'pinned', newPinned);
}
```

### Step 7: Rewrite Sidebar session list with sections

In `src/components/layout/Sidebar.tsx`:

1. Add `Pin` icon to lucide imports:
```typescript
import { Plus, Trash2, MessageSquare, FolderOpen, Pin } from 'lucide-solid';
```

2. Add `toggleSessionPinned` to sessionStore imports.

3. Add `createSignal` for section collapse state, and computed section lists. Inside the `Sidebar` component:

```typescript
const [pinnedOpen, setPinnedOpen] = createSignal(true);
const [recentOpen, setRecentOpen] = createSignal(true);
const [olderOpen, setOlderOpen] = createSignal(true);

const pinnedSessions = () => filteredSessions().filter((s) => s.pinned);
const recentSessions = () => {
  const cutoff = Date.now() - 86400000; // 24 hours
  return filteredSessions().filter(
    (s) => !s.pinned && s.updated_at && new Date(s.updated_at).getTime() > cutoff,
  );
};
const olderSessions = () => {
  const cutoff = Date.now() - 86400000;
  return filteredSessions().filter(
    (s) => !s.pinned && (!s.updated_at || new Date(s.updated_at).getTime() <= cutoff),
  );
};
```

4. Replace the flat `<For each={filteredSessions()}>` with three collapsible sections. Use a `SidebarSection` helper:

```tsx
function SidebarSection(props: {
  title: string;
  sessions: Session[];
  open: boolean;
  onToggle: () => void;
  isCollapsed: boolean;
  // ... pass through session handlers
}) {
  // Render nothing if section is empty
  if (props.sessions.length === 0) return null;
  // If sidebar is collapsed, skip headers and just render icons
  // Otherwise render collapsible header + session list
}
```

5. Add a pin button to `SessionItem` (alongside the delete button):

```tsx
<button
  class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-accent transition-opacity"
  style={{ 'transition-duration': 'var(--duration-fast)' }}
  onClick={(e) => {
    e.stopPropagation();
    toggleSessionPinned(props.session.id);
  }}
  aria-label={props.session.pinned ? 'Unpin session' : 'Pin session'}
>
  <Pin size={11} class={props.session.pinned ? 'fill-current' : ''} />
</button>
```

### Step 8: Verify

Run: `cargo test` (expect tests to pass — migration v3 auto-applies), `npx tsc --noEmit`, `npx eslint .`

Expected: All pass. Test count should still be 78 (no new test needed for simple ALTER TABLE).

### Step 9: Commit

```bash
git add src-tauri/src/db/migrations.rs src-tauri/src/db/queries.rs src-tauri/src/commands/session.rs src-tauri/src/main.rs src/lib/types.ts src/stores/sessionStore.ts src/components/layout/Sidebar.tsx
git commit -m "feat(CHI-85): session sections (Pinned/Recent/Older) with collapsible headers and pin toggle"
```

---

## Task 7: CHI-77 — Session Quick-Switcher (Cmd+Shift+P)

Filtered variant of CommandPalette showing only sessions with model badges.

**Files:**
- Modify: `src/stores/uiStore.ts` — add `sessionSwitcherVisible` state
- Modify: `src/components/common/CommandPalette.tsx` — add `mode` prop for session-only filtering
- Modify: `src/lib/keybindings.ts` — add Cmd+Shift+P
- Modify: `src/components/layout/MainLayout.tsx` — render switcher

### Step 1: Add state to uiStore

In `src/stores/uiStore.ts`:

1. Add to `UIState` interface:
```typescript
sessionSwitcherVisible: boolean;
```

2. Add to initial state:
```typescript
sessionSwitcherVisible: false,
```

3. Add functions:
```typescript
export function openSessionSwitcher() {
  setState('sessionSwitcherVisible', true);
}
export function closeSessionSwitcher() {
  setState('sessionSwitcherVisible', false);
}
```

### Step 2: Add mode prop to CommandPalette

In `src/components/common/CommandPalette.tsx`:

1. Add props interface:
```typescript
interface CommandPaletteProps {
  /** When 'sessions', only show session commands. Default: show all. */
  mode?: 'all' | 'sessions';
  onClose?: () => void;
}

const CommandPalette: Component<CommandPaletteProps> = (props) => {
  const mode = () => props.mode ?? 'all';
  const handleClose = () => {
    if (props.onClose) props.onClose();
    else closeCommandPalette();
  };
```

2. Filter commands based on mode:
```typescript
// In the commands memo, wrap the existing commands:
const allCommands = /* existing commands array */;
return mode() === 'sessions'
  ? allCommands.filter((c) => c.category === 'Sessions')
  : allCommands;
```

3. Update the placeholder text:
```typescript
placeholder={mode() === 'sessions' ? 'Switch to session...' : 'Type a command...'}
```

4. Add model badge display for session commands — in the command item rendering, when the command has a session model, show a colored dot:
```tsx
{/* Inside the command item, add after the label: */}
<Show when={cmd.category === 'Sessions'}>
  {/* The session title includes the model — add badge color dot */}
</Show>
```

Actually, to properly show model badges, the `Command` interface needs a `meta` field. Add:
```typescript
interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon?: () => JSX.Element;
  action: () => void;
  meta?: { model?: string }; // For session commands
}
```

When building session commands, add the meta:
```typescript
meta: { model: session.model }
```

Then in the rendering, show a badge dot using the model color.

### Step 3: Add Cmd+Shift+P to keybindings

In `src/lib/keybindings.ts`:

```typescript
import { openSessionSwitcher } from '@/stores/uiStore';

// Add after the Cmd+K handler:
// Cmd+Shift+P — session quick-switcher
if (e.code === 'KeyP' && e.shiftKey) {
  e.preventDefault();
  openSessionSwitcher();
  return;
}
```

### Step 4: Render in MainLayout

In `src/components/layout/MainLayout.tsx`:

```typescript
import { closeSessionSwitcher } from '@/stores/uiStore';

// Add after the CommandPalette Show block:
<Show when={uiState.sessionSwitcherVisible}>
  <CommandPalette mode="sessions" onClose={closeSessionSwitcher} />
</Show>
```

### Step 5: Verify

Run: `npx tsc --noEmit && npx eslint .`

Expected: No errors.

### Step 6: Commit

```bash
git add src/stores/uiStore.ts src/components/common/CommandPalette.tsx src/lib/keybindings.ts src/components/layout/MainLayout.tsx
git commit -m "feat(CHI-77): session quick-switcher (Cmd+Shift+P) as filtered command palette"
```

---

## Task 8: CHI-91 — Permission Inline Record

Show inline permission outcome blocks in the conversation after a permission dialog resolves or YOLO auto-approves.

**Files:**
- Create: `src/components/conversation/PermissionRecordBlock.tsx`
- Modify: `src/lib/types.ts` — add `'permission'` role, `PermissionRecordData` type
- Modify: `src/stores/conversationStore.ts` — persist permission records after dialog response
- Modify: `src/components/conversation/ConversationView.tsx` — render permission blocks
- Modify: `src/components/layout/MainLayout.tsx` — capture permission outcome and store

### Step 1: Update types

In `src/lib/types.ts`:

1. Add `'permission'` to `MessageRole`:
```typescript
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'thinking' | 'permission';
```

2. Add data type:
```typescript
/** Structured data stored in permission message content (JSON string). */
export interface PermissionRecordData {
  tool: string;
  command: string;
  outcome: 'allowed' | 'denied' | 'yolo';
  risk_level: string;
}
```

### Step 2: Create PermissionRecordBlock

```typescript
// src/components/conversation/PermissionRecordBlock.tsx
// Inline permission outcome display per CHI-91.

import type { Component } from 'solid-js';
import { Show, createSignal } from 'solid-js';
import { CheckCircle, XCircle, Zap, ChevronDown, ChevronRight } from 'lucide-solid';
import type { Message, PermissionRecordData } from '../../lib/types';

interface PermissionRecordBlockProps {
  message: Message;
}

function parsePermissionContent(content: string): PermissionRecordData {
  try {
    return JSON.parse(content) as PermissionRecordData;
  } catch {
    return { tool: 'Unknown', command: content, outcome: 'denied', risk_level: 'low' };
  }
}

function outcomeColor(outcome: PermissionRecordData['outcome']): string {
  switch (outcome) {
    case 'allowed': return 'var(--color-tool-permission-allow)';
    case 'denied': return 'var(--color-tool-permission-deny)';
    case 'yolo': return 'var(--color-tool-permission-yolo)';
  }
}

function outcomeLabel(outcome: PermissionRecordData['outcome']): string {
  switch (outcome) {
    case 'allowed': return 'Allowed';
    case 'denied': return 'Denied';
    case 'yolo': return 'Auto-approved (YOLO)';
  }
}

export const PermissionRecordBlock: Component<PermissionRecordBlockProps> = (props) => {
  const data = () => parsePermissionContent(props.message.content);
  const color = () => outcomeColor(data().outcome);
  const [expanded, setExpanded] = createSignal(false);

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
          <div class="w-[3px] shrink-0" style={{ background: color() }} />
          <div class="flex-1 min-w-0">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => setExpanded((p) => !p)}
              aria-expanded={expanded()}
            >
              <Show when={data().outcome === 'allowed'}>
                <CheckCircle size={12} color={color()} />
              </Show>
              <Show when={data().outcome === 'denied'}>
                <XCircle size={12} color={color()} />
              </Show>
              <Show when={data().outcome === 'yolo'}>
                <Zap size={12} color={color()} />
              </Show>
              <span class="text-xs font-mono" style={{ color: color() }}>
                {data().tool}
              </span>
              <span class="text-[11px] text-text-tertiary truncate flex-1">
                {outcomeLabel(data().outcome)}
              </span>
              <Show
                when={expanded()}
                fallback={<ChevronRight size={12} color="var(--color-text-tertiary)" class="shrink-0" />}
              >
                <ChevronDown size={12} color="var(--color-text-tertiary)" class="shrink-0" />
              </Show>
            </button>

            <Show when={expanded()}>
              <div
                class="px-3 pb-2 border-t"
                style={{ 'border-color': 'var(--color-border-secondary)' }}
              >
                <pre
                  class="mt-1.5 rounded overflow-x-auto text-xs leading-5"
                  style={{
                    'font-family': 'var(--font-mono)',
                    background: 'var(--color-bg-inset)',
                    padding: '8px 12px',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <code>{data().command}</code>
                </pre>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### Step 3: Add permission message persistence

In `src/stores/conversationStore.ts`, add a new exported function:

```typescript
/** Record a permission outcome as an inline message. */
export function recordPermissionOutcome(
  sessionId: string,
  tool: string,
  command: string,
  outcome: 'allowed' | 'denied' | 'yolo',
  riskLevel: string,
): void {
  const msgId = crypto.randomUUID();
  const content = JSON.stringify({ tool, command, outcome, risk_level: riskLevel });
  const msg: Message = {
    id: msgId,
    session_id: sessionId,
    role: 'permission',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
  setState('messages', (prev) => [...prev, msg]);
  invoke('save_message', {
    session_id: sessionId,
    id: msgId,
    role: 'permission',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) => console.error('[conversationStore] Failed to persist permission record:', err));
}
```

### Step 4: Call recordPermissionOutcome from MainLayout

In `src/components/layout/MainLayout.tsx`, in the `onRespond` handler (around line 158):

```typescript
import { recordPermissionOutcome } from '@/stores/conversationStore';

// Inside onRespond, after dismissPermissionDialog():
const outcome = action === 'Approve' || action === 'AlwaysAllow' ? 'allowed' : 'denied';
const sid = sessionState.activeSessionId;
if (sid) {
  recordPermissionOutcome(sid, req.tool, req.command, outcome, req.risk_level);
}
```

### Step 5: Add rendering branch in ConversationView

In `src/components/conversation/ConversationView.tsx`:

1. Import:
```typescript
import { PermissionRecordBlock } from './PermissionRecordBlock';
```

2. Add branch in the message rendering (around line 177):
```tsx
{msg.role === 'tool_use' ? (
  <ToolUseBlock message={msg} />
) : msg.role === 'tool_result' ? (
  <ToolResultBlock message={msg} />
) : msg.role === 'thinking' ? (
  <ThinkingBlock message={msg} />
) : msg.role === 'permission' ? (
  <PermissionRecordBlock message={msg} />
) : (
  <MessageBubble message={msg} />
)}
```

### Step 6: Update MessageBubble roleLabel

In `src/components/conversation/MessageBubble.tsx`, add to `roleLabel()`:
```typescript
case 'permission':
  return 'Permission';
```

### Step 7: Verify

Run: `cargo check && cargo test && npx tsc --noEmit && npx eslint .`

Expected: All pass.

### Step 8: Commit

```bash
git add src/components/conversation/PermissionRecordBlock.tsx src/lib/types.ts src/stores/conversationStore.ts src/components/conversation/ConversationView.tsx src/components/conversation/MessageBubble.tsx src/components/layout/MainLayout.tsx
git commit -m "feat(CHI-91): permission inline record blocks (allowed/denied/YOLO) in conversation"
```

---

## Execution Order Summary

| # | Issue | Scope | Depends On |
|---|-------|-------|------------|
| 1 | CHI-74 | Toast system (new store + component) | — |
| 2 | CHI-73 | Typewriter buffer (new lib + store change) | — |
| 3 | CHI-68 | Titlebar redesign (component rewrite) | — |
| 4 | CHI-75 | Copy/hover micro-interactions (CSS + component mods) | — |
| 5 | CHI-55 | Per-message cost display (component mod) | CHI-74 (toast) |
| 6 | CHI-85 | Session sections (DB migration + frontend) | — |
| 7 | CHI-77 | Session quick-switcher (palette extension) | CHI-76 (done) |
| 8 | CHI-91 | Permission inline records (new component + wiring) | — |

**Verification after each task:** `npx tsc --noEmit && npx eslint .`
**Verification after Tasks 6 and 8:** `cargo check && cargo test` (Rust changes)
**Final verification:** Full build `npx vite build && cargo build`
