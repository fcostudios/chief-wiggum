# CHI-203 / CHI-196 / CHI-197 / CHI-205 / CHI-211 — Symbol @-Mention, Formatting Toggle, Anchor Links, Unit & E2E Test Coverage

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver five conversation-experience features: symbol `@fn:`/`@class:`/`@var:` autocomplete (CHI-203), per-message raw markdown toggle (CHI-196), response anchor links with floating mini-TOC (CHI-197), and test coverage for existing code block + Mermaid renderers (CHI-205 unit / CHI-211 E2E).

**Architecture:**
- CHI-203: Rust regex scanner → new `list_symbols` IPC → extended `FileMentionMenu` + `MessageInput` for symbol triggers; `addSymbolAttachment()` in contextStore.
- CHI-196: Pure SolidJS `showRaw` signal + Eye/EyeOff toggle in `MessageBubble`.
- CHI-197: Extend MarkdownContent.tsx marked heading renderer with anchor IDs; new `ResponseOutline.tsx` floating mini-TOC, mounted via `solidRender` when ≥3 headings.
- CHI-205: `CodeBlockRenderer.test.tsx` tests MarkdownContent's post-processed code block DOM; one additional test added to `MermaidRenderer.test.tsx`.
- CHI-211: Playwright E2E with IPC-seeded fixture sessions; asserts on rendered DOM.

**Tech Stack:** SolidJS 1.9, Tauri v2, Rust (`regex` + `ignore` crates — both already in Cargo.toml), Vitest + `@solidjs/testing-library`, Playwright.

---

## Part A — CHI-203: Symbol @-Mention

### Task A1: Add `SymbolMatch` + `scan_symbols()` to scanner.rs (TDD)

**Files:**
- Modify: `src-tauri/src/files/scanner.rs`

**Step 1: Write 6 failing unit tests**

Append inside the existing `#[cfg(test)]` block at the bottom of `scanner.rs`:

```rust
#[cfg(test)]
mod symbol_tests {
    use super::*;
    use std::io::Write as _;
    use tempfile::TempDir;

    fn write_file(dir: &TempDir, name: &str, content: &str) {
        let path = dir.path().join(name);
        let mut f = std::fs::File::create(path).expect("create file");
        f.write_all(content.as_bytes()).expect("write file");
    }

    #[test]
    fn scan_ts_function_by_name() {
        let dir = TempDir::new().unwrap();
        write_file(&dir, "utils.ts", "export function greetUser(name: string): string {\n  return `Hello ${name}`;\n}\n");
        let results = scan_symbols(dir.path(), "greet", "function").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "greetUser");
        assert_eq!(results[0].kind, "function");
        assert_eq!(results[0].line_number, 1);
    }

    #[test]
    fn scan_ts_class_by_name() {
        let dir = TempDir::new().unwrap();
        write_file(&dir, "service.ts", "export class UserService {\n  id = 1;\n}\n");
        let results = scan_symbols(dir.path(), "UserService", "class").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "UserService");
        assert_eq!(results[0].kind, "class");
    }

    #[test]
    fn scan_rust_fn() {
        let dir = TempDir::new().unwrap();
        write_file(&dir, "lib.rs", "pub fn compute_total(x: i32) -> i32 {\n    x * 2\n}\n");
        let results = scan_symbols(dir.path(), "compute", "function").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].kind, "function");
    }

    #[test]
    fn scan_query_is_case_insensitive() {
        let dir = TempDir::new().unwrap();
        write_file(&dir, "helpers.ts", "export function calculateTotal() {}\n");
        let results = scan_symbols(dir.path(), "CALC", "all").unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn scan_kind_filter_excludes_other_kinds() {
        let dir = TempDir::new().unwrap();
        write_file(&dir, "mixed.ts", "export function doWork() {}\nexport class DoClass {}\n");
        let fn_only = scan_symbols(dir.path(), "", "function").unwrap();
        assert!(fn_only.iter().all(|r| r.kind == "function"), "expected only functions");
        let cls_only = scan_symbols(dir.path(), "", "class").unwrap();
        assert!(cls_only.iter().all(|r| r.kind == "class"), "expected only classes");
    }

    #[test]
    fn scan_snippet_capped_at_20_lines() {
        let dir = TempDir::new().unwrap();
        let body: String = (0..30).map(|i| format!("  let line{i} = {i};\n")).collect();
        write_file(&dir, "big.ts", &format!("export function bigFn() {{\n{body}}}\n"));
        let results = scan_symbols(dir.path(), "bigFn", "function").unwrap();
        assert!(!results.is_empty());
        assert!(results[0].snippet.lines().count() <= 20);
    }
}
```

**Step 2: Run tests — expect compilation failure**

```bash
cd src-tauri && cargo test symbol_tests 2>&1 | head -20
```

Expected: `error[E0425]: cannot find function 'scan_symbols'`

**Step 3: Add `SymbolMatch` struct + regex helpers + `scan_symbols()` to scanner.rs**

Insert the `SymbolMatch` struct near the top of `scanner.rs`, after the existing structs:

```rust
/// A code symbol found by regex pattern scanning.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SymbolMatch {
    pub name: String,
    pub kind: String,       // "function" | "class" | "variable"
    pub file_path: String,  // relative to root, forward-slash separated
    pub line_number: usize, // 1-indexed
    pub snippet: String,    // up to 20 lines starting at the declaration
    pub estimated_tokens: usize,
}
```

Insert the helper functions and `scan_symbols` before the `#[cfg(test)]` block:

```rust
use std::sync::OnceLock;

// --- Symbol scanning helpers ---

fn ts_symbol_patterns(kind: &str) -> Vec<(&'static regex::Regex, &'static str)> {
    static FN_KEYWORD: OnceLock<regex::Regex> = OnceLock::new();
    static FN_ARROW:   OnceLock<regex::Regex> = OnceLock::new();
    static CLASS:      OnceLock<regex::Regex> = OnceLock::new();
    static VAR_EXPORT: OnceLock<regex::Regex> = OnceLock::new();

    let fn_kw  = FN_KEYWORD.get_or_init(|| regex::Regex::new(r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)").expect("valid regex"));
    let fn_arr = FN_ARROW  .get_or_init(|| regex::Regex::new(r"^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(").expect("valid regex"));
    let cls    = CLASS     .get_or_init(|| regex::Regex::new(r"^(?:export\s+)?(?:default\s+)?class\s+(\w+)").expect("valid regex"));
    let var    = VAR_EXPORT.get_or_init(|| regex::Regex::new(r"^export\s+(?:const|let)\s+(\w+)\s*[=:]").expect("valid regex"));

    let want_fn  = kind == "all" || kind == "function";
    let want_cls = kind == "all" || kind == "class";
    let want_var = kind == "all" || kind == "variable";

    let mut v: Vec<(&'static regex::Regex, &'static str)> = Vec::new();
    if want_fn  { v.push((fn_kw, "function")); v.push((fn_arr, "function")); }
    if want_cls { v.push((cls, "class")); }
    if want_var { v.push((var, "variable")); }
    v
}

fn rs_symbol_patterns(kind: &str) -> Vec<(&'static regex::Regex, &'static str)> {
    static FN:  OnceLock<regex::Regex> = OnceLock::new();
    static STR: OnceLock<regex::Regex> = OnceLock::new();
    static CST: OnceLock<regex::Regex> = OnceLock::new();

    let fn_re  = FN .get_or_init(|| regex::Regex::new(r"^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)").expect("valid regex"));
    let str_re = STR.get_or_init(|| regex::Regex::new(r"^(?:pub\s+)?struct\s+(\w+)").expect("valid regex"));
    let cst_re = CST.get_or_init(|| regex::Regex::new(r"^(?:pub\s+)?const\s+([A-Z_][A-Z0-9_]*)").expect("valid regex"));

    let want_fn  = kind == "all" || kind == "function";
    let want_cls = kind == "all" || kind == "class";
    let want_var = kind == "all" || kind == "variable";

    let mut v: Vec<(&'static regex::Regex, &'static str)> = Vec::new();
    if want_fn  { v.push((fn_re, "function")); }
    if want_cls { v.push((str_re, "class")); }
    if want_var { v.push((cst_re, "variable")); }
    v
}

fn py_symbol_patterns(kind: &str) -> Vec<(&'static regex::Regex, &'static str)> {
    static FN:  OnceLock<regex::Regex> = OnceLock::new();
    static CLS: OnceLock<regex::Regex> = OnceLock::new();

    let fn_re  = FN .get_or_init(|| regex::Regex::new(r"^(?:async\s+)?def\s+(\w+)").expect("valid regex"));
    let cls_re = CLS.get_or_init(|| regex::Regex::new(r"^class\s+(\w+)").expect("valid regex"));

    let want_fn  = kind == "all" || kind == "function";
    let want_cls = kind == "all" || kind == "class";

    let mut v: Vec<(&'static regex::Regex, &'static str)> = Vec::new();
    if want_fn  { v.push((fn_re, "function")); }
    if want_cls { v.push((cls_re, "class")); }
    v
}

/// Scan `root` directory for code symbols matching `query` (case-insensitive substring)
/// of the given `kind` ("function" | "class" | "variable" | "all").
/// Returns up to 20 results. Supports TypeScript/JavaScript, Rust, and Python.
pub fn scan_symbols(root: &Path, query: &str, kind: &str) -> Result<Vec<SymbolMatch>, AppError> {
    use ignore::WalkBuilder;

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    'walk: for entry in WalkBuilder::new(root).hidden(false).build() {
        let entry = entry.map_err(|e| AppError::Other(e.to_string()))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let patterns: Vec<(&'static regex::Regex, &'static str)> = match ext {
            "ts" | "tsx" | "js" | "jsx" => ts_symbol_patterns(kind),
            "rs"                        => rs_symbol_patterns(kind),
            "py"                        => py_symbol_patterns(kind),
            _                           => continue,
        };

        let content = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let line_vec: Vec<&str> = content.lines().collect();
        let relative = path
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();

        for (line_idx, line) in line_vec.iter().enumerate() {
            for (re, sym_kind) in &patterns {
                if let Some(caps) = re.captures(line) {
                    let name = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    if name.is_empty() {
                        continue;
                    }
                    if !query.is_empty() && !name.to_lowercase().contains(&query_lower) {
                        continue;
                    }
                    let end = (line_idx + 20).min(line_vec.len());
                    let snippet = line_vec[line_idx..end].join("\n");
                    let estimated_tokens = snippet.len() / 4;
                    results.push(SymbolMatch {
                        name,
                        kind: sym_kind.to_string(),
                        file_path: relative.clone(),
                        line_number: line_idx + 1,
                        snippet,
                        estimated_tokens,
                    });
                    if results.len() >= 20 {
                        break 'walk;
                    }
                }
            }
        }
    }
    Ok(results)
}
```

**Step 4: Run tests — expect all 6 to pass**

```bash
cd src-tauri && cargo test symbol_tests -- --nocapture
```

Expected: `test result: ok. 6 passed`

**Step 5: Run clippy + fmt**

```bash
cd src-tauri && cargo clippy -- -D warnings && cargo fmt --check
```

Fix any warnings before continuing.

**Step 6: Commit**

```bash
git add src-tauri/src/files/scanner.rs
git commit -m "CHI-203: add SymbolMatch struct and scan_symbols() to scanner.rs"
```

---

### Task A2: Add `list_symbols` IPC command

**Files:**
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/main.rs` (register command)

**Step 1: Add `list_symbols` to files.rs**

In `src-tauri/src/commands/files.rs`, add after the last `#[tauri::command]` function:

```rust
/// Search the project's source files for code symbols (functions, classes, variables).
/// `kind`: "function" | "class" | "variable" | "all"
/// `query`: case-insensitive substring match against symbol names (empty = all)
/// Returns up to 20 matches.
#[tauri::command(rename_all = "snake_case")]
#[tracing::instrument(skip(db), fields(project_id = %project_id, kind = %kind, query = %query))]
pub fn list_symbols(
    db: State<'_, Database>,
    project_id: String,
    kind: String,
    query: String,
) -> Result<Vec<scanner::SymbolMatch>, AppError> {
    let project = queries::get_project(&db, &project_id)?
        .ok_or_else(|| AppError::Other(format!("Project not found: {}", project_id)))?;
    let root = std::path::Path::new(&project.path);
    scanner::scan_symbols(root, &query, &kind)
}
```

**Step 2: Register in main.rs**

In `src-tauri/src/main.rs`, find the `.invoke_handler(tauri::generate_handler![` block and add `files::list_symbols` to the list (add comma after the previous entry):

```rust
files::list_symbols,
```

**Step 3: Build check**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error"
```

Expected: no output (clean build).

**Step 4: Commit**

```bash
git add src-tauri/src/commands/files.rs src-tauri/src/main.rs
git commit -m "CHI-203: add list_symbols IPC command"
```

---

### Task A3: Add `SymbolSearchResult` type + `addSymbolAttachment()` to frontend

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/contextStore.ts`

**Step 1: Add `SymbolSearchResult` to types.ts**

In `src/lib/types.ts`, add after the `FileSearchResult` interface (search for it):

```typescript
/** A code symbol (function/class/variable) found by the backend regex scanner. */
export interface SymbolSearchResult {
  name: string;
  kind: 'function' | 'class' | 'variable';
  file_path: string;    // relative to project root, forward-slash separated
  line_number: number;  // 1-indexed
  snippet: string;      // up to 20 lines starting at the declaration line
  estimated_tokens: number;
}
```

