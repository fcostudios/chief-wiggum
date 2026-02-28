# Actions Polish (CHI-144 + CHI-145) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Actions Polish follow-up for Epic CHI-138 by adding global action launch/control affordances (CHI-144) and inline custom action authoring/management (CHI-145) on top of the shipped Project Actions MVP.

**Architecture:** Treat CHI-144 and CHI-145 as independent tracks after a shared baseline. CHI-144 is frontend-heavy and builds on the existing `actionStore` + `ActionsPanel`; CHI-145 requires a small Rust backend extension for `.claude/actions.json` CRUD IPC plus inline editor UX in the sidebar. Keep DB schema unchanged (no v4 migration yet) and reuse `discover_actions` rescans instead of inventing new persistence layers.

**Tech Stack:** Tauri v2 (Rust, Tokio, serde/serde_json), SolidJS stores/components, existing `actionStore`/`uiStore`/`toastStore`, existing CHI-138 actions backend (`src-tauri/src/actions/*`).

---

## Preconditions / Context

- Dependencies already satisfied (done): `CHI-139`, `CHI-140`, `CHI-142`.
- Current Project Actions MVP exists on `main`:
  - Backend discovery + process manager + IPC (`discover_actions`, `start_action`, `stop_action`, `restart_action`, `list_running_actions`)
  - Frontend `ActionsPanel`, `ActionRow`, `ActionOutputPanel`, `/run` slash command, `Ask AI`
- This plan intentionally keeps **CHI-144** and **CHI-145** mostly independent so they can be executed in parallel batches.
- Use an isolated worktree before execution (e.g., via `using-git-worktrees`).

## Scope Decisions (important)

- **CHI-144:** Implement command palette actions, dedicated action-runner palette mode, status bar running-actions indicator/popover, and keyboard shortcuts (`Cmd+Shift+R`, `Cmd+Shift+.`).
- **CHI-145:** Implement custom action CRUD for `.claude/actions.json` plus inline editor UX and "Customize..." (pin discovered action) flow.
- **CHI-145 Phase 2 argument templates:** Include a minimal data model + inline argument prompt plan as the last subtask. If time is constrained, this can be flagged as a second commit within CHI-145, but it remains in-scope for the issue.
- **No DB migration v4 in this plan** (the current MVP runs in-memory for action runtime state). Custom action persistence remains file-based (`.claude/actions.json`).

## Shared Verification Baseline (run once before either track)

### Task 0: Baseline and Branch Health Check

**Files:**
- No code changes (verification only)

**Step 1: Confirm clean worktree baseline**

Run:
```bash
git status --short
```
Expected: clean feature worktree (or only intentional handover checkpoint files).

**Step 2: Install frontend deps (if needed)**

Run:
```bash
npm install
```
Expected: dependencies resolved, no missing package errors.

