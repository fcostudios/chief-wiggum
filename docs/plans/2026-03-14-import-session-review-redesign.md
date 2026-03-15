# Import Session Review Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the import modal into a review-first master-detail flow that makes long session paths distinguishable before import and normalizes scanned sessions with manually picked files.

**Architecture:** Introduce a unified import-review model shared by backend scan results and manually picked files. Add backend metadata extraction for arbitrary JSONL paths, move review/selection/focus state into `importStore`, and split the modal UI into focused review-list and details-pane components while preserving the current batch import engine and results screen.

**Tech Stack:** SolidJS 1.9, Tauri v2 IPC, Rust (`serde`, existing import modules), Vitest, cargo test

---

## File Map

### Backend

- Create: `src-tauri/src/import/review.rs`
  - Shared review-item model and arbitrary JSONL metadata extraction for both scanned and picked files.
- Modify: `src-tauri/src/import/mod.rs`
  - Export the new `review` module.
- Modify: `src-tauri/src/import/discover.rs`
  - Reuse shared metadata extraction and stop owning the only review struct.
- Modify: `src-tauri/src/commands/import.rs`
  - Add command for enriching manually picked file paths and switch discovery command to the unified review payload.
- Modify: `src-tauri/src/main.rs`
  - Register any new import review IPC command.

### Frontend data/state

- Modify: `src/lib/types.ts`
  - Replace narrow `DiscoveredSession` usage with a richer review model.
- Modify: `src/stores/importStore.ts`
  - Move review dataset, focus state, selection state, dedupe, and ordering into the store.
- Create: `src/stores/importStore.test.ts`
  - Unit coverage for merge, dedupe, focus, search, and selection rules.

### Frontend UI

- Modify: `src/components/import/ImportDialog.tsx`
  - Convert to master-detail layout driven by store state instead of local-only signals.
- Create: `src/components/import/ImportReviewList.tsx`
  - Left-pane session list with badges, selection, and search-aware rendering.
- Create: `src/components/import/ImportSessionDetails.tsx`
  - Right-pane details view with full path and metadata hierarchy.
- Create: `src/components/import/ImportDialog.test.tsx`
  - High-level modal behavior and interaction tests.
- Optional Modify: `src/components/import/ImportProgress.tsx`
  - Only if import completion summary needs wording tweaks after the flow change.

---

## Chunk 1: Backend Review Metadata And IPC

### Task 1: Shared review model + arbitrary-path metadata extraction

**Files:**
- Create: `src-tauri/src/import/review.rs`
- Modify: `src-tauri/src/import/mod.rs`
- Modify: `src-tauri/src/import/discover.rs`

- [ ] **Step 1: Create failing Rust tests for arbitrary-path review metadata**

Add tests in `src-tauri/src/import/review.rs` for:

```rust
#[test]
fn inspect_jsonl_file_extracts_model_timestamp_and_preview() {
    // temp file with system/init and first user message lines
}

#[test]
fn inspect_jsonl_file_returns_invalid_state_for_bad_jsonl() {
    // temp file with malformed content
}

#[test]
fn inspect_jsonl_file_reports_last_modified_and_file_stats() {
    // temp file metadata assertions
}
```

- [ ] **Step 2: Run the focused Rust test to verify it fails**

Run:
```bash
cd src-tauri && cargo test import::review
```

Expected: FAIL because `review.rs` and the tested helpers do not exist yet.

- [ ] **Step 3: Create `review.rs` with the shared review item model**

