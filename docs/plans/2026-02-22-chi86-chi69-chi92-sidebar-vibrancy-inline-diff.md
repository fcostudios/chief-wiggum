# CHI-86, CHI-69, CHI-92 (Session Actions, Vibrancy, Inline Diff) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement session inline rename/actions (`CHI-86`), macOS vibrancy polish for app chrome (`CHI-69`), and inline diff previews in conversation tool results (`CHI-92`) with a minimal bridge into the existing Diff tab.

**Architecture:** `CHI-86` spans Sidebar UI + session store + Tauri session IPC + SQLite queries. `CHI-69` is a cross-layer visual polish using Tauri window configuration/runtime effects plus targeted chrome styling (titlebar/sidebar only, not global token regression). `CHI-92` extends tool-result rendering by pairing `tool_result` and `tool_use` messages via `tool_use_id`, parsing unified diff text heuristically, and routing preview payloads into a minimal diff review store so the current Diff tab can display selected inline previews.

**Tech Stack:** Tauri v2 (Rust), SolidJS, TypeScript, Tailwind CSS v4, SQLite (rusqlite), highlight.js, Linear/CLAUDE handoff workflow

---

## Context / Preconditions

- Execute in a dedicated git worktree (recommended: `@using-git-worktrees`).
- `CHI-89` is already `Done` in Linear, so `CHI-92` is no longer blocked in practice (issue text is stale).
- Current constraints:
  - No frontend unit/component test harness is configured in `package.json` today.
  - Diff tab (`uiState.activeView === 'diff'`) is still a placeholder in `src/components/layout/MainLayout.tsx`.
- Pragmatic testing approach:
  - Use Rust unit tests (TDD) for SQLite/query behavior in `CHI-86`.
  - Use typecheck/lint/build + manual UI verification for frontend and visual behavior (`CHI-69`, `CHI-92`).

## References to Read Before Execution

- `docs/specs/SPEC-003-ux-design.md` (§10.1, §10.5, §10.6)
- `docs/specs/SPEC-002-design-system.md` (§3.4 diff colors, §10.11 ToolUseBlock)
- `docs/tasks/TASKS-002-phase2-make-it-real.md` (`CHI-69`, `CHI-86`, `CHI-92`)
- `CLAUDE.md` and `.claude/handover.json` (for end-of-work sync)

## Scope Decisions (to avoid ambiguity during execution)

- `CHI-86 Duplicate session` duplicates **session metadata only** (project + model + optional derived title), not message history or CLI process state.
- `CHI-86 Delete confirmation` uses a lightweight confirmation (`window.confirm`) only when the target session has messages (no new modal component in this issue).
- `CHI-69` implements macOS vibrancy now; Windows Mica/Acrylic remains optional/best-effort if the chosen crate API supports it cleanly without destabilizing builds.
- `CHI-92 Open in Diff view` will switch to Diff tab and render a minimal diff preview (not the full future three-pane diff review experience).

---

### Task 0: Preflight, Worktree, and Baseline Validation

**Files:**
- Read: `docs/specs/SPEC-003-ux-design.md`
- Read: `docs/specs/SPEC-002-design-system.md`
- Read: `src/components/layout/Sidebar.tsx`
- Read: `src/components/conversation/ToolResultBlock.tsx`
- Read: `src/components/layout/MainLayout.tsx`

**Step 1: Create/enter a dedicated worktree**

Use `@using-git-worktrees` (or manual git worktree commands) before touching code.

Run:

```bash
git worktree add .claude/worktrees/chi-86-69-92 main
cd .claude/worktrees/chi-86-69-92
```

Expected: new worktree checked out on `main` (or a feature branch created immediately after).

**Step 2: Create a feature branch for the batch**

Run:

```bash
git checkout -b codex/chi-86-69-92-session-actions-vibrancy-inline-diff
```

Expected: branch created and checked out.

