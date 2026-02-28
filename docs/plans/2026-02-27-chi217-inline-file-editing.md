# CHI-217: Inline File Editing in FilePreview Panel

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the read-only `FilePreview.tsx` panel into a click-to-edit inline editor using CodeMirror 6, with auto-save on blur (500ms debounce), undo/redo, dirty indicator, conflict detection, and read-only lock.

**Architecture:**
- `FilePreview.tsx` — major refactor: click on code view → CodeMirror 6 replaces static display. Auto-save on blur via `EditorView.domEventHandlers`. Dirty/saving/saved/error state shown inline.
- New IPC `write_file_content` in `commands/files.rs` — atomic file write with path containment check.
- `fileStore.ts` — add `editState: FileEditState` block: `isEditing`, `isDirty`, `saveStatus`, `fullContent`, `conflictDetected`, `isReadonly`.
- `DetailsPanel.tsx` — title slot updated to show `●` dot when dirty.

**Tech Stack:** Tauri v2, Rust (std::fs), SolidJS 1.9, CodeMirror 6 (`@codemirror/*`), Vitest, solid-testing-library

**UX Decisions (from spec):**
- Entry: click anywhere in preview → edit mode (no explicit Edit button)
- Save: auto-save on blur, 500ms debounce, no Cmd+S required
- Undo: full Cmd+Z / Cmd+Shift+Z, survives blur events (CodeMirror history extension)
- Tab: indent (not focus navigation); Shift+Tab: outdent
- Escape: blur editor (edits retained)
- Dirty: white `●` dot in DetailsPanel "File Preview" header + "Unsaved" text in preview header
- Feedback: "Saving…" → "Saved" text + 1.5s auto-dismiss toast
- Read-only: 🔒 icon, disabled editor, tooltip "File is read-only"
- Conflict: banner "File changed on disk. [Reload] [Keep my edits]" when `files:changed` fires during edit
- Large file warning: >100KB or >5000 lines → "Large file — use Cmd+Z to undo bulk changes" banner
- Binary files: remain non-editable (no click-to-edit)

---

## Task 1: Rust — add `is_readonly` to `FileContent` + `write_file_content` IPC

**Files:**
- Modify: `src-tauri/src/files/mod.rs`
- Modify: `src-tauri/src/files/scanner.rs`
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/lib.rs` or `src-tauri/src/main.rs` (register new command)

### Step 1: Write the failing tests

In `src-tauri/src/files/scanner.rs`, inside the `#[cfg(test)] mod tests` block, add:

```rust
#[test]
fn write_file_creates_and_reads_back() {
    let project = create_test_project();
    write_file(project.path(), "src/new-file.ts", "export const x = 1;\n").unwrap();
    let content = std::fs::read_to_string(project.path().join("src/new-file.ts")).unwrap();
    assert_eq!(content, "export const x = 1;\n");
}

#[test]
fn write_file_overwrites_existing() {
    let project = create_test_project();
    write_file(project.path(), "README.md", "Updated\n").unwrap();
    let content = std::fs::read_to_string(project.path().join("README.md")).unwrap();
    assert_eq!(content, "Updated\n");
}

#[test]
fn write_file_rejects_path_traversal() {
    let base = tempfile::tempdir().unwrap();
    let project_dir = base.path().join("project");
    std::fs::create_dir_all(&project_dir).unwrap();
    std::fs::create_dir_all(project_dir.join("src")).unwrap();
    let result = write_file(&project_dir, "../outside.txt", "evil");
    assert!(result.is_err(), "Should reject path traversal");
}

#[test]
fn write_file_rejects_nonexistent_parent_dir() {
    let project = create_test_project();
    let result = write_file(project.path(), "no-such-dir/file.txt", "content");
    assert!(result.is_err());
}

#[test]
fn read_file_exposes_is_readonly_flag() {
    let project = create_test_project();
    let result = read_file(project.path(), "README.md", None, None).unwrap();
    // Regular file in a temp dir should NOT be readonly
    assert!(!result.is_readonly, "README.md should not be readonly");
}
```

### Step 2: Run tests — verify they fail