Define a new serializable struct for review-time payloads, for example:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ImportReviewItem {
    pub source: String,
    pub file_path: String,
    pub project_path: String,
    pub cli_session_id: String,
    pub file_size_bytes: u64,
    pub line_count: u64,
    pub model: Option<String>,
    pub first_timestamp: Option<String>,
    pub last_modified_timestamp: Option<String>,
    pub first_user_preview: Option<String>,
    pub already_imported: bool,
    pub is_valid_jsonl: bool,
    pub warning: Option<String>,
}
```

Implement a helper such as:

```rust
pub fn inspect_jsonl_file(path: &Path, source: &str, project_path: String) -> ImportReviewItem
```

The helper should:
- read file stats
- inspect early non-empty lines
- pull `model` and `timestamp`
- capture the first user message preview
- set `is_valid_jsonl` / `warning`
- never panic on malformed files

- [ ] **Step 4: Export the new module**

Modify `src-tauri/src/import/mod.rs`:

```rust
pub mod review;
```

- [ ] **Step 5: Refactor `discover.rs` to reuse shared metadata extraction**

Update `scan_projects_dir()` to return `Vec<ImportReviewItem>` and call the shared helper instead of building `DiscoveredSession` directly.

Keep the existing Claude path decode logic in `discover.rs`.

- [ ] **Step 6: Run focused Rust tests again**

Run:
```bash
cd src-tauri && cargo test import::review import::discover
```

Expected: PASS for the new metadata tests and the existing discovery tests after signature updates.

- [ ] **Step 7: Commit backend review-model foundation**

```bash
git add src-tauri/src/import/review.rs src-tauri/src/import/mod.rs src-tauri/src/import/discover.rs
git commit -m "feat(import): add shared review metadata extraction"
```

### Task 2: Add IPC command for picked-file review enrichment

**Files:**
- Modify: `src-tauri/src/commands/import.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `src-tauri/src/import/review.rs`

- [ ] **Step 1: Add failing command-level test or payload-level test for arbitrary-path inspection**

If command tests already exist nearby, add one there. Otherwise extend `review.rs` tests to cover a vector-of-paths helper used by the command.

Target shape:

```rust
#[test]
fn inspect_selected_files_marks_invalid_and_valid_rows() {
    // mix valid and invalid temp files
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:
```bash
cd src-tauri && cargo test inspect_selected_files
```

Expected: FAIL because no helper/command exists yet.

- [ ] **Step 3: Add a new IPC command**

In `src-tauri/src/commands/import.rs`, add a command like:

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn inspect_importable_files(file_paths: Vec<String>) -> Result<Vec<ImportReviewItem>, AppError>
```

Rules:
- reject empty input list
- map each file path through the shared inspection helper
- use `source = "picked"`
- derive `project_path` from the file’s parent directory
- do not depend on DB for this command

- [ ] **Step 4: Register the command in `main.rs`**

Add the new import command to the `invoke_handler!` list.

- [ ] **Step 5: Run focused backend verification**

Run:
```bash
cd src-tauri && cargo test import::review import::discover commands::import -- --nocapture
```

Expected: PASS.

- [ ] **Step 6: Run compile verification**

Run:
```bash
cd src-tauri && cargo check
```

Expected: PASS.

- [ ] **Step 7: Commit backend IPC support**

```bash
git add src-tauri/src/commands/import.rs src-tauri/src/main.rs src-tauri/src/import/review.rs
git commit -m "feat(import): expose review metadata for picked session files"
```

---

## Chunk 2: Frontend Review Model And Store Ownership

### Task 3: Add the richer review types to the frontend contract

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add a failing type-level usage in the new store test file**

Create a placeholder test file `src/stores/importStore.test.ts` that imports the new type name and references fields like `source`, `last_modified_timestamp`, and `first_user_preview`.

- [ ] **Step 2: Run the focused test to verify type/test failure**

Run:
```bash
npx vitest run src/stores/importStore.test.ts
```

Expected: FAIL because the type or store APIs do not exist yet.

- [ ] **Step 3: Replace/expand the current frontend import review type**

In `src/lib/types.ts`, replace `DiscoveredSession` with a richer review type, for example:

```ts
export interface ImportReviewItem {
  source: 'scanned' | 'picked';
  file_path: string;
  project_path: string;
  cli_session_id: string;
  file_size_bytes: number;
  line_count: number;
  model: string | null;
  first_timestamp: string | null;
  last_modified_timestamp: string | null;
  first_user_preview: string | null;
  already_imported: boolean;
  is_valid_jsonl: boolean;
  warning: string | null;
}
```