**Step 2: Add `addSymbolAttachment()` to contextStore.ts**

In `src/stores/contextStore.ts`, add this function alongside `addFileReference`:

```typescript
/** Add a code symbol as a context attachment. The snippet is pre-loaded; no IPC needed. */
export function addSymbolAttachment(symbol: SymbolSearchResult): void {
  // Dedup by file_path + line_number
  const alreadyAttached = state.attachments.some(
    (a) =>
      a.reference.relative_path === symbol.file_path &&
      a.reference.start_line === symbol.line_number,
  );
  if (alreadyAttached) return;

  const currentTotal = getTotalEstimatedTokens();
  if (currentTotal + symbol.estimated_tokens > TOKEN_HARD_CAP) {
    import('@/stores/toastStore').then(({ addToast }) => {
      addToast('Symbol would exceed the context token limit', 'warning');
    });
    return;
  }

  const ext = symbol.file_path.split('.').pop() ?? '';
  const kindPrefix = symbol.kind === 'function' ? 'fn' : symbol.kind === 'class' ? 'class' : 'var';
  const displayName = `@${kindPrefix}:${symbol.name}`;

  const reference: FileReference = {
    relative_path: symbol.file_path,
    name: displayName,
    extension: ext,
    size_bytes: symbol.snippet.length,
    symbol_names: [symbol.name],
    start_line: symbol.line_number,
    end_line: symbol.line_number + symbol.snippet.split('\n').length - 1,
  };

  const attachment: ContextAttachment = {
    id: crypto.randomUUID(),
    reference,
    content: symbol.snippet,   // pre-loaded, skip IPC read
    actual_tokens: symbol.estimated_tokens,
  };

  setState('attachments', [...state.attachments, attachment]);

  if (currentTotal + symbol.estimated_tokens > TOKEN_WARNING_THRESHOLD) {
    import('@/stores/toastStore').then(({ addToast }) => {
      addToast('Context is getting large — consider removing some files', 'warning');
    });
  }
}
```

Also make sure `SymbolSearchResult` is imported at the top of contextStore.ts:

```typescript
import type { ..., SymbolSearchResult } from '@/lib/types';
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors before continuing.

**Step 4: Commit**

```bash
git add src/lib/types.ts src/stores/contextStore.ts
git commit -m "CHI-203: add SymbolSearchResult type and addSymbolAttachment()"
```

---

### Task A4: Extend `FileMentionMenu.tsx` for symbol display mode

**Files:**
- Modify: `src/components/conversation/FileMentionMenu.tsx`

**Step 1: Update component to support symbol mode**

Replace the entire file with the extended version that adds optional symbol props:

```tsx
// src/components/conversation/FileMentionMenu.tsx
// Inline autocomplete dropdown for @-file and @symbol mentions.

import type { Component } from 'solid-js';
import { Show, For, createEffect } from 'solid-js';
import { File, Code, Box, Hash } from 'lucide-solid';
import type { FileSearchResult, SymbolSearchResult } from '@/lib/types';

interface FileMentionMenuProps {
  isOpen: boolean;
  results: FileSearchResult[];
  symbolResults?: SymbolSearchResult[];
  highlightedIndex: number;
  bundleHints?: Record<string, string>;
  mode?: 'file' | 'symbol';
  onSelect: (result: FileSearchResult) => void;
  onSelectSymbol?: (result: SymbolSearchResult) => void;
  onClose: () => void;
}

function SymbolKindIcon(props: { kind: string }) {
  return (
    <Show when={props.kind === 'class'} fallback={
      <Show when={props.kind === 'variable'} fallback={<Code size={12} style={{ color: 'var(--color-text-tertiary)' }} />}>
        <Hash size={12} style={{ color: 'var(--color-text-tertiary)' }} />
      </Show>
    }>
      <Box size={12} style={{ color: 'var(--color-text-tertiary)' }} />
    </Show>
  );
}