**Step 3: Run Rust baseline tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```
Expected: pass (current baseline is ~218 tests, count may increase as tasks land).

**Step 4: Run frontend baseline checks**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

**Step 5: Commit**

No commit for this verification-only task.

---

# Track A — CHI-144 StatusBar & Command Palette Integration (independent)

## CHI-144 Design Notes (implementation guardrails)

- Reuse `actionStore` as the source of truth for discovered actions + statuses + outputs.
- Add lightweight derived helpers/selectors in `actionStore` instead of duplicating status math in multiple components.
- Extend command palette to support an **actions-only mode** instead of creating a separate component.
- Keep "recent" actions in frontend memory (derived from lifecycle events in this process session); no DB/history persistence in CHI-144.
- Add stop-all shortcut in frontend by iterating running action IDs (no backend `stop_all_actions` IPC required unless execution proves necessary).

### Task 1: Add ActionStore Derived State for CHI-144 (running count, recent actions, stop-all)

**Files:**
- Modify: `src/stores/actionStore.ts`
- Modify: `src/lib/types.ts`
- Test: `src/stores/actionStore.ts` (if extracting pure helpers in-file)

**Step 1: Write failing Rust-free frontend type/compile expectation (scaffold usage sites first)**

Add temporary usage references (or TODO imports) in `StatusBar.tsx` / `CommandPalette.tsx` for planned helpers such as:
- `getRunningActions()`
- `getRecentActionEvents()`
- `stopAllRunningActions()`

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL with missing exports from `actionStore.ts`.

**Step 2: Implement minimal `actionStore` helper exports**

Add to `src/stores/actionStore.ts`:
- derived helpers: `getRunningActionIds()`, `getRunningActions()`, `getActionById()`
- `stopAllRunningActions()` (frontend loop over running IDs calling `stopAction`)
- recent lifecycle event buffer (e.g., last 10 completed/failed actions) updated from `action:completed` / `action:failed`

Example shape:
```ts
interface ActionRecentEvent {
  action_id: string;
  name: string;
  status: 'completed' | 'failed';
  exit_code: number | null;
  timestamp: number;
}
```

**Step 3: Extend frontend action event payload typing minimally**

Add/adjust TS types in `src/lib/types.ts` for recent event records if needed.
Keep YAGNI: only fields required by CHI-144 UI.

**Step 4: Run typecheck + targeted lint**

Run:
```bash
npx tsc --noEmit && npx eslint src/stores/actionStore.ts src/lib/types.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/stores/actionStore.ts src/lib/types.ts
git commit -m "feat(actions): add derived runtime helpers for palette and statusbar (CHI-144)"
```

### Task 2: Add Action Lifecycle Toast Notifications (Started/Completed/Failed)

**Files:**
- Modify: `src/stores/actionStore.ts`
- Modify: `src/stores/toastStore.ts` (only if action-button API needs extension)
- Modify: `src/components/layout/DetailsPanel.tsx` (only if adding "View Output" navigation callback helper)

**Step 1: Write failing compile references for lifecycle toasts**

Wire placeholder calls in `actionStore` listeners (`action:output`, `action:completed`, `action:failed`) to `addToast(...)` with typed payload assumptions.

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL if new helper/types are missing.

**Step 2: Implement started/completed/failed toasts in actionStore listeners**

In `setupActionListeners()`:
- Started toast (first transition into `running` for an action)
- Completed toast with duration/exit_code when available
- Failed toast with persistent/error style and optional `View Output` action

Keep duplicate suppression simple (store last notified status per action in-memory).

**Step 3: Hook `View Output` toast action to select action + reveal DetailsPanel**

If needed, import small UI helpers (or keep just `selectAction(actionId)` for MVP).
Avoid circular imports; prefer one-direction store imports.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/stores/actionStore.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/stores/actionStore.ts src/lib/types.ts src/stores/toastStore.ts src/components/layout/DetailsPanel.tsx
git commit -m "feat(actions): add lifecycle toasts for action start complete fail (CHI-144)"
```

### Task 3: Add Command Palette Actions Mode to UI State and Rendering

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/components/common/CommandPalette.tsx`

**Step 1: Add failing usage of an actions-only palette mode**

In `MainLayout.tsx`, add a placeholder `Show` branch for an action-runner palette visibility flag or mode.

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL because `uiStore` does not expose action-runner palette state/helpers.

**Step 2: Extend uiStore with palette mode / dedicated opener**

Add a minimal API (choose one and stay consistent):
- Option A (recommended): `commandPaletteMode: 'all' | 'sessions' | 'actions'` + `openCommandPalette(mode?)`
- Option B: separate `actionRunnerPaletteVisible`

Prefer **Option A** to avoid duplicated overlay state.

Example (Option A):
```ts
export type CommandPaletteMode = 'all' | 'sessions' | 'actions';
openCommandPalette(mode: CommandPaletteMode = 'all')
```

**Step 3: Update `MainLayout.tsx` to pass mode to `CommandPalette`**

Replace hardcoded `<CommandPalette />` with `<CommandPalette mode={...} />` based on `uiState.commandPaletteMode`.
Preserve existing session switcher behavior.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/stores/uiStore.ts src/components/layout/MainLayout.tsx src/components/common/CommandPalette.tsx
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/components/layout/MainLayout.tsx src/components/common/CommandPalette.tsx
git commit -m "feat(ui): add actions mode for command palette (CHI-144)"
```