```bash
cd src-tauri && cargo test write_file -- --nocapture
```
Expected: compile errors (functions don't exist yet).

### Step 3: Add `is_readonly` to `FileContent` struct

In `src-tauri/src/files/mod.rs`, find the `FileContent` struct and add one field after `truncated`:

```rust
/// Whether the file is read-only on disk (permissions check).
pub is_readonly: bool,
```

Update the one place `FileContent` is constructed in `scanner.rs`'s `read_file` function:
- Find the final `Ok(FileContent { ... })` return value
- Add `is_readonly: false` as a placeholder — you will fill in the real value next

To detect read-only: after `let metadata = std::fs::metadata(&safe_path)?;`, add:
```rust
let is_readonly = metadata.permissions().readonly();
```
Then use `is_readonly` in the struct literal.

Also update the early-exit binary-file return to include `is_readonly: false` (it doesn't matter for binary files).

### Step 4: Add `write_file` function to `scanner.rs`

Add this function after `read_file`:

```rust
/// Write `content` to `relative_path` within `project_root`.
/// Validates path containment. Creates/overwrites the file atomically on most platforms.
pub fn write_file(
    project_root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<(), AppError> {
    tracing::debug!(
        root = %project_root.display(),
        relative_path = %relative_path,
        content_bytes = content.len(),
        "writing project file"
    );

    let full_path = project_root.join(relative_path);
    let parent = full_path.parent().ok_or_else(|| {
        AppError::Other(format!("Invalid path (no parent): {}", relative_path))
    })?;

    // Parent must exist. Canonicalize it (not the file — it may not exist yet).
    if !parent.exists() {
        return Err(AppError::Other(format!(
            "Parent directory does not exist: {}",
            relative_path
        )));
    }
    let safe_parent = std::fs::canonicalize(parent)?;
    let root = std::fs::canonicalize(project_root)?;
    if !safe_parent.starts_with(&root) {
        return Err(AppError::Other(format!(
            "Path escapes project root: {}",
            relative_path
        )));
    }

    std::fs::write(&full_path, content).map_err(AppError::from)?;
    tracing::debug!(relative_path = %relative_path, "wrote project file");
    Ok(())
}
```

### Step 5: Add `write_file_content` IPC command to `commands/files.rs`

Add this function after `read_project_file`:

```rust
/// Write content to a project file (inline editor save).
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db, content), fields(
    project_id = %project_id,
    relative_path = %relative_path,
    content_bytes = content.len()
))]
pub fn write_file_content(
    db: State<'_, Database>,
    project_id: String,
    relative_path: String,
    content: String,
) -> Result<(), AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let project_root = std::path::Path::new(&project.path);
    scanner::write_file(project_root, &relative_path, &content)
}
```

### Step 6: Register the command in `main.rs`

Find the `.invoke_handler(tauri::generate_handler![...])` call. Add `commands::files::write_file_content` to the list (keep alphabetical order within the files block).

### Step 7: Update `src/lib/types.ts` — add `is_readonly` to `FileContent`

Find the `FileContent` interface (around line 239) and add:
```typescript
/** Whether the file is read-only on disk. */
is_readonly: boolean;
```

### Step 8: Run all Rust tests

```bash
cd src-tauri && cargo test
```
Expected: all tests pass including the 5 new ones.

### Step 9: Commit

```bash
git add src-tauri/src/files/mod.rs src-tauri/src/files/scanner.rs \
        src-tauri/src/commands/files.rs src-tauri/src/main.rs \
        src/lib/types.ts
git commit -m "CHI-217: add write_file_content IPC + is_readonly to FileContent (5 Rust tests)"
```

---

## Task 2: Install CodeMirror 6 dependencies

**Files:**
- Modify: `package.json` (via npm)

### Step 1: Install packages

```bash
npm install @codemirror/state @codemirror/view @codemirror/commands \
  @codemirror/language @codemirror/lang-javascript @codemirror/lang-rust \
  @codemirror/lang-json @codemirror/lang-css @codemirror/lang-html \
  @codemirror/lang-python @codemirror/lang-markdown \
  @codemirror/theme-one-dark
```

### Step 2: Verify build doesn't break

```bash
npx vite build 2>&1 | tail -20
```
Expected: no errors (CodeMirror packages resolve cleanly).

### Step 3: Commit

```bash
git add package.json package-lock.json
git commit -m "CHI-217: install CodeMirror 6 packages"
```

---

## Task 3: Add editing state to `fileStore.ts`

**Files:**
- Modify: `src/stores/fileStore.ts`

### Step 1: Write the failing tests

Create `src/stores/fileStore.edit.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// IPC mock
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock('@/stores/projectStore', () => ({
  projectState: { activeProjectId: 'proj-1' },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { addToast } from '@/stores/toastStore';

describe('fileStore editing state (CHI-217)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enterEditMode sets isEditing=true and stores fullContent', async () => {
    const { enterEditMode, fileState } = await import('@/stores/fileStore');
    enterEditMode('const x = 1;', 'src/main.ts');
    expect(fileState.isEditing).toBe(true);
    expect(fileState.fullContent).toBe('const x = 1;');
    expect(fileState.editingFilePath).toBe('src/main.ts');
  });

  it('exitEditMode resets all edit state', async () => {
    const { enterEditMode, exitEditMode, fileState } = await import('@/stores/fileStore');
    enterEditMode('hello', 'src/a.ts');
    exitEditMode();
    expect(fileState.isEditing).toBe(false);
    expect(fileState.isDirty).toBe(false);
    expect(fileState.fullContent).toBeNull();
    expect(fileState.editingFilePath).toBeNull();
  });

  it('setEditBuffer marks isDirty', async () => {
    const { enterEditMode, setEditBuffer, fileState } = await import('@/stores/fileStore');
    enterEditMode('original', 'src/a.ts');
    setEditBuffer('modified content');
    expect(fileState.isDirty).toBe(true);
    expect(fileState.fullContent).toBe('modified content');
  });

  it('saveFileEdit calls write_file_content IPC and shows toast on success', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { enterEditMode, setEditBuffer, saveFileEdit, fileState } = await import('@/stores/fileStore');
    enterEditMode('original', 'src/a.ts');
    setEditBuffer('updated');
    await saveFileEdit('proj-1', 'src/a.ts');
    expect(invoke).toHaveBeenCalledWith('write_file_content', {
      project_id: 'proj-1',
      relative_path: 'src/a.ts',
      content: 'updated',
    });
    expect(fileState.saveStatus).toBe('saved');
    expect(addToast).toHaveBeenCalledWith('File saved', 'success', expect.any(Number));
  });

  it('saveFileEdit sets saveStatus=error on IPC failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'));
    const { enterEditMode, setEditBuffer, saveFileEdit, fileState } = await import('@/stores/fileStore');
    enterEditMode('original', 'src/a.ts');
    setEditBuffer('modified');
    await saveFileEdit('proj-1', 'src/a.ts');
    expect(fileState.saveStatus).toBe('error');
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('disk full'), 'error');
  });
});
```

### Step 2: Run tests — verify they fail

```bash
npx vitest run src/stores/fileStore.edit.test.ts
```
Expected: FAIL (missing exports `enterEditMode`, `exitEditMode`, `setEditBuffer`, `saveFileEdit`).

### Step 3: Add edit state to `fileStore.ts`

In `src/stores/fileStore.ts`:

**a) Add imports at the top:**
```typescript
import { addToast } from '@/stores/toastStore';
```

**b) Add new fields to the `FileState` interface** (after `editingAttachmentId`):
```typescript
// ── Inline editing (CHI-217) ──────────────────────
/** Whether the file is currently open in the inline editor. */
isEditing: boolean;
/** Whether the editor buffer differs from the saved file. */
isDirty: boolean;
/** Current editor save lifecycle status. */
saveStatus: 'idle' | 'saving' | 'saved' | 'error';
/** Full file content loaded for editing (may be larger than the 50-line preview). */
fullContent: string | null;
/** Path of the file currently being edited. */
editingFilePath: string | null;
/** Whether the file on disk changed while editing (conflict detected). */
conflictDetected: boolean;
/** Whether the file is read-only on disk. */
isReadonly: boolean;
```

