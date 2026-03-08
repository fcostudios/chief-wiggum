# File Context Menu & Question Dialog Accessibility Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete CHI-272 (inline rename in file tree context menu + `…` overflow button), CHI-284 (compact answer summary in ToolUseBlock), and CHI-285 (YOLO auto-skip + a11y improvements for QuestionDialog).

**Architecture:** CHI-272 extends `FileTreeNode.tsx` to show a `…` button on hover and replace `window.prompt` for rename with an inline `InlineRenameInput` component. CHI-284 adds a `questionSummary()` memo to `ToolUseBlock.tsx` that picks a human-readable collapsed label. CHI-285 adds YOLO-mode auto-resolution in `event_loop.rs` and a proper focus-trap + `aria-live` region to `QuestionDialog.tsx`.

**Tech Stack:** SolidJS, TailwindCSS v4 (tokens), Tauri v2 IPC, Rust/tokio (event_loop)

---

## Current State — Read Before Coding

### CHI-272 — what already exists

`src/components/explorer/FileTreeNode.tsx` already has:
- Right-click `ContextMenu` component with Rename, Duplicate, Delete items
- `renameFileInProject`, `duplicateFileInProject`, `deleteFileInProject` IPC calls imported from `fileStore`
- `setRenamingPath(path)` state function in `fileStore`

**What's missing / broken:**
1. **Rename uses `window.prompt`** — native modal, bad UX, blocks the UI thread. Must be replaced with an inline input that appears in the tree node.
2. **No `…` overflow button** — SPEC-006 §4 requires "right-click context menus must be discoverable via visible `...` overflow menus." The `…` button must appear on hover (not always visible — it clutters the tree).
3. **Delete uses `window.confirm`** — while less critical, ideally should use a short inline confirmation (keep scope minimal: just add `aria-label` and handle Escape — the `window.confirm` can stay for this task, keep CHI-272 focused).

### CHI-284 — what already exists

`src/components/conversation/ToolUseBlock.tsx`:
- `classifyTool('AskUserQuestion')` returns `'question'`
- The collapsed header shows `summary()` from `toolSummary()` which has **no case for AskUserQuestion** — falls through to `toolInput.slice(0, 60)` showing raw JSON
- The expanded view already shows answers in a styled block when `parsedInput()?.answers` is truthy

**What's missing:**
- A human-readable compact summary for the collapsed state, e.g.:
  - Before answered: `"2 questions"` or first question text truncated
  - After answered: `"Answered: <first answer value>"`

### CHI-285 — what already exists

`src/components/questions/QuestionDialog.tsx`:
- Has `role="dialog"`, `aria-modal="true"`, `aria-label`
- Has `dialogRef?.focus()` on mount — but this is not a proper focus trap
- Has 60-second countdown → auto-submit

`src-tauri/src/bridge/event_loop.rs` line ~644:
```
// Questions are never auto-approved (including YOLO mode).
```
— This comment says YOLO doesn't skip questions. The spec says it should.

**What's missing:**
1. **YOLO auto-skip** (§4.24.8): When YOLO mode is on, backend should auto-resolve question with first/default options instead of emitting `question:request`
2. **Focus trap** (§4.24.6): When dialog is open, Tab/Shift+Tab must cycle only within the dialog, not leak to background
3. **Keyboard announce** (§4.24.6): When dialog opens, focus lands on the dialog container (already done) — but the countdown timer change should be announced via `aria-live`

---

## Task 1 — CHI-272: Inline Rename + `…` Overflow Button

**Files:**
- Create: `src/components/explorer/InlineRenameInput.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`
- Test: `src/components/explorer/FileTreeNode.test.tsx` (existing)

### Step 1.1: Write the failing test for `…` button visibility

In `src/components/explorer/FileTreeNode.test.tsx`, find the test file and add a test. First read the existing tests to understand the setup, then add:

```tsx
it('shows … button on hover and hides it otherwise', async () => {
  // Render a FileTreeNode for a file
  const node = makeFileNode('src/main.ts');
  render(() => <FileTreeNode node={node} depth={0} />);

  // Initially the … button should not be visible
  expect(screen.queryByTitle('More options')).not.toBeInTheDocument();

  // Hover the node
  const btn = screen.getByRole('button', { name: /main\.ts/i });
  fireEvent.mouseEnter(btn);

  // Now … button should appear
  expect(await screen.findByTitle('More options')).toBeInTheDocument();
});
```

Run: `npx vitest run src/components/explorer/FileTreeNode.test.tsx`
Expected: FAIL — "More options" button not found.

### Step 1.2: Add `…` overflow button to FileTreeNode

In `src/components/explorer/FileTreeNode.tsx`, find the `<button>` for the tree row (around line 357) and the `{/* Size badge for files */}` section. Add a hover-visible `…` button **after** the git status indicator, before the size badge:

```tsx
{/* Overflow "…" menu button — only visible on hover/focus */}
<button
  class="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 rounded px-0.5 leading-none text-base transition-opacity"
  style={{
    color: 'var(--color-text-tertiary)',
    'transition-duration': 'var(--duration-fast)',
  }}
  title="More options"
  aria-label={`More options for ${props.node.name}`}
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    handleMouseLeaveTooltip();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenuPos({ x: rect.left, y: rect.bottom + 2 });
    void loadBundleOptions();
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenuPos({ x: rect.left, y: rect.bottom + 2 });
      void loadBundleOptions();
    }
  }}
>
  ···
</button>
```

**Note:** The parent `<button>` element needs a `group` class for `group-hover:` to work. Add `group` to its `class` prop:
```tsx
<button
  class="group flex items-center gap-1 w-full text-left ..."
```

### Step 1.3: Run the test

```bash
npx vitest run src/components/explorer/FileTreeNode.test.tsx
```
Expected: PASS for the `…` button test.

### Step 1.4: Create `InlineRenameInput.tsx`

The existing `InlineFileInput.tsx` is for creating (empty initial value). Rename needs to pre-fill the current name.

Create `src/components/explorer/InlineRenameInput.tsx`:

```tsx
// InlineRenameInput: inline editor that replaces the tree node label during rename.
// Pre-fills with current name, auto-selects stem (without extension) on mount.

import type { Component } from 'solid-js';
import { createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { t } from '@/stores/i18nStore';

interface InlineRenameInputProps {
  /** Current file/folder name (basename only, no path separators) */
  currentName: string;
  /** Visual indent depth, in units matching FileTreeNode */
  depth: number;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

const INVALID_CHARS = /[<>:"|?*\0/\\]/;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-4]|LPT[1-4])(\.|$)/i;

const InlineRenameInput: Component<InlineRenameInputProps> = (props) => {
  const [value, setValue] = createSignal(props.currentName);
  let inputRef: HTMLInputElement | undefined;

  const validationError = createMemo((): string | null => {
    const text = value().trim();
    if (!text) return t('files.nameEmpty');
    if (text === props.currentName) return null; // unchanged is valid (will cancel on confirm)
    if (INVALID_CHARS.test(text)) return t('files.invalidChar');
    if (RESERVED_NAMES.test(text)) return t('files.reservedName');
    return null;
  });

  const isValid = createMemo(
    () => value().trim().length > 0 && !validationError(),
  );

  function handleConfirm(): void {
    const trimmed = value().trim();
    if (trimmed === props.currentName) {
      props.onCancel();
      return;
    }
    if (!isValid()) return;
    props.onConfirm(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onCancel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  }

  onMount(() => {
    if (!inputRef) return;
    inputRef.focus();

    // Select just the stem (without extension) for convenient editing
    const name = props.currentName;
    const dotIdx = name.lastIndexOf('.');
    const selEnd = dotIdx > 0 ? dotIdx : name.length;
    inputRef.setSelectionRange(0, selEnd);

    // Click-outside cancels
    const handlePointerDown = (e: MouseEvent) => {
      if (inputRef && !inputRef.contains(e.target as Node)) {
        props.onCancel();
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    onCleanup(() =>
      document.removeEventListener('mousedown', handlePointerDown, true),
    );
  });

  return (
    <div
      class="flex items-start py-0.5 pr-2"
      style={{ 'padding-left': `${props.depth * 12 + 4 + 16}px` }}
    >
      <div class="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          class="w-full rounded px-1.5 py-1 text-[11px] font-mono outline-none"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-primary)',
            border: `1px solid ${
              validationError()
                ? 'var(--color-error)'
                : isValid()
                  ? 'var(--color-success)'
                  : 'var(--color-border-primary)'
            }`,
          }}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Short delay so confirm button click can fire before blur-cancel
            setTimeout(() => props.onCancel(), 150);
          }}
          aria-label={`Rename ${props.currentName}`}
        />
        {validationError() && (
          <div
            class="text-[10px] mt-0.5"
            style={{ color: 'var(--color-error)' }}
          >
            {validationError()}
          </div>
        )}
      </div>
    </div>
  );
};

export default InlineRenameInput;
```