### Task 4: Add CHI-144 Keyboard Shortcuts (`Cmd+Shift+R`, `Cmd+Shift+.`)

**Files:**
- Modify: `src/lib/keybindings.ts`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/stores/actionStore.ts`

**Step 1: Write failing compile references for new shortcut handlers**

Add calls in `keybindings.ts` to planned helpers:
- `openCommandPalette('actions')` (or `openActionRunnerPalette()`)
- `stopAllRunningActions()`

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL if helpers are not yet exported/typed.

**Step 2: Implement shortcut handling**

In `src/lib/keybindings.ts` add:
- `Cmd+Shift+R` => action-runner palette
- `Cmd+Shift+.` => stop all running actions

Respect existing guards (don’t conflict with active typing in inputs only if current file already handles that globally; follow current style).

**Step 3: Add tiny dev logging / no-op guard behavior**

If no actions are running on `Cmd+Shift+.`, optionally no-op or show low-noise toast. Keep behavior explicit.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/lib/keybindings.ts src/stores/actionStore.ts src/stores/uiStore.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/keybindings.ts src/stores/actionStore.ts src/stores/uiStore.ts
git commit -m "feat(actions): add action runner and stop-all keyboard shortcuts (CHI-144)"
```

### Task 5: Integrate Dynamic Action Commands into Command Palette

**Files:**
- Modify: `src/components/common/CommandPalette.tsx`
- Modify: `src/stores/actionStore.ts`
- Modify: `src/lib/types.ts` (only if new view-model types are added)

**Step 1: Extract a pure action-command builder helper and write a failing testable path (in-file helper is fine)**

Add a helper skeleton in `CommandPalette.tsx` (or `src/lib/actionPalette.ts`) to transform `actionState.actions` + running statuses into palette commands:
- `Run: <name>`
- `Stop: <name>` / `Restart: <name>` when running

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL until helper types and integration are complete.

**Step 2: Add dynamic "Actions" category commands**

In `CommandPalette.tsx`:
- import `actionState`, `startAction`, `stopAction`, `restartAction`
- build action commands when an active project exists
- include source/command in searchable text (e.g., hidden `searchText` field or label/meta matching)

Keep command list DRY by composing `staticCommands + sessionCommands + actionCommands`.

**Step 3: Add actions-only mode filtering**

When `mode === 'actions'`, palette should show only the action commands category.
Preserve `sessions` mode behavior.

**Step 4: Add lightweight fuzzy matching on action command strings**

Extend filter logic to search label + category + action command/meta string.
Avoid overhauling the whole palette matcher.

**Step 5: Run checks and commit**

Run:
```bash
npx tsc --noEmit && npx eslint src/components/common/CommandPalette.tsx
```
Expected: PASS.

Commit:
```bash
git add src/components/common/CommandPalette.tsx src/stores/actionStore.ts src/lib/types.ts
git commit -m "feat(actions): integrate actions into command palette and action-runner mode (CHI-144)"
```

### Task 6: Add StatusBar Running-Actions Indicator + Quick Popover Controls

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/stores/actionStore.ts`
- Optionally Create: `src/components/actions/ActionStatusPopover.tsx`

**Step 1: Add failing compile references for running/recent action data in StatusBar**

Wire placeholder calls to `getRunningActions()` / `getRecentActionEvents()` in `StatusBar.tsx`.

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL if helpers are missing or return shape mismatches.

**Step 2: Implement running action badge in StatusBar left section**

Add `▶ N running` badge (or icon + count) when actions are running.
Keep existing session background count badge intact (can coexist).

**Step 3: Implement popover with quick controls**

Clicking the badge opens a small popover showing:
- running actions with stop/restart inline controls
- recent completed/failed actions (last 3)
Use lightweight local component state in `StatusBar.tsx` unless complexity justifies `ActionStatusPopover.tsx`.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/components/layout/StatusBar.tsx src/stores/actionStore.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/stores/actionStore.ts src/components/actions/ActionStatusPopover.tsx
git commit -m "feat(actions): add statusbar running-actions indicator and quick controls (CHI-144)"
```