const FileMentionMenu: Component<FileMentionMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!menuRef || !props.isOpen) return;
    const highlighted = menuRef.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });

  const isSymbolMode = () => props.mode === 'symbol';
  const activeResults = () => isSymbolMode() ? (props.symbolResults ?? []) : props.results;
  const hasResults = () => activeResults().length > 0;

  return (
    <Show when={props.isOpen && hasResults()}>
      <div
        ref={menuRef}
        class="absolute bottom-full left-0 right-0 mb-1 max-h-[250px] overflow-y-auto rounded-lg z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': '0 -4px 16px rgba(0, 0, 0, 0.3)',
        }}
        role="listbox"
        aria-label={isSymbolMode() ? 'Symbol mentions' : 'File mentions'}
      >
        {/* Header */}
        <div
          class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-secondary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          {isSymbolMode() ? 'Symbols' : 'Files'}
        </div>

        {/* Symbol results */}
        <Show when={isSymbolMode()}>
          <For each={props.symbolResults ?? []}>
            {(result, idx) => {
              const isHighlighted = () => idx() === props.highlightedIndex;
              return (
                <button
                  class="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                  style={{
                    background: isHighlighted() ? 'var(--color-accent-muted)' : 'transparent',
                    'border-left': isHighlighted()
                      ? '2px solid var(--color-accent)'
                      : '2px solid transparent',
                  }}
                  data-highlighted={isHighlighted()}
                  role="option"
                  aria-selected={isHighlighted()}
                  onClick={() => props.onSelectSymbol?.(result)}
                >
                  <SymbolKindIcon kind={result.kind} />
                  <span class="text-xs font-mono font-medium truncate" style={{ color: 'var(--color-accent)' }}>
                    {result.name}
                  </span>
                  <span class="text-[10px] truncate flex-1 text-right font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                    {result.file_path}:{result.line_number}
                  </span>
                </button>
              );
            }}
          </For>
        </Show>

        {/* File results (original behaviour) */}
        <Show when={!isSymbolMode()}>
          <For each={props.results}>
            {(result, idx) => {
              const isHighlighted = () => idx() === props.highlightedIndex;
              return (
                <div>
                  <button
                    class="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                    style={{
                      background: isHighlighted() ? 'var(--color-accent-muted)' : 'transparent',
                      'border-left': isHighlighted()
                        ? '2px solid var(--color-accent)'
                        : '2px solid transparent',
                    }}
                    data-highlighted={isHighlighted()}
                    role="option"
                    aria-selected={isHighlighted()}
                    onClick={() => props.onSelect(result)}
                  >
                    <File size={12} class="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                    <span class="text-xs font-mono font-medium truncate" style={{ color: 'var(--color-accent)' }}>
                      {result.name}
                    </span>
                    <span class="text-[10px] truncate flex-1 text-right font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      {result.relative_path}
                    </span>
                  </button>
                  <Show when={props.bundleHints?.[result.relative_path]}>
                    {(hint) => (
                      <div class="px-3 pb-1 text-[10px] font-mono" style={{ color: 'var(--color-accent)' }}>
                        Bundle: {hint()}
                      </div>
                    )}
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>

        {/* Footer hint */}
        <div
          class="px-3 py-1.5 text-[10px] flex items-center gap-3"
          style={{
            color: 'var(--color-text-tertiary)',
            'border-top': '1px solid var(--color-border-secondary)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <span><kbd class="font-mono">↑↓</kbd> navigate</span>
          <span><kbd class="font-mono">↵</kbd> attach</span>
          <span><kbd class="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </Show>
  );
};

export default FileMentionMenu;
```

**Step 2: Check TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/conversation/FileMentionMenu.tsx
git commit -m "CHI-203: extend FileMentionMenu for symbol display mode"
```

---

### Task A5: Extend `MessageInput.tsx` for `@fn:` / `@class:` / `@var:` triggers

**Files:**
- Modify: `src/components/conversation/MessageInput.tsx`

**Step 1: Add symbol-mode helpers and signals**

At the top of the file, add the import:

```typescript
import type { SymbolSearchResult } from '@/lib/types';
import { addSymbolAttachment } from '@/stores/contextStore';
```

Inside the `MessageInput` component (near the existing `mentionResults` signal), add:

```typescript
const [symbolResults, setSymbolResults] = createSignal<SymbolSearchResult[]>([]);
const [mentionMode, setMentionMode] = createSignal<'file' | 'symbol'>('file');
```

Add a helper function inside the component (above the mention debounce handler):

```typescript
const SYMBOL_KIND_MAP: Record<string, string> = {
  'fn:':    'function',
  'class:': 'class',
  'var:':   'variable',
} as const;

function getSymbolPrefix(query: string): { kind: string; subQuery: string } | null {
  for (const [prefix, kind] of Object.entries(SYMBOL_KIND_MAP)) {
    if (query.startsWith(prefix)) {
      return { kind, subQuery: query.slice(prefix.length) };
    }
  }
  return null;
}
```

**Step 2: Update the mention debounce handler**

Find the existing `@`-mention debounce handler (the one that calls `search_project_files`) and update it to branch on symbol vs file mode:

```typescript
// Inside the debounced mention handler (replace the existing search_project_files call):
const symbolPrefix = getSymbolPrefix(q);
if (symbolPrefix) {
  // Symbol mode
  setMentionMode('symbol');
  const project = projectStore.getActiveProject();
  if (!project) return;
  try {
    const symbols = await invoke<SymbolSearchResult[]>('list_symbols', {
      project_id: project.id,
      kind: symbolPrefix.kind,
      query: symbolPrefix.subQuery,
    });
    setSymbolResults(symbols);
  } catch (err) {
    log.warn('list_symbols failed:', err instanceof Error ? err.message : String(err));
    setSymbolResults([]);
  }
} else {
  // File mode (existing logic — unchanged)
  setMentionMode('file');
  // ... existing search_project_files call ...
}
```

**Step 3: Wire `onSelectSymbol` callback in `<FileMentionMenu>`**

Find the `<FileMentionMenu>` JSX usage and add the symbol props:

```tsx
<FileMentionMenu
  isOpen={mentionQuery() !== null}
  results={mentionResults()}
  symbolResults={symbolResults()}
  highlightedIndex={mentionHighlight()}
  bundleHints={bundleHints()}
  mode={mentionMode()}
  onSelect={handleMentionSelect}
  onSelectSymbol={(result) => {
    addSymbolAttachment(result);
    setMentionQuery(null);
    setSymbolResults([]);
    setMentionMode('file');
    // Remove the @fn:query text from the textarea
    const ta = textareaRef;
    if (!ta) return;
    const val = ta.value;
    const atIdx = val.lastIndexOf('@');
    if (atIdx !== -1) {
      const newVal = val.slice(0, atIdx);
      setState('message', newVal);
      ta.value = newVal;
      ta.setSelectionRange(newVal.length, newVal.length);
    }
  }}
  onClose={() => {
    setMentionQuery(null);
    setSymbolResults([]);
    setMentionMode('file');
  }}
/>
```

Also update the keyboard handler so ↑↓/Enter/Escape work in symbol mode — the existing `handleMentionKeyDown` should already work since it uses `highlightedIndex` and calls `onSelect` on Enter. Make sure the Enter handler branches on `mentionMode()`:

```typescript
// In handleMentionKeyDown, find the Enter case and add:
if (mentionMode() === 'symbol') {
  const sym = symbolResults()[mentionHighlight()];
  if (sym) {
    // trigger onSelectSymbol as above
    addSymbolAttachment(sym);
    setMentionQuery(null);
    setSymbolResults([]);
    setMentionMode('file');
    // strip @... text from textarea (same as above)
  }
  return;
}
// else fall through to existing file select logic
```

**Step 4: TypeScript + lint check**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/MessageInput.tsx
```

Fix any issues.

**Step 5: Full lint + build**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check . && cd src-tauri && cargo test && cargo clippy -- -D warnings
```

**Step 6: Commit**

```bash
git add src/components/conversation/MessageInput.tsx
git commit -m "CHI-203: wire @fn:/@class:/@var: symbol triggers in MessageInput"
```

---

## Part B — CHI-196: Message Formatting Toggle

### Task B1: Add `showRaw` signal + Eye/EyeOff toggle to `MessageBubble.tsx`

**Files:**
- Modify: `src/components/conversation/MessageBubble.tsx`

**Step 1: Add imports**

At the top of `MessageBubble.tsx`, add to the lucide-solid import:

```typescript
import { ..., Eye, EyeOff } from 'lucide-solid';
```

Also add highlight.js import for markdown syntax highlighting:

```typescript
import hljs from 'highlight.js/lib/core';
import markdownLang from 'highlight.js/lib/languages/markdown';
hljs.registerLanguage('markdown', markdownLang);
```

**Step 2: Add `showRaw` signal inside the component**

Inside `MessageBubble` (at the top of the component body, alongside other signals):

```typescript
const [showRaw, setShowRaw] = createSignal(false);
```

**Step 3: Add Eye/EyeOff toggle button**

Find the hover actions area for assistant messages (where copy/regenerate buttons are). Add the toggle button **before** the copy button, only for assistant messages:

```tsx
<Show when={props.message.role === 'assistant' && props.message.content}>
  <button
    class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
    style={{ color: showRaw() ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
    onClick={() => setShowRaw((v) => !v)}
    title={showRaw() ? 'Show rendered markdown' : 'Show raw source'}
    aria-label={showRaw() ? 'Show rendered markdown' : 'Show raw markdown source'}
  >
    <Show when={showRaw()} fallback={<Eye size={14} />}>
      <EyeOff size={14} />
    </Show>
  </button>
</Show>
```

**Step 4: Conditionally render raw vs rendered content**

Find where `<MarkdownContent>` is rendered for assistant messages and wrap with a `<Show>`:

```tsx
<Show
  when={!showRaw()}
  fallback={
    <pre
      class="text-[11px] font-mono whitespace-pre-wrap rounded-lg p-3 overflow-x-auto"
      style={{ background: 'var(--color-bg-inset)' }}
    >
      <code
        class="hljs language-markdown"
        // eslint-disable-next-line solid/no-innerhtml
        innerHTML={hljs.highlight(props.message.content ?? '', {
          language: 'markdown',
          ignoreIllegals: true,
        }).value}
      />
    </pre>
  }
>
  <MarkdownContent content={props.message.content ?? ''} messageId={props.message.id} />
</Show>
```

**Step 5: TypeScript + lint check**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/MessageBubble.tsx
```

---

### Task B2: Add tests + final checks

**Files:**
- Modify: `src/components/conversation/MessageBubble.test.tsx`

**Step 1: Add 3 tests to `MessageBubble.test.tsx`**

Append to the existing test file inside the main `describe` block:

```tsx
describe('Formatting toggle (CHI-196)', () => {
  it('toggle button only visible for assistant messages', () => {
    const { queryByLabelText } = render(() => (
      <MessageBubble
        message={{ ...assistantMsg, role: 'assistant' }}
        onDelete={() => {}}
        onFork={() => {}}
        onEdit={() => {}}
        onRegenerate={() => {}}
      />
    ));
    // Button exists (visibility is CSS opacity, so it's in DOM)
    expect(queryByLabelText('Show raw markdown source')).toBeInTheDocument();
  });

  it('toggle button NOT present for user messages', () => {
    const { queryByLabelText } = render(() => (
      <MessageBubble
        message={{ ...userMsg, role: 'user', content: 'hello **there**' }}
        onDelete={() => {}}
        onFork={() => {}}
        onEdit={() => {}}
        onRegenerate={() => {}}
      />
    ));
    expect(queryByLabelText('Show raw markdown source')).not.toBeInTheDocument();
    expect(queryByLabelText('Show rendered markdown')).not.toBeInTheDocument();
  });

  it('clicking eye toggle switches to raw view and back', async () => {
    const rawContent = '## Hello\n\nSome **bold** text.';
    const { getByLabelText, queryByText } = render(() => (
      <MessageBubble
        message={{ ...assistantMsg, content: rawContent }}
        onDelete={() => {}}
        onFork={() => {}}
        onEdit={() => {}}
        onRegenerate={() => {}}
      />
    ));
    // Initially rendered — raw markdown text NOT directly visible
    expect(queryByText('## Hello')).not.toBeInTheDocument();

    // Click toggle
    fireEvent.click(getByLabelText('Show raw markdown source'));

    // Now raw text is visible in a <pre>
    await waitFor(() => expect(queryByText(/## Hello/)).toBeInTheDocument());

    // Click again to go back to rendered view
    fireEvent.click(getByLabelText('Show rendered markdown'));
    await waitFor(() => expect(queryByText('## Hello')).not.toBeInTheDocument());
  });
});
```

Note: adjust the `assistantMsg` / `userMsg` fixture objects to match those already defined in the test file.

**Step 2: Run tests**

```bash
npx vitest run src/components/conversation/MessageBubble.test.tsx
```

Expected: all tests pass (including existing 16 + new 3).

**Step 3: Full checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

**Step 4: Commit**

```bash
git add src/components/conversation/MessageBubble.tsx src/components/conversation/MessageBubble.test.tsx
git commit -m "CHI-196: add per-message raw markdown formatting toggle"
```

---

## Part C — CHI-197: Response Anchor Links

### Task C1: Add anchor IDs to headings in `MarkdownContent.tsx`

**Files:**
- Modify: `src/components/conversation/MarkdownContent.tsx`

**Step 1: Add a slugify helper**

Near the top of `MarkdownContent.tsx` (after imports), add:

```typescript
/** Convert heading text to a URL-safe slug for anchor IDs. */
function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // strip HTML tags (for nested inline markup)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}
```

**Step 2: Extend the marked heading renderer**

Find where `marked` is configured (look for `marked.use(` or `new marked.Renderer()`). Add heading renderer using the merge syntax:

```typescript
marked.use({
  renderer: {
    heading({ text, depth }) {
      const id = slugifyHeading(text);
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    },
  },
});
```

If a renderer is already set up differently (e.g., via `new Renderer()`), add the heading method to the existing renderer object:

```typescript
renderer.heading = ({ text, depth }) => {
  const id = slugifyHeading(text);
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};
```

**Step 3: Verify headings get IDs in tests**

```bash
npx vitest run src/components/conversation/MarkdownContent.test.tsx
```

Expected: all 42 existing tests still pass.

**Step 4: Commit**

```bash
git add src/components/conversation/MarkdownContent.tsx
git commit -m "CHI-197: add anchor IDs to rendered headings in MarkdownContent"
```

---

### Task C2: Create `ResponseOutline.tsx` floating mini-TOC

**Files:**
- Create: `src/components/conversation/ResponseOutline.tsx`

**Step 1: Write the component**

```tsx
// src/components/conversation/ResponseOutline.tsx
// Floating mini-TOC shown on hover when a response has 3+ headings.

import { createSignal, For, Show, type Component } from 'solid-js';
import { AlignLeft } from 'lucide-solid';

export interface OutlineHeading {
  id: string;
  text: string;
  depth: number; // 1-6
}

interface ResponseOutlineProps {
  headings: OutlineHeading[];
  containerRef: HTMLElement;
}

export const ResponseOutline: Component<ResponseOutlineProps> = (props) => {
  const [visible, setVisible] = createSignal(false);

  const scrollTo = (id: string) => {
    // CSS.escape handles edge-case IDs (numbers, special chars)
    const target = props.containerRef.querySelector(
      `#${CSS.escape(id)}`,
    ) as HTMLElement | null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      class="absolute top-2 right-2 z-10"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* Toggle button */}
      <button
        class="w-6 h-6 rounded flex items-center justify-center transition-opacity opacity-40 hover:opacity-100"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-secondary)',
          color: 'var(--color-text-tertiary)',
        }}
        aria-label="Show table of contents"
        title="Table of contents"
      >
        <AlignLeft size={12} />
      </button>

      {/* TOC dropdown */}
      <Show when={visible()}>
        <nav
          class="absolute right-0 top-7 w-52 rounded-lg p-1.5 space-y-0.5"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            'box-shadow': '0 4px 16px rgba(0,0,0,0.3)',
          }}
          aria-label="Table of contents"
        >
          <For each={props.headings}>
            {(h) => (
              <button
                class="block w-full text-left rounded px-2 py-1 text-[11px] truncate transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{
                  'padding-left': `${(h.depth - 1) * 10 + 8}px`,
                  color:
                    h.depth === 1
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                }}
                onClick={() => scrollTo(h.id)}
              >
                {h.text}
              </button>
            )}
          </For>
        </nav>
      </Show>
    </div>
  );
};
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

