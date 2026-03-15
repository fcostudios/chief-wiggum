# Import Session Review Redesign

Date: 2026-03-14
Status: Approved design
Scope: Redesign the session import modal so users can identify the correct session file even when source paths are long and similar.

## Problem

The current import flow makes path disambiguation unnecessarily hard:

- `Pick File...` imports immediately after OS selection, so there is no in-app review step.
- The discovered-session list is a flat single-column list with truncated path information.
- Similar paths are difficult to distinguish because the row title leads with `project_path`, which often shares long common prefixes.
- The UI does not expose enough metadata to help users confirm they selected the right transcript before import.

The result is a weak review experience exactly where users need confidence: choosing among many long-path JSONL session files.

## Goals

- Make long-path session sources easy to distinguish before import.
- Normalize scanned sessions and picked files into one review model and one UI.
- Show enough metadata to confirm identity before import begins.
- Preserve batch import behavior.
- Keep import execution semantics stable; this is primarily a review UX redesign.

## Non-Goals

- Changing import engine conflict-resolution semantics.
- Adding transcript content preview beyond lightweight metadata and first-user-message preview.
- Turning import into a multi-step wizard.

## Recommended Approach

Use a master-detail import modal.

- Left pane: searchable, selectable review list optimized for scanning.
- Right pane: persistent details pane for the focused row.
- Both scan results and manually picked files populate the same normalized review list.
- Import occurs only after explicit confirmation via the final import action.

This is the preferred approach over a denser one-column list or a wizard because the actual pain point is disambiguation across many similar items, not merely lack of text.

## UX Structure

### Modal Layout

The modal remains a single overlay, but its main content becomes a split layout:

- Header: title, close action, optional session count summary.
- Top controls row:
  - `Scan ~/.claude/projects/`
  - `Pick File...`
  - search/filter input
- Content area:
  - left review list
  - right details pane
- Footer:
  - selection summary
  - import CTA
  - disabled-state explanation when nothing valid is selected

### Left Review List

The left pane is optimized for quick comparison.

Each row includes:

- checkbox for selection
- primary title using `project tail / folder tail`
  - examples: `observer / sessions`, `ChiefWiggum / imports`
- secondary subtitle with shortened parent path
- compact metadata badges:
  - source (`Picked` or `Scanned`)
  - `Already imported`
  - `Active project match`
  - model when useful

Behavior:

- clicking a checkbox affects import selection only
- clicking a row changes focus in the details pane
- focus and selection are separate states
- `Already imported` rows remain visible but disabled
- manually picked rows sort to the top temporarily

### Right Details Pane

The right pane is the confidence layer.

Priority order:

1. full absolute file path
2. project/folder identity
3. started time and last modified time
4. model
5. file size and line count
6. import state and whether it matches the active project
7. short preview of the first user message

This pane should not depend on selection. It follows the currently focused row.

## Unified Review Model

The current `DiscoveredSession` shape is too narrow for the redesigned review flow. The UI should operate on one normalized review model regardless of source.

Suggested conceptual fields:

- `source: 'scanned' | 'picked'`
- `file_path`
- `project_path`
- `cli_session_id`
- `model`
- `first_timestamp`
- `last_modified_timestamp`
- `file_size_bytes`
- `line_count`
- `already_imported`
- `matches_active_project`
- `first_user_preview`
- optional parse or validation warning state

This model should power both list rows and the details pane.

## Source Normalization

### Scanned Sessions

Sessions discovered from `~/.claude/projects/` continue to come from backend discovery, but should be enriched into the unified review model.

### Picked Files

`Pick File...` should stop importing immediately.

New behavior:

- file picker returns file paths only
- app parses lightweight metadata for each selected JSONL first
- chosen files are appended into the same review list as scanned sessions
- chosen files get a `Picked` badge
- chosen files sort to the top for the current session
- first chosen file becomes the focused details item automatically
- import does not begin until the user clicks the final import button

If the same absolute path exists from both scan and pick, dedupe by `file_path` and preserve the stronger source signal as `Picked`.

## Metadata Extraction

The review step should provide parity between scanned and picked files.

That means the system needs a reusable metadata extraction path for arbitrary JSONL file paths, not only files found under `~/.claude/projects/`.

At review time, the app should attempt to extract:

- first timestamp
- model
- line count
- file size
- last modified timestamp
- first user message preview
- basic validity state

This keeps the review experience consistent regardless of how the file entered the modal.

## Error Handling

### Unreadable Metadata

If a chosen file cannot be fully parsed for metadata:

- still show the row
- mark it with an `Unreadable metadata` warning badge
- show path plus parse error summary in the details pane
- allow import only if the import pipeline can still handle the file safely

### Invalid JSONL

If inspection proves the file is invalid for import:

- show it in the review list
- mark it invalid
- disable its checkbox
- explain the failure in the details pane

### Large Batches

When many files are present:

- preserve one modal, not a wizard
- support search across path tail, project path, model, and session ID
- highlight active-project matches but do not auto-hide non-matches

## State Ownership

The current `ImportDialog` keeps too much behavior locally.

Recommended boundary changes:

- `importStore` should own the review dataset, selection state, focus state, phase, and errors
- `ImportDialog` should become mostly presentational
- backend remains responsible for discovery and import execution
- backend or a dedicated metadata command should provide arbitrary-path metadata extraction

This gives clearer ownership and makes the redesigned interaction easier to test.

## Data Flow

### Scan Flow

1. user clicks scan
2. backend discovers sessions under `~/.claude/projects/`
3. frontend maps results into unified review items
4. list renders and first item is focused

### Pick Flow

1. user clicks `Pick File...`
2. file picker returns absolute paths
3. app requests metadata extraction for those paths
4. metadata results merge into the existing review list
5. dedupe runs by `file_path`
6. picked rows rise to the top and first picked row gains focus

### Import Flow

1. user checks one or more rows
2. import CTA submits only selected valid rows
3. existing import backend executes unchanged as much as possible
4. results screen remains as-is or receives minor follow-up polish later

## Testing Strategy

### Frontend Component Tests

- picked files populate the review list instead of importing immediately
- focused row updates the details pane
- long-path row titles render in compressed `tail / tail` form
- details pane shows full absolute path
- badges render correctly for `Picked`, `Already imported`, and active-project match
- invalid/unreadable rows show correct disabled and warning states
- dedupe works when the same path appears from both sources

### Store And Integration Tests

- normalized review model merges scanned and picked sources
- picked rows sort to top without breaking stable focus/selection
- search works across path tail, project path, model, and session ID
- focus and selection remain independent

### Rust Tests

- arbitrary-path metadata extraction
- invalid JSONL handling
- first-user-message preview extraction
- timestamp/stat extraction
- consistency of review payload shape

## Rollout Plan

Implement incrementally to reduce risk:

1. introduce unified review model and store ownership changes
2. add arbitrary-path metadata extraction for picked files
3. convert `Pick File...` from immediate import to review-list population
4. replace flat modal body with master-detail layout
5. add badges, active-project matching, dedupe, and preview metadata

This keeps the import engine stable while improving review confidence first.

## Success Criteria

The redesign is successful when:

- users can tell similar long-path files apart without guessing
- users can verify file identity before import begins
- picked files and scanned files feel like one consistent system
- batch import remains efficient
- invalid or already-imported files are visible and explained, not silently confusing