### Task 7: CHI-144 Verification and Polish Pass

**Files:**
- Modify as needed based on QA feedback in:
  - `src/components/common/CommandPalette.tsx`
  - `src/components/layout/StatusBar.tsx`
  - `src/lib/keybindings.ts`
  - `src/stores/actionStore.ts`

**Step 1: Run frontend automated checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/ && npx vite build
```
Expected: PASS (chunk-size warning from Vite is acceptable).

**Step 2: Manual app QA (CHI-144 checklist)**

Run:
```bash
npm run tauri dev
```
Manual checks:
- `Cmd+Shift+R` opens actions-only command palette
- action commands appear and can run/stop/restart
- `Cmd+Shift+.` stops all running actions
- StatusBar shows running action count + popover controls
- toast notifications show started/completed/failed lifecycle events

**Step 3: Fix issues found in QA**

Patch minimal UI/store issues only (no scope expansion).

**Step 4: Re-run checks**

Run:
```bash
npm run typecheck && npm run lint && npm run build
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/common/CommandPalette.tsx src/components/layout/StatusBar.tsx src/lib/keybindings.ts src/stores/actionStore.ts src/components/actions/
git commit -m "feat(actions): polish global action launch and status UX (CHI-144)"
```

---

# Track B — CHI-145 Custom Action Configuration (independent)

## CHI-145 Design Notes (implementation guardrails)

- Implement **file-based CRUD** for `.claude/actions.json` via new IPC commands in `commands/actions.rs`.
- Reuse the existing CHI-139 scanner file format (extend it safely) instead of introducing DB tables.
- Keep editor inline in `ActionsPanel` (no modal, no settings page).
- Use `discover_actions(projectPath)` after save/delete to refresh UI (do not depend on an action watcher if it isn’t implemented yet).
- Implement argument templates as optional metadata persisted in JSON and a minimal inline prompt before run (Phase 2 portion inside CHI-145).

### Task 8: Add Rust Custom Action File CRUD Helpers with Unit Tests (TDD)

**Files:**
- Modify: `src-tauri/src/actions/scanner.rs`
- Modify: `src-tauri/src/actions/mod.rs`
- Test: `src-tauri/src/actions/scanner.rs` (new `#[cfg(test)]` cases)

**Step 1: Write failing Rust tests for read/write/delete custom actions**

Add tests in `src-tauri/src/actions/scanner.rs` for helper functions such as:
- `read_custom_actions_file_missing_returns_empty`
- `save_custom_action_creates_file`
- `save_custom_action_updates_existing_by_name`
- `delete_custom_action_removes_entry`

Example test skeleton:
```rust
#[test]
fn save_custom_action_creates_file() {
    let dir = temp_project(&[]);
    save_custom_action_file(dir.path(), test_custom_action()).expect("save");
    let actions = read_custom_actions_file(dir.path()).expect("read");
    assert_eq!(actions.len(), 1);
    assert_eq!(actions[0].name, "seed-db");
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner::tests::save_custom_action_creates_file
```
Expected: FAIL (missing helper functions / types).

**Step 3: Implement minimal custom-action file helpers**

In `src-tauri/src/actions/scanner.rs` add helpers (or a small submodule in the same file):
- `read_custom_actions_file(project_path: &Path) -> AppResult<Vec<CustomActionConfig>>`
- `save_custom_action_file(project_path: &Path, action: CustomActionConfig) -> AppResult<()>`
- `delete_custom_action_file(project_path: &Path, action_name: &str) -> AppResult<()>`

