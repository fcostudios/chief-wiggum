# CHI-125, CHI-127, CHI-126/128, CHI-137: Context Intelligence, i18n, Message Edit

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add context quality scoring and smart file suggestions to the attachment system, build i18n infrastructure with Spanish locale support, and implement message edit/regenerate.

**Architecture:** CHI-125 adds a frontend scoring engine (`contextScoring.ts`) that computes relevance, token cost, and freshness scores per attachment — displayed on ContextChips and in a Cmd+Shift+T breakdown modal. CHI-127 adds a Rust backend import parser (`files/suggestions.rs`) + IPC command that analyzes attached files' imports, test file patterns, and conversation keywords to suggest related files. CHI-126 installs `@solid-primitives/i18n`, creates an `i18nStore.ts` with lazy-loaded locale JSON, and extracts ~120 hardcoded strings from 17+ components. CHI-128 provides Spanish translations. CHI-137 adds `delete_messages_after` + `update_message_content` backend queries, wires edit/regenerate hover actions on MessageBubble, and cascades deletion through tool_use/thinking message pairs.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, lucide-solid, Tauri v2 IPC, Rust (regex for import parsing), @solid-primitives/i18n

---

## Task 1: Context Scoring Engine (CHI-125)

**Files:**
- Create: `src/lib/contextScoring.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add scoring types to types.ts**

In `src/lib/types.ts`, add after the existing `ContextAttachment` interface:

```typescript
/** Quality score for an attached file in the current conversation context. */
export interface ContextQualityScore {
  /** Overall quality 0-100. Green >= 60, Yellow >= 30, Red < 30. */
  overall: number;
  /** Keyword overlap between file content/name and conversation history. */
  relevance: number;
  /** Inverse token cost factor — smaller files score higher. */
  tokenEfficiency: number;
  /** Whether the file has been modified since attachment (stale = true). */
  isStale: boolean;
  /** Human-readable quality label. */
  label: 'high' | 'medium' | 'low';
}
```

**Step 2: Create contextScoring.ts**

```typescript
// src/lib/contextScoring.ts
// Context quality scoring engine for attached files.
// Computes relevance, token efficiency, and staleness per CHI-125.

import type { ContextAttachment, ContextQualityScore, Message } from '@/lib/types';

/** Extract keywords from conversation messages (nouns, identifiers). */
export function extractConversationKeywords(messages: Message[]): string[] {
  const text = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();

  // Extract words 3+ chars, skip common stop words
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
    'will', 'would', 'could', 'should', 'about', 'there', 'their', 'what',
    'when', 'where', 'which', 'while', 'into', 'some', 'than', 'then',
    'them', 'these', 'they', 'also', 'just', 'more', 'other', 'only',
    'can', 'may', 'not', 'but', 'how', 'all', 'any', 'was', 'are',
  ]);

  const words = text.match(/[a-z_][a-z0-9_]{2,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))];
}

/** Score a single attachment against conversation keywords. */
export function scoreAttachment(
  attachment: ContextAttachment,
  conversationKeywords: string[],
): ContextQualityScore {
  const ref = attachment.reference;
  const fileName = ref.name.toLowerCase().replace(/\.[^.]+$/, ''); // strip extension
  const filePath = ref.relative_path.toLowerCase();

  // --- Relevance (0-100) ---
  // Check how many conversation keywords appear in the file name/path
  let relevanceHits = 0;
  for (const keyword of conversationKeywords) {
    if (filePath.includes(keyword) || fileName.includes(keyword)) {
      relevanceHits++;
    }
  }
  const relevance = conversationKeywords.length > 0
    ? Math.min(100, Math.round((relevanceHits / Math.min(conversationKeywords.length, 10)) * 100))
    : 50; // neutral if no conversation yet

  // --- Token Efficiency (0-100) ---
  // Smaller files are more efficient. Sweet spot ~500-2000 tokens.
  const tokens = ref.estimated_tokens;
  let tokenEfficiency: number;
  if (tokens <= 2000) tokenEfficiency = 100;
  else if (tokens <= 5000) tokenEfficiency = 80;
  else if (tokens <= 10000) tokenEfficiency = 50;
  else if (tokens <= 30000) tokenEfficiency = 25;
  else tokenEfficiency = 10;

  // --- Overall Score ---
  const overall = Math.round(relevance * 0.6 + tokenEfficiency * 0.4);

  // --- Label ---
  const label = overall >= 60 ? 'high' : overall >= 30 ? 'medium' : 'low';

  return {
    overall,
    relevance,
    tokenEfficiency,
    isStale: false, // Freshness check requires mtime comparison (future enhancement)
    label,
  };
}

/** Score all attachments at once. Returns a Map keyed by attachment ID. */
export function scoreAllAttachments(
  attachments: ContextAttachment[],
  messages: Message[],
): Map<string, ContextQualityScore> {
  const keywords = extractConversationKeywords(messages);
  const scores = new Map<string, ContextQualityScore>();
  for (const att of attachments) {
    scores.set(att.id, scoreAttachment(att, keywords));
  }
  return scores;
}

/** Get CSS color token for a quality label. */
export function qualityColor(label: 'high' | 'medium' | 'low'): string {
  switch (label) {
    case 'high': return 'var(--color-success)';
    case 'medium': return 'var(--color-warning)';
    case 'low': return 'var(--color-error)';
  }
}
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/lib/contextScoring.ts src/lib/types.ts
git commit -m "feat: context quality scoring engine with relevance and token efficiency (CHI-125)"
```

---

## Task 2: Quality Badges on ContextChip + Scoring in ContextStore (CHI-125)

**Files:**
- Modify: `src/stores/contextStore.ts`
- Modify: `src/components/conversation/ContextChip.tsx`

**Step 1: Add scores state and computation to contextStore**

In `src/stores/contextStore.ts`, add imports:

```typescript
import type { ContextQualityScore } from '@/lib/types';
import { scoreAllAttachments } from '@/lib/contextScoring';
import { conversationState } from '@/stores/conversationStore';
```

Add to `ContextState` interface:

```typescript
scores: Record<string, ContextQualityScore>;
```

Initial state:

```typescript
scores: {},
```

Add scoring function:

```typescript
/** Recalculate quality scores for all attachments. */
export function recalculateScores(): void {
  const scoresMap = scoreAllAttachments(state.attachments, conversationState.messages);
  const scoresRecord: Record<string, ContextQualityScore> = {};
  for (const [id, score] of scoresMap) {
    scoresRecord[id] = score;
  }
  setState('scores', scoresRecord);
}
```

Call `recalculateScores()` at the end of `addFileReference()` and `removeAttachment()`.

**Step 2: Add quality badge to ContextChip**

In `ContextChip.tsx`, add imports:

```typescript
import { contextState } from '@/stores/contextStore';
import { qualityColor } from '@/lib/contextScoring';
```

Add a derived score accessor inside the component:

```typescript
const score = () => contextState.scores[props.attachment.id];
```

After the token estimate display (existing line showing `~{tokens}`), add the quality dot:

```tsx
<Show when={score()}>
  <span
    class="w-1.5 h-1.5 rounded-full shrink-0"
    style={{ background: qualityColor(score()!.label) }}
    title={`Quality: ${score()!.label} (${score()!.overall}/100)`}
    aria-label={`Context quality: ${score()!.label}`}
  />