**c) Add initial values in `createStore<FileState>({...})`:**
```typescript
isEditing: false,
isDirty: false,
saveStatus: 'idle',
fullContent: null,
editingFilePath: null,
conflictDetected: false,
isReadonly: false,
```

**d) Update `selectFile` to reset edit state and set `isReadonly`:**

Inside `selectFile` (after setting `previewContent`), add:
```typescript
// Exit any active edit session when switching files
setState({ isEditing: false, isDirty: false, saveStatus: 'idle', fullContent: null, editingFilePath: null, conflictDetected: false });
// Set read-only flag from file metadata
setState('isReadonly', content.is_readonly ?? false);
```

**e) Update `handleFilesChanged` to detect conflicts during editing:**

Find this block near line 169:
```typescript
// Refresh the selected preview if its file changed.
if (state.selectedPath && changedPaths.includes(state.selectedPath)) {
  await selectFile(payload.project_id, state.selectedPath);
}
```

Replace with:
```typescript
// If the file changed while editing: show conflict banner instead of auto-refreshing.
if (state.selectedPath && changedPaths.includes(state.selectedPath)) {
  if (state.isEditing) {
    setState('conflictDetected', true);
  } else {
    await selectFile(payload.project_id, state.selectedPath);
  }
}
```

**f) Add the four new exported functions** (add after `setSelectedRange`):

