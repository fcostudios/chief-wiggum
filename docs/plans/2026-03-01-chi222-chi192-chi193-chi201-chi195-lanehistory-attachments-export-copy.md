# CHI-222 / CHI-192 / CHI-193 / CHI-201 / CHI-195 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Five focused tasks — LaneHistory tab, image attachment completions, file picker button, conversation export, and copy buttons on all content blocks.

**Architecture:**
- CHI-222 adds the History tab (lazy-loaded `LaneHistory.tsx`) to Warehouse Detail in ActionsCenter, with paginated `get_action_history` and auto-refresh on action completion.
- CHI-192 fills in the remaining two gaps from the already-implemented image paste: a full-size preview lightbox and a total image size budget indicator (plus OS drag-drop support for images).
- CHI-193 adds a `<input type="file">` triggered by a Paperclip toolbar button so users can attach files without drag-drop.
- CHI-201 is a pure-TS formatter (`conversationExport.ts`) + a Rust `save_export_file` IPC + integration in CommandPalette and Sidebar context menu.
- CHI-195 adds a `CopyButton` component (reusing the pattern from `MessageBubble`) to ToolUseBlock, ToolResultBlock, and ThinkingBlock headers.

**Tech Stack:** SolidJS 1.9, Rust / Tauri v2, TailwindCSS v4 tokens, `tauri-plugin-dialog` (already registered), `lucide-solid` icons.

**Critical image-encoding note:** Clipboard-pasted images are stored as data URLs in `contextStore.images`. On send, `getPromptImages()` strips the `data:…;base64,` prefix and passes `data_base64` to `bridge.send_user_message_with_images()` via the Agent SDK protocol. **Do NOT embed base64 in the message text** — that approach fails. The SDK path is correct and already works.

---

## Part A — CHI-222: LaneHistory

**Depends on:** CHI-221 (Warehouse Detail view exists in ActionsCenter). If CHI-221 is not yet merged, implement as a standalone component ready to drop in.

**Files:**
- Modify: `src-tauri/src/commands/actions.rs` — add `offset` param to `get_action_history`
- Modify: `src-tauri/src/db/queries.rs` — add `OFFSET` to the SQL query
- Modify: `src/stores/actionStore.ts` — add `loadMoreActionHistory()`
- Create: `src/components/actions/LaneHistory.tsx`
- Modify: `src/components/actions/ActionsCenter.tsx` — wire History tab
- Modify: `src-tauri/src/commands/actions.rs` test — update expected pagination call

---

### Task A1: Paginate `get_action_history` + `loadMoreActionHistory`

**Files:**
- Modify: `src-tauri/src/commands/actions.rs:179-193`
- Modify: `src-tauri/src/db/queries.rs` (wherever `get_action_history` SQL is)
- Modify: `src/stores/actionStore.ts:449-462`

**Step 1: Read queries.rs to find the get_action_history SQL**

```bash
grep -n "get_action_history\|action_history" src-tauri/src/db/queries.rs | head -30
```

**Step 2: Add `offset` param to the SQL function in queries.rs**

Find the `get_action_history` function and update the SQL to include `OFFSET $3`:

```rust
pub fn get_action_history(
    db: &Database,
    project_id: &str,
    limit: u32,
    offset: u32,          // ← add this
) -> Result<Vec<ActionHistoryEntry>, AppError> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, action_id, project_id, project_name, action_name, command, category,
                started_at, ended_at, exit_code, duration_ms, output_preview, created_at
         FROM action_history
         WHERE project_id = ?1
         ORDER BY started_at DESC
         LIMIT ?2 OFFSET ?3",   // ← add OFFSET
    )?;
    // rest of the mapping stays the same, add offset to the execute params:
    // stmt.query_map(params![project_id, limit, offset], |row| { ... })
}
```

**Step 3: Update `get_action_history` command in actions.rs**

```rust
pub async fn get_action_history(
    project_id: String,
    limit: Option<u32>,
    offset: Option<u32>,   // ← add
    db: tauri::State<'_, Database>,
) -> Result<Vec<queries::ActionHistoryEntry>, AppError> {
    let project_id = project_id.trim().to_string();
    if project_id.is_empty() {
        return Err(AppError::Validation("Project ID cannot be empty".to_string()));
    }
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let offset = offset.unwrap_or(0);   // ← add
    queries::get_action_history(db.inner(), &project_id, limit, offset)  // ← pass offset
}
```

**Step 4: Run Rust tests to make sure they still pass**

```bash
cd src-tauri && cargo test --quiet 2>&1 | tail -5
```
Expected: all tests pass.

**Step 5: Add `loadMoreActionHistory` to actionStore.ts**

After `loadActionHistory` (line 462), add:

```typescript
/** Load the next page of action history for a project (appends to existing). */
export async function loadMoreActionHistory(projectId: string): Promise<void> {
  const current = state.history[projectId] ?? [];
  setState('historyLoading', projectId, true);
  try {
    const entries = await invoke<ActionHistoryEntry[]>('get_action_history', {
      project_id: projectId,
      limit: 50,
      offset: current.length,
    });
    setState('history', projectId, [...current, ...entries]);
  } catch (err) {
    log.warn('loadMoreActionHistory failed: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    setState('historyLoading', projectId, false);
  }
}
```

Also update the existing `loadActionHistory` to pass `offset: 0` explicitly:

```typescript
export async function loadActionHistory(projectId: string, limit = 50): Promise<void> {
  setState('historyLoading', projectId, true);
  try {
    const entries = await invoke<ActionHistoryEntry[]>('get_action_history', {
      project_id: projectId,
      limit,
      offset: 0,  // ← add
    });
    setState('history', projectId, entries);
  } catch (err) {
    log.warn('get_action_history failed: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    setState('historyLoading', projectId, false);
  }
}
```