**Step 3: Baseline build checks (before changes)**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run typecheck
npm run lint
```

Expected: PASS. If baseline fails, stop and document unrelated failures before continuing.

**Step 4: Record manual fixture notes for CHI-92**

Capture at least 2 real `tool_result` messages from an existing session (one diff-like, one non-diff) for manual regression testing.

Run (example manual path):

```bash
# optional: inspect stored messages if needed (do not edit DB)
rg -n "\"tool_result\"" src/stores/conversationStore.ts
```

Expected: clear understanding of real tool result text formats before parser heuristics are implemented.

---

### Task 1: CHI-86 Backend Query Layer (Duplicate Session + Message Count) with Rust TDD

**Files:**
- Modify: `src-tauri/src/db/queries.rs`
- Test: `src-tauri/src/db/queries.rs` (existing `#[cfg(test)] mod tests`)

**Step 1: Write failing tests for duplicate session metadata copy**

Add tests for:
- duplicate preserves `project_id` and `model`
- duplicate does **not** copy message rows / cost totals / `cli_session_id`
- duplicate can derive a title like `"Original Title (Copy)"` (or fallback if null)

```rust
#[test]
fn duplicate_session_metadata_only_works() {
    let db = test_db();
    insert_project(&db, "p1", "Proj", "/proj").unwrap();
    insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
    update_session_title(&db, "s1", "Alpha").unwrap();
    insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();

    let new_id = "s2";
    duplicate_session_metadata_only(&db, "s1", new_id).unwrap();

    let dup = get_session(&db, new_id).unwrap().unwrap();
    assert_eq!(dup.project_id.as_deref(), Some("p1"));
    assert_eq!(dup.model, "claude-sonnet-4-6");
    assert_eq!(list_messages(&db, new_id).unwrap().len(), 0);
}
```

**Step 2: Write failing test for message count helper**

```rust
#[test]
fn count_session_messages_works() {
    let db = test_db();
    insert_project(&db, "p1", "Proj", "/proj").unwrap();
    insert_session(&db, "s1", Some("p1"), "claude-sonnet-4-6").unwrap();
    assert_eq!(count_session_messages(&db, "s1").unwrap(), 0);

    insert_message(&db, "m1", "s1", "user", "Hello", None, None, None, None).unwrap();
    assert_eq!(count_session_messages(&db, "s1").unwrap(), 1);
}
```

**Step 3: Run targeted tests to verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml db::queries::tests::duplicate_session_metadata_only_works --lib
cargo test --manifest-path src-tauri/Cargo.toml db::queries::tests::count_session_messages_works --lib
```

Expected: FAIL with missing function errors.

**Step 4: Implement minimal query functions**

Add:
- `pub fn count_session_messages(db: &Database, session_id: &str) -> Result<i64, AppError>`
- `pub fn duplicate_session_metadata_only(db: &Database, source_id: &str, new_id: &str) -> Result<(), AppError>`

Implementation sketch:

```rust
pub fn count_session_messages(db: &Database, session_id: &str) -> Result<i64, AppError> {
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        ).map_err(Into::into)
    })
}

pub fn duplicate_session_metadata_only(
    db: &Database,
    source_id: &str,
    new_id: &str,
) -> Result<(), AppError> {
    db.with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO sessions (id, project_id, title, model, status, parent_session_id)
            SELECT
                ?2,
                project_id,
                CASE
                    WHEN title IS NULL OR title = '' THEN 'New Session (Copy)'
                    ELSE title || ' (Copy)'
                END,
                model,
                'active',
                id
            FROM sessions
            WHERE id = ?1
            "#,
            rusqlite::params![source_id, new_id],
        )?;
        Ok(())
    })
}
```

**Step 5: Run targeted tests to verify pass**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml db::queries::tests::duplicate_session_metadata_only_works --lib
cargo test --manifest-path src-tauri/Cargo.toml db::queries::tests::count_session_messages_works --lib
```

Expected: PASS.