```typescript
/** Enter inline edit mode for the currently previewed file. Loads full content first. */
export async function enterEditMode(content: string, relativePath: string): Promise<void> {
  setState({
    isEditing: true,
    isDirty: false,
    saveStatus: 'idle',
    fullContent: content,
    editingFilePath: relativePath,
    conflictDetected: false,
  });
}

/** Exit inline edit mode, discarding any unsaved buffer reference. */
export function exitEditMode(): void {
  setState({
    isEditing: false,
    isDirty: false,
    saveStatus: 'idle',
    fullContent: null,
    editingFilePath: null,
    conflictDetected: false,
  });
}

/** Update the editor buffer (called on every CodeMirror doc change). */
export function setEditBuffer(content: string): void {
  setState({ fullContent: content, isDirty: true });
}

/** Persist the current edit buffer to disk. Shows toast on completion. */
export async function saveFileEdit(projectId: string, relativePath: string): Promise<void> {
  const content = state.fullContent;
  if (!content) return;
  setState('saveStatus', 'saving');
  try {
    await invoke('write_file_content', {
      project_id: projectId,
      relative_path: relativePath,
      content,
    });
    setState({ saveStatus: 'saved', isDirty: false });
    addToast('File saved', 'success', 1500);
    // Reset to idle after 2s so the status label clears
    setTimeout(() => setState('saveStatus', 'idle'), 2000);
  } catch (err) {
    setState('saveStatus', 'error');
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Failed to save file: ' + msg);
    addToast('Failed to save: ' + msg, 'error');
  }
}
```

**g) Update `clearFileState` to reset edit state:**

In the `setState({...})` call inside `clearFileState`, add:
```typescript
isEditing: false,
isDirty: false,
saveStatus: 'idle',
fullContent: null,
editingFilePath: null,
conflictDetected: false,
isReadonly: false,
```

### Step 4: Run tests

```bash
npx vitest run src/stores/fileStore.edit.test.ts
```
Expected: all 5 tests PASS.

### Step 5: TypeScript check

```bash
npx tsc --noEmit
```
Expected: no errors.

### Step 6: Commit

```bash
git add src/stores/fileStore.ts src/stores/fileStore.edit.test.ts
git commit -m "CHI-217: add edit state to fileStore — enterEditMode/exitEditMode/saveFileEdit (5 tests)"
```

---

## Task 4: Refactor `FilePreview.tsx` — embed CodeMirror 6 editor

**Files:**
- Modify: `src/components/explorer/FilePreview.tsx`

This is the largest task. The read-only view stays intact; clicking on the code viewport activates the editor.

### Step 1: Plan the structure before writing

The component will have three modes:
1. **Read-only** (default): existing static table view with line numbers + range selection
2. **Editing**: CodeMirror 6 replaces the code viewport; toolbar shows save status; range selection bar hidden
3. **Locked**: binary / read-only file → no click-to-edit; 🔒 shown

Key new signals/refs:
- `editorContainerRef: HTMLDivElement | undefined` — CodeMirror mount point
- `editorViewRef: EditorView | undefined` — CodeMirror instance (module-level `let`)
- `saveDebounceTimer: ReturnType<typeof setTimeout>` — 500ms blur debounce
- All edit state comes from `fileStore` (reactive store)