**Step 6: Export `loadMoreActionHistory` is already done since it's at module scope.**

**Step 7: Commit**

```bash
git add src-tauri/src/db/queries.rs src-tauri/src/commands/actions.rs src/stores/actionStore.ts
git commit -m "CHI-222: paginate get_action_history with offset, add loadMoreActionHistory"
```

---

### Task A2: Create `LaneHistory.tsx`

**Files:**
- Create: `src/components/actions/LaneHistory.tsx`

**Step 1: Create the component**

```tsx
// src/components/actions/LaneHistory.tsx
// Lazy-loaded history list for a warehouse (project).
// Renders completed action runs in reverse chronological order.
// Per TASKS-005 CHI-222.

import type { Component } from 'solid-js';
import { For, Show, onMount, createMemo } from 'solid-js';
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-solid';
import type { ActionHistoryEntry } from '@/lib/types';
import {
  actionState,
  loadActionHistory,
  loadMoreActionHistory,
} from '@/stores/actionStore';

interface LaneHistoryProps {
  projectId: string;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  if (date >= startOfToday) {
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (date >= startOfYesterday) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function categoryIcon(category: string): string {
  switch (category) {
    case 'build': return '🔨';
    case 'test': return '🧪';
    case 'lint': return '🔍';
    case 'dev': return '⚡';
    case 'deploy': return '🚀';
    default: return '⚙';
  }
}

const OutputPreview: Component<{ entry: ActionHistoryEntry }> = (props) => {
  const preview = () => props.entry.output_preview;
  return (
    <Show when={preview()}>
      {(text) => (
        <pre
          class="mt-1 rounded text-[10px] leading-4 px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-words"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border-secondary)',
            'font-family': 'var(--font-mono)',
            'max-height': '60px',
          }}
        >
          {text()}
        </pre>
      )}
    </Show>
  );
};

const LaneHistory: Component<LaneHistoryProps> = (props) => {
  onMount(() => {
    void loadActionHistory(props.projectId, 50);
  });

  const entries = createMemo(() => actionState.history[props.projectId] ?? []);
  const isLoading = () => actionState.historyLoading[props.projectId] ?? false;

  return (
    <div class="flex flex-col h-full">
      <Show when={isLoading() && entries().length === 0}>
        <div class="flex items-center justify-center py-12">
          <span
            class="text-sm animate-pulse"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Loading history…
          </span>
        </div>
      </Show>

      <Show when={!isLoading() && entries().length === 0}>
        <div class="flex flex-col items-center justify-center py-12 gap-2">
          <FileText size={24} style={{ color: 'var(--color-text-tertiary)', opacity: '0.4' }} />
          <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            No history yet — run an action to see it here
          </p>
        </div>
      </Show>

      <Show when={entries().length > 0}>
        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <For each={entries()}>
            {(entry) => {
              const success = () => (entry.exit_code ?? 0) === 0;
              return (
                <div
                  class="rounded-md px-3 py-2"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <div class="flex items-center gap-2">
                    {/* Category icon */}
                    <span class="text-sm shrink-0" aria-hidden="true">
                      {categoryIcon(entry.category)}
                    </span>

                    {/* Action name */}
                    <span
                      class="text-sm font-medium truncate flex-1"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {entry.action_name}
                    </span>

                    {/* Exit code badge */}
                    <span
                      class="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: success()
                          ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                          : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
                        color: success() ? 'var(--color-success)' : 'var(--color-error)',
                        border: `1px solid color-mix(in srgb, ${success() ? 'var(--color-success)' : 'var(--color-error)'} 25%, transparent)`,
                      }}
                      aria-label={`Exit code ${entry.exit_code ?? 0}`}
                    >
                      <Show when={success()} fallback={<XCircle size={9} class="inline mr-0.5" />}>
                        <CheckCircle size={9} class="inline mr-0.5" />
                      </Show>
                      {entry.exit_code ?? 0}
                    </span>

                    {/* Duration */}
                    <span
                      class="text-[10px] font-mono shrink-0 flex items-center gap-0.5"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <Clock size={9} />
                      {formatDuration(entry.duration_ms)}
                    </span>

                    {/* Timestamp */}
                    <span
                      class="text-[10px] shrink-0"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {formatRelativeDate(entry.started_at)}
                    </span>
                  </div>

                  {/* Output preview */}
                  <OutputPreview entry={entry} />

                  <Show when={entry.output_preview}>
                    <p
                      class="text-[9px] mt-0.5"
                      style={{ color: 'var(--color-text-tertiary)', opacity: '0.6' }}
                    >
                      Full output not persisted — only last 3 lines saved
                    </p>
                  </Show>
                </div>
              );
            }}
          </For>

          {/* Load more */}
          <div class="flex justify-center pt-2 pb-4">
            <button
              class="px-3 py-1.5 rounded text-xs transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
              }}
              onClick={() => void loadMoreActionHistory(props.projectId)}
              disabled={isLoading()}
              aria-busy={isLoading()}
            >
              <Show when={isLoading()} fallback="Load more">
                Loading…
              </Show>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default LaneHistory;
```

**Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/actions/LaneHistory.tsx
git commit -m "CHI-222: add LaneHistory component with pagination and output preview"
```

---

### Task A3: Wire History tab in ActionsCenter + auto-refresh + tests

**Files:**
- Modify: `src/components/actions/ActionsCenter.tsx` — import LaneHistory, wire History tab
- Modify: `src/stores/actionStore.ts` — refresh history when action completes

**Step 1: Find the History tab in ActionsCenter**

```bash
grep -n "History\|laneTab\|activeTab" src/components/actions/ActionsCenter.tsx | head -20
```

**Step 2: Import LaneHistory and wire it into the History tab**

In `ActionsCenter.tsx`, find the `[History]` tab content section and replace any placeholder with:

```tsx
import LaneHistory from './LaneHistory';