Requirements:
- create `.claude/` directory + `actions.json` when missing
- formatted JSON output (`serde_json::to_string_pretty`)
- merge by action name (update existing)
- preserve unknown future fields only if practical; otherwise document overwrite semantics in comments

**Step 4: Run targeted scanner tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner
```
Expected: PASS (existing CHI-139 scanner tests + new CRUD tests).

**Step 5: Commit**

```bash
git add src-tauri/src/actions/scanner.rs src-tauri/src/actions/mod.rs
git commit -m "feat(actions): add .claude/actions.json CRUD helpers with tests (CHI-145)"
```

### Task 9: Add CHI-145 IPC Commands for Custom Actions (read/save/delete)

**Files:**
- Modify: `src-tauri/src/commands/actions.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/commands/actions.rs` (unit tests if feasible) or integration via scanner tests + compile checks

**Step 1: Write failing compile integration (register missing commands)**

Temporarily register new command names in `main.rs` invoke handler before implementing them:
- `read_custom_actions`
- `save_custom_action`
- `delete_custom_action`

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml -p chief-wiggum
```
Expected: FAIL (missing symbols).

**Step 2: Implement thin IPC commands in `commands/actions.rs`**

Add commands:
```rust
#[tauri::command(rename_all = "snake_case")]
pub async fn read_custom_actions(project_path: String) -> Result<Vec<ActionDefinition>, AppError>
#[tauri::command(rename_all = "snake_case")]
pub async fn save_custom_action(project_path: String, action: ActionDefinition) -> Result<(), AppError>
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_custom_action(project_path: String, action_name: String) -> Result<(), AppError>
```

Implementation notes:
- validate `project_path` exists
- only allow saving `source == ClaudeActions` (or coerce to custom)
- call scanner CRUD helpers, then return/refresh appropriately

**Step 3: Register commands in `main.rs`**

Add to `invoke_handler` list and keep ordering grouped with other actions commands.

**Step 4: Run Rust checks**

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml -p chief-wiggum && cargo clippy --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- -D warnings
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src-tauri/src/commands/actions.rs src-tauri/src/main.rs
git commit -m "feat(actions): add IPC commands for custom action CRUD (CHI-145)"
```

### Task 10: Add Frontend Types + Store Methods for Custom Action CRUD

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/actionStore.ts`

**Step 1: Write failing TypeScript references for custom-action methods**

In `ActionsPanel.tsx`, add placeholder calls to planned store methods:
- `saveCustomAction(...)`
- `deleteCustomAction(...)`
- `customizeAction(...)` (optional helper wrapper)

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL (missing exports/types).

**Step 2: Extend TS action types for custom editor payloads**

Add minimal types in `src/lib/types.ts`:
- `CustomActionDraft` (editor payload)
- optional `before_commands`, `after_commands`, `env_vars`, `args` metadata fields (Phase 2 support)

Keep `ActionDefinition` backward compatible by using optional fields.

**Step 3: Implement store methods in `actionStore.ts`**

Add methods:
- `saveCustomAction(projectPath, draft)`
- `deleteCustomAction(projectPath, actionName)`
- `customizeDiscoveredAction(projectPath, action)` (clone to custom source and save)
- `runActionWithArgs(action, resolvedArgs)` (prep for Phase 2 prompt)