### Step 2: Add imports to `FilePreview.tsx`

Add to the top of the file:

```typescript
// CodeMirror 6 — lazy language loader
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { Lock } from 'lucide-solid';
import {
  enterEditMode,
  exitEditMode,
  fileState,
  saveFileEdit,
  setEditBuffer,
} from '@/stores/fileStore';
```

### Step 3: Add `loadLanguageExtension` helper (outside component)

Add this function before the `FilePreview` component declaration:

```typescript
/** Lazy-load a CodeMirror language extension. Returns null for unknown languages. */
async function loadLanguageExtension(language: string | null): Promise<Extension | null> {
  switch (language) {
    case 'typescript':
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: language === 'typescript' });
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'python': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'markdown': {
      const { markdown } = await import('@codemirror/lang-markdown');
      return markdown();
    }
    default:
      return null;
  }
}
```

### Step 4: Add editor state variables inside the `FilePreview` component

Inside the `FilePreview` component body, after the existing signal declarations, add:

```typescript
let editorContainerRef: HTMLDivElement | undefined;
let editorView: EditorView | undefined;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Mount CodeMirror when entering edit mode; destroy when exiting.
createEffect(async () => {
  const editing = fileState.isEditing;
  const filePath = fileState.editingFilePath;

  if (editing && filePath === props.content.relative_path) {
    // Mount editor (next microtask, after DOM renders)
    await Promise.resolve();
    if (!editorContainerRef || editorView) return;

    const langExt = await loadLanguageExtension(props.content.language);
    const extensions: Extension[] = [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setEditBuffer(update.state.doc.toString());
          // Reset auto-save debounce
          if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
          saveDebounceTimer = setTimeout(() => {
            const pid = projectState.activeProjectId;
            if (pid && filePath) void saveFileEdit(pid, filePath);
          }, 500);
        }
      }),
      EditorView.domEventHandlers({
        blur: () => {
          // Trigger save on blur if dirty
          const pid = projectState.activeProjectId;
          if (fileState.isDirty && pid && filePath) {
            if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
            saveDebounceTimer = setTimeout(() => {
              void saveFileEdit(pid, filePath);
            }, 500);
          }
        },
        keydown: (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            // Blur editor; edits retained in history
            (document.activeElement as HTMLElement)?.blur();
          }
        },
      }),
      EditorView.editable.of(!fileState.isReadonly),
    ];
    if (langExt) extensions.push(langExt);

    const startState = EditorState.create({
      doc: fileState.fullContent ?? activeContent().content,
      extensions,
    });
    editorView = new EditorView({
      state: startState,
      parent: editorContainerRef,
    });
  } else if (!editing) {
    // Destroy editor when exiting edit mode
    if (editorView) {
      editorView.destroy();
      editorView = undefined;
    }
  }
});
```

Update the existing `onCleanup` to also destroy the editor:

```typescript
onCleanup(() => {
  if (copyTimeout) clearTimeout(copyTimeout);
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  if (editorView) {
    editorView.destroy();
    editorView = undefined;
  }
  cleanupResizeListeners();
  // ... existing window listeners
});
```

### Step 5: Add derived memos for UI state

Inside the component, add:

```typescript
const isLargeFile = () =>
  props.content.size_bytes > 100 * 1024 || props.content.line_count > 5000;

const canEdit = () => !isBinaryFile() && !props.content.is_readonly;

const saveStatusLabel = () => {
  switch (fileState.saveStatus) {
    case 'saving': return 'Saving…';
    case 'saved': return 'Saved';
    case 'error': return 'Save failed';
    default: return fileState.isDirty ? 'Unsaved' : '';
  }
};

const saveStatusColor = () => {
  switch (fileState.saveStatus) {
    case 'saving': return 'var(--color-text-tertiary)';
    case 'saved': return 'var(--color-success)';
    case 'error': return 'var(--color-tool-permission-deny)';
    default: return fileState.isDirty ? 'var(--color-warning)' : 'transparent';
  }
};
```

### Step 6: Update `handleCodeViewportClick` — click to enter edit mode