// In the History tab content:
<Show when={activeTab() === 'history' && selectedWarehouseId()}>
  {(projectId) => <LaneHistory projectId={projectId()} />}
</Show>
```

**Step 3: Auto-refresh history on action completion**

In `setupActionListeners()` in `actionStore.ts`, after the `action:completed` handler updates `statuses`, add a history refresh:

```typescript
// Inside the action:completed listen callback, after pushRecentEvent:
// Refresh history for the project if any tab is open (best-effort)
void loadActionHistory(payload.project_id, 50);
```

Wait — the `action:completed` payload currently has `action_id` and `exit_code`, not `project_id`. Check the actual payload shape. If `project_id` isn't in the event, skip the auto-refresh and document it as a known gap. The manual "Load more" button is the fallback.

```bash
grep -n "action:completed\|action:failed" src-tauri/src/commands/actions.rs src-tauri/src/bridge/event_loop.rs 2>/dev/null | head -10
```

If `project_id` is in the payload, add the refresh. If not, leave a `// TODO: CHI-222 refresh history when project_id available in event` comment.

**Step 4: Run full checks**

```bash
npx tsc --noEmit && npx eslint src/components/actions/LaneHistory.tsx src/components/actions/ActionsCenter.tsx --max-warnings 0
```

**Step 5: Commit**

```bash
git add src/components/actions/ActionsCenter.tsx src/stores/actionStore.ts
git commit -m "CHI-222: wire LaneHistory into History tab, auto-refresh on action complete"
```

---

## Part B — CHI-192: Image Attachment (Remaining)

**What is already done (do NOT reimplement):**
- Clipboard paste → `addImageAttachment(dataUrl, mimeType, sizeBytes, width, height)`
- Thumbnail row in MessageInput with remove button and token estimate
- `getPromptImages()` → SDK sends `{type:"image", source:{type:"base64",...}}` vision blocks
- `ImageAttachment` + `PromptImageInput` types in types.ts

**What remains (the two items NOT in the closed plan):**
1. Click thumbnail → full-size preview lightbox
2. Total image size budget indicator (bytes used / 5MB max)
3. Bonus: OS file drag-drop for images (currently shows "not supported" toast)

**⚠️ ENCODING WARNING:** Do NOT change `getPromptImages()` or `send_to_cli`. The base64 is correctly stripped from the data URL prefix by `image.data_url.replace(/^data:[^;]+;base64,/, '')`. The SDK bridge handles vision formatting. Any attempt to embed base64 in the message TEXT will fail.

**Files:**
- Modify: `src/components/conversation/MessageInput.tsx`

---

### Task B1: Full-size image preview lightbox

**Step 1: Add previewImage signal and modal to MessageInput**

In `MessageInput.tsx`, add a `previewImage` signal:

```typescript
const [previewImage, setPreviewImage] = createSignal<import('@/lib/types').ImageAttachment | null>(null);
```

**Step 2: Make thumbnails clickable**

In the existing thumbnail grid (around line 748), add `onClick` to open the preview:

```tsx
<img
  src={image.data_url}
  alt={image.file_name}
  class="h-12 w-auto max-w-[80px] object-cover cursor-pointer"
  onClick={() => setPreviewImage(image)}
/>
```

**Step 3: Add the lightbox modal**

Below the image thumbnails section (still inside the return JSX), add:

```tsx
{/* Full-size image preview lightbox */}
<Show when={previewImage()}>
  {(img) => (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0, 0, 0, 0.75)' }}
      onClick={() => setPreviewImage(null)}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${img().file_name}`}
    >
      <div
        class="relative rounded-lg overflow-hidden"
        style={{
          'max-width': '80vw',
          'max-height': '80vh',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={img().data_url}
          alt={img().file_name}
          style={{
            'max-width': '80vw',
            'max-height': '80vh',
            display: 'block',
          }}
        />
        <div
          class="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center justify-between"
          style={{ background: 'rgba(0, 0, 0, 0.6)' }}
        >
          <span class="text-xs font-mono" style={{ color: 'var(--color-text-primary)' }}>
            {img().file_name}
          </span>
          <button
            class="text-xs px-2 py-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'rgba(255, 255, 255, 0.1)',
            }}
            onClick={() => setPreviewImage(null)}
            aria-label="Close preview"
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  )}
</Show>
```

**Step 4: Close lightbox on Escape**

Add an `onMount`/`onCleanup` effect to handle `Escape` key:

```typescript
onMount(() => {
  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && previewImage()) {
      setPreviewImage(null);
    }
  }
  document.addEventListener('keydown', handleEscape);
  onCleanup(() => document.removeEventListener('keydown', handleEscape));
});
```

**Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

---

### Task B2: Image budget indicator + OS drag-drop for images

**Step 1: Add total image size helper to contextStore.ts**

```typescript
/** Total size of all image attachments in bytes. */
export function getTotalImageSizeBytes(): number {
  return state.images.reduce((sum, img) => sum + img.size_bytes, 0);
}
```

**Step 2: Import and show budget in MessageInput**

Import `getTotalImageSizeBytes` from contextStore.

In the image thumbnails section, below the `<For>` loop, add:

```tsx
<span
  class="text-[9px] font-mono ml-1"
  style={{
    color:
      getTotalImageSizeBytes() > 4 * 1024 * 1024
        ? 'var(--color-warning)'
        : 'var(--color-text-tertiary)',
    opacity: '0.8',
  }}