**Step 6: Run broader query regression tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml db::queries --lib
```

Expected: PASS for existing and new `db::queries` tests.

**Step 7: Commit query-layer changes**

```bash
git add src-tauri/src/db/queries.rs
git commit -m "feat: add session duplicate and message count queries"
```

---

### Task 2: CHI-86 Session IPC Commands and Store Actions

**Files:**
- Modify: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/stores/sessionStore.ts`

**Step 1: Add failing frontend call sites (temporary compile failure)**

Update `sessionStore.ts` API surface with placeholders referenced from the sidebar implementation to force compile errors before IPC is implemented:

```ts
export async function duplicateSession(sessionId: string): Promise<Session> {
  throw new Error('not implemented');
}

export async function sessionHasMessages(sessionId: string): Promise<boolean> {
  throw new Error('not implemented');
}
```

**Step 2: Run typecheck to confirm failure path is exercised**

Run:

```bash
npm run typecheck
```

Expected: PASS (placeholders compile) or FAIL later when sidebar uses return shape not yet implemented. Either outcome is acceptable at this step.

**Step 3: Add Tauri IPC commands**

Add to `src-tauri/src/commands/session.rs`:
- `duplicate_session`
- `session_has_messages`

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn duplicate_session(db: State<'_, Database>, session_id: String) -> Result<SessionRow, AppError> {
    let new_id = uuid::Uuid::new_v4().to_string();
    queries::duplicate_session_metadata_only(&db, &session_id, &new_id)?;
    queries::get_session(&db, &new_id)?
        .ok_or_else(|| AppError::Other("Duplicated session not found".to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn session_has_messages(db: State<'_, Database>, session_id: String) -> Result<bool, AppError> {
    Ok(queries::count_session_messages(&db, &session_id)? > 0)
}
```

**Step 4: Register new commands in `main.rs`**

Add both commands to `tauri::generate_handler![...]` next to other session commands.

**Step 5: Implement store wrappers in `sessionStore.ts`**

Add store actions that:
- call IPC
- update local `sessionState.sessions`
- set duplicated session as active (or return session and let caller decide; choose one and keep consistent)

```ts
export async function duplicateSession(sessionId: string): Promise<Session> {
  const session = await invoke<Session>('duplicate_session', { session_id: sessionId });
  setState('sessions', (prev) => [session, ...prev]);
  return session;
}

export async function sessionHasMessages(sessionId: string): Promise<boolean> {
  return invoke<boolean>('session_has_messages', { session_id: sessionId });
}
```

**Step 6: Compile-check Rust + TypeScript**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run typecheck
```

Expected: PASS.

**Step 7: Commit IPC/store plumbing**

```bash
git add src-tauri/src/commands/session.rs src-tauri/src/main.rs src/stores/sessionStore.ts
git commit -m "feat: add session actions IPC for duplicate and delete confirmation checks"
```

---

### Task 3: CHI-86 Sidebar Session Actions Menu (Rename / Pin / Duplicate / Delete)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/stores/sessionStore.ts` (if small API tweaks needed)

**Step 1: Add local UI state for inline rename + menu (failing UI state path first)**

Within `SessionItem`, add signals/refs:

```ts
const [menuOpen, setMenuOpen] = createSignal(false);
const [isRenaming, setIsRenaming] = createSignal(false);
const [draftTitle, setDraftTitle] = createSignal(props.session.title || 'New Session');
let menuRef: HTMLDivElement | undefined;
let inputRef: HTMLInputElement | undefined;
```

**Step 2: Add a stub menu button and wire visible state**

Render `⋮` button (e.g., `MoreHorizontal`) shown on hover. Keep actions as placeholders initially.

```tsx
<button
  class="opacity-0 group-hover:opacity-100 ..."
  onClick={(e) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  }}
  aria-label="Session actions"
>
  <MoreHorizontal size={13} />
</button>
```

**Step 3: Run lint/typecheck to catch event/Signal issues early**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS or actionable lint errors (unused refs, event propagation).

**Step 4: Implement inline rename behavior (double-click, Enter/Escape/blur)**

Requirements:
- Double-click title enters rename mode.
- Enter trims and commits if changed/non-empty.
- Escape cancels and restores original.
- Blur commits (same rules) and exits rename mode.

Implementation sketch:

```ts
async function commitRename() {
  const trimmed = draftTitle().trim();
  const fallback = props.session.title || 'New Session';
  if (!trimmed) {
    setDraftTitle(fallback);
    setIsRenaming(false);
    return;
  }
  if (trimmed !== (props.session.title || 'New Session')) {
    await updateSessionTitle(props.session.id, trimmed);
  }
  setIsRenaming(false);
}
```

**Step 5: Implement menu actions**

Actions:
- Rename -> enter rename mode
- Pin/Unpin -> `toggleSessionPinned`
- Duplicate -> `duplicateSession`, set active session, switch conversation
- Delete -> delegate to parent delete flow (confirmation added in Task 4)

Example action wiring:

```ts
async function handleDuplicate(e: MouseEvent) {
  e.stopPropagation();
  const dup = await duplicateSession(props.session.id);
  props.onSelect(dup.id);
  setMenuOpen(false);
}
```

**Step 6: Add click-outside + Escape-to-close menu behavior**

Follow `ModelSelector.tsx` pattern (`mousedown` listener on document/window) and ensure cleanup.

**Step 7: Manual UI smoke test for session actions (without delete confirm yet)**

Run:

```bash
npm run tauri dev
```

Manual checks:
- double-click title enters inline input
- Enter saves rename
- Escape cancels
- Pin/Unpin moves session between sections
- Duplicate creates a new session with same model/project

Expected: all behaviors work; delete may still be immediate until Task 4.

**Step 8: Commit CHI-86 UI actions menu and rename**

```bash
git add src/components/layout/Sidebar.tsx src/stores/sessionStore.ts
git commit -m "feat: add inline session rename and actions menu"
```

---

### Task 4: CHI-86 Conditional Delete Confirmation (Sessions With Messages)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/stores/sessionStore.ts` (if helper exports need adjustment)

**Step 1: Add delete confirmation gate using `sessionHasMessages`**

Before delete action executes, check message presence:

```ts
const hasMessages = await sessionHasMessages(sessionId);
if (hasMessages) {
  const ok = window.confirm('Delete this session and all its messages? This cannot be undone.');
  if (!ok) return;
}
await props.onDelete(sessionId);
```

**Step 2: Ensure current trash icon path and menu delete path use same confirmation logic**

Refactor to a shared handler inside `SessionItem` so behavior is consistent.

**Step 3: Run verification**

Run:

```bash
npm run typecheck
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml db::queries --lib
```

Expected: PASS.

**Step 4: Manual QA for delete behavior**

Run:

```bash
npm run tauri dev
```

Manual checks:
- delete empty session -> no confirmation (or confirmation only if product decides always-confirm; document behavior)
- delete session with messages -> confirmation shown
- cancel confirmation -> session remains
- confirm deletion -> session removed and active-session fallback still works

**Step 5: Commit CHI-86 completion**

```bash
git add src/components/layout/Sidebar.tsx src/stores/sessionStore.ts
git commit -m "feat: confirm session deletion when messages exist"
```

---

### Task 5: CHI-69 Tauri Window Vibrancy Runtime + Config (Rust / Tauri)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Add dependency (compile will fail until used/imported correctly)**

Add a Tauri v2-compatible `window-vibrancy` crate version to `src-tauri/Cargo.toml`.

```toml
window-vibrancy = "..."
```

Note: Verify exact compatible version against current Tauri v2 docs during implementation.

**Step 2: Add a small OS-gated helper in `main.rs`**

Implement a helper invoked from `.setup(...)` after acquiring `main` window.

```rust
fn apply_platform_window_effects(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        let _ = apply_vibrancy(window, NSVisualEffectMaterial::Sidebar, None, None);
    }
}
```

Also apply a titlebar-appropriate material if separate calls/windows are needed by the crate API; otherwise use a single subtle material and rely on CSS segmentation.

**Step 3: Wire helper in `.setup(...)`**

Call the helper where `main_window` is already retrieved:

```rust
if let Some(main_window) = app.get_webview_window("main") {
    apply_platform_window_effects(&main_window);
    // existing close handler registration...
}
```

**Step 4: Update `tauri.conf.json` for transparent window background (macOS path)**

Add/verify window transparency flags in the main window config.

Example (verify exact schema key for Tauri v2):

```json
{
  "transparent": true
}
```

Do not remove existing `decorations` / `titleBarStyle` settings.

**Step 5: Run Rust/config validation**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS on current development platform. If crate API signatures differ, update imports/helper signature before proceeding.

**Step 6: Commit CHI-69 backend/config foundation**

```bash
git add src-tauri/Cargo.toml src-tauri/src/main.rs src-tauri/tauri.conf.json
git commit -m "feat: add macOS window vibrancy runtime hook"
```

---

### Task 6: CHI-69 Chrome Styling (TitleBar + Sidebar) with Platform-Safe Fallback

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/components/layout/TitleBar.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/styles/tokens.css`

**Step 1: Add chrome-specific tokens (avoid changing all surfaces)**

In `tokens.css`, add dedicated vars for translucent chrome instead of globally changing `--color-bg-secondary`:

```css
:root {
  --color-chrome-bg: rgba(22, 27, 34, 0.82);
  --color-chrome-bg-strong: rgba(28, 33, 40, 0.88);
  --color-chrome-border: rgba(48, 54, 61, 0.7);
}
```

Add macOS-specific overrides if using a platform class:

```css
.cw-platform-macos {
  --color-chrome-bg: rgba(22, 27, 34, 0.72);
}
```

**Step 2: Mark app root with platform class (single source of truth)**

In `MainLayout.tsx`, detect platform on mount and add/remove a root class on the top container (or `document.documentElement`).

```ts
onMount(async () => {
  const p = await platform();
  document.documentElement.classList.toggle('cw-platform-macos', p === 'macos');
});
```

(If `platform()` is already queried in `TitleBar`, avoid duplicate calls by centralizing the result.)

**Step 3: Apply translucent styling to `TitleBar` only**

Use `--color-chrome-bg*`, `backdrop-filter`, and fallback-safe borders in `TitleBar.tsx`.

```tsx
style={{
  background: 'linear-gradient(180deg, var(--color-chrome-bg-strong), var(--color-chrome-bg))',
  'backdrop-filter': 'blur(var(--glass-blur)) saturate(1.1)',
  'border-bottom': '1px solid var(--color-chrome-border)',
}}
```

**Step 4: Apply translucent styling to Sidebar shell only**

Update sidebar container wrapper (`MainLayout` sidebar shell and/or `Sidebar.tsx` root) so the sidebar panel visually matches titlebar vibrancy without making nested cards unreadable.

**Step 5: Typecheck/lint/build**

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

**Step 6: Manual macOS visual QA**

Run:

```bash
npm run tauri dev
```

Manual checks:
- titlebar and sidebar show subtle frosted/translucent effect on macOS
- text contrast remains readable against varied wallpapers
- non-chrome surfaces (conversation bubbles, cards, modals) remain visually stable
- no visible rendering artifacts around window edges / titlebar buttons

**Step 7: Commit CHI-69 frontend chrome styling**

```bash
git add src/components/layout/MainLayout.tsx src/components/layout/TitleBar.tsx src/components/layout/Sidebar.tsx src/styles/tokens.css
git commit -m "feat: add translucent chrome styling for vibrancy-capable platforms"
```

---

### Task 7: CHI-92 Diff Parsing + InlineDiff Component (Conversation Tool Results)

**Files:**
- Create: `src/components/conversation/InlineDiff.tsx`
- Create: `src/lib/inlineDiff.ts`
- Modify: `src/components/conversation/ToolResultBlock.tsx`
- Modify: `src/lib/types.ts` (optional helper types)

**Step 1: Add a pure parser helper for diff detection (heuristic, no UI yet)**

Create `src/lib/inlineDiff.ts` with:
- `extractInlineDiffPreview(resultContent: string, toolName?: string, toolInput?: string): InlineDiffPreview | null`
- unified diff detection (`diff --git`, `@@`, `+++`, `---`, or repeated `+`/`-` hunks)
- file path extraction from tool input JSON fallback (`file_path`, `path`, etc.)
- added/removed line counts

```ts
export interface InlineDiffPreview {
  filePath: string;
  diffText: string;
  addedLines: number;
  removedLines: number;
}

export function extractInlineDiffPreview(
  resultContent: string,
  toolName?: string,
  toolInput?: string,
): InlineDiffPreview | null {
  if (!/@@|^diff --git/m.test(resultContent)) return null;
  // parse path + counts...
  return { filePath, diffText, addedLines, removedLines };
}
```

**Step 2: Add temporary manual parser fixtures inside the helper file (DEV-only comments/examples)**

Since no frontend test runner exists yet, add documented fixtures and validate manually in browser/devtools while implementing. Keep helper pure to enable future unit tests.

**Step 3: Implement `InlineDiff.tsx` collapsed/expandable UI**

Requirements:
- collapsed by default
- file name header + `+N/-M`
- expand/collapse chevron
- diff syntax highlighting with `highlight.js` (`language = 'diff'`)
- SPEC-002 diff tokens for line backgrounds/colors

```tsx
<pre class="font-mono text-xs overflow-auto">
  <code innerHTML={highlightedHtml()} />
</pre>
```

Apply line-level styling by splitting lines and wrapping spans/divs, or by post-processing highlighted HTML (prefer simpler line-based rendering first).

**Step 4: Wire `ToolResultBlock` to render `InlineDiff` when diff detected**

Enhance `ToolResultBlock` parsing pipeline:
- parse tool result JSON (`tool_use_id`, `content`, `is_error`)
- locate matching `tool_use` message by `tool_use_id` (scan conversation messages, preferably via a helper)
- parse `tool_use` JSON to get `tool_name` and `tool_input`
- call `extractInlineDiffPreview(...)`
- render `InlineDiff` in expanded content area above/beside raw output fallback

Minimal pairing helper sketch (inside `ToolResultBlock` or extracted):

```ts
function findRelatedToolUse(toolUseId: string): ToolUseData | null {
  for (let i = conversationState.messages.length - 1; i >= 0; i--) {
    const msg = conversationState.messages[i];
    if (msg.role !== 'tool_use') continue;
    const parsed = parseToolUseContent(msg.content);
    if (parsed.tool_use_id === toolUseId) return parsed;
  }
  return null;
}
```

**Step 5: Keep raw output fallback visible**

If `InlineDiff` parse fails:
- preserve current `<pre><code>` rendering exactly.

If parse succeeds:
- still provide access to raw tool result text (collapsed section or below preview) to avoid losing information.

**Step 6: Typecheck/lint**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

**Step 7: Manual QA (conversation inline diff)**

Run:

```bash
npm run tauri dev
```

Manual checks:
- non-diff tool results render unchanged
- diff-like tool results show `InlineDiff`
- added/removed colors use SPEC-002 tokens
- expand/collapse works
- long diff scrolls without breaking message layout

**Step 8: Commit CHI-92 inline diff preview core**

```bash
git add src/components/conversation/InlineDiff.tsx src/lib/inlineDiff.ts src/components/conversation/ToolResultBlock.tsx src/lib/types.ts
git commit -m "feat: render inline diff previews in tool results"
```

---

### Task 8: CHI-92 “Open in Diff View” Bridge (Minimal Diff Tab Store)

**Files:**
- Create: `src/stores/diffReviewStore.ts`
- Create: `src/components/diff/DiffPreviewPane.tsx`
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/components/conversation/InlineDiff.tsx`
- Modify: `src/stores/uiStore.ts` (only if additional helper is useful)

**Step 1: Add a minimal diff review store**

Store state:
- `activeInlineDiff: InlineDiffPreview | null`
- `setActiveInlineDiff(preview)`
- `clearActiveInlineDiff()`

```ts
interface DiffReviewState {
  activeInlineDiff: InlineDiffPreview | null;
}
```

**Step 2: Add `DiffPreviewPane` component for the Diff tab placeholder replacement**

Render:
- empty state if no inline diff selected
- selected diff header (file path, counts)
- diff content with same styling/highlighting as `InlineDiff`

This keeps `MainLayout` clean and creates a reusable seam for future full diff review work.

**Step 3: Replace current Diff placeholder in `MainLayout.tsx`**

Swap placeholder block with `<DiffPreviewPane />` under `uiState.activeView === 'diff'`.

**Step 4: Add “Open in Diff view” button in `InlineDiff.tsx`**

On click:
- call `setActiveInlineDiff(preview)`
- call `setActiveView('diff')`

```ts
onClick={() => {
  setActiveInlineDiff(props.preview);
  setActiveView('diff');
}}
```

**Step 5: Typecheck/lint/build**

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: PASS.

**Step 6: Manual QA (Diff tab handoff)**

Run:

```bash
npm run tauri dev
```

Manual checks:
- clicking “Open in Diff view” switches to Diff tab
- selected diff renders in Diff tab
- returning to conversation preserves message content
- opening another inline diff replaces current diff preview cleanly

**Step 7: Commit CHI-92 Diff tab integration**

```bash
git add src/stores/diffReviewStore.ts src/components/diff/DiffPreviewPane.tsx src/components/layout/MainLayout.tsx src/components/conversation/InlineDiff.tsx src/stores/uiStore.ts
git commit -m "feat: open inline diff previews in diff tab"
```

---

### Task 9: Final Verification, Handoff Sync, and Optional Linear Notes

**Files:**
- Modify: `.claude/handover.json`
- Modify: `CLAUDE.md`
- Optional (if spec drift occurs): `docs/specs/SPEC-003-ux-design.md`

**Step 1: Run full verification batch**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo check --manifest-path src-tauri/Cargo.toml
npm run typecheck
npm run lint
npm run build
```

Expected: PASS (document any platform-specific CHI-69 caveats separately).

**Step 2: Update local handoff state**

Update `.claude/handover.json` and `CLAUDE.md`:
- mark `CHI-86`, `CHI-69`, `CHI-92` done/in_progress accurately
- note `CHI-92` issue text dependency on `CHI-89` is stale but resolved
- add commit hashes and test results summary

**Step 3: Spec drift check (only if behavior differs from spec text)**

If implementation scope differs (e.g., `CHI-92` minimal diff-tab preview rather than full diff review), add a short note in the relevant spec/task doc or handoff notes instead of silently diverging.

**Step 4: Commit handoff/docs sync**

```bash
git add .claude/handover.json CLAUDE.md docs/specs/SPEC-003-ux-design.md
git commit -m "docs: sync handoff for chi-86 chi-69 chi-92"
```

If no spec file changed, omit it from `git add`.

**Step 5: Push branch**

```bash
git push -u origin codex/chi-86-69-92-session-actions-vibrancy-inline-diff
```

Expected: remote branch available for review/handoff.

---

## Execution Notes for `@executing-plans`

- Keep commits scoped by issue (`CHI-86`, `CHI-69`, `CHI-92`) plus one final docs/handoff commit.
- Re-run `cargo check` after any `src-tauri/Cargo.toml` or `main.rs` edits (CHI-69 can fail fast on API mismatch).
- For CHI-92 parsing heuristics, save 2-3 real tool-result samples during execution and verify against them before polishing UI.
- Do not widen CHI-92 into full diff-review architecture; the goal is inline preview + minimal Diff tab bridge only.