After save/delete, call `discoverActions(projectPath)` to refresh the sidebar.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/stores/actionStore.ts src/lib/types.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/stores/actionStore.ts src/lib/types.ts
git commit -m "feat(actions): add frontend custom-action CRUD store methods (CHI-145)"
```

### Task 11: Build Inline `ActionEditor` Component (Basic Fields, No Advanced Yet)

**Files:**
- Create: `src/components/actions/ActionEditor.tsx`
- Modify: `src/components/actions/ActionsPanel.tsx`
- Test: none (frontend component; verify via typecheck/lint/manual)

**Step 1: Create failing import integration**

Import `ActionEditor` in `ActionsPanel.tsx` and render a placeholder branch (`<ActionEditor ... />`) behind a local flag.

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL (component missing).

**Step 2: Implement minimal inline editor UI**

Create `ActionEditor.tsx` with inline form fields:
- name
- command
- working_dir
- category
- description
- Cancel / Save buttons

Use controlled local signals and emit callbacks:
- `onSave(draft)`
- `onCancel()`

**Step 3: Integrate “+ Add Action” in `ActionsPanel.tsx`**

Add a visible `+ Add Action` row/button and render editor inline above the grouped lists.
On save, call `actionStore.saveCustomAction(...)`.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/components/actions/ActionEditor.tsx src/components/actions/ActionsPanel.tsx
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/actions/ActionEditor.tsx src/components/actions/ActionsPanel.tsx
git commit -m "feat(actions): add inline custom action editor (CHI-145)"
```

### Task 12: Add Edit / Customize / Delete Flows in Actions List (Inline, No Modal)

**Files:**
- Modify: `src/components/actions/ActionRow.tsx`
- Modify: `src/components/actions/ActionsPanel.tsx`
- Modify: `src/stores/actionStore.ts`

**Step 1: Add failing callback props to `ActionRow`**

Extend `ActionRowProps` with callback placeholders:
- `onEdit(action)`
- `onCustomize(action)`
- `onDelete(action)`

Run:
```bash
npx tsc --noEmit
```
Expected: FAIL until callers/props are wired.

**Step 2: Implement lightweight row action affordances**

Add UI controls (inline buttons or compact menu) in `ActionRow` for:
- custom action: Edit / Remove
- discovered action: Customize...

Keep YAGNI: no full context menu if inline controls can satisfy CHI-145 acceptance.

**Step 3: Implement inline delete confirmation in `ActionsPanel`**

Add row-level confirmation state in `ActionsPanel`:
- “Remove <name>? [Yes] [No]” inline (not modal)
Call `deleteCustomAction(...)` on confirm.

**Step 4: Run checks**

Run:
```bash
npx tsc --noEmit && npx eslint src/components/actions/ActionRow.tsx src/components/actions/ActionsPanel.tsx src/stores/actionStore.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/actions/ActionRow.tsx src/components/actions/ActionsPanel.tsx src/stores/actionStore.ts
git commit -m "feat(actions): add customize edit remove flows for custom actions (CHI-145)"
```

### Task 13: Add Advanced Custom Action Fields (before/after/env) and Persistence Wiring

**Files:**
- Modify: `src/components/actions/ActionEditor.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/stores/actionStore.ts`
- Modify: `src-tauri/src/actions/scanner.rs`
- Modify: `src-tauri/src/commands/actions.rs`

**Step 1: Write failing Rust tests for advanced field round-trip**

Add scanner tests ensuring `.claude/actions.json` advanced fields persist and reload:
- `before_commands`
- `after_commands`
- `env_vars`

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner::tests::claude_actions_json
```
Expected: FAIL until parser/file models include advanced fields.

**Step 2: Extend Rust custom-action file schema and mapping**

Update `CustomAction` serde struct and scanner mapping to parse optional advanced fields.
Preserve backward compatibility with existing simple JSON entries.

**Step 3: Add Advanced section to `ActionEditor`**

Inline collapsible “Advanced” section with textareas/inputs for:
- before command(s)
- after command(s)
- env vars (simple `KEY=VALUE` multiline parser in frontend)

Keep validation simple and explicit; parse errors should show inline warnings, not crash save.

**Step 4: Run combined checks**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner && npx tsc --noEmit && npx eslint src/components/actions/ActionEditor.tsx src/stores/actionStore.ts src/lib/types.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src-tauri/src/actions/scanner.rs src-tauri/src/commands/actions.rs src/components/actions/ActionEditor.tsx src/stores/actionStore.ts src/lib/types.ts
git commit -m "feat(actions): support advanced custom action fields in inline editor (CHI-145)"
```