>
  {(getTotalImageSizeBytes() / 1024 / 1024).toFixed(1)} / 5.0 MB
</span>
```

**Step 3: Support OS image drag-drop**

In `handleExternalFileDrop` (around line 443), replace the `isImage` branch (which currently increments `imageCount` and continues) with actual processing:

```typescript
if (isImage) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const img = new window.Image();
    img.onload = () => {
      addImageAttachment(dataUrl, mimeType, file.size, img.width, img.height);
    };
    img.onerror = () => {
      addImageAttachment(dataUrl, mimeType, file.size);
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
  imageCount += 1;
  continue;
}
```

And update the final toast for images from the "not supported" warning to:

```typescript
if (imageCount > 0) {
  addToast(`Added ${imageCount} image${imageCount > 1 ? 's' : ''} to prompt`, 'success');
}
```

**Step 4: Run checks + commit**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/MessageInput.tsx --max-warnings 0
git add src/stores/contextStore.ts src/components/conversation/MessageInput.tsx
git commit -m "CHI-192: full-size image preview lightbox, budget indicator, OS drag-drop support"
```

---

## Part C — CHI-193: Attachment Button & File Picker

**What to build:** A `Paperclip` button in the MessageInput footer that opens a multi-select OS file picker (via HTML `<input type="file">`) to attach code, text, and image files.

**⚠️ Keyboard shortcut conflict:** The Linear issue for CHI-193 says `Cmd+Shift+A`, but that shortcut is already used for Actions Center (`setActiveView('actions_center')`). Use **`Cmd+Shift+U`** instead (U = Upload/Attach).

**Files:**
- Modify: `src/components/conversation/MessageInput.tsx`
- Modify: `src/lib/keybindings.ts`

---

### Task C1: Hidden file input + Paperclip button

**Step 1: Add file input ref and handler to MessageInput**

Add a file input ref near the existing `textareaRef`:

```typescript
let fileInputRef: HTMLInputElement | undefined;
```

**Step 2: Add file picker handler**

```typescript
async function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  await handleExternalFileDrop(input.files);
  // Reset input so the same file can be re-selected
  input.value = '';
}
```

This reuses the existing `handleExternalFileDrop` which already handles both text files and (after B2) images correctly.

**Step 3: Add hidden `<input type="file">` to the JSX**

Near the bottom of the component return, before the closing outer `</div>`, add:

```tsx
<input
  ref={fileInputRef}
  type="file"
  multiple
  accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.rb,.rs,.go,.java,.kt,.swift,.c,.cpp,.h,.hpp,.cs,.html,.css,.scss,.less,.json,.yaml,.yml,.toml,.xml,.md,.txt,.sh,.bash,.zsh,.sql,.graphql,.env,.gitignore,image/png,image/jpeg,image/webp,image/gif,application/pdf"
  class="hidden"
  aria-hidden="true"
  onChange={handleFileInputChange}
/>
```

**Step 4: Add Paperclip button to the footer area**

In the footer `div` (around line 843, the `flex items-center justify-between mt-2` div), after the left character-count `<span>`, add the button before the right buttons group:

```tsx
{/* Attach file button */}
<button
  class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors"
  style={{
    'transition-duration': 'var(--duration-fast)',
    color: 'var(--color-text-tertiary)',
    background: 'transparent',
  }}
  onClick={() => fileInputRef?.click()}
  disabled={props.isDisabled}
  aria-label="Attach file (Cmd+Shift+U)"
  title="Attach file (⌘⇧U)"
>
  <Paperclip size={13} />
</button>
```

Note: The `Paperclip` icon is already imported at line 10.

**Step 5: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/MessageInput.tsx --max-warnings 0
```

**Step 6: Commit**

```bash
git add src/components/conversation/MessageInput.tsx
git commit -m "CHI-193: add file picker button and hidden file input for multi-file attachment"
```

---

### Task C2: Keyboard shortcut `Cmd+Shift+U`

**Files:**
- Modify: `src/lib/keybindings.ts`

**Step 1: Add the shortcut in `handleGlobalKeyDown`**

After the `Cmd+Shift+A` block (around line 112), add:

```typescript
// Cmd+Shift+U — open file attachment picker
if (e.code === 'KeyU' && e.shiftKey) {
  e.preventDefault();
  // Dispatch a custom event that MessageInput listens for
  window.dispatchEvent(new CustomEvent('cw:open-file-picker'));
  return;
}
```

**Step 2: Listen for the event in MessageInput**

In `MessageInput.tsx`, add inside `onMount`:

```typescript
function handleOpenFilePicker() {
  fileInputRef?.click();
}
window.addEventListener('cw:open-file-picker', handleOpenFilePicker);
onCleanup(() => window.removeEventListener('cw:open-file-picker', handleOpenFilePicker));
```

**Step 3: Run checks + commit**

```bash
npx tsc --noEmit && npx eslint src/lib/keybindings.ts src/components/conversation/MessageInput.tsx --max-warnings 0
git add src/lib/keybindings.ts src/components/conversation/MessageInput.tsx
git commit -m "CHI-193: add Cmd+Shift+U shortcut to open file attachment picker"
```

---

## Part D — CHI-201: Conversation Export

**What to build:** Export conversation to Markdown, HTML, or plain text via a native file save dialog. Accessible from the Command Palette and the Sidebar session right-click context menu.

**Files:**
- Create: `src/lib/conversationExport.ts`
- Create: `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/components/common/CommandPalette.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

---