---

### Task C3: Mount `ResponseOutline` from `MarkdownContent` + tests + final checks

**Files:**
- Modify: `src/components/conversation/MarkdownContent.tsx`
- Modify: `src/components/conversation/MarkdownContent.test.tsx`

**Step 1: Import `ResponseOutline` in `MarkdownContent.tsx`**

```typescript
import { ResponseOutline, type OutlineHeading } from './ResponseOutline';
```

**Step 2: Mount ResponseOutline in post-processing**

Inside the `requestAnimationFrame` callback (the existing post-processing block), at the **end** of the block (after all other DOM work), add:

```typescript
// --- Anchor link TOC (CHI-197) ---
// Collect headings that have IDs (set by the heading renderer in step C1)
const headingEls = Array.from(
  containerRef!.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'),
);
if (headingEls.length >= 3) {
  const headings: OutlineHeading[] = headingEls.map((el) => ({
    id: el.id,
    text: el.innerText,
    depth: parseInt(el.tagName[1], 10),
  }));
  const container = containerRef!;
  // Ensure the container can host absolute-positioned children
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  const outlineMount = document.createElement('div');
  outlineMount.className = 'response-outline-host';
  container.appendChild(outlineMount);
  const disposeOutline = solidRender(
    () => <ResponseOutline headings={headings} containerRef={container} />,
    outlineMount,
  );
  disposers.push(disposeOutline);
}
```