</Show>
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/stores/contextStore.ts src/components/conversation/ContextChip.tsx
git commit -m "feat: quality score badges on ContextChips with auto-recalculation (CHI-125)"
```

---

## Task 3: Context Breakdown Modal (CHI-125)

**Files:**
- Create: `src/components/conversation/ContextBreakdownModal.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/lib/keybindings.ts`
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Add modal visibility to uiStore**

In `src/stores/uiStore.ts`, add to `UIState`:

```typescript
contextBreakdownVisible: boolean;
```

Initial state: `contextBreakdownVisible: false,`

Add mutations:

```typescript
export function openContextBreakdown() { setState('contextBreakdownVisible', true); }
export function closeContextBreakdown() { setState('contextBreakdownVisible', false); }
```

**Step 2: Add Cmd+Shift+T keybinding**

In `src/lib/keybindings.ts`, add import for `openContextBreakdown` from uiStore, and add handler:

```typescript
// Cmd+Shift+T — Open context breakdown
if (meta && shift && e.key === 'T') {
  e.preventDefault();
  openContextBreakdown();
  return;
}
```

**Step 3: Create ContextBreakdownModal**

```typescript
// src/components/conversation/ContextBreakdownModal.tsx
// Modal showing context budget, per-file quality scores, and removal suggestions.

import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { X, File, AlertTriangle } from 'lucide-solid';
import { closeContextBreakdown } from '@/stores/uiStore';
import { contextState, removeAttachment, getTotalEstimatedTokens } from '@/stores/contextStore';
import { qualityColor } from '@/lib/contextScoring';
import type { ContextQualityScore } from '@/lib/types';

const TOKEN_BUDGET = 100_000;