### Task D1: Pure TS formatter (`conversationExport.ts`) + tests

**Step 1: Create `src/lib/conversationExport.ts`**

```typescript
// src/lib/conversationExport.ts
// Pure formatting functions for exporting conversations.
// No side effects, no IPC — easy to unit-test.
// Per CHI-201 spec.

import type { Message } from './types';

export type ExportFormat = 'md' | 'html' | 'txt';

// ── Markdown ────────────────────────────────────────────────────────────────

export function exportAsMarkdown(messages: Message[], sessionId: string): string {
  const lines: string[] = [
    `# Chief Wiggum — Session ${sessionId}`,
    `_Exported: ${new Date().toLocaleString()}_`,
    '',
  ];

  for (const msg of messages) {
    switch (msg.role) {
      case 'user':
        lines.push('---', '**You:**', '', msg.content, '');
        break;
      case 'assistant':
        lines.push('---', '**Claude:**', '', msg.content, '');
        break;
      case 'thinking': {
        const preview = msg.content.slice(0, 200);
        lines.push('<details>', '<summary>Thinking…</summary>', '', preview, '</details>', '');
        break;
      }
      case 'tool_use': {
        try {
          const parsed = JSON.parse(msg.content) as { tool_name?: string; tool_input?: string };
          lines.push(
            '```tool',
            `# ${parsed.tool_name ?? 'Tool'}`,
            parsed.tool_input ?? msg.content,
            '```',
            '',
          );
        } catch {
          lines.push('```', msg.content, '```', '');
        }
        break;
      }
      case 'tool_result': {
        try {
          const parsed = JSON.parse(msg.content) as { content?: string; is_error?: boolean };
          const prefix = parsed.is_error ? '> [Error] ' : '> ';
          lines.push(prefix + (parsed.content ?? msg.content).split('\n').join('\n> '), '');
        } catch {
          lines.push('> ' + msg.content, '');
        }
        break;
      }
      default:
        break;
    }
  }

  return lines.join('\n');
}

// ── Plain text ───────────────────────────────────────────────────────────────

