# CHI-131 + CHI-134 Closure Batch (2026-03-02)

## Scope

- `CHI-131` Token-Optimized Snippets
- `CHI-134` Multi-File Bundles

## Implemented

### CHI-131

- Added lightweight symbol extraction engine for TypeScript/JavaScript and Rust:
  - `src/lib/symbolExtractor.ts`
- Added symbol optimization metadata/types:
  - `src/lib/types.ts`
  - `src/stores/contextStore.ts`
- Added optimization flows:
  - per-attachment suggestion discovery
  - apply optimized snippet
  - revert to full-file context
  - symbol-aware context assembly (`<file ... symbols="...">`)
- Added UI affordances:
  - optimize/full toggles in `ContextChip`
  - optimize/full controls in `FilePreview`

### CHI-134

- Added backend multi-file bundle detection:
  - component bundles
  - module bundles (Rust module + TS/JS index module)
  - custom bundles from `.claude/bundles.json`
  - `src-tauri/src/files/bundles.rs`
- Added IPC command:
  - `get_file_bundles` in `src-tauri/src/commands/files.rs`
  - command registration in `src-tauri/src/main.rs`
- Added frontend bundle usage:
  - bundle menu entries in `FileTreeNode` context menu
  - one-click attach through `contextStore.addFileBundle`
  - bundle hints in `@` mention menu (`FileMentionMenu` + `MessageInput`)

## Tests Added/Updated

- `src/lib/symbolExtractor.test.ts`
- `src/stores/contextStore.test.ts`
- `src/components/conversation/ContextChip.test.tsx`
- `src/components/explorer/FileTreeNode.test.tsx`
- Rust unit tests in `src-tauri/src/files/bundles.rs`

## Verification

- `npm run format:check`
- `npm run lint`
- `npm run build`
- `npx vitest run` (full suite)
- `cargo fmt --all -- --check`
- `cargo test --quiet`
- `cargo clippy -- -D warnings`

All checks passed in the feature worktree.