const ContextBreakdownModal: Component = () => {
  const totalTokens = () => getTotalEstimatedTokens();
  const budgetPercent = () => Math.round((totalTokens() / TOKEN_BUDGET) * 100);

  // Find lowest-quality attachment for suggestion
  const weakestAttachment = () => {
    let worst: { id: string; name: string; tokens: number; score: ContextQualityScore } | null = null;
    for (const att of contextState.attachments) {
      const score = contextState.scores[att.id];
      if (score && (!worst || score.overall < worst.score.overall)) {
        worst = { id: att.id, name: att.reference.name, tokens: att.reference.estimated_tokens, score };
      }
    }
    return worst;
  };

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeContextBreakdown();
    }
  }

  function formatTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      on:keydown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) closeContextBreakdown(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Context Budget"
    >
      <div
        class="w-full max-w-lg rounded-lg overflow-hidden animate-fade-in"
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          class="flex items-center justify-between px-5 py-3"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <h2 class="text-sm font-semibold text-text-primary">Context Budget</h2>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            onClick={closeContextBreakdown}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Budget bar */}
        <div class="px-5 py-4">
          <div class="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>Total: {formatTokens(totalTokens())} / {formatTokens(TOKEN_BUDGET)} tokens</span>
            <span>{budgetPercent()}%</span>
          </div>
          <div
            class="w-full h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--color-bg-inset)' }}
          >
            <div
              class="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(budgetPercent(), 100)}%`,
                background: budgetPercent() > 80 ? 'var(--color-error)' : budgetPercent() > 50 ? 'var(--color-warning)' : 'var(--color-accent)',
                'transition-duration': 'var(--duration-normal)',
              }}
            />
          </div>
        </div>

        {/* File list */}
        <div class="px-5 pb-2 max-h-64 overflow-y-auto">
          <Show when={contextState.attachments.length > 0} fallback={
            <p class="text-xs text-text-tertiary py-4 text-center">No files attached</p>
          }>
            <div class="space-y-1">
              <For each={contextState.attachments}>
                {(att) => {
                  const score = () => contextState.scores[att.id];
                  return (
                    <div
                      class="flex items-center gap-3 px-3 py-2 rounded-md"
                      style={{ background: 'var(--color-bg-secondary)' }}
                    >
                      <File size={12} class="shrink-0 text-text-tertiary" />
                      <span class="flex-1 text-xs text-text-primary truncate">{att.reference.name}</span>
                      <span class="text-[10px] font-mono text-text-tertiary">
                        ~{formatTokens(att.reference.estimated_tokens)}
                      </span>
                      <Show when={score()}>
                        <span
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize"
                          style={{
                            color: qualityColor(score()!.label),
                            background: `color-mix(in srgb, ${qualityColor(score()!.label)} 15%, transparent)`,
                          }}
                        >
                          {score()!.label}
                        </span>
                      </Show>
                      <button
                        class="p-0.5 rounded text-text-tertiary hover:text-error transition-colors"
                        onClick={() => removeAttachment(att.id)}
                        aria-label={`Remove ${att.reference.name}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* Suggestion */}
        <Show when={weakestAttachment() && weakestAttachment()!.score.label === 'low'}>
          <div
            class="mx-5 mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-xs"
            style={{
              background: 'rgba(248, 81, 73, 0.08)',
              border: '1px solid rgba(248, 81, 73, 0.15)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <AlertTriangle size={12} class="shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
            <span>
              <strong>{weakestAttachment()!.name}</strong> has low relevance — consider removing it to save ~{formatTokens(weakestAttachment()!.tokens)} tokens.
            </span>
          </div>
        </Show>

        {/* Footer */}
        <div class="px-5 py-3" style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
          <p class="text-[10px] text-text-tertiary">
            Cmd+Shift+T to toggle &middot; Quality scores update as the conversation progresses
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContextBreakdownModal;
```

**Step 4: Wire into MainLayout**

In `src/components/layout/MainLayout.tsx`, add import and render:

```typescript
import ContextBreakdownModal from '@/components/conversation/ContextBreakdownModal';
```

```tsx
<Show when={uiState.contextBreakdownVisible}>
  <ContextBreakdownModal />
</Show>
```

**Step 5: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 6: Commit**

```bash
git add src/components/conversation/ContextBreakdownModal.tsx src/stores/uiStore.ts src/lib/keybindings.ts src/components/layout/MainLayout.tsx
git commit -m "feat: Context Breakdown Modal with Cmd+Shift+T (CHI-125)"
```

---

## Task 4: Backend Import Parser for Smart File Suggestions (CHI-127)

**Files:**
- Create: `src-tauri/src/files/suggestions.rs`
- Modify: `src-tauri/src/files/mod.rs`

**Step 1: Create suggestions.rs with import parsing**

```rust
// src-tauri/src/files/suggestions.rs
// Import graph analysis and file suggestion engine for CHI-127.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// A suggested file with reason and confidence.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileSuggestion {
    pub path: String,
    pub reason: String,
    pub confidence: f32,
    pub estimated_tokens: usize,
}

/// Parse import statements from file content based on extension.
pub fn parse_imports(content: &str, extension: &str) -> Vec<String> {
    match extension {
        "ts" | "tsx" | "js" | "jsx" => parse_ts_imports(content),
        "rs" => parse_rust_imports(content),
        "py" => parse_python_imports(content),
        _ => vec![],
    }
}

fn parse_ts_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        // import ... from '...' or import ... from "..."
        if let Some(from_idx) = trimmed.find(" from ") {
            let after = &trimmed[from_idx + 6..];
            let path = after.trim().trim_matches(|c| c == '\'' || c == '"' || c == ';');
            if path.starts_with('.') || path.starts_with('@/') {
                imports.push(path.to_string());
            }
        }
        // require('...')
        if let Some(start) = trimmed.find("require(") {
            let after = &trimmed[start + 8..];
            if let Some(end) = after.find(')') {
                let path = after[..end].trim_matches(|c| c == '\'' || c == '"');
                if path.starts_with('.') {
                    imports.push(path.to_string());
                }
            }
        }
    }
    imports
}

fn parse_rust_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        // mod foo; → foo.rs or foo/mod.rs
        if trimmed.starts_with("mod ") && trimmed.ends_with(';') {
            let name = trimmed[4..trimmed.len() - 1].trim();
            if !name.is_empty() && !name.contains(' ') {
                imports.push(format!("{}.rs", name));
            }
        }
        // use crate::foo::bar → foo/bar.rs
        if trimmed.starts_with("use crate::") {
            let path_part = trimmed[11..].split(';').next().unwrap_or("");
            let segments: Vec<&str> = path_part.split("::").collect();
            if !segments.is_empty() {
                imports.push(format!("{}.rs", segments[0]));
            }
        }
        // use super::foo → ../foo.rs
        if trimmed.starts_with("use super::") {
            let path_part = trimmed[11..].split(';').next().unwrap_or("");
            let segments: Vec<&str> = path_part.split("::").collect();
            if !segments.is_empty() {
                imports.push(format!("../{}.rs", segments[0]));
            }
        }
    }
    imports
}

fn parse_python_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        // from .foo import bar → foo.py
        if trimmed.starts_with("from .") {
            let rest = &trimmed[6..];
            if let Some(space_idx) = rest.find(' ') {
                let module = &rest[..space_idx];
                if !module.is_empty() {
                    imports.push(format!("{}.py", module.replace('.', "/")));
                }
            }
        }
    }
    imports
}

/// Suggest test file paths for a given file.
pub fn suggest_test_files(file_path: &str) -> Vec<String> {
    let path = Path::new(file_path);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    let parent = path.parent().and_then(|p| p.to_str()).unwrap_or("");

    let mut suggestions = Vec::new();
    match ext {
        "ts" | "tsx" => {
            suggestions.push(format!("{}/{}.test.ts", parent, stem));
            suggestions.push(format!("{}/{}.test.tsx", parent, stem));
            suggestions.push(format!("{}/{}.spec.ts", parent, stem));
        }
        "rs" => {
            // Rust tests are usually inline, but tests/ directory is common
            suggestions.push(format!("tests/{}.rs", stem));
        }
        "py" => {
            suggestions.push(format!("{}/test_{}.py", parent, stem));
            suggestions.push(format!("tests/test_{}.py", stem));
        }
        _ => {}
    }
    suggestions
}

/// Resolve an import path relative to the importing file, returning a relative path from project root.
pub fn resolve_import(import_path: &str, importing_file: &str, extension: &str) -> Option<String> {
    let importing = Path::new(importing_file);
    let parent = importing.parent()?;

    if import_path.starts_with("@/") {
        // Alias to src/
        let resolved = format!("src/{}", &import_path[2..]);
        return Some(add_extension_if_needed(&resolved, extension));
    }

    if import_path.starts_with('.') {
        let resolved = parent.join(import_path);
        let normalized = normalize_path(&resolved);
        return Some(add_extension_if_needed(&normalized.to_string_lossy(), extension));
    }

    None
}

fn add_extension_if_needed(path: &str, ext: &str) -> String {
    if Path::new(path).extension().is_some() {
        path.to_string()
    } else {
        format!("{}.{}", path, ext)
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => { components.pop(); }
            std::path::Component::CurDir => {}
            _ => { components.push(component); }
        }
    }
    components.iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ts_import_from() {
        let content = r#"import { Foo } from './foo';
import Bar from '../bar';
import type { Baz } from '@/lib/baz';"#;
        let imports = parse_ts_imports(content);
        assert_eq!(imports, vec!["./foo", "../bar", "@/lib/baz"]);
    }

    #[test]
    fn parse_rust_mod_and_use() {
        let content = r#"mod parser;
use crate::bridge::process;
use super::manager;"#;
        let imports = parse_rust_imports(content);
        assert_eq!(imports, vec!["parser.rs", "bridge.rs", "../manager.rs"]);
    }

    #[test]
    fn parse_python_relative_import() {
        let content = "from .utils import helper\nfrom .models.user import User";
        let imports = parse_python_imports(content);
        assert_eq!(imports, vec!["utils.py", "models/user.py"]);
    }

    #[test]
    fn suggest_test_files_ts() {
        let suggestions = suggest_test_files("src/lib/parser.ts");
        assert!(suggestions.contains(&"src/lib/parser.test.ts".to_string()));
    }

    #[test]
    fn resolve_alias_import() {
        let resolved = resolve_import("@/lib/types", "src/stores/foo.ts", "ts");
        assert_eq!(resolved, Some("src/lib/types.ts".to_string()));
    }

    #[test]
    fn resolve_relative_import() {
        let resolved = resolve_import("./bar", "src/foo.ts", "ts");
        assert_eq!(resolved, Some("src/bar.ts".to_string()));
    }
}
```

**Step 2: Register module in mod.rs**

In `src-tauri/src/files/mod.rs`, add:

```rust
pub mod suggestions;
```

**Step 3: Run tests**

Run: `cargo test -p chief-wiggum -- suggestions`
Expected: 6 tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/files/suggestions.rs src-tauri/src/files/mod.rs
git commit -m "feat: import parser and test file suggestion engine (CHI-127)"
```

---

## Task 5: File Suggestions IPC Command + Frontend (CHI-127)

**Files:**
- Modify: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/lib/types.ts`
- Create: `src/components/conversation/ContextSuggestions.tsx`
- Modify: `src/components/conversation/MessageInput.tsx`
- Modify: `src/stores/contextStore.ts`

**Step 1: Add IPC command to files.rs**

In `src-tauri/src/commands/files.rs`, add:

```rust
use crate::files::suggestions::{self, FileSuggestion};

/// Suggest files that may be relevant to attached context.
#[tauri::command(rename_all = "snake_case")]
pub fn get_file_suggestions(
    db: State<'_, Database>,
    project_id: String,
    attached_paths: Vec<String>,
    conversation_keywords: Vec<String>,
    limit: Option<usize>,
) -> Result<Vec<FileSuggestion>, AppError> {
    let project = crate::db::queries::get_project(&db, &project_id)?;
    let project_path = std::path::Path::new(&project.path);
    let limit = limit.unwrap_or(5);

    let mut all_suggestions: Vec<FileSuggestion> = Vec::new();
    let attached_set: std::collections::HashSet<&str> = attached_paths.iter().map(|s| s.as_str()).collect();

    for attached_path in &attached_paths {
        let full_path = project_path.join(attached_path);
        let content = std::fs::read_to_string(&full_path).unwrap_or_default();
        let ext = std::path::Path::new(attached_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        // Import-based suggestions
        let imports = suggestions::parse_imports(&content, ext);
        for import_path in &imports {
            if let Some(resolved) = suggestions::resolve_import(import_path, attached_path, ext) {
                if !attached_set.contains(resolved.as_str()) && project_path.join(&resolved).exists() {
                    let tokens = crate::files::scanner::estimate_tokens_for_file(&project_path.join(&resolved));
                    all_suggestions.push(FileSuggestion {
                        path: resolved.clone(),
                        reason: format!("imported by {}", attached_path),
                        confidence: 0.8,
                        estimated_tokens: tokens,
                    });
                }
            }
        }

        // Test file suggestions
        for test_path in suggestions::suggest_test_files(attached_path) {
            if !attached_set.contains(test_path.as_str()) && project_path.join(&test_path).exists() {
                let tokens = crate::files::scanner::estimate_tokens_for_file(&project_path.join(&test_path));
                all_suggestions.push(FileSuggestion {
                    path: test_path,
                    reason: "test file".to_string(),
                    confidence: 0.7,
                    estimated_tokens: tokens,
                });
            }
        }
    }

    // Deduplicate by path, keeping highest confidence
    let mut seen = std::collections::HashMap::new();
    for suggestion in all_suggestions {
        seen.entry(suggestion.path.clone())
            .and_modify(|existing: &mut FileSuggestion| {
                if suggestion.confidence > existing.confidence {
                    *existing = suggestion.clone();
                }
            })
            .or_insert(suggestion);
    }

    let mut results: Vec<FileSuggestion> = seen.into_values().collect();
    results.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}
```

Register in `main.rs` invoke handler: `commands::files::get_file_suggestions`

**Step 2: Add TypeScript types**

In `src/lib/types.ts`:

```typescript
export interface FileSuggestion {
  path: string;
  reason: string;
  confidence: number;
  estimated_tokens: number;
}
```

**Step 3: Add suggestions state to contextStore**

In `src/stores/contextStore.ts`:

```typescript
import type { FileSuggestion } from '@/lib/types';
```

Add to `ContextState`:

```typescript
suggestions: FileSuggestion[];
```

Initial state: `suggestions: [],`

Add function:

```typescript
/** Fetch smart file suggestions based on currently attached files. */
export async function refreshSuggestions(): Promise<void> {
  const project = getActiveProject();
  if (!project || state.attachments.length === 0) {
    setState('suggestions', []);
    return;
  }
  try {
    const attachedPaths = state.attachments.map((a) => a.reference.relative_path);
    const keywords = extractConversationKeywords(conversationState.messages);
    const suggestions = await invoke<FileSuggestion[]>('get_file_suggestions', {
      project_id: project.id,
      attached_paths: attachedPaths,
      conversation_keywords: keywords,
      limit: 5,
    });
    setState('suggestions', suggestions);
  } catch {
    setState('suggestions', []);
  }
}
```

Call `refreshSuggestions()` at the end of `addFileReference()` and `removeAttachment()`.

**Step 4: Create ContextSuggestions component**

```typescript
// src/components/conversation/ContextSuggestions.tsx
import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { Lightbulb, Plus } from 'lucide-solid';
import { contextState, addFileReference } from '@/stores/contextStore';
import type { FileSuggestion, FileReference } from '@/lib/types';

const ContextSuggestions: Component = () => {
  function handleAdd(suggestion: FileSuggestion) {
    const parts = suggestion.path.split('/');
    const name = parts[parts.length - 1];
    const ext = name.includes('.') ? name.split('.').pop() ?? null : null;
    const ref: FileReference = {
      relative_path: suggestion.path,
      name,
      extension: ext,
      estimated_tokens: suggestion.estimated_tokens,
      is_directory: false,
    };
    addFileReference(ref);
  }

  return (
    <Show when={contextState.suggestions.length > 0}>
      <div class="flex items-center gap-1.5 mb-2 max-w-4xl mx-auto overflow-x-auto">
        <Lightbulb size={10} style={{ color: 'var(--color-warning)' }} class="shrink-0" />
        <span class="text-[10px] text-text-tertiary shrink-0">Suggested:</span>
        <For each={contextState.suggestions}>
          {(suggestion) => (
            <button
              class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 transition-colors"
              style={{
                background: 'var(--color-bg-inset)',
                color: 'var(--color-text-secondary)',
                border: '1px dashed var(--color-border-secondary)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onClick={() => handleAdd(suggestion)}
              title={`${suggestion.path} — ${suggestion.reason} (~${suggestion.estimated_tokens} tokens)`}
            >
              <span class="truncate max-w-[120px]">{suggestion.path.split('/').pop()}</span>
              <Plus size={9} />
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

export default ContextSuggestions;
```

**Step 5: Wire into MessageInput**

In `MessageInput.tsx`, add import and render `<ContextSuggestions />` after the context chips bar (after the `Show when={getAttachmentCount() > 0}` block):

```tsx
import ContextSuggestions from '@/components/conversation/ContextSuggestions';

{/* After context chips bar */}
<ContextSuggestions />
```

**Step 6: Run verification**

Run: `cargo test -p chief-wiggum && npx tsc --noEmit && npx eslint .`
Expected: All pass

**Step 7: Commit**

```bash
git add src-tauri/src/commands/files.rs src-tauri/src/main.rs src/lib/types.ts src/stores/contextStore.ts src/components/conversation/ContextSuggestions.tsx src/components/conversation/MessageInput.tsx
git commit -m "feat: smart file suggestions with import parsing and test file detection (CHI-127)"
```

---

## Task 6: i18n Store and Infrastructure (CHI-126)

**Files:**
- Create: `src/stores/i18nStore.ts`
- Create: `src/locales/en.json`
- Modify: `src/App.tsx`

**Step 1: Install @solid-primitives/i18n**

Run: `npm install @solid-primitives/i18n`

**Step 2: Create English locale file**

Create `src/locales/en.json` with the core UI strings organized by namespace:

```json
{
  "common": {
    "close": "Close",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "delete": "Delete",
    "save": "Save",
    "retry": "Retry",
    "send": "Send",
    "stop": "Stop",
    "copy": "Copy",
    "search": "Search",
    "loading": "Loading...",
    "noResults": "No results"
  },
  "statusBar": {
    "cliNotFound": "CLI not found",
    "running": "Running",
    "starting": "Starting...",
    "error": "Error",
    "stopping": "Stopping...",
    "done": "Done",
    "ready": "Ready",
    "yolo": "YOLO",
    "dev": "DEV",
    "nActive": "{n} active",
    "exportDiagnostics": "Export Diagnostics"
  },
  "sidebar": {
    "projects": "Projects",
    "files": "Files",
    "actions": "Actions",
    "sessions": "Sessions",
    "openProject": "Open a project folder",
    "newSession": "New Session",
    "filterSessions": "Filter sessions...",
    "noSessions": "No sessions yet",
    "createToStart": "Create one to get started",
    "noMatching": "No matching sessions",
    "tryDifferent": "Try a different search term",
    "pinned": "Pinned",
    "recent": "Recent",
    "older": "Older",
    "rename": "Rename",
    "pin": "Pin",
    "unpin": "Unpin",
    "duplicate": "Duplicate",
    "deleteConfirm": "Delete this session and all its messages? This cannot be undone."
  },
  "conversation": {
    "emptyTitle": "Chief Wiggum",
    "emptySubtitle": "What would you like to work on?",
    "cliNotFoundTitle": "Claude Code CLI Not Found",
    "cliNotFoundSubtitle": "Install it to start chatting",
    "sampleExplain": "Explain this codebase",
    "sampleExplainDesc": "Get a high-level overview of the project architecture and key components",
    "sampleBug": "Find and fix a bug",
    "sampleBugDesc": "Describe a bug and let Claude investigate, diagnose, and fix it",
    "sampleFeature": "Write a new feature",
    "sampleFeatureDesc": "Describe what you want to build and Claude will implement it step by step",
    "jumpToLatest": "Jump to latest",
    "assistant": "Assistant",
    "thinking": "Thinking",
    "user": "You"
  },
  "permissions": {
    "required": "Permission Required",
    "lowRisk": "Low Risk",
    "mediumRisk": "Medium Risk",
    "highRisk": "High Risk",
    "deny": "Deny",
    "alwaysAllow": "Always Allow",
    "allowOnce": "Allow Once",
    "autoDenyIn": "Auto-deny in",
    "path": "Path:"
  },
  "input": {
    "placeholder": "Message Chief Wiggum... (@ to mention files)",
    "noBridge": "No CLI bridge connected"
  },
  "explorer": {
    "searchFiles": "Search files...",
    "noFiles": "No files",
    "noFilesFound": "No files found",
    "loadMore": "Load more"
  },
  "errors": {
    "couldNotLoadFiles": "Could not load files",
    "couldNotReadFile": "Could not read file",
    "slashCommandFailed": "Could not load slash commands",
    "folderNotAccessible": "Folder not accessible",
    "settingsNotSaved": "Settings could not be saved",
    "connectionTimeout": "Connection timed out"
  },
  "settings": {
    "title": "Settings",
    "appearance": "Appearance",
    "language": "Language",
    "cli": "CLI",
    "sessions": "Sessions",
    "keybindings": "Keybindings",
    "privacy": "Privacy",
    "advanced": "Advanced",
    "searchSettings": "Search settings...",
    "resetDefaults": "Reset to defaults"
  }
}
```

**Step 3: Create i18nStore.ts**

```typescript
// src/stores/i18nStore.ts
// Internationalization store using @solid-primitives/i18n.
// Loads locale JSON, provides t() function, supports locale switching.

import { createSignal } from 'solid-js';
import { createI18nContext, type Flatten } from '@solid-primitives/i18n';
import enLocale from '@/locales/en.json';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/i18n');

export type Locale = 'en' | 'es';
export type RawDictionary = typeof enLocale;

// Flatten the dictionary for dot-notation access
type FlatDict = Flatten<RawDictionary>;

const [locale, setLocale] = createSignal<Locale>('en');

// Initialize with English as the base dictionary
const [i18n, { add, locale: setI18nLocale }] = createI18nContext(
  { en: enLocale } as Record<string, RawDictionary>,
  'en',
);

/** Translate a key. Falls back to key name if missing. */
export function t(key: string): string {
  // Navigate nested keys via dot notation
  const parts = key.split('.');
  let current: unknown = i18n.dict[locale()];
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key; // Fallback to key
    }
  }
  return typeof current === 'string' ? current : key;
}

/** Switch locale. Lazy-loads locale JSON if not already loaded. */
export async function switchLocale(newLocale: Locale): Promise<void> {
  if (newLocale === 'en') {
    setLocale('en');
    setI18nLocale('en');
    return;
  }

  try {
    // Dynamic import for non-English locales
    const module = await import(`../locales/${newLocale}.json`);
    add(newLocale, module.default);
    setLocale(newLocale);
    setI18nLocale(newLocale);
    log.info(`Switched locale to ${newLocale}`);
  } catch (err) {
    log.error('Failed to load locale: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Get the current locale. */
export function currentLocale(): Locale {
  return locale();
}
```

**Step 4: Wire into App.tsx**

In `src/App.tsx`, import and initialize i18n based on settings:

```typescript
import { switchLocale, type Locale } from '@/stores/i18nStore';
```

In the existing `onMount`, after `loadSettings()`:

```typescript
// Set locale from settings
const settings = settingsState.settings;
if (settings.i18n.locale && settings.i18n.locale !== 'en') {
  switchLocale(settings.i18n.locale as Locale);
}
```

**Step 5: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 6: Commit**

```bash
git add src/stores/i18nStore.ts src/locales/en.json src/App.tsx package.json package-lock.json
git commit -m "feat: i18n infrastructure with @solid-primitives/i18n and English locale (CHI-126)"
```

---

## Task 7: Extract Hardcoded Strings — Batch 1 (CHI-126)

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Replace strings in StatusBar**

Import `t` from i18nStore:

```typescript
import { t } from '@/stores/i18nStore';
```

Replace hardcoded strings with `t()` calls. Examples:

- `"CLI not found"` → `{t('statusBar.cliNotFound')}`
- `"Running"` → `{t('statusBar.running')}`
- `"Ready"` → `{t('statusBar.ready')}`
- `"YOLO"` → `{t('statusBar.yolo')}`
- `"DEV"` → `{t('statusBar.dev')}`
- `"Export Diagnostics"` title → `{t('statusBar.exportDiagnostics')}`

**Step 2: Replace strings in Sidebar**

Import `t`:

```typescript
import { t } from '@/stores/i18nStore';
```

Replace:

- `"Projects"` → `{t('sidebar.projects')}`
- `"Files"` → `{t('sidebar.files')}`
- `"Actions"` → `{t('sidebar.actions')}`
- `"Sessions"` → `{t('sidebar.sessions')}`
- `"New Session"` → `{t('sidebar.newSession')}`
- `"No sessions yet"` → `{t('sidebar.noSessions')}`
- `"Create one to get started"` → `{t('sidebar.createToStart')}`
- `"Filter sessions..."` → `{t('sidebar.filterSessions')}`
- `"Rename"` / `"Pin"` / `"Unpin"` / `"Duplicate"` / `"Delete"` → respective `t()` calls

**Step 3: Replace strings in ConversationView**

Import `t`:

```typescript
import { t } from '@/stores/i18nStore';
```

Replace:

- `"Chief Wiggum"` → `{t('conversation.emptyTitle')}`
- `"What would you like to work on?"` → `{t('conversation.emptySubtitle')}`
- Sample prompt titles and descriptions → respective `t()` calls
- `"Jump to latest"` → `{t('conversation.jumpToLatest')}`
- `"Retry"` → `{t('common.retry')}`

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean — no visible behavior change (English strings identical)

**Step 5: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/components/layout/Sidebar.tsx src/components/conversation/ConversationView.tsx
git commit -m "feat: extract hardcoded strings from StatusBar, Sidebar, ConversationView (CHI-126)"
```

---

## Task 8: Extract Hardcoded Strings — Batch 2 (CHI-126)

**Files:**
- Modify: `src/components/permissions/PermissionDialog.tsx`
- Modify: `src/components/conversation/MessageInput.tsx`
- Modify: `src/components/explorer/FileTree.tsx`

**Step 1: Replace strings in PermissionDialog**

Import `t`:

```typescript
import { t } from '@/stores/i18nStore';
```

Replace:

- `"Permission Required"` → `{t('permissions.required')}`
- `"Low Risk"` / `"Medium Risk"` / `"High Risk"` → respective `t()` calls
- `"Deny"` / `"Always Allow"` / `"Allow Once"` → respective `t()` calls
- `"Auto-deny in"` → `{t('permissions.autoDenyIn')}`

**Step 2: Replace strings in MessageInput**

Import `t`:

```typescript
import { t } from '@/stores/i18nStore';
```

Replace:

- Placeholder text → `t('input.placeholder')` and `t('input.noBridge')`
- `"Send"` → `{t('common.send')}`
- `"Stop"` → `{t('common.stop')}`

**Step 3: Replace strings in FileTree**

Import `t`:

```typescript
import { t } from '@/stores/i18nStore';
```

Replace:

- `"Search files..."` → `{t('explorer.searchFiles')}`
- `"No files"` / `"No files found"` → respective `t()` calls
- `"Loading..."` → `{t('common.loading')}`

**Step 4: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/permissions/PermissionDialog.tsx src/components/conversation/MessageInput.tsx src/components/explorer/FileTree.tsx
git commit -m "feat: extract hardcoded strings from PermissionDialog, MessageInput, FileTree (CHI-126)"
```

---

## Task 9: Spanish Locale (CHI-128)

**Files:**
- Create: `src/locales/es.json`

**Step 1: Create Spanish translations**

Create `src/locales/es.json` mirroring the structure of `en.json`:

```json
{
  "common": {
    "close": "Cerrar",
    "cancel": "Cancelar",
    "confirm": "Confirmar",
    "delete": "Eliminar",
    "save": "Guardar",
    "retry": "Reintentar",
    "send": "Enviar",
    "stop": "Detener",
    "copy": "Copiar",
    "search": "Buscar",
    "loading": "Cargando...",
    "noResults": "Sin resultados"
  },
  "statusBar": {
    "cliNotFound": "CLI no encontrado",
    "running": "Ejecutando",
    "starting": "Iniciando...",
    "error": "Error",
    "stopping": "Deteniendo...",
    "done": "Listo",
    "ready": "Listo",
    "yolo": "YOLO",
    "dev": "DEV",
    "nActive": "{n} activas",
    "exportDiagnostics": "Exportar diagnósticos"
  },
  "sidebar": {
    "projects": "Proyectos",
    "files": "Archivos",
    "actions": "Acciones",
    "sessions": "Sesiones",
    "openProject": "Abrir una carpeta de proyecto",
    "newSession": "Nueva sesión",
    "filterSessions": "Filtrar sesiones...",
    "noSessions": "Aún no hay sesiones",
    "createToStart": "Cree una para comenzar",
    "noMatching": "No se encontraron sesiones",
    "tryDifferent": "Intente con otro término de búsqueda",
    "pinned": "Fijadas",
    "recent": "Recientes",
    "older": "Anteriores",
    "rename": "Renombrar",
    "pin": "Fijar",
    "unpin": "Desfijar",
    "duplicate": "Duplicar",
    "deleteConfirm": "¿Eliminar esta sesión y todos sus mensajes? Esta acción no se puede deshacer."
  },
  "conversation": {
    "emptyTitle": "Chief Wiggum",
    "emptySubtitle": "¿En qué le gustaría trabajar?",
    "cliNotFoundTitle": "CLI de Claude Code no encontrado",
    "cliNotFoundSubtitle": "Instálelo para comenzar a conversar",
    "sampleExplain": "Explicar este código",
    "sampleExplainDesc": "Obtenga una visión general de la arquitectura del proyecto y sus componentes principales",
    "sampleBug": "Encontrar y corregir un error",
    "sampleBugDesc": "Describa un error y permita que Claude lo investigue, diagnostique y corrija",
    "sampleFeature": "Escribir una nueva funcionalidad",
    "sampleFeatureDesc": "Describa lo que desea construir y Claude lo implementará paso a paso",
    "jumpToLatest": "Ir al último",
    "assistant": "Asistente",
    "thinking": "Pensando",
    "user": "Usted"
  },
  "permissions": {
    "required": "Permiso requerido",
    "lowRisk": "Riesgo bajo",
    "mediumRisk": "Riesgo medio",
    "highRisk": "Riesgo alto",
    "deny": "Denegar",
    "alwaysAllow": "Permitir siempre",
    "allowOnce": "Permitir una vez",
    "autoDenyIn": "Auto-denegar en",
    "path": "Ruta:"
  },
  "input": {
    "placeholder": "Escriba a Chief Wiggum... (@ para mencionar archivos)",
    "noBridge": "Sin conexión al CLI"
  },
  "explorer": {
    "searchFiles": "Buscar archivos...",
    "noFiles": "Sin archivos",
    "noFilesFound": "No se encontraron archivos",
    "loadMore": "Cargar más"
  },
  "errors": {
    "couldNotLoadFiles": "No se pudieron cargar los archivos",
    "couldNotReadFile": "No se pudo leer el archivo",
    "slashCommandFailed": "No se pudieron cargar los comandos",
    "folderNotAccessible": "Carpeta no accesible",
    "settingsNotSaved": "No se pudieron guardar las configuraciones",
    "connectionTimeout": "Tiempo de conexión agotado"
  },
  "settings": {
    "title": "Configuración",
    "appearance": "Apariencia",
    "language": "Idioma",
    "cli": "CLI",
    "sessions": "Sesiones",
    "keybindings": "Atajos de teclado",
    "privacy": "Privacidad",
    "advanced": "Avanzado",
    "searchSettings": "Buscar configuración...",
    "resetDefaults": "Restablecer valores predeterminados"
  }
}
```

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx vite build`
Expected: Clean build (JSON import should be handled by Vite)

**Step 3: Commit**

```bash
git add src/locales/es.json
git commit -m "feat: Spanish locale translations for all UI chrome (CHI-128)"
```

---

## Task 10: Backend Message Deletion and Update (CHI-137)

**Files:**
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add query functions to queries.rs**

```rust
/// Delete a single message by ID.
#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn delete_message(db: &Database, session_id: &str, message_id: &str) -> Result<(), AppError> {
    let conn = db.conn.lock();
    conn.execute(
        "DELETE FROM messages WHERE id = ?1 AND session_id = ?2",
        rusqlite::params![message_id, session_id],
    )?;
    Ok(())
}

/// Delete all messages in a session that were created after a given message ID.
/// Returns the number of deleted messages.
#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn delete_messages_after(
    db: &Database,
    session_id: &str,
    after_message_id: &str,
) -> Result<usize, AppError> {
    let conn = db.conn.lock();
    // Get the created_at timestamp of the reference message
    let created_at: String = conn.query_row(
        "SELECT created_at FROM messages WHERE id = ?1 AND session_id = ?2",
        rusqlite::params![after_message_id, session_id],
        |row| row.get(0),
    )?;
    let deleted = conn.execute(
        "DELETE FROM messages WHERE session_id = ?1 AND created_at > ?2",
        rusqlite::params![session_id, created_at],
    )?;
    Ok(deleted)
}

/// Update the content of an existing message.
#[tracing::instrument(target = "db/queries", level = "info", skip(db))]
pub fn update_message_content(
    db: &Database,
    message_id: &str,
    new_content: &str,
) -> Result<(), AppError> {
    let conn = db.conn.lock();
    conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        rusqlite::params![new_content, message_id],
    )?;
    Ok(())
}
```

**Step 2: Add IPC commands to session.rs**

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn delete_messages_after(
    db: State<'_, Database>,
    session_id: String,
    after_message_id: String,
) -> Result<usize, AppError> {
    crate::db::queries::delete_messages_after(&db, &session_id, &after_message_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_message_content(
    db: State<'_, Database>,
    message_id: String,
    new_content: String,
) -> Result<(), AppError> {
    crate::db::queries::update_message_content(&db, &message_id, &new_content)
}
```

**Step 3: Register in main.rs**

Add `commands::session::delete_messages_after` and `commands::session::update_message_content` to the invoke handler.

**Step 4: Run tests**

Run: `cargo test -p chief-wiggum`
Expected: All existing tests pass

**Step 5: Commit**

```bash
git add src-tauri/src/db/queries.rs src-tauri/src/commands/session.rs src-tauri/src/main.rs
git commit -m "feat: backend delete_messages_after and update_message_content IPC (CHI-137)"
```

---

## Task 11: Frontend Edit and Regenerate Functions (CHI-137)

**Files:**
- Modify: `src/stores/conversationStore.ts`

**Step 1: Add editMessage function**

```typescript
/** Edit a user message: update content, delete all messages after it, resend. */
export async function editMessage(
  messageId: string,
  newContent: string,
  sessionId: string,
): Promise<void> {
  // 1. Update the message content in DB
  try {
    await invoke('update_message_content', {
      message_id: messageId,
      new_content: newContent,
    });
  } catch (err) {
    log.error('Failed to update message: ' + (err instanceof Error ? err.message : String(err)));
    return;
  }

  // 2. Delete all messages after the edited one
  try {
    await invoke('delete_messages_after', {
      session_id: sessionId,
      after_message_id: messageId,
    });
  } catch (err) {
    log.error('Failed to delete subsequent messages: ' + (err instanceof Error ? err.message : String(err)));
  }

  // 3. Reload messages from DB to get clean state
  await loadMessages(sessionId);

  // 4. Resend the edited message
  await sendMessage(newContent, sessionId);
}

/** Regenerate an assistant response: delete it and resend the preceding user message. */
export async function regenerateResponse(
  assistantMessageId: string,
  sessionId: string,
): Promise<void> {
  // Find the preceding user message
  const msgIndex = state.messages.findIndex((m) => m.id === assistantMessageId);
  if (msgIndex < 0) return;

  // Walk backwards to find the user message before this assistant message
  let userMessage: Message | null = null;
  for (let i = msgIndex - 1; i >= 0; i--) {
    if (state.messages[i].role === 'user') {
      userMessage = state.messages[i];
      break;
    }
  }
  if (!userMessage) return;

  // Delete the assistant message and everything after it
  // We use the user message as the anchor — delete everything after it
  try {
    await invoke('delete_messages_after', {
      session_id: sessionId,
      after_message_id: userMessage.id,
    });
  } catch (err) {
    log.error('Failed to delete messages for regeneration: ' + (err instanceof Error ? err.message : String(err)));
    return;
  }

  // Reload messages
  await loadMessages(sessionId);

  // Resend the user message
  await sendMessage(userMessage.content, sessionId);
}
```

**Step 2: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/stores/conversationStore.ts
git commit -m "feat: editMessage and regenerateResponse store functions (CHI-137)"
```

---

## Task 12: Edit and Regenerate UI on MessageBubble (CHI-137)

**Files:**
- Modify: `src/components/conversation/MessageBubble.tsx`
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Add edit/regenerate props and UI to MessageBubble**

In `MessageBubble.tsx`, extend the props:

```typescript
interface MessageBubbleProps {
  message: Message;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
}
```

Add local edit state:

```typescript
const [isEditing, setIsEditing] = createSignal(false);
const [editContent, setEditContent] = createSignal('');
```

Add imports:

```typescript
import { createSignal } from 'solid-js';
import { Pencil, RefreshCw } from 'lucide-solid';
```

In the footer actions area (near the existing Copy button), add edit/regenerate icons conditionally:

For **user messages**, add an Edit button:

```tsx
<Show when={isUser() && !isEditing()}>
  <button
    class="opacity-0 group-hover/footer:opacity-100 p-0.5 rounded text-text-tertiary hover:text-accent transition-all"
    style={{ 'transition-duration': 'var(--duration-fast)' }}
    onClick={(e) => {
      e.stopPropagation();
      setEditContent(props.message.content);
      setIsEditing(true);
    }}
    aria-label="Edit message"
    title="Edit and resend"
  >
    <Pencil size={12} />
  </button>
</Show>
```

For **assistant messages**, add a Regenerate button:

```tsx
<Show when={!isUser() && props.message.role === 'assistant'}>
  <button
    class="opacity-0 group-hover/footer:opacity-100 p-0.5 rounded text-text-tertiary hover:text-accent transition-all"
    style={{ 'transition-duration': 'var(--duration-fast)' }}
    onClick={(e) => {
      e.stopPropagation();
      props.onRegenerate?.(props.message.id);
    }}
    aria-label="Regenerate response"
    title="Regenerate"
  >
    <RefreshCw size={12} />
  </button>
</Show>
```

Replace the content rendering for user messages with an editable mode:

```tsx
<Show when={isUser()}>
  <Show
    when={!isEditing()}
    fallback={
      <div class="space-y-2">
        <textarea
          class="w-full text-sm rounded-md px-3 py-2 outline-none resize-y min-h-[60px]"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-focus)',
          }}
          value={editContent()}
          onInput={(e) => setEditContent(e.currentTarget.value)}
        />
        <div class="flex gap-2">
          <button
            class="px-3 py-1 rounded text-xs font-medium transition-colors"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
              'transition-duration': 'var(--duration-fast)',
            }}
            onClick={() => {
              setIsEditing(false);
              props.onEdit?.(props.message.id, editContent());
            }}
          >
            Save & Resend
          </button>
          <button
            class="px-3 py-1 rounded text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    }
  >
    <p class="text-text-primary text-base whitespace-pre-wrap">{props.message.content}</p>
  </Show>