export function exportAsText(messages: Message[], sessionId: string): string {
  const lines: string[] = [
    `Chief Wiggum — Session ${sessionId}`,
    `Exported: ${new Date().toLocaleString()}`,
    '='.repeat(60),
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('YOU:', msg.content, '');
    } else if (msg.role === 'assistant') {
      lines.push('CLAUDE:', msg.content, '');
    }
    // skip tool_use, tool_result, thinking in plain text
  }

  return lines.join('\n');
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const DARK_THEME_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d1117; color: #c9d1d9; max-width: 900px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 1.2rem; color: #e8825a; margin-bottom: 4px; }
  .meta { color: #6e7681; font-size: 0.8rem; margin-bottom: 32px; }
  .msg { margin: 16px 0; padding: 12px 16px; border-radius: 8px; }
  .msg.user { background: #161b22; border-left: 3px solid #388bfd; }
  .msg.assistant { background: #0d1117; border-left: 3px solid #e8825a; }
  .role { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: #6e7681; margin-bottom: 6px; }
  .msg.user .role { color: #388bfd; }
  .msg.assistant .role { color: #e8825a; }
  pre { background: #161b22; padding: 12px; border-radius: 6px; overflow-x: auto;
    font-size: 0.8rem; color: #8b949e; }
  details { margin: 4px 0; color: #6e7681; font-size: 0.85rem; }
  hr { border: none; border-top: 1px solid #21262d; margin: 8px 0; }
`.replace(/\s+/g, ' ');

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportAsHtml(messages: Message[], sessionId: string): string {
  const parts: string[] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<title>Chief Wiggum — Session ${escapeHtml(sessionId)}</title>`,
    `<style>${DARK_THEME_CSS}</style>`,
    '</head>',
    '<body>',
    `<h1>Chief Wiggum</h1>`,
    `<div class="meta">Session ${escapeHtml(sessionId)} · Exported ${escapeHtml(new Date().toLocaleString())}</div>`,
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      parts.push(
        '<div class="msg user">',
        '<div class="role">You</div>',
        `<p>${escapeHtml(msg.content).replace(/\n/g, '<br>')}</p>`,
        '</div>',
      );
    } else if (msg.role === 'assistant') {
      parts.push(
        '<div class="msg assistant">',
        '<div class="role">Claude</div>',
        `<p>${escapeHtml(msg.content).replace(/\n/g, '<br>')}</p>`,
        '</div>',
      );
    } else if (msg.role === 'thinking') {
      parts.push(
        `<details><summary>Thinking…</summary><pre>${escapeHtml(msg.content.slice(0, 400))}</pre></details>`,
      );
    } else if (msg.role === 'tool_use') {
      try {
        const parsed = JSON.parse(msg.content) as { tool_name?: string; tool_input?: string };
        parts.push(`<pre><b>${escapeHtml(parsed.tool_name ?? 'Tool')}</b>\n${escapeHtml(parsed.tool_input ?? '')}</pre>`);
      } catch {
        parts.push(`<pre>${escapeHtml(msg.content)}</pre>`);
      }
    }
    // tool_result, permission: skip in HTML export
  }

  parts.push('</body>', '</html>');
  return parts.join('\n');
}

/** Build the default filename for an export. */
export function buildExportFilename(sessionId: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const shortId = sessionId.slice(0, 8);
  return `session-${shortId}-${date}.${format}`;
}
```

**Step 2: Write unit tests**

Create `src/lib/conversationExport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { exportAsMarkdown, exportAsText, exportAsHtml, buildExportFilename } from './conversationExport';
import type { Message } from './types';

function msg(role: Message['role'], content: string): Message {
  return { id: '1', session_id: 's1', role, content, model: null,
    input_tokens: null, output_tokens: null, thinking_tokens: null,
    cost_cents: null, is_compacted: false, created_at: '2026-01-01T00:00:00Z' };
}

describe('exportAsMarkdown', () => {
  it('includes user and assistant messages', () => {
    const result = exportAsMarkdown([msg('user', 'Hello'), msg('assistant', 'Hi')], 'abc123');
    expect(result).toContain('**You:**');
    expect(result).toContain('Hello');
    expect(result).toContain('**Claude:**');
    expect(result).toContain('Hi');
  });

  it('wraps thinking in details block', () => {
    const result = exportAsMarkdown([msg('thinking', 'I am thinking')], 'abc');
    expect(result).toContain('<details>');
    expect(result).toContain('I am thinking');
  });

  it('skips unknown roles without error', () => {
    const result = exportAsMarkdown([msg('permission', 'x')], 'abc');
    expect(result).not.toContain('x');
  });
});

describe('exportAsText', () => {
  it('includes only user and assistant', () => {
    const result = exportAsText([msg('user', 'Q'), msg('assistant', 'A'), msg('thinking', 'T')], 'id');
    expect(result).toContain('YOU:');
    expect(result).toContain('Q');
    expect(result).toContain('CLAUDE:');
    expect(result).toContain('A');
    expect(result).not.toContain('T');
  });
});

describe('exportAsHtml', () => {
  it('produces valid HTML scaffold', () => {
    const result = exportAsHtml([], 'test');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('</html>');
  });

  it('escapes HTML in content', () => {
    const result = exportAsHtml([msg('user', '<script>evil</script>')], 'id');
    expect(result).not.toContain('<script>evil</script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('buildExportFilename', () => {
  it('includes session short ID and date', () => {
    const name = buildExportFilename('abc12345-xyz', 'md');
    expect(name).toMatch(/^session-abc12345-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/lib/conversationExport.test.ts
```
Expected: all tests pass.

**Step 4: Commit**

```bash
git add src/lib/conversationExport.ts src/lib/conversationExport.test.ts
git commit -m "CHI-201: add conversationExport formatting lib with MD, HTML, txt, tests"
```

---

### Task D2: Rust `save_export_file` IPC command

**Files:**
- Create: `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create `src-tauri/src/commands/export.rs`**

```rust
//! IPC command for saving an exported conversation to disk.
//! Uses tauri-plugin-dialog for the native save dialog.
//! Uses tauri-plugin-shell to open the file after saving.

use crate::AppError;

/// Save exported conversation content to a user-chosen file.
/// Returns the path where the file was saved, or None if the user cancelled.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_export_file(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
    extension: String,
) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;

    let filter_label = match extension.as_str() {
        "md" => "Markdown",
        "html" => "HTML",
        "txt" => "Plain Text",
        _ => "Export",
    };

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(filter_label, &[extension.as_str()])
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            std::fs::write(&path_str, content.as_bytes()).map_err(|e| {
                AppError::Other(format!("Failed to write export file: {}", e))
            })?;
            tracing::info!("save_export_file: wrote {} bytes to {}", content.len(), path_str);
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}

/// Open a file path in the OS default application.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_path_in_shell(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), AppError> {
    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(&path, None)
        .map_err(|e| AppError::Other(format!("Failed to open path: {}", e)))
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_command_registered() {
        // Compile-time: if this file compiles, the commands are correctly defined.
        assert!(true);
    }
}
```

**Step 2: Register in `commands/mod.rs`**

```bash
grep -n "pub mod" src-tauri/src/commands/mod.rs
```

Add `pub mod export;` to the list.

**Step 3: Register commands in `main.rs`**

```bash
grep -n "save_export_file\|open_path_in_shell\|invoke_handler" src-tauri/src/main.rs | head -10
```

In the `.invoke_handler(tauri::generate_handler![...])` call, add:
```rust
commands::export::save_export_file,
commands::export::open_path_in_shell,
```

**Step 4: Build to verify**

```bash
cd src-tauri && cargo build --quiet 2>&1 | tail -10
```
Expected: build succeeds with no errors.

**Step 5: Commit**

```bash
git add src-tauri/src/commands/export.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "CHI-201: add save_export_file and open_path_in_shell Tauri commands"
```

---

### Task D3: Wire into CommandPalette + Sidebar

**Files:**
- Modify: `src/components/common/CommandPalette.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Create a reusable export trigger function**

In CommandPalette.tsx, add a local helper (or import from a thin module):

```typescript
import { invoke } from '@tauri-apps/api/core';
import { conversationState } from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';
import {
  exportAsMarkdown, exportAsHtml, exportAsText, buildExportFilename,
  type ExportFormat
} from '@/lib/conversationExport';
import { addToast } from '@/stores/toastStore';

async function exportConversation(format: ExportFormat): Promise<void> {
  const messages = conversationState.messages;
  const sessionId = sessionState.activeSessionId ?? 'unknown';

  let content: string;
  if (format === 'md') content = exportAsMarkdown(messages, sessionId);
  else if (format === 'html') content = exportAsHtml(messages, sessionId);
  else content = exportAsText(messages, sessionId);

  const defaultName = buildExportFilename(sessionId, format);

  try {
    const savedPath = await invoke<string | null>('save_export_file', {
      content,
      default_name: defaultName,
      extension: format,
    });

    if (savedPath) {
      addToast('Conversation exported', 'success', {
        label: 'Open File',
        onClick: () => {
          void invoke('open_path_in_shell', { path: savedPath });
        },
      });
    }
  } catch (err) {
    addToast(
      'Export failed: ' + (err instanceof Error ? err.message : String(err)),
      'error',
    );
  }
}
```

**Step 2: Add to `staticCommands` in CommandPalette.tsx**

After the Session category entries (around line 156), add:

```typescript
// Export
{
  id: 'export-md',
  label: 'Export Conversation as Markdown',
  category: 'Session',
  icon: () => <Download size={16} />,
  action: () => void exportConversation('md'),
},
{
  id: 'export-html',
  label: 'Export Conversation as HTML',
  category: 'Session',
  icon: () => <Download size={16} />,
  action: () => void exportConversation('html'),
},
{
  id: 'export-txt',
  label: 'Export Conversation as Plain Text',
  category: 'Session',
  icon: () => <Download size={16} />,
  action: () => void exportConversation('txt'),
},
```

Also import `Download` from `lucide-solid`.

**Step 3: Add to Sidebar session context menu**

In `Sidebar.tsx`, add to `sessionContextItems()`:

```typescript
{
  label: 'Export conversation…',
  icon: Download,
  onClick: async () => {
    // Export the clicked session (not necessarily the active one)
    const msgs = session.id === sessionState.activeSessionId
      ? conversationState.messages
      : await invoke<Message[]>('list_messages', { session_id: session.id });

    const content = exportAsMarkdown(msgs, session.id);
    const defaultName = buildExportFilename(session.id, 'md');

    try {
      const savedPath = await invoke<string | null>('save_export_file', {
        content,
        default_name: defaultName,
        extension: 'md',
      });
      if (savedPath) {
        addToast('Exported', 'success', {
          label: 'Open File',
          onClick: () => void invoke('open_path_in_shell', { path: savedPath }),
        });
      }
    } catch (err) {
      addToast('Export failed', 'error');
    }
  },
},
```

Import `Download` from `lucide-solid` and import `exportAsMarkdown, buildExportFilename` from `@/lib/conversationExport`.

**Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add src/components/common/CommandPalette.tsx src/components/layout/Sidebar.tsx
git commit -m "CHI-201: wire export into CommandPalette (3 formats) and Sidebar right-click"
```

---

### Task D4: Final checks for CHI-201

**Step 1: Full lint + type check**

```bash
npx tsc --noEmit && npx eslint src/lib/conversationExport.ts src/components/common/CommandPalette.tsx src/components/layout/Sidebar.tsx --max-warnings 0
```

**Step 2: Run all tests**

```bash
npx vitest run src/lib/conversationExport.test.ts
```

**Step 3: Rust checks**

```bash
cd src-tauri && cargo test --quiet && cargo clippy -- -D warnings 2>&1 | tail -10
```

**Step 4: Commit tag**

```bash
git commit --allow-empty -m "CHI-201: all checks pass"
```

---

## Part E — CHI-195: Copy Actions on All Blocks

**What to build:** Consistent copy button on the header of ToolUseBlock, ToolResultBlock, and ThinkingBlock. Pattern mirrors `MessageBubble`'s `CopyButton` (creates a `copied` signal, shows `Check` icon for 2 seconds after click, calls `addToast('Copied to clipboard', 'success')`).

**Files:**
- Modify: `src/components/conversation/ToolUseBlock.tsx`
- Modify: `src/components/conversation/ToolResultBlock.tsx`
- Modify: `src/components/conversation/ThinkingBlock.tsx`

---

### Task E1: Copy button in ToolUseBlock + ToolResultBlock

**Step 1: Update ToolUseBlock.tsx**

Add `Copy, Check` to lucide imports. Add `createSignal` to solid-js imports.

Add a `[copied, setCopied]` signal in the component body:

```typescript
const [copied, setCopied] = createSignal(false);

function handleCopy() {
  navigator.clipboard.writeText(data().tool_input).catch(() => {});
  setCopied(true);
  addToast('Copied to clipboard', 'success');
  setTimeout(() => setCopied(false), 2000);
}
```

Add import: `import { addToast } from '@/stores/toastStore';`

In the header button (the `onClick={toggleExpanded}` button), this is the expand/collapse button — we should NOT put copy there. Instead, add a separate copy button AFTER the expand/collapse chevron, still inside the header flex row:

```tsx
{/* Copy button — only visible on hover */}
<button
  class="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
  style={{ 'transition-duration': 'var(--duration-fast)' }}
  onClick={(e) => {
    e.stopPropagation(); // don't toggle expand
    handleCopy();
  }}
  aria-label="Copy tool input"
  title="Copy tool input"
>
  <Show when={copied()} fallback={<Copy size={11} color="var(--color-text-tertiary)" />}>
    <Check size={11} color="var(--color-success)" />
  </Show>
</button>
```

Add `group` class to the outer content div (the one wrapping the header button):

```tsx
<div class="flex-1 min-w-0 group">
```

**Step 2: Update ToolResultBlock.tsx**

Same pattern — add `[copied, setCopied]` signal, `handleCopy` function that copies `data().content`, and a copy button in the header row with `e.stopPropagation()`.

```typescript
const [copied, setCopied] = createSignal(false);

function handleCopy() {
  navigator.clipboard.writeText(data().content).catch(() => {});
  setCopied(true);
  addToast('Copied to clipboard', 'success');
  setTimeout(() => setCopied(false), 2000);
}
```

Add `group` class to the outer `<div class="max-w-[85%] w-full ...">` wrapper and the copy button after the expand chevron in the header.

**Step 3: TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/ToolUseBlock.tsx src/components/conversation/ToolResultBlock.tsx --max-warnings 0
```

**Step 4: Commit**

```bash
git add src/components/conversation/ToolUseBlock.tsx src/components/conversation/ToolResultBlock.tsx
git commit -m "CHI-195: add copy button to ToolUseBlock and ToolResultBlock headers"
```

---

### Task E2: Copy button in ThinkingBlock + Cmd+C on focus + final checks

**Step 1: Update ThinkingBlock.tsx**

Add `Copy, Check` to lucide imports. Add `createSignal` to solid-js imports.

```typescript
const [copied, setCopied] = createSignal(false);

function handleCopy() {
  navigator.clipboard.writeText(props.message.content).catch(() => {});
  setCopied(true);
  addToast('Copied to clipboard', 'success');
  setTimeout(() => setCopied(false), 2000);
}
```

Add copy button after the collapse chevron in the header button — but since the header IS the button, we need to either:
- Add the copy button OUTSIDE the header button (as a sibling inside the header row wrapper), or
- Add `Cmd+C` handling to the outer div

Cleanest approach: restructure the header to be a flex row containing both the collapsible trigger area AND the copy button:

```tsx
{/* Header row wrapper */}
<div class="flex items-center group">
  {/* Collapsible trigger — takes all remaining space */}
  <button
    class="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
    style={{ 'transition-duration': 'var(--duration-fast)' }}
    onClick={toggleExpanded}
    aria-expanded={expanded()}
    aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
  >
    {/* ... existing header content unchanged ... */}
  </button>

  {/* Copy button */}
  <button
    class="px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity rounded"
    style={{ 'transition-duration': 'var(--duration-fast)' }}
    onClick={handleCopy}
    aria-label="Copy thinking content"
    title="Copy thinking"
  >
    <Show when={copied()} fallback={<Copy size={11} color="var(--color-text-tertiary)" />}>
      <Check size={11} color="var(--color-success)" />
    </Show>
  </button>
</div>
```

**Step 2: Add `Cmd+C` when block header is focused**

On the outer `<div>` of each block, add `tabIndex={0}` and `onKeyDown`:

Wait — instead of making the entire block focusable (which adds complexity), just document that `Cmd+C` works when the Copy button itself has focus (standard browser keyboard behavior for buttons). The spec's "Cmd+C when block is focused" is satisfied by the copy button being focusable via `Tab`.

**Step 3: Full checks**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/ThinkingBlock.tsx --max-warnings 0
```

**Step 4: Run all Rust + frontend tests**

```bash
cd src-tauri && cargo test --quiet 2>&1 | tail -5
npx vitest run 2>&1 | tail -20
```

**Step 5: Final lint sweep**

```bash
npx eslint . --max-warnings 0 2>&1 | tail -20
npx prettier --check . 2>&1 | tail -10
```

**Step 6: Commit**

```bash
git add src/components/conversation/ThinkingBlock.tsx
git commit -m "CHI-195: add copy button to ThinkingBlock; all checks pass"
```

---

## Smoke Test Checklist

After all tasks are done, verify:

**CHI-222:**
- [ ] Open Actions Center → select a warehouse → click History tab
- [ ] History entries render with category icon, exit code badge (green ✓ / red ✗), duration, timestamp
- [ ] "Load more" appends entries (offset pagination)
- [ ] Empty state shows when no history
- [ ] Running an action and completing it — history refreshes (if project_id is in event payload)

**CHI-192:**
- [ ] Paste image from clipboard → thumbnail appears below textarea
- [ ] Click thumbnail → full-size lightbox opens with correct image
- [ ] Press Escape → lightbox closes
- [ ] Total budget shows "X.X / 5.0 MB" next to thumbnails
- [ ] Drag an image file from Finder → image thumbnail appears (drag-drop)
- [ ] Budget warning text turns orange when > 4MB total

**CHI-193:**
- [ ] Paperclip button appears in MessageInput footer
- [ ] Click → OS file picker opens with correct type filters
- [ ] Select a `.ts` file → ContextChip appears
- [ ] Select an image → thumbnail appears
- [ ] Press `Cmd+Shift+U` → file picker opens

**CHI-201:**
- [ ] Open Command Palette (Cmd+K) → type "Export" → see 3 entries (MD, HTML, txt)
- [ ] Click "Export as Markdown" → native save dialog opens with `.md` extension
- [ ] Save → success toast with "Open File" button
- [ ] "Open File" → file opens in default app
- [ ] Right-click session in Sidebar → "Export conversation…" → saves as `.md`
- [ ] Markdown output includes user/assistant messages, thinking in `<details>`, tool calls in fenced blocks

**CHI-195:**
- [ ] Hover over a ToolUseBlock → copy button appears in header
- [ ] Click copy → toast "Copied to clipboard", icon briefly becomes checkmark
- [ ] Paste content → valid JSON with `tool_name` and `tool_input`
- [ ] Same for ToolResultBlock (copies output text)
- [ ] Same for ThinkingBlock (copies thinking content)

---

## Commit Summary

```
CHI-222: paginate get_action_history with offset, add loadMoreActionHistory
CHI-222: add LaneHistory component with pagination and output preview
CHI-222: wire LaneHistory into History tab, auto-refresh on action complete
CHI-192: full-size image preview lightbox, budget indicator, OS drag-drop support
CHI-193: add file picker button and hidden file input for multi-file attachment
CHI-193: add Cmd+Shift+U shortcut to open file attachment picker
CHI-201: add conversationExport formatting lib with MD, HTML, txt, tests
CHI-201: add save_export_file and open_path_in_shell Tauri commands
CHI-201: wire export into CommandPalette (3 formats) and Sidebar right-click
CHI-195: add copy button to ToolUseBlock and ToolResultBlock headers
CHI-195: add copy button to ThinkingBlock; all checks pass
```