Also update `ImportDialog.tsx` and any import-related references to use `ImportReviewItem` once Task 4 starts.

- [ ] **Step 4: Re-run the focused type/test check**

Run:
```bash
npx vitest run src/stores/importStore.test.ts
```

Expected: still FAIL, but now because store functions are missing instead of type names.

### Task 4: Move review data, focus, and selection logic into `importStore`

**Files:**
- Modify: `src/stores/importStore.ts`
- Create: `src/stores/importStore.test.ts`

- [ ] **Step 1: Write failing store tests for normalized review behavior**

In `src/stores/importStore.test.ts`, cover:

```ts
it('merges picked items above scanned items')
it('dedupes by file_path and upgrades source to picked')
it('tracks focused row independently from selected rows')
it('disables invalid or already-imported rows from selection')
it('filters by path tail, project path, model, and session id')
```

- [ ] **Step 2: Run the focused store tests to verify they fail**

Run:
```bash
npx vitest run src/stores/importStore.test.ts
```

Expected: FAIL because the new review-state API is not implemented.

- [ ] **Step 3: Expand `importStore.ts` state**

Move local dialog state into the store. Add fields like:

```ts
interface ImportState {
  dialogOpen: boolean;
  phase: 'idle' | 'discovering' | 'importing' | 'done' | 'error';
  error: string | null;
  reviewItems: ImportReviewItem[];
  selectedPaths: string[];
  focusedPath: string | null;
  searchQuery: string;
}
```

Add focused store APIs such as:
- `setImportReviewItems(items)`
- `mergePickedReviewItems(items)`
- `toggleImportSelection(path)`
- `setFocusedImportItem(path)`
- `setImportSearchQuery(query)`
- derived/helper selectors for visible rows and selected valid rows

- [ ] **Step 4: Encode the business rules in the store**

Ensure the store handles:
- picked-first ordering
- dedupe by `file_path`
- source upgrade from `scanned` → `picked`
- auto-focus first picked item if present
- rejection of invalid/already-imported rows from selection

- [ ] **Step 5: Re-run the focused store tests**

Run:
```bash
npx vitest run src/stores/importStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the frontend state refactor**

```bash
git add src/lib/types.ts src/stores/importStore.ts src/stores/importStore.test.ts
git commit -m "feat(import): move review state into import store"
```

---

## Chunk 3: Master-Detail Import UI

### Task 5: Build the left review list and right details pane components

**Files:**
- Create: `src/components/import/ImportReviewList.tsx`
- Create: `src/components/import/ImportSessionDetails.tsx`
- Create: `src/components/import/ImportDialog.test.tsx`

- [ ] **Step 1: Write failing UI tests for the new layout shell**

In `src/components/import/ImportDialog.test.tsx`, add tests for:

```ts
it('renders a review list and details pane when review items exist')
it('shows compressed row titles but full path in the details pane')
it('updates the details pane when a row is focused')
it('shows Picked, Already imported, and Active project match badges')
```

Mock the store and IPC at the dialog boundary instead of reaching through Tauri.

- [ ] **Step 2: Run the focused dialog tests to verify they fail**

Run:
```bash
npx vitest run src/components/import/ImportDialog.test.tsx
```

Expected: FAIL because the child components and layout do not exist yet.

- [ ] **Step 3: Create `ImportReviewList.tsx`**

Render:
- search input
- checkbox rows
- compressed primary title (`project tail / folder tail`)
- shortened subtitle path
- source/import/match badges

Expose callbacks for focus and selection.

- [ ] **Step 4: Create `ImportSessionDetails.tsx`**

Render for the focused item:
- full file path
- project/folder identity
- first timestamp
- last modified timestamp
- model
- file size / line count
- status and warning state
- first user preview

Handle empty focus gracefully with a placeholder state.

- [ ] **Step 5: Re-run focused UI tests**

Run:
```bash
npx vitest run src/components/import/ImportDialog.test.tsx
```

Expected: FAIL only at `ImportDialog` integration points, not missing component errors.

### Task 6: Convert `ImportDialog` to a review-first master-detail modal

**Files:**
- Modify: `src/components/import/ImportDialog.tsx`
- Optional Modify: `src/components/import/ImportProgress.tsx`
- Test: `src/components/import/ImportDialog.test.tsx`

- [ ] **Step 1: Update `ImportDialog.tsx` to use store-owned review state**

Remove local `createSignal` ownership for discovered rows / selected set / results where possible. Read from `importStore`.

- [ ] **Step 2: Change scan flow to populate review items instead of local discovered state**

Replace:
```ts
const sessions = await invoke<DiscoveredSession[]>('discover_importable_sessions')
```
with the new richer type and store merge/reset helpers.

- [ ] **Step 3: Change `Pick File...` from immediate import to review enrichment**

Replace direct `runImport(paths)` with:

```ts
const reviewItems = await invoke<ImportReviewItem[]>('inspect_importable_files', { file_paths: paths })
mergePickedReviewItems(reviewItems)
```

No import should happen here.

- [ ] **Step 4: Render the split modal body**

Use the new components:

```tsx
<ImportReviewList ... />
<ImportSessionDetails ... />
```

Keep `ImportProgress` for `importing` and `done` phases.

- [ ] **Step 5: Wire the footer CTA to selected valid rows only**

Import should submit only checked, valid, non-disabled rows using their `file_path` values.

- [ ] **Step 6: Expand tests for pick/scan merge behavior**

Add tests to `ImportDialog.test.tsx` for:
- picked items merge into the same list
- picked items sort to the top
- first picked item becomes focused
- import button remains disabled until valid selection exists
- duplicate picked/scanned paths dedupe correctly

- [ ] **Step 7: Run the focused dialog tests again**

Run:
```bash
npx vitest run src/components/import/ImportDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the UI redesign**