**Step 3: Write 2 tests in `MarkdownContent.test.tsx`**

Append a new `describe` block:

```tsx
describe('Response anchor links (CHI-197)', () => {
  it('headings have id attributes (slugified)', async () => {
    const { container } = render(() => (
      <MarkdownContent
        content={'# Hello World\n\nSome text.\n\n## Second Section\n\nMore text.'}
        messageId="test-anchors"
      />
    ));
    await waitFor(() => {
      const h1 = container.querySelector('h1');
      expect(h1).toBeTruthy();
      expect(h1!.id).toBe('hello-world');
      const h2 = container.querySelector('h2');
      expect(h2!.id).toBe('second-section');
    });
  });

  it('shows TOC button when response has 3 or more headings', async () => {
    const md = '# A\n\ntext\n\n## B\n\ntext\n\n### C\n\ntext';
    const { getByLabelText } = render(() => (
      <MarkdownContent content={md} messageId="test-toc" />
    ));
    await waitFor(() => {
      expect(getByLabelText('Show table of contents')).toBeInTheDocument();
    });
  });

  it('does NOT show TOC button when response has fewer than 3 headings', async () => {
    const md = '# A\n\ntext\n\n## B\n\ntext';
    const { queryByLabelText } = render(() => (
      <MarkdownContent content={md} messageId="test-no-toc" />
    ));
    await waitFor(() => {
      expect(queryByLabelText('Show table of contents')).not.toBeInTheDocument();
    });
  });
});
```

**Step 4: Run tests**

```bash
npx vitest run src/components/conversation/MarkdownContent.test.tsx
```

Expected: all existing tests + 3 new tests pass.

**Step 5: Full checks + commit**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

```bash
git add src/components/conversation/MarkdownContent.tsx src/components/conversation/ResponseOutline.tsx src/components/conversation/MarkdownContent.test.tsx
git commit -m "CHI-197: add response anchor links and floating mini-TOC"
```

---

## Part D — CHI-205: Unit Tests — Code Block & Mermaid Renderers

### Task D1: Create `CodeBlockRenderer.test.tsx`

**Files:**
- Create: `src/components/conversation/renderers/CodeBlockRenderer.test.tsx`

These tests exercise the code block toolbar that `MarkdownContent.tsx` injects via DOM post-processing.

**Note:** Before writing, open `src/components/conversation/MarkdownContent.tsx` and find the post-processing code that creates the copy button, line-numbers toggle, and word-wrap toggle. Confirm the exact `aria-label` values and CSS class names used. The test code below uses the most likely values — adjust to match the actual implementation.

**Step 1: Write the test file**

```tsx
// src/components/conversation/renderers/CodeBlockRenderer.test.tsx
// Unit tests for the code block toolbar post-processed by MarkdownContent (CHI-183).
// MarkdownContent is used as the test harness since CodeBlockRenderer logic lives
// in its post-processing createEffect.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import MarkdownContent from '../MarkdownContent';

// ---- helpers ---------------------------------------------------------------

function renderCodeBlock(lang: string, code: string, messageId = 'test') {
  return render(() => (
    <MarkdownContent
      content={`\`\`\`${lang}\n${code}\n\`\`\``}
      messageId={messageId}
    />
  ));
}

// ---- setup -----------------------------------------------------------------

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---- tests -----------------------------------------------------------------

describe('CodeBlockRenderer — line numbers (CHI-183)', () => {
  it('line numbers are visible by default', async () => {
    const { container } = renderCodeBlock('typescript', 'const x = 1;\nconst y = 2;');
    // Wait for post-processing
    await waitFor(() => {
      // Line number "1" should appear in the gutter
      expect(container.querySelector('.line-numbers')).toBeTruthy();
    });
    // Both line 1 and line 2 visible
    const lineNums = container.querySelectorAll('.line-numbers span, .line-number');
    expect(lineNums.length).toBeGreaterThanOrEqual(2);
  });

  it('line numbers toggle hides and shows the gutter', async () => {
    const { container } = renderCodeBlock('typescript', 'const x = 1;');
    await waitFor(() => expect(container.querySelector('.line-numbers')).toBeTruthy());

    const toggle = screen.getByLabelText('Toggle line numbers');
    fireEvent.click(toggle);

    await waitFor(() => {
      const gutter = container.querySelector('.line-numbers');
      // Hidden by CSS class or removed from DOM — either is acceptable
      const isHidden =
        gutter === null ||
        (gutter as HTMLElement).style.display === 'none' ||
        (gutter as HTMLElement).classList.contains('hidden');
      expect(isHidden).toBe(true);
    });
  });
});

describe('CodeBlockRenderer — language badge (CHI-183)', () => {
  it('shows the correct language label', async () => {
    renderCodeBlock('python', 'print("hello")');
    await waitFor(() => {
      expect(screen.getByText('python')).toBeInTheDocument();
    });
  });

  it('shows "typescript" for tsx blocks', async () => {
    renderCodeBlock('tsx', 'const x = <div />;');
    await waitFor(() => {
      // Either "tsx" or "typescript" is acceptable
      const badge =
        screen.queryByText('tsx') ?? screen.queryByText('typescript');
      expect(badge).toBeTruthy();
    });
  });
});