</Show>
```

**Step 2: Wire callbacks in ConversationView**

In `ConversationView.tsx`, import the store functions:

```typescript
import { editMessage, regenerateResponse } from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';
```

In the message rendering function, pass callbacks to MessageBubble:

```tsx
<MessageBubble
  message={msg}
  onEdit={(id, content) => {
    const sid = sessionState.activeSessionId;
    if (sid) editMessage(id, content, sid);
  }}
  onRegenerate={(id) => {
    const sid = sessionState.activeSessionId;
    if (sid) regenerateResponse(id, sid);
  }}
/>
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/conversation/MessageBubble.tsx src/components/conversation/ConversationView.tsx
git commit -m "feat: message edit and regenerate UI with hover actions (CHI-137)"
```

---

## Verification

1. `cargo test -p chief-wiggum` — All Rust tests pass (existing + 6 new suggestion tests)
2. `cargo clippy -- -D warnings` — No warnings
3. `npx tsc --noEmit` — TypeScript clean
4. `npx eslint .` — No lint errors
5. `npx vite build` — Build succeeds
6. Manual test — Context quality scoring (CHI-125):
   - Attach a file → quality dot appears on ContextChip (green/yellow/red)
   - Send messages with relevant keywords → quality scores update
   - Cmd+Shift+T → Context Breakdown Modal opens with budget bar and per-file scores
   - Low-quality file shows removal suggestion
7. Manual test — Smart file suggestions (CHI-127):
   - Attach a TypeScript file with imports → "Suggested" bar appears below chips
   - Shows imported files and test files
   - Click "+" on suggestion → adds as ContextChip
   - Suggestions update when attachments change
8. Manual test — i18n (CHI-126/128):
   - English locale renders identically to before
   - Settings → Language → Español → all UI chrome switches to Spanish
   - Buttons don't overflow, sidebar headers fit
   - Dev terms (YOLO, session, token) remain in English
9. Manual test — Message edit/regenerate (CHI-137):
   - Hover user message → Edit (pencil) icon appears
   - Click Edit → inline textarea with content
   - Modify text → "Save & Resend" → subsequent messages deleted, new response streams
   - Hover assistant message → Regenerate (refresh) icon appears
   - Click Regenerate → assistant message deleted, prior user message resent