Create a new function:
```typescript
async function handleCodeViewportClick() {
  if (fileState.isEditing) return; // already editing
  if (!canEdit()) return;

  const pid = projectState.activeProjectId;
  if (!pid) return;

  // Load full content for editing (current preview may only have 50 lines)
  let fullContent = activeContent().content;
  if (props.content.truncated || activeContent().line_count < props.content.line_count) {
    try {
      const full = await invoke<FileContent>('read_project_file', {
        project_id: pid,
        relative_path: props.content.relative_path,
        start_line: null,
        end_line: null,
      });
      fullContent = full.content;
    } catch (err) {
      log.error('Failed to load full content for editing: ' + String(err));
      // Fall through with partial content
    }
  }

  await enterEditMode(fullContent, props.content.relative_path);
}
```

### Step 7: Update the JSX — filename header row

Find the filename header row (the `<div class="flex items-center gap-2 min-w-0">` near line 344). Add save status and lock icon:

```tsx
<div class="flex items-center gap-2 min-w-0">
  <File size={12} style={{ color: 'var(--color-accent)' }} />
  <span
    class="font-mono text-xs font-medium truncate"
    style={{ color: 'var(--color-text-primary)' }}
    title={fileName()}
  >
    {fileName()}
  </span>

  {/* Read-only lock icon */}
  <Show when={props.content.is_readonly}>
    <Lock size={10} style={{ color: 'var(--color-text-tertiary)' }} title="File is read-only" />
  </Show>

  {/* Dirty/save status indicator */}
  <Show when={fileState.isEditing && fileState.editingFilePath === props.content.relative_path}>
    <span
      class="text-[10px] font-mono ml-1 shrink-0"
      style={{ color: saveStatusColor() }}
    >
      {saveStatusLabel() || (fileState.isDirty ? '●' : '')}
    </span>
  </Show>

  <span
    class="text-[9px] font-mono ml-auto shrink-0"
    style={{ color: 'var(--color-text-tertiary)' }}
  >
    ~{(activeContent().estimated_tokens / 1000).toFixed(1)}K
  </span>
</div>
```

### Step 8: Update the JSX — conflict and large-file banners

Add these banners **before** the main code viewport `<Show>` block:

```tsx
{/* Conflict banner — file changed on disk while editing */}
<Show when={fileState.conflictDetected && fileState.isEditing}>
  <div
    class="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[10px]"
    style={{
      background: 'rgba(248, 81, 73, 0.08)',
      border: '1px solid rgba(248, 81, 73, 0.3)',
      color: 'var(--color-tool-permission-deny)',
    }}
  >
    <span>File changed on disk.</span>
    <div class="flex items-center gap-2">
      <button
        class="underline"
        onClick={async () => {
          // Reload from disk — discard local edits
          const pid = projectState.activeProjectId;
          if (!pid) return;
          exitEditMode();
          await selectFile(pid, props.content.relative_path);
        }}
      >
        Reload
      </button>
      <button
        class="underline"
        onClick={() => setState({ conflictDetected: false })}
      >
        Keep my edits
      </button>
    </div>
  </div>
</Show>

{/* Large file warning */}
<Show when={isLargeFile() && fileState.isEditing}>
  <div
    class="px-2 py-1 rounded text-[10px]"
    style={{
      background: 'var(--color-bg-elevated)',
      color: 'var(--color-text-tertiary)',
      border: '1px solid var(--color-border-secondary)',
    }}
  >
    Large file — use Cmd+Z to undo bulk changes
  </div>
</Show>
```

> **Note:** `setState` is not directly available in FilePreview. Instead, import `setConflictDetected` (a small exported helper from fileStore) OR inline an `exitConflict` call. Add a one-liner export to fileStore: `export function clearConflict(): void { setState('conflictDetected', false); }` and call that here instead.

### Step 9: Update the JSX — main content area

Replace the existing code viewport `<Show>` block structure with a conditional between the editor and the read-only view:

```tsx
{/* ── EDIT MODE: CodeMirror editor ── */}
<Show when={fileState.isEditing && fileState.editingFilePath === props.content.relative_path}>
  <div
    ref={editorContainerRef}
    class="rounded overflow-hidden"
    classList={{
      'flex-1': props.fillHeight,
      'min-h-0': props.fillHeight,
    }}
    style={{
      height: props.fillHeight ? '100%' : `${previewHeight()}px`,
      'min-height': props.fillHeight ? undefined : '200px',
      border: fileState.isDirty
        ? '1px solid var(--color-accent)'
        : '1px solid var(--color-border-secondary)',
      'font-size': '12px',
    }}
    aria-label="File editor"
  />
  {/* "Stop editing" affordance */}
  <button
    class="text-[10px] px-1.5 py-0.5 rounded self-start"
    style={{
      color: 'var(--color-text-tertiary)',
      background: 'transparent',
      border: '1px solid var(--color-border-secondary)',
    }}
    onClick={exitEditMode}
  >
    Stop editing
  </button>
</Show>

{/* ── READ-ONLY MODE: existing static table view ── */}
<Show when={!fileState.isEditing && !props.isLoading && !isBinaryFile() && !isEmptyTextFile() && displayContent()}>
  {/* Add onClick to enter edit mode */}
  <div
    ref={codeViewportRef}
    class="overflow-auto rounded focus-ring"
    classList={{
      'flex-1': props.fillHeight,
      'min-h-[180px]': props.fillHeight,
      'cursor-text': canEdit(),
    }}
    style={{
      height: props.fillHeight ? '100%' : `${previewHeight()}px`,
      'min-height': props.fillHeight ? undefined : '200px',
      background: 'var(--color-bg-inset)',
      border: '1px solid var(--color-border-secondary)',
      'scrollbar-gutter': 'stable',
      'overscroll-behavior': 'contain',
    }}
    tabindex={0}
    onMouseUp={stopDragging}
    onKeyDown={handlePreviewKeyDown}
    onClick={() => { if (!isDragging()) void handleCodeViewportClick(); }}
    aria-label="File preview — click to edit"
  >
    {/* existing <table> with line numbers ... unchanged ... */}
  </div>

  {/* ... existing Load More, selection bar ... */}
</Show>
```

### Step 10: Full TypeScript check + lint

```bash
npx tsc --noEmit && npx eslint src/components/explorer/FilePreview.tsx
```
Fix any type errors (common: `setState` not imported — use fileStore exported helpers; `selectFile` signature — takes projectId + path).

### Step 11: Commit

```bash
git add src/components/explorer/FilePreview.tsx
git commit -m "CHI-217: embed CodeMirror 6 editor in FilePreview — click-to-edit with auto-save"
```

---

## Task 5: Update `DetailsPanel.tsx` — dirty dot in section title

**Files:**
- Modify: `src/components/layout/DetailsPanel.tsx`

### Step 1: Change `SectionProps.title` to accept `JSX.Element`

In `DetailsPanel.tsx`, update the `SectionProps` interface:

```typescript
interface SectionProps {
  id: string;
  title: JSX.Element;   // was: string
  // ... rest unchanged
}
```

### Step 2: Update the "File Preview" section title to show dirty dot

Find the `<CollapsibleSection id="filePreview" ...>` component. Change the `title` prop:

```tsx
<CollapsibleSection
  id="filePreview"
  title={
    <>
      File Preview
      <Show when={fileState.isDirty && fileState.editingFilePath === fileState.selectedPath}>
        <span
          class="ml-1 text-[8px]"
          style={{ color: 'var(--color-warning)' }}
          title="Unsaved changes"
          aria-label="Unsaved changes"
        >
          ●
        </span>
      </Show>
    </>
  }
  open={isSectionOpen('filePreview')}
  focused={isFocused('filePreview')}
  onHeaderClick={() => handleSectionHeaderClick('filePreview')}
>
```

### Step 3: TypeScript check

```bash
npx tsc --noEmit
```

### Step 4: Commit

```bash
git add src/components/layout/DetailsPanel.tsx
git commit -m "CHI-217: show dirty dot in DetailsPanel File Preview section header"
```

---

## Task 6: Add `clearConflict` helper to `fileStore.ts`

> Small follow-up from Task 4 Step 8 where `FilePreview` needs to clear the conflict flag.

**Files:**
- Modify: `src/stores/fileStore.ts`

### Step 1: Add one-liner export

After `exitEditMode`, add:
```typescript
/** Dismiss the on-disk conflict banner (user chose "Keep my edits"). */
export function clearConflict(): void {
  setState('conflictDetected', false);
}
```

### Step 2: Update `FilePreview.tsx` to use it