### Step 1.5: Write test for InlineRenameInput

Create `src/components/explorer/InlineRenameInput.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@solidjs/testing-library';
import InlineRenameInput from './InlineRenameInput';
import { describe, it, expect, vi } from 'vitest';

describe('InlineRenameInput', () => {
  it('pre-fills with currentName', () => {
    render(() => (
      <InlineRenameInput
        currentName="hello.ts"
        depth={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    ));
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('hello.ts');
  });

  it('calls onConfirm with new name on Enter', () => {
    const onConfirm = vi.fn();
    render(() => (
      <InlineRenameInput
        currentName="old.ts"
        depth={0}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    ));
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'new.ts' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('new.ts');
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(() => (
      <InlineRenameInput
        currentName="file.ts"
        depth={0}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    ));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel (not onConfirm) when name unchanged', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(() => (
      <InlineRenameInput
        currentName="same.ts"
        depth={0}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows validation error for invalid chars', () => {
    render(() => (
      <InlineRenameInput
        currentName="file.ts"
        depth={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    ));
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'bad<name.ts' } });
    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/explorer/InlineRenameInput.test.tsx`
Expected: PASS.

### Step 1.6: Wire InlineRenameInput into FileTreeNode

In `src/components/explorer/FileTreeNode.tsx`:

1. Add import at top:
```tsx
import InlineRenameInput from './InlineRenameInput';
```

2. Add `isRenaming` signal:
```tsx
const isRenaming = () => fileState.renamingPath === props.node.relative_path;
```