describe('CodeBlockRenderer — copy button (CHI-183)', () => {
  it('copy button calls navigator.clipboard.writeText with the code content', async () => {
    renderCodeBlock('bash', 'echo hello world');
    await waitFor(() => expect(screen.getByLabelText('Copy code')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Copy code'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('echo hello world\n');
  });

  it('shows checkmark feedback for 2s then resets to copy icon', async () => {
    renderCodeBlock('bash', 'echo hello');
    await waitFor(() => expect(screen.getByLabelText('Copy code')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Copy code'));

    // Immediately after: feedback state (either "Copied!" label or check icon present)
    await waitFor(() => {
      const copied =
        screen.queryByLabelText('Copied!') ?? screen.queryByText('Copied!');
      expect(copied).toBeTruthy();
    });

    // After 2 s: reverts
    vi.advanceTimersByTime(2000);
    await waitFor(() => {
      const copied =
        screen.queryByLabelText('Copied!') ?? screen.queryByText('Copied!');
      expect(copied).toBeFalsy();
      expect(screen.getByLabelText('Copy code')).toBeInTheDocument();
    });
  });
});

describe('CodeBlockRenderer — word wrap toggle (CHI-183)', () => {
  it('word-wrap toggle applies and removes wrap CSS class on the pre element', async () => {
    const { container } = renderCodeBlock('text', 'a very long line that would scroll horizontally');
    await waitFor(() => expect(screen.getByLabelText('Toggle word wrap')).toBeInTheDocument());

    const pre = container.querySelector('pre')!;
    expect(pre).toBeTruthy();

    // Before toggle: wrapping off
    const hasWrap = () =>
      pre.classList.contains('code-wrap') ||
      pre.style.whiteSpace === 'pre-wrap';
    expect(hasWrap()).toBe(false);

    fireEvent.click(screen.getByLabelText('Toggle word wrap'));
    expect(hasWrap()).toBe(true);

    // Click again: wrapping off
    fireEvent.click(screen.getByLabelText('Toggle word wrap'));
    expect(hasWrap()).toBe(false);
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run src/components/conversation/renderers/CodeBlockRenderer.test.tsx
```

If any selector doesn't match (e.g., wrong aria-label), open `MarkdownContent.tsx` and find the exact label used in the post-processing block, then update the test accordingly.

**Step 3: Commit**

```bash
git add src/components/conversation/renderers/CodeBlockRenderer.test.tsx
git commit -m "CHI-205: add CodeBlockRenderer unit tests for code block toolbar"
```

---

### Task D2: Add missing test to `MermaidRenderer.test.tsx` + final checks

**Files:**
- Modify: `src/components/conversation/renderers/MermaidRenderer.test.tsx`

**Step 1: Confirm which test is missing**

Open `MermaidRenderer.test.tsx` (128 lines, 9 tests). The CHI-205 spec lists "Lazy import triggered only on first mermaid block" as required. The current 9 tests cover: SVG render, loading state, error fallback, fullscreen open, fullscreen close (button), fullscreen close (backdrop), dark theme, and registry registration. The lazy-import test is missing.

**Step 2: Add the test**

Append inside the existing `describe('MermaidRenderer (CHI-182)', ...)` block:

```typescript
it('dynamic import of mermaid is lazy — initialize not called before first render', () => {
  // This verifies the module does NOT call mermaid.initialize at import time.
  // initializeMock is wired at module-level via vi.mock('mermaid').
  // If initialize were called eagerly (at module load), it would have been called
  // before any test renders. The beforeEach clears mocks, so we check it starts at 0
  // without rendering any component.
  expect(initializeMock).not.toHaveBeenCalled();
});

it('renders multiple diagrams without calling mermaid.initialize more than once each', async () => {
  // Each MermaidRenderer instance initializes mermaid once in its own onMount.
  // Verify the second render also calls initialize (not skipped).
  render(() => <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />);
  await waitFor(() => expect(initializeMock).toHaveBeenCalledTimes(1));

  vi.clearAllMocks();
  render(() => <MermaidRenderer code={'graph TD\n  B-->C'} lang="mermaid" />);
  await waitFor(() => expect(initializeMock).toHaveBeenCalledTimes(1));
});
```

**Step 3: Run all MermaidRenderer tests**

```bash
npx vitest run src/components/conversation/renderers/MermaidRenderer.test.tsx
```

Expected: 11 tests pass.

**Step 4: Full frontend + backend checks**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx prettier --check .
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

**Step 5: Commit**

```bash
git add src/components/conversation/renderers/MermaidRenderer.test.tsx
git commit -m "CHI-205: add missing lazy-import tests to MermaidRenderer.test.tsx"
```

---

## Part E — CHI-211: E2E Tests — Rich Content Rendering

### Task E1: Create `conversation-rendering.spec.ts`

**Files:**
- Create: `tests/e2e/conversation/conversation-rendering.spec.ts`

**Note:** This spec uses `window.__TAURI_INTERNALS__.invoke` to seed test data via IPC before each test. The `seedConversation` helper creates a throwaway project + session + message then clicks through the sidebar. If the `create_project` IPC signature differs from what's used below, check `src-tauri/src/commands/project.rs` for the exact param names.

**Step 1: Write the spec**

```typescript
// tests/e2e/conversation/conversation-rendering.spec.ts
// E2E tests for rich content rendering (CHI-211).
// Covers: GFM tables (CHI-181), Mermaid (CHI-182), enhanced code blocks (CHI-183),
//         renderer registry (CHI-186).

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app';

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

const TABLE_MD = `
| Name  | Role   | Status |
|-------|--------|--------|
| Alice | Admin  | Active |
| Bob   | Editor | Idle   |
`.trim();

const MERMAID_MD = [
  '```mermaid',
  'graph TD',
  '  A[Start] --> B[Process]',
  '  B --> C[End]',
  '```',
].join('\n');

const CODE_TS_MD = [
  '```typescript',
  'const greet = (name: string): string => {',
  '  return `Hello, ${name}!`;',
  '};',
  '```',
].join('\n');

const WIDE_TABLE_MD = `
| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 |
|----|----|----|----|----|----|----|----|----|-----|
| a  | b  | c  | d  | e  | f  | g  | h  | i  | j   |
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed the DB with a throwaway project + session + single assistant message,
 * then navigate the UI to that session.
 * Returns the session ID for cleanup if needed.
 */
async function seedAndLoad(page: Page, content: string): Promise<string> {
  const sessionId = await page.evaluate(
    async ([msgContent]: [string]) => {
      const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
        cmd: string,
        args?: Record<string, unknown>,
      ) => Promise<unknown>;

      const project = (await invoke('create_project', {
        name: `__e2e_render_${Date.now()}`,
        path: `/tmp/e2e-render-${Date.now()}`,
      })) as { id: string };

      const session = (await invoke('create_session', {
        project_id: project.id,
        model: 'claude-sonnet-4-6',
      })) as { id: string };

      await invoke('save_message', {
        session_id: session.id,
        role: 'assistant',
        content: msgContent,
        tool_name: null,
        tool_input: null,
        tool_use_id: null,
        model: null,
        cost_cents: null,
        tokens_in: null,
        tokens_out: null,
      });

      return session.id;
    },
    [content] as [string],
  );

  // Reload so the new project/session appear in the sidebar
  await page.reload();
  await page.waitForSelector('.grain-overlay', { timeout: 15_000 });
  // Dismiss onboarding if it reappears
  try {
    const skip = page.getByRole('button', { name: 'Skip all' });
    await skip.waitFor({ timeout: 1_500 });
    await skip.click();
  } catch {
    /* no onboarding */
  }

  // Click the most recently created session in the sidebar.
  // Sessions appear in reverse-chronological order — the last created is first.
  const sessionItem = page.locator('[data-session-id]').first();
  await sessionItem.waitFor({ timeout: 5_000 });
  await sessionItem.click();
  await page.waitForTimeout(400);

  return sessionId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Rich Content Rendering (CHI-211)', () => {
  test('GFM table renders as <table>, not raw pipe characters', async ({ page }) => {
    await seedAndLoad(page, TABLE_MD);

    // A <table> element must exist in the message
    const table = page.locator('.message-bubble table, [data-role="assistant"] table').first();
    await expect(table).toBeVisible({ timeout: 6_000 });

    // Headers contain text, not pipe characters
    const firstHeader = table.locator('th').first();
    await expect(firstHeader).not.toContainText('|');
    await expect(firstHeader).toContainText('Name');
  });

  test('mermaid code block renders SVG instead of plain code', async ({ page }) => {
    await seedAndLoad(page, MERMAID_MD);

    // SVG rendered inside the message
    await expect(
      page.locator('.message-bubble svg, [data-role="assistant"] svg').first(),
    ).toBeVisible({ timeout: 10_000 });

    // No raw mermaid source in a <code> block
    const rawCode = page.locator('[data-role="assistant"] code').filter({
      hasText: 'graph TD',
    });
    await expect(rawCode).not.toBeVisible();
  });

  test('typescript code block shows line-number gutter and language badge', async ({ page }) => {
    await seedAndLoad(page, CODE_TS_MD);

    // Language badge (e.g. "typescript" or "ts")
    const badge = page
      .locator('.message-bubble, [data-role="assistant"]')
      .filter({ hasText: 'typescript' })
      .first();
    await expect(badge).toBeVisible({ timeout: 6_000 });

    // Line numbers gutter present
    const lineNumGutter = page.locator('.line-numbers, [data-testid="line-numbers"]').first();
    await expect(lineNumGutter).toBeVisible({ timeout: 6_000 });
    await expect(lineNumGutter).toContainText('1');
  });

  test('copy button on code block writes to clipboard and shows feedback', async ({ page }) => {
    await seedAndLoad(page, CODE_TS_MD);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const copyBtn = page.getByLabel('Copy code');
    await expect(copyBtn).toBeVisible({ timeout: 6_000 });
    await copyBtn.click();

    // Clipboard receives the code
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('greet');

    // Feedback: "Copied!" label or checkmark appears
    const feedback = page.getByLabel('Copied!');
    await expect(feedback).toBeVisible({ timeout: 2_000 });
  });

  test('mermaid fullscreen button opens modal dialog containing SVG', async ({ page }) => {
    await seedAndLoad(page, MERMAID_MD);

    // Wait for SVG
    await expect(
      page.locator('.message-bubble svg, [data-role="assistant"] svg').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Open fullscreen
    await page.getByLabel('Open diagram fullscreen').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(dialog.locator('svg')).toBeVisible();
  });

  test('renderer registry hydrates mermaid placeholder into SVG component', async ({ page }) => {
    await seedAndLoad(page, MERMAID_MD);

    // The renderer registry should have replaced the placeholder <div> with an SVG
    await expect(
      page.locator('.message-bubble svg, [data-role="assistant"] svg').first(),
    ).toBeVisible({ timeout: 10_000 });

    // The renderer-placeholder div itself should no longer be empty
    const placeholder = page.locator('[data-renderer="mermaid"]');
    // Either not present (replaced) or contains SVG
    if ((await placeholder.count()) > 0) {
      await expect(placeholder.locator('svg')).toBeVisible();
    }
  });

  test('wide table has horizontal-scroll wrapper (overflow-x: auto)', async ({ page }) => {
    await seedAndLoad(page, WIDE_TABLE_MD);

    const wrapper = page
      .locator('.message-bubble .table-scroll-wrapper, [data-role="assistant"] .table-scroll-wrapper')
      .first();
    await expect(wrapper).toBeVisible({ timeout: 6_000 });
    // The wrapper allows overflow scrolling
    const overflow = await wrapper.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(overflow).toMatch(/auto|scroll/);
  });
});
```

**Step 2: Run the E2E spec**

```bash
npx playwright test tests/e2e/conversation/conversation-rendering.spec.ts --reporter=list
```

If `[data-session-id]` doesn't exist on sidebar items, open `src/components/layout/Sidebar.tsx` and find what attribute identifies session items, then update the `seedAndLoad` helper accordingly. Common alternatives: `data-testid`, class name, or ARIA role.

If the `create_session` IPC expects different params (e.g., `name` is required), check `src-tauri/src/commands/session.rs` and adjust the helper.

**Step 3: Fix any failures**

Run individual tests with `--grep` to isolate issues:

```bash
npx playwright test tests/e2e/conversation/conversation-rendering.spec.ts --grep "GFM table"
```

---

### Task E2: Final checks + commit

**Step 1: Run all tests**

```bash
npx vitest run
npx playwright test tests/e2e/conversation/conversation-rendering.spec.ts
```

**Step 2: Full lint + build**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

**Step 3: Commit**

```bash
git add tests/e2e/conversation/conversation-rendering.spec.ts
git commit -m "CHI-211: add E2E tests for rich content rendering (tables, Mermaid, code blocks)"
```

---

## Final Commit Summary

After all parts are complete:

```
CHI-203: symbol @fn:/@class:/@var: mention — scan_symbols backend, list_symbols IPC,
         FileMentionMenu symbol mode, MessageInput trigger + contextStore.addSymbolAttachment
CHI-196: per-message raw markdown formatting toggle (Eye/EyeOff in MessageBubble)
CHI-197: heading anchor IDs + ResponseOutline floating mini-TOC (≥3 headings)
CHI-205: CodeBlockRenderer.test.tsx (6 tests) + MermaidRenderer lazy-import tests
CHI-211: E2E rich content rendering spec (7 scenarios: table, mermaid, code blocks, fullscreen)
```