In `FilePreview.tsx`, add to the import from `@/stores/fileStore`:
```typescript
import { clearConflict, enterEditMode, exitEditMode, fileState, saveFileEdit, setEditBuffer } from '@/stores/fileStore';
```

Replace the inline `setState({ conflictDetected: false })` in the "Keep my edits" button:
```tsx
onClick={clearConflict}
```

### Step 3: TypeScript check

```bash
npx tsc --noEmit
```

### Step 4: Commit

```bash
git add src/stores/fileStore.ts src/components/explorer/FilePreview.tsx
git commit -m "CHI-217: add clearConflict helper; fix FilePreview import"
```

---

## Task 7: Full smoke check + accessibility

### Step 1: Run all unit tests

```bash
npx vitest run
```
Expected: all pass (including the 5 new fileStore edit tests).

### Step 2: Run all Rust tests

```bash
cd src-tauri && cargo test
```

### Step 3: Lint + typecheck + format

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```
Fix any issues (common: missing `import type { FileContent }` in FilePreview after adding `invoke` call).

### Step 4: Rust lint

```bash
cd src-tauri && cargo clippy -- -D warnings && cargo fmt --check
```

### Step 5: Build check

```bash
npx vite build 2>&1 | tail -20
```

### Step 6: Accessibility quick-check (manual)

Open the app in development mode and verify:
- Clicking on file preview text shows CodeMirror editor with visible cursor and border
- Tab key indents (does not move focus)
- Escape blurs the editor
- Dirty `●` appears in DetailsPanel header after first keystroke
- Blur triggers "Saving…" then "Saved" toast appears 1.5s
- Closing and reopening the preview panel → editor exits, read-only view shows updated content
- Binary file shows no click-to-edit (cursor-text class not present)
- Read-only file shows 🔒 icon, clicking does not enter edit mode

### Step 7: Update handover.json

```bash
python3 -c "
import json
with open('.claude/handover.json') as f: d = json.load(f)
d['file_explorer_v2_epic']['CHI-217']['status'] = 'done'
d['file_explorer_v2_epic']['CHI-217']['completed_notes'] = 'CodeMirror 6 inline editor in FilePreview; write_file_content IPC; auto-save blur 500ms; dirty dot in DetailsPanel; conflict banner; read-only lock.'
with open('.claude/handover.json', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
print('Updated')
"
```

### Step 8: Final commit

```bash
git add .claude/handover.json
git commit -m "docs: mark CHI-217 done in handover.json"
```

---

## Acceptance Criteria Checklist

Before marking CHI-217 done in Linear:

- [ ] 1. Click anywhere in FilePreview text → editor active (CodeMirror cursor visible, orange border)
- [ ] 2. Dirty indicator: `●` in DetailsPanel header + "Unsaved" text in preview header
- [ ] 3. Blur → auto-save (500ms debounce); "Saving…" then "Saved"
- [ ] 4. Toast "File saved" (1.5s auto-dismiss) on success
- [ ] 5. Save failure → "Save failed" text + error toast
- [ ] 6. Cmd+Z / Cmd+Shift+Z undo/redo work; survive blur events
- [ ] 7. Tab = indent; Shift+Tab = outdent (via `indentWithTab` keymap binding)
- [ ] 8. Escape = blur (edits retained)
- [ ] 9. Read-only file → 🔒 icon, no click-to-edit
- [ ] 10. On-disk change while editing → conflict banner with Reload / Keep my edits
- [ ] 11. Files >100KB or >5000 lines → large-file warning banner when editing
- [ ] 12. WCAG 2.1 AA: dirty state uses `●` + "Unsaved" text (not color alone); focus ring visible

---

## Quick-Reference

```bash
# Rust checks
cd src-tauri && cargo test && cargo clippy -- -D warnings

# Frontend checks
npx tsc --noEmit
npx eslint .
npx prettier --check .
npx vitest run
npx vite build
```

**New IPC command:** `write_file_content(project_id, relative_path, content) → Result<(), AppError>`

**New fileStore exports:** `enterEditMode`, `exitEditMode`, `setEditBuffer`, `saveFileEdit`, `clearConflict`

**New `FileContent` fields:** `is_readonly: bool` (Rust) / `is_readonly: boolean` (TS)