```bash
git add src/components/import/ImportDialog.tsx src/components/import/ImportReviewList.tsx src/components/import/ImportSessionDetails.tsx src/components/import/ImportDialog.test.tsx src/components/import/ImportProgress.tsx
git commit -m "feat(import): redesign session review modal"
```

---

## Chunk 4: Full Verification And Follow-Through

### Task 7: Regression coverage and end-to-end verification

**Files:**
- Verify only: import-related frontend and backend files

- [ ] **Step 1: Run import-focused frontend tests**

Run:
```bash
npx vitest run src/components/import/ImportDialog.test.tsx src/stores/importStore.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related integration tests**

Run:
```bash
npx vitest run src/components/settings/SettingsModal.test.tsx src/stores/__integration__/settings-theme.test.ts
```

Expected: PASS; ensures import entry points still work.

- [ ] **Step 3: Run Rust import-focused tests**

Run:
```bash
cd src-tauri && cargo test import::review import::discover commands::import
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Run lint on changed frontend files**

Run:
```bash
npx eslint src/components/import src/stores/importStore.ts src/stores/importStore.test.ts src/lib/types.ts
```

Expected: PASS.

- [ ] **Step 6: Run full frontend unit suite**

Run:
```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Run full Rust suite**

Run:
```bash
cd src-tauri && cargo test
```

Expected: PASS.

- [ ] **Step 8: Run production build verification**

Run:
```bash
npx vite build
```

Expected: PASS (chunk-size warnings are acceptable if they are pre-existing and non-failing).

- [ ] **Step 9: Final closure commit**

```bash
git add src-tauri/src/import src-tauri/src/commands/import.rs src-tauri/src/main.rs src/lib/types.ts src/stores/importStore.ts src/stores/importStore.test.ts src/components/import
git commit -m "test(import): finalize import review redesign verification"
```

---

## Notes For The Implementer

- Prefer reusing `ImportProgress.tsx` unchanged unless the flow rewrite reveals a real UX mismatch.
- Keep import execution behavior stable. The redesign is successful even if the import engine itself barely changes.
- Do not reintroduce immediate import from the file picker. That is the core UX regression this plan is fixing.
- Avoid bloating `ImportDialog.tsx` further. The split components exist to keep the modal readable.
- Use the active project from existing store state only as a badge/ranking signal, not as a hard filter.