### Task 14: CHI-145 Phase 2 — Argument Templates + Inline Run Prompt

**Files:**
- Create: `src/components/actions/ActionArgPrompt.tsx`
- Modify: `src/components/actions/ActionRow.tsx`
- Modify: `src/components/actions/ActionsPanel.tsx`
- Modify: `src/stores/actionStore.ts`
- Modify: `src/lib/types.ts`
- Modify: `src-tauri/src/actions/scanner.rs` (parse optional `args` metadata)

**Step 1: Write failing parser round-trip tests for `args` metadata in `.claude/actions.json`**

Add Rust tests in `actions/scanner.rs` for parsing custom action `args` arrays.

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner
```
Expected: FAIL until `args` schema is modeled.

**Step 2: Extend types and scanner parser for argument templates**

Add optional `args` metadata to Rust/TS types (enum + string only for CHI-145).
Do not implement every type variant from the issue if unused.

**Step 3: Implement `ActionArgPrompt` inline component**

Render inline prompt (not modal) before run when action has args metadata:
- enum -> `<select>`
- string -> text input
- Save/Run and Cancel actions

**Step 4: Integrate prompt into `ActionRow` / `ActionsPanel` run flow**

On Play for custom action with args:
- open inline prompt
- substitute `{{arg_name}}` placeholders in command
- call `startAction` with resolved command (via store helper)

**Step 5: Run checks and commit**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner && npx tsc --noEmit && npx eslint src/components/actions/ActionArgPrompt.tsx src/components/actions/ActionRow.tsx src/components/actions/ActionsPanel.tsx src/stores/actionStore.ts src/lib/types.ts && npx vite build
```
Expected: PASS.

Commit:
```bash
git add src/components/actions/ActionArgPrompt.tsx src/components/actions/ActionRow.tsx src/components/actions/ActionsPanel.tsx src/stores/actionStore.ts src/lib/types.ts src-tauri/src/actions/scanner.rs
git commit -m "feat(actions): add argument templates and inline action run prompt (CHI-145)"
```

### Task 15: CHI-145 Manual QA and Bugfix Pass

**Files:**
- Modify only files touched in CHI-145 as needed

**Step 1: Manual app QA for custom actions**

Run:
```bash
npm run tauri dev
```
Manual checks:
- `+ Add Action` opens inline editor
- save creates `.claude/actions.json`
- edit custom action updates file
- remove custom action uses inline confirmation
- Customize discovered action creates custom override
- advanced fields persist across reload
- argument prompt appears for templated actions and runs resolved command

**Step 2: Rust regression check after QA fixes**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- actions::scanner
```
Expected: PASS.

**Step 3: Frontend checks after QA fixes**

Run:
```bash
npm run typecheck && npm run lint && npm run build
```
Expected: PASS.

**Step 4: Patch any QA defects**

Fix only acceptance-blocking issues; defer extra polish to follow-up issues.

**Step 5: Commit**

```bash
git add src/components/actions src/stores/actionStore.ts src/lib/types.ts src-tauri/src/actions/scanner.rs src-tauri/src/commands/actions.rs
git commit -m "feat(actions): complete inline custom action configuration UX (CHI-145)"
```

---

# Final Convergence (Both Tracks)

### Task 16: Full Verification, Docs/Spec/Handover/Linear Sync, Merge Readiness

**Files:**
- Modify: `.claude/handover.json`
- Modify: `CLAUDE.md`
- Modify: `docs/specs/SPEC-004-architecture.md`
- Optionally Modify: `docs/specs/SPEC-003-ux-design.md` (if CHI-144/145 UI flows are documented there)
- Optionally Modify: `docs/plans/2026-02-23-chi144-chi145-actions-polish.md` (execution notes only if needed)

**Step 1: Run full automated verification**

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml -p chief-wiggum
cargo test --manifest-path src-tauri/Cargo.toml -p chief-wiggum
cargo clippy --manifest-path src-tauri/Cargo.toml -p chief-wiggum -- -D warnings
npm run format:check
npm run typecheck
npm run lint
npm run build
```
Expected: PASS (Vite chunk-size warning acceptable).