3. Find the Rename context menu item (around line 243). Replace the `onClick` with:
```tsx
onClick: () => {
  const pid = projectId();
  if (!pid) return;
  setRenamingPath(props.node.relative_path);
  setContextMenuPos(null);
},
```
(Remove the `window.prompt` call — it's no longer needed.)

4. In the JSX return, find `<Show when={contextMenuPos()}>` and **before** that block add inline rename:
```tsx
{/* Inline rename input — appears in place of the tree row */}
<Show when={isRenaming()}>
  <InlineRenameInput
    currentName={props.node.name}
    depth={props.depth}
    onConfirm={(newName) => {
      const pid = projectId();
      if (!pid) return;
      const parent = props.node.relative_path.split('/').slice(0, -1).join('/');
      const nextPath = parent ? `${parent}/${newName}` : newName;
      void renameFileInProject(pid, props.node.relative_path, nextPath).finally(
        () => setRenamingPath(null),
      );
    }}
    onCancel={() => setRenamingPath(null)}
  />
</Show>
```

5. Wrap the **main button** in a `<Show when={!isRenaming()}>` so it hides while renaming:
```tsx
<Show when={!isRenaming()}>
  <button class="group flex items-center ...">
    ...
  </button>
</Show>
```

### Step 1.7: Add missing i18n key

In `src/locales/en.json`, in the `files` object, add:
```json
"nameEmpty": "Name cannot be empty"
```
(Check if it already exists; if so, skip.)

### Step 1.8: Run all tests

```bash
npx vitest run src/components/explorer/
```
Expected: all tests pass.

### Step 1.9: Type check + lint

```bash
npx tsc --noEmit && npx eslint src/components/explorer/InlineRenameInput.tsx src/components/explorer/FileTreeNode.tsx --max-warnings 0
```

### Step 1.10: Commit

```bash
git add src/components/explorer/InlineRenameInput.tsx \
        src/components/explorer/InlineRenameInput.test.tsx \
        src/components/explorer/FileTreeNode.tsx \
        src/locales/en.json
git commit -m "CHI-272: add inline rename input and … overflow button to file tree nodes"
```

---

## Task 2 — CHI-284: ToolUseBlock Question Summary

**What:** When a `ToolUseBlock` for `AskUserQuestion` is collapsed, show a human-readable summary instead of raw JSON.

**Files:**
- Modify: `src/components/conversation/ToolUseBlock.tsx`
- Test: `src/components/conversation/ToolUseBlock.test.tsx` (add cases)

### Background

Current `toolSummary()` for AskUserQuestion returns `toolInput.slice(0, 60)` — raw JSON like `{"questions":[{"question":"What...`.

Target behavior:
- **Before user answered** (no `answers` key): show `"1 question"` or first question's header
- **After user answered** (has `answers`): show `"Answered: <first answer>"`

The `parsedInput()` memo already parses `tool_input` to `{ questions?, answers? }`.

### Step 2.1: Write the failing test

In `src/components/conversation/ToolUseBlock.test.tsx`, add:

```tsx
describe('AskUserQuestion compact summary', () => {
  it('shows question count when unanswered', () => {
    const msg = makeToolUseMessage(
      JSON.stringify({
        tool_name: 'AskUserQuestion',
        tool_input: JSON.stringify({
          questions: [
            { question: 'Pick a color', header: 'Color', options: [], multiSelect: false },
            { question: 'Pick a size', header: 'Size', options: [], multiSelect: false },
          ],
        }),
      }),
    );
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.getByText('2 questions')).toBeInTheDocument();
  });

  it('shows first answer when answered', () => {
    const msg = makeToolUseMessage(
      JSON.stringify({
        tool_name: 'AskUserQuestion',
        tool_input: JSON.stringify({
          questions: [{ question: 'Color', header: 'Color', options: [], multiSelect: false }],
          answers: { Color: 'Blue' },
        }),
      }),
    );
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.getByText(/Answered: Blue/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/conversation/ToolUseBlock.test.tsx`
Expected: new tests FAIL — text not found in collapsed state.

### Step 2.2: Add `questionSummary` to ToolUseBlock

In `src/components/conversation/ToolUseBlock.tsx`, find the `toolSummary` function (line ~84) and add a case for `AskUserQuestion`:

```ts
function toolSummary(toolName: string, toolInput: string): string {
  try {
    const parsed = JSON.parse(toolInput);
    switch (toolName) {
      case 'Bash':
        return parsed.command ? String(parsed.command).slice(0, 60) : '';
      case 'Edit':
      case 'Write':
      case 'Read':
        return parsed.file_path ? (String(parsed.file_path).split('/').pop() ?? '') : '';
      case 'Glob':
        return parsed.pattern ? String(parsed.pattern) : '';
      case 'Grep':
        return parsed.pattern ? String(parsed.pattern) : '';
      case 'AskUserQuestion': {
        // Show answer summary if already answered, otherwise question count
        if (parsed.answers && typeof parsed.answers === 'object') {
          const firstAnswer = Object.values(parsed.answers)[0];
          return firstAnswer ? `Answered: ${String(firstAnswer).slice(0, 40)}` : 'Answered';
        }
        const qCount = Array.isArray(parsed.questions) ? parsed.questions.length : 0;
        if (qCount === 0) return '';
        const header = (parsed.questions as Array<{ header?: string }>)[0]?.header;
        return qCount === 1 && header ? header : `${qCount} question${qCount !== 1 ? 's' : ''}`;
      }
      default:
        return '';
    }
  } catch {
    return toolInput.slice(0, 60);
  }
}
```

### Step 2.3: Run the tests

```bash
npx vitest run src/components/conversation/ToolUseBlock.test.tsx
```
Expected: all tests PASS including new ones.

### Step 2.4: Verify no regressions

```bash
npx vitest run src/components/conversation/
```
Expected: PASS.

### Step 2.5: Type + lint check

```bash
npx tsc --noEmit && npx eslint src/components/conversation/ToolUseBlock.tsx --max-warnings 0
```

### Step 2.6: Commit

```bash
git add src/components/conversation/ToolUseBlock.tsx
git commit -m "CHI-284: add compact answer summary to AskUserQuestion ToolUseBlock"
```

---

## Task 3 — CHI-285: QuestionDialog YOLO Skip + Focus Trap

**What:** (1) When YOLO mode is on, backend auto-resolves questions without showing the dialog. (2) QuestionDialog gets a proper focus trap and `aria-live` countdown.

**Files:**
- Modify: `src-tauri/src/bridge/event_loop.rs`
- Modify: `src/components/questions/QuestionDialog.tsx`
- Tests: rust unit tests in `event_loop.rs`; component test additions

### Part A: YOLO Auto-Skip (backend — event_loop.rs)

### Step 3.1: Understand the current flow

In `src-tauri/src/bridge/event_loop.rs` around line 626:

```rust
BridgeOutput::QuestionRequired(req) => {
    // ...
    // Questions are never auto-approved (including YOLO mode).
    if let Some(pm) = permission_manager.as_ref() {
        // ... stores pending question, waits for frontend response
    }
}
```

In YOLO mode, we want to resolve the question immediately with the default answers (first option for each single-select question, empty multi-select).

### Step 3.2: Write a Rust unit test for auto-resolve logic

Find the `#[cfg(test)]` block in `src-tauri/src/bridge/mod.rs` or `event_loop.rs`. If `build_auto_answers` doesn't exist, add a test placeholder:

In `src-tauri/src/bridge/mod.rs`, add to the test section:

```rust
#[test]
fn build_auto_answers_picks_first_option() {
    let questions = vec![
        QuestionItem {
            question: "Pick one".to_string(),
            header: "Choice".to_string(),
            options: vec![
                QuestionOption { label: "A".to_string(), description: String::new() },
                QuestionOption { label: "B".to_string(), description: String::new() },
            ],
            multi_select: false,
        },
        QuestionItem {
            question: "Pick many".to_string(),
            header: "Multi".to_string(),
            options: vec![
                QuestionOption { label: "X".to_string(), description: String::new() },
            ],
            multi_select: true,
        },
    ];
    let answers = build_auto_answers(&questions);
    assert_eq!(answers.get("Pick one").map(String::as_str), Some("A"));
    // multi-select defaults to empty
    assert_eq!(answers.get("Pick many").map(String::as_str), Some(""));
}
```

Run: `cargo test -p chief-wiggum-lib bridge::mod::tests::build_auto_answers_picks_first_option`
Expected: FAIL — function not found.

### Step 3.3: Add `build_auto_answers` to `bridge/mod.rs`

In `src-tauri/src/bridge/mod.rs`, add near the `QuestionRequest` struct:

```rust
use std::collections::HashMap;

/// Build a default answers map for YOLO-mode auto-resolution.
/// Single-select: picks the first option's label.
/// Multi-select: empty string (no selection).
pub fn build_auto_answers(questions: &[QuestionItem]) -> HashMap<String, String> {
    questions
        .iter()
        .map(|q| {
            let answer = if q.multi_select {
                String::new()
            } else {
                q.options
                    .first()
                    .map(|o| o.label.clone())
                    .unwrap_or_default()
            };
            (q.question.clone(), answer)
        })
        .collect()
}
```

### Step 3.4: Run the test

```bash
cargo test -p chief-wiggum-lib build_auto_answers -- --nocapture
```
Expected: PASS.

### Step 3.5: Wire YOLO auto-skip in event_loop.rs

In `src-tauri/src/bridge/event_loop.rs`, find the `BridgeOutput::QuestionRequired(req)` arm and replace:

```rust
// Questions are never auto-approved (including YOLO mode).
if let Some(pm) = permission_manager.as_ref() {
```

With:

```rust
// In YOLO mode, auto-resolve questions with default answers (first option).
if let Some(pm) = permission_manager.as_ref() {
    // Auto-resolve if YOLO mode is active — skip showing the dialog
    if pm.is_yolo_mode().await {
        tracing::info!(
            "Event loop [{}]: YOLO mode active, auto-resolving question {} with defaults",
            session_id,
            req.request_id
        );
        let auto_answers = crate::bridge::build_auto_answers(&req.questions);
        let updated_input =
            match crate::commands::bridge::build_question_updated_input(
                &auto_answers,
                serde_json::to_value(&req).unwrap_or_default(),
            ) {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!(
                        "Event loop [{}]: failed to build auto-answer payload for {}: {}",
                        session_id, req.request_id, e
                    );
                    serde_json::Value::Null
                }
            };
        let rx = pm.store_pending_question(req.request_id.clone(), req.clone()).await;
        // Immediately resolve using the stored channel
        drop(rx); // We'll resolve via the permission manager directly
        if let Err(e) = pm.resolve_question(&req.request_id, updated_input).await {
            tracing::warn!(
                "Event loop [{}]: failed to auto-resolve question {}: {}",
                session_id, req.request_id, e
            );
        }
        // Don't emit question:request to frontend in YOLO mode
        return; // early return from this arm — NOTE: this is inside a match arm, not the event loop
    }
```

**Wait** — the above approach has a problem: `store_pending_question` creates a channel receiver, and we need to resolve through that same channel. Let me think about this more carefully.

A cleaner approach: check YOLO mode **before** emitting and storing:

```rust
BridgeOutput::QuestionRequired(req) => {
    tracing::info!(
        "Event loop [{}]: question:request ({} questions)",
        session_id, req.questions.len()
    );

    // YOLO mode: auto-resolve with default answers, do not show dialog.
    if let Some(pm) = permission_manager.as_ref() {
        if pm.is_yolo_mode().await {
            tracing::info!(
                "Event loop [{}]: YOLO auto-resolving question {}",
                session_id, req.request_id
            );
            let auto_answers = crate::bridge::build_auto_answers(&req.questions);
            let updated_input =
                crate::commands::bridge::build_question_updated_input(
                    &auto_answers,
                    serde_json::to_value(&req).unwrap_or(serde_json::Value::Null),
                )
                .unwrap_or(serde_json::Value::Null);

            // Store + immediately resolve
            let rx = pm.store_pending_question(req.request_id.clone(), req.clone()).await;
            // Spawn a task that resolves immediately
            let pm2 = pm.clone();
            let request_id = req.request_id.clone();
            let bridge_clone = Arc::clone(bridge);
            let session_id_str = session_id.to_string();
            tokio::spawn(async move {
                if let Err(e) = pm2.resolve_question(&request_id, updated_input).await {
                    tracing::warn!("YOLO auto-resolve question {} failed: {}", request_id, e);
                }
                drop(rx); // ensure receiver is kept alive until resolved
                // Wait for the bridge to receive the response (rx consumed by resolve)
            });
            // Skip emitting question:request and the normal pending-question flow
        } else {
            // Normal flow: emit to frontend and wait
            let payload = QuestionRequestPayload {
                session_id: session_id.to_string(),
                request_id: req.request_id.clone(),
                questions: req.questions.clone(),
            };
            if let Err(e) = app.emit("question:request", &payload) {
                tracing::warn!("Failed to emit question:request: {}", e);
            }
            let request_id = req.request_id.clone();
            let rx = pm.store_pending_question(request_id.clone(), req).await;
            let bridge_clone = Arc::clone(bridge);
            let session_id_str = session_id.to_string();
            tokio::spawn(async move {
                match rx.await {
                    Ok(updated_input) => {
                        if let Err(e) = bridge_clone
                            .send_control_response(&request_id, true, None, Some(updated_input))
                            .await
                        {
                            tracing::warn!(
                                "Event loop [{}]: failed to send question response for {}: {}",
                                session_id_str, request_id, e
                            );
                        }
                    }
                    Err(_) => {
                        tracing::warn!(
                            "Event loop [{}]: question {} cancelled (receiver dropped)",
                            session_id_str, request_id
                        );
                    }
                }
            });
        }
    } else {
        tracing::warn!(
            "Event loop [{}]: QuestionRequired without PermissionManager; question {} cannot be resolved",
            session_id, req.request_id
        );
    }
}
```

**Note:** Check whether `bridge_clone` and `session_id` variable names differ in the current code — match the existing naming exactly. The variable `bridge_clone` is already defined earlier in the function.

**Also note:** `build_question_updated_input` is currently in `commands/bridge.rs` and is `pub(crate)`. Verify it's accessible from `event_loop.rs`. If it's private, either make it `pub(crate)` or move the logic to `bridge/mod.rs`.

### Step 3.6: Check `build_question_updated_input` visibility

```bash
grep -n "fn build_question_updated_input\|pub.*build_question" src-tauri/src/commands/bridge.rs
```

If it's `fn` (not `pub`), change to `pub(crate) fn`.

### Step 3.7: Run Rust checks

```bash
cargo build 2>&1 | grep -E "error|warning: unused"
cargo test -p chief-wiggum-lib bridge -- --nocapture
```
Expected: 0 errors.

### Part B: QuestionDialog Focus Trap + aria-live

### Step 3.8: Write failing test for focus trap

In the existing `QuestionDialog` test file (or create `src/components/questions/QuestionDialog.test.tsx`):

```tsx
import { render, screen, fireEvent } from '@solidjs/testing-library';
import QuestionDialog from './QuestionDialog';
import { describe, it, expect, vi } from 'vitest';

function makeRequest(numQuestions = 1) {
  return {
    request_id: 'req-1',
    session_id: 'sess-1',
    questions: Array.from({ length: numQuestions }, (_, i) => ({
      question: `Q${i + 1}`,
      header: `Header ${i + 1}`,
      options: [{ label: 'Yes', description: '' }, { label: 'No', description: '' }],
      multiSelect: false,
    })),
  };
}

describe('QuestionDialog', () => {
  it('traps Tab within the dialog', () => {
    render(() => <QuestionDialog request={makeRequest()} />);
    const dialog = screen.getByRole('dialog');
    // All focusable elements should be inside the dialog
    const focusable = dialog.querySelectorAll(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(0);
    // Tab from the last focusable element should cycle back to the first
    const last = focusable[focusable.length - 1] as HTMLElement;
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    // Focus should now be on the first focusable element
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('has aria-live region for countdown', () => {
    render(() => <QuestionDialog request={makeRequest()} />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/questions/QuestionDialog.test.tsx`
Expected: FAIL — focus trap not implemented, `role="timer"` not found.

### Step 3.9: Add focus trap and aria-live to QuestionDialog

In `src/components/questions/QuestionDialog.tsx`:

**1. Add a `getFocusableElements` helper and focus-trap keydown:**

```tsx
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}
```

In `handleDialogKeyDown`, add Tab trap logic before the Escape/Enter checks:

```tsx
function handleDialogKeyDown(event: KeyboardEvent): void {
  // Focus trap — keep Tab/Shift+Tab within the dialog
  if (event.key === 'Tab' && dialogRef) {
    const focusable = getFocusableElements(dialogRef);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
    return;
  }
  if (event.key === 'Enter' && isValid()) {
    const target = event.target as HTMLElement;
    if (target?.tagName.toLowerCase() !== 'textarea') {
      event.preventDefault();
      void handleSubmit();
    }
  }
}
```

**2. Add `role="timer"` and `aria-live="polite"` to the countdown span:**

Find the countdown span in the footer:
```tsx
<span class="text-xs text-text-tertiary">
  {t('questionDialog.timeoutWarning', { seconds: secondsLeft() })}
</span>
```

Replace with:
```tsx
<span
  class="text-xs text-text-tertiary"
  role="timer"
  aria-live="polite"
  aria-label={`Auto-submitting in ${secondsLeft()} seconds`}
>
  {t('questionDialog.timeoutWarning', { seconds: secondsLeft() })}
</span>
```

**3. Add `aria-labelledby` to the dialog:**

Add an `id` to the title heading:
```tsx
<h3 id="question-dialog-title" class="...">
  {t('questionDialog.title')}
</h3>
```

And in the dialog div:
```tsx
<div
  ref={dialogRef}
  role="dialog"
  aria-modal="true"
  aria-labelledby="question-dialog-title"
  // Remove aria-label since labelledby is now used
  tabindex="-1"
  onKeyDown={handleDialogKeyDown}
  ...
>
```

### Step 3.10: Run the tests

```bash
npx vitest run src/components/questions/QuestionDialog.test.tsx
```
Expected: PASS.

### Step 3.11: Full Rust and frontend checks

```bash
cargo test && cargo clippy -- -D warnings && cargo fmt --check
npx tsc --noEmit && npx eslint src/components/questions/ src-tauri/src/bridge/event_loop.rs --max-warnings 0 2>/dev/null || npx eslint src/components/questions/ --max-warnings 0
```

### Step 3.12: Commit

```bash
git add src-tauri/src/bridge/mod.rs \
        src-tauri/src/bridge/event_loop.rs \
        src-tauri/src/commands/bridge.rs \
        src/components/questions/QuestionDialog.tsx
git commit -m "CHI-285: YOLO auto-skip questions in backend, add focus trap and aria-live to QuestionDialog"
```

---

## Final Validation Checklist

```bash
# Rust
cargo test
cargo clippy -- -D warnings
cargo fmt --check

# Frontend
npx tsc --noEmit
npx eslint . --max-warnings 0
npx prettier --check .
npx vitest run
npx vite build
```

### Manual smoke tests

1. **CHI-272:** Open file tree → right-click file → confirm context menu has Rename, Duplicate, Delete. Click Rename → verify inline input appears with filename pre-filled, stem selected. Type new name → Enter → file renames. Press Escape → cancels without renaming. Hover file → confirm `···` button appears; click it → context menu opens.

2. **CHI-284:** Trigger `AskUserQuestion` tool (or view a session that has one). Verify collapsed ToolUseBlock shows `"1 question"` or the question header, not raw JSON. Expand after answering → verify `"Answered: <value>"` in the header.

3. **CHI-285a:** Enable YOLO mode (Settings → Permission Tier → Auto-approve). Trigger `AskUserQuestion` in a session. Verify the QuestionDialog does NOT appear — question is auto-resolved with the first option's label silently.

4. **CHI-285b:** With YOLO mode off, open a QuestionDialog. Verify: Tab cycles within the dialog, Shift+Tab works backwards, focus never escapes to background. Screen reader announces countdown changes.

### Update handover.json

After all tasks complete:
- `CHI-272.status` → `"done"` + close epic `CHI-269` in Linear (only remaining task)
- `CHI-284.status` → `"done"`
- `CHI-285.status` → `"done"` + close epic `CHI-277` in Linear (all 4 subtasks done)

---

## Watch-outs / Gotchas

| Area | Gotcha | Fix |
|------|--------|-----|
| `group` class in Tailwind v4 | `group-hover:` utilities require `group` on the parent element | Ensure the parent `<button>` has `class="group flex ..."` |
| SolidJS Show + button | Wrapping the main row button in `<Show when={!isRenaming()}>` — make sure the `ContextMenu` and rename input are siblings, not nested | Keep them as siblings inside `<div class="relative">` |
| `build_question_updated_input` visibility | Currently in `commands/bridge.rs` — may be private | Check and make `pub(crate)` if needed |
| YOLO auto-resolve race | `store_pending_question` returns a `Receiver<Value>`. The spawned task must hold onto it until `resolve_question` resolves it. Dropping `rx` early causes the send to fail. | Pass `rx` into the spawned task even if not awaiting it — just `let _rx = rx;` inside the `tokio::spawn` |
| `PermissionManager::clone` | Only `Clone` if the manager is `Arc`-backed. Check the struct definition. | If not Clone, use the passed-in `pm` reference carefully or pass `Arc<PermissionManager>` |
| `dialogRef` as `tabindex="-1"` | The dialog container with `tabindex="-1"` is focusable but not in the natural tab order — this is correct for programmatic focus on mount | Don't add `tabindex="0"` to it |
| Vitest mock for `invoke` | QuestionDialog tests call `invoke('respond_question', ...)` — must be mocked in test setup | Add `vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))` at the top of the test file |