**Step 2: Sync handover (Schema v2 nested epic + summary fields)**

Update `.claude/handover.json`:
- `project_actions_epic.CHI-138.tasks.CHI-144` -> `done`
- `project_actions_epic.CHI-138.tasks.CHI-145` -> `done`
- `project_actions_epic.CHI-138.status` -> evaluate (`done` if all CHI-139..145 complete)
- `recommended_next` advance beyond CHI-144/145
- `notes`, `critical_path`, `environment.notes` update test count and Project Actions epic completion
- `session_work_log` add execution summary

**Step 3: Sync human/spec docs**

Update `CLAUDE.md` and `SPEC-004-architecture.md`:
- mark CHI-144/145 done in Project Actions epic section
- document new IPC commands (CHI-145 custom action CRUD)
- document command palette actions mode / status bar action UX at architecture level
- update validation snapshot counts

**Step 4: Linear issue updates (CHI-144, CHI-145, CHI-138)**

Using Linear MCP:
- `CHI-144` -> Done + completion comment (scope + verification + commit hashes)
- `CHI-145` -> Done + completion comment (note MVP vs Phase 2 if any scope was deferred)
- `CHI-138` epic -> Done (if all 7 tasks complete) or progress comment (if any scope intentionally deferred)

**Step 5: Commit finish-flow docs/handover sync**

```bash
git add .claude/handover.json CLAUDE.md docs/specs/SPEC-004-architecture.md docs/specs/SPEC-003-ux-design.md
git commit -m "docs: sync handover and specs for chi-144 chi-145"
```

---

## Execution Order Recommendations

### Option A (Parallel Tracks, fastest)
- Execute Track A (`CHI-144`) and Track B (`CHI-145`) in parallel batches after Task 0.
- Merge conflicts likely in:
  - `src/stores/actionStore.ts`
  - `src/lib/types.ts`
  - `src/components/actions/ActionRow.tsx`
  - `src/components/actions/ActionsPanel.tsx`
- Resolve by rebasing Track B onto Track A before final convergence.

### Option B (Sequential, lower coordination cost)
1. Task 0
2. CHI-145 (Tasks 8–15) first (backend + editor foundations)
3. CHI-144 (Tasks 1–7) second (global access + polish)
4. Task 16 final convergence

Recommended if only one implementer is working in a single branch.

## Manual QA Checklist (combined, final)

- Actions can be started from:
  - Sidebar row play button
  - `/run <action>` slash command
  - Command palette actions category
  - Dedicated action-runner palette (`Cmd+Shift+R`)
- Running actions visible in StatusBar badge + popover controls
- `Cmd+Shift+.` stops all running actions
- Custom action add/edit/delete/customize flows work inline (no modal)
- `.claude/actions.json` created/updated correctly and remains valid JSON
- Advanced custom fields persist and reload
- Argument prompt renders inline and substitutes command placeholders
- Action output panel still streams and `Ask AI` still works after CHI-144/145 changes

## Notes for the Implementer

- Keep CHI-145 file writes defensive and idempotent; invalid JSON should surface a user-friendly error toast and not clobber existing file content.
- Avoid adding DB schema changes or background watchers unless required to satisfy acceptance; `discoverActions(projectPath)` refreshes are sufficient for MVP/Polish.
- Preserve current CHI-138 behavior and keyboard shortcuts (`Cmd+K`, `Cmd+Shift+P`, etc.) while adding new shortcuts.
- Follow the handover protocol strictly at checkpoints and finish-flow (nested epic tasks + top-level summary fields).
