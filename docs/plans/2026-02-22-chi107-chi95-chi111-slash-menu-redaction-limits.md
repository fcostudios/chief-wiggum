# SlashCommandMenu + Log Redaction + Session Limits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the slash command autocomplete UI (CHI-107), log redaction engine for privacy-safe export (CHI-95), and concurrent session resource limits (CHI-111).

**Architecture:** Three independent features that can be implemented in any order. CHI-107 builds `slashStore.ts` + `SlashCommandMenu.tsx` and hooks into MessageInput's keystroke handling. CHI-95 adds a `logging/redactor.rs` module that transforms cloned `LogEntry` values at export time. CHI-111 adds a `max_concurrent` check in `SessionBridgeMap` before `spawn_for_session` and surfaces the error in the frontend.

**Tech Stack:** Tauri v2, Rust (tokio, serde, regex), SolidJS (solid-js/store), TypeScript

---

## Task 1: SlashCommand TypeScript Types + slashStore

**Files:**
- Create: `src/stores/slashStore.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add `SlashCommand` TypeScript type**

In `src/lib/types.ts`, add after the `Project` interface (line 180):

```typescript
/** Slash command from backend discovery (mirrors Rust SlashCommand). */
export interface SlashCommand {
  name: string;
  description: string;
  category: 'Builtin' | 'Project' | 'User';
  args_hint: string | null;
  source_path: string | null;
  from_sdk: boolean;
}
```

**Step 2: Create `slashStore.ts`**

Create `src/stores/slashStore.ts`:

```typescript
// src/stores/slashStore.ts
// Manages slash command state: command list, menu visibility, fuzzy filtering, keyboard selection.
// Backed by `list_slash_commands` IPC from CHI-106.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { SlashCommand } from '@/lib/types';

interface SlashState {
  /** All discovered commands (built-in + project + user). */
  commands: SlashCommand[];
  /** Whether the autocomplete menu is open. */
  isOpen: boolean;
  /** Current filter text (everything after the `/`). */
  filter: string;
  /** Index of the highlighted item in filteredCommands. */
  highlightedIndex: number;
}

const [state, setState] = createStore<SlashState>({
  commands: [],
  isOpen: false,
  filter: '',
  highlightedIndex: 0,
});

export { state as slashState };

/** Fuzzy-match a filter string against a command name and description. */
function fuzzyMatch(command: SlashCommand, filter: string): boolean {
  if (!filter) return true;
  const lower = filter.toLowerCase();
  return (
    command.name.toLowerCase().includes(lower) ||
    command.description.toLowerCase().includes(lower)
  );
}

/** Get the filtered list of commands based on current filter text. */
export function filteredCommands(): SlashCommand[] {
  return state.commands.filter((cmd) => fuzzyMatch(cmd, state.filter));
}

/** Load commands from backend. Called on app mount and project change. */
export async function loadCommands(projectPath?: string): Promise<void> {
  try {
    const commands = await invoke<SlashCommand[]>('list_slash_commands', {
      project_path: projectPath ?? null,
    });
    setState('commands', commands);
  } catch (err) {
    console.error('[slashStore] Failed to load slash commands:', err);
  }
}

/** Refresh commands from backend (force rescan). */
export async function refreshCommands(projectPath?: string): Promise<void> {
  try {
    const commands = await invoke<SlashCommand[]>('refresh_slash_commands', {
      project_path: projectPath ?? null,
    });
    setState('commands', commands);
  } catch (err) {
    console.error('[slashStore] Failed to refresh slash commands:', err);
  }
}

/** Open the slash command menu with an optional initial filter. */
export function openMenu(filter: string = ''): void {
  setState({ isOpen: true, filter, highlightedIndex: 0 });
}

/** Close the slash command menu. */
export function closeMenu(): void {
  setState({ isOpen: false, filter: '', highlightedIndex: 0 });
}

/** Update the filter text (called as user types after `/`). */
export function setFilter(filter: string): void {
  setState({ filter, highlightedIndex: 0 });
}

/** Move highlight up. */
export function highlightPrev(): void {
  const max = filteredCommands().length;
  if (max === 0) return;
  setState('highlightedIndex', (i) => (i - 1 + max) % max);
}

/** Move highlight down. */
export function highlightNext(): void {
  const max = filteredCommands().length;
  if (max === 0) return;
  setState('highlightedIndex', (i) => (i + 1) % max);
}

/** Get the currently highlighted command. */
export function getHighlightedCommand(): SlashCommand | undefined {
  return filteredCommands()[state.highlightedIndex];
}
```

**Step 3: Run verification**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/lib/types.ts src/stores/slashStore.ts
git commit -m "feat: add slashStore and SlashCommand TypeScript type (CHI-107)"
```

---

## Task 2: SlashCommandMenu Component

**Files:**
- Create: `src/components/conversation/SlashCommandMenu.tsx`

**Step 1: Create the component**

Create `src/components/conversation/SlashCommandMenu.tsx`:

```tsx
// src/components/conversation/SlashCommandMenu.tsx
// Inline autocomplete dropdown for slash commands.
// Appears above MessageInput when user types `/` at start of input.
// Per CHI-107: categorized, fuzzy-searchable, keyboard-navigable.

import type { Component } from 'solid-js';
import { Show, For, createMemo, createEffect } from 'solid-js';
import type { SlashCommand } from '@/lib/types';

interface SlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashCommand[];
  highlightedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

/** Group commands by category for sectioned display. */
function groupByCategory(commands: SlashCommand[]): { label: string; commands: SlashCommand[] }[] {
  const groups: { label: string; category: string; commands: SlashCommand[] }[] = [
    { label: 'Built-in', category: 'Builtin', commands: [] },
    { label: 'Project', category: 'Project', commands: [] },
    { label: 'User', category: 'User', commands: [] },
  ];

  for (const cmd of commands) {
    const group = groups.find((g) => g.category === cmd.category);
    if (group) group.commands.push(cmd);
  }

  return groups.filter((g) => g.commands.length > 0);
}

const SlashCommandMenu: Component<SlashCommandMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  const groups = createMemo(() => groupByCategory(props.commands));

  // Scroll highlighted item into view
  createEffect(() => {
    if (!menuRef || !props.isOpen) return;
    const highlighted = menuRef.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });

  // Build a flat index so we can match highlightedIndex to items across groups
  const flatIndex = (groupIdx: number, itemIdx: number): number => {
    let offset = 0;
    const g = groups();
    for (let i = 0; i < groupIdx; i++) {
      offset += g[i].commands.length;
    }
    return offset + itemIdx;
  };

  return (
    <Show when={props.isOpen && props.commands.length > 0}>
      <div
        ref={menuRef}
        class="absolute bottom-full left-0 right-0 mb-1 max-h-[300px] overflow-y-auto rounded-lg z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': '0 -4px 16px rgba(0, 0, 0, 0.3)',
        }}
        role="listbox"
        aria-label="Slash commands"
      >
        <For each={groups()}>
          {(group, groupIdx) => (
            <div>
              {/* Section header */}
              <div
                class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  color: 'var(--color-text-tertiary)',
                  background: 'var(--color-bg-secondary)',
                  'border-bottom': '1px solid var(--color-border-secondary)',
                }}
              >
                {group.label}
              </div>

              {/* Command items */}
              <For each={group.commands}>
                {(cmd, itemIdx) => {
                  const isHighlighted = () => flatIndex(groupIdx(), itemIdx()) === props.highlightedIndex;

                  return (
                    <button
                      class="w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors"
                      style={{
                        background: isHighlighted() ? 'var(--color-surface-hover)' : 'transparent',
                      }}
                      data-highlighted={isHighlighted()}
                      role="option"
                      aria-selected={isHighlighted()}
                      onMouseEnter={() => {
                        // Optional: could update highlight on hover
                      }}
                      onClick={() => props.onSelect(cmd)}
                    >
                      <span
                        class="text-xs font-mono font-medium shrink-0"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        /{cmd.name}
                      </span>
                      <Show when={cmd.args_hint}>
                        <span class="text-[11px] text-text-tertiary/50 font-mono">
                          {cmd.args_hint}
                        </span>
                      </Show>
                      <span class="text-[11px] text-text-tertiary truncate">
                        {cmd.description}
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </For>

        {/* Footer hint */}
        <div
          class="px-3 py-1.5 text-[10px] text-text-tertiary/40 flex items-center gap-3"
          style={{
            'border-top': '1px solid var(--color-border-secondary)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <span>
            <kbd class="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd class="font-mono">↵</kbd> select
          </span>
          <span>
            <kbd class="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </Show>
  );
};

export default SlashCommandMenu;
```

**Step 2: Run verification**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/conversation/SlashCommandMenu.tsx
git commit -m "feat: add SlashCommandMenu autocomplete component (CHI-107)"
```

---

## Task 3: Wire SlashCommandMenu into MessageInput

**Files:**
- Modify: `src/components/conversation/MessageInput.tsx`

**Step 1: Add imports and slash detection logic**

Add to imports (after line 9):

```typescript
import SlashCommandMenu from './SlashCommandMenu';
import {
  slashState,
  filteredCommands,
  openMenu,
  closeMenu,
  setFilter,
  highlightPrev,
  highlightNext,
  getHighlightedCommand,
} from '@/stores/slashStore';
```

**Step 2: Modify `handleInput` to detect `/` trigger**

Replace the existing `handleInput` function (lines 31-35) with:

```typescript
function handleInput(e: InputEvent) {
  const target = e.target as HTMLTextAreaElement;
  const value = target.value;
  setContent(value);
  adjustHeight();

  // Slash command detection: `/` at position 0, no spaces yet
  if (value.startsWith('/')) {
    const afterSlash = value.slice(1);
    // Close menu if user typed a space (finished command name, typing args)
    if (afterSlash.includes(' ') || afterSlash.includes('\n')) {
      closeMenu();
    } else {
      openMenu(afterSlash);
      setFilter(afterSlash);
    }
  } else {
    if (slashState.isOpen) closeMenu();
  }
}
```

**Step 3: Modify `handleKeyDown` for menu navigation**

Replace the existing `handleKeyDown` function (lines 52-65) with:

```typescript
function handleKeyDown(e: KeyboardEvent) {
  // When slash menu is open, intercept navigation keys
  if (slashState.isOpen) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightPrev();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightNext();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const cmd = getHighlightedCommand();
      if (cmd) {
        handleSlashSelect(cmd);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const cmd = getHighlightedCommand();
      if (cmd) {
        handleSlashSelect(cmd);
      }
      return;
    }
  }

  // Enter (without Shift) sends the message
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    handleSend();
    return;
  }

  // Cmd/Ctrl+Enter always sends (force send)
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSend();
  }
}
```

**Step 4: Add `handleSlashSelect` helper**

Add after `handleCancel` (after line 50):

```typescript
function handleSlashSelect(cmd: SlashCommand) {
  const text = `/${cmd.name}${cmd.args_hint ? ' ' : ''}`;
  setContent(text);
  if (textareaRef) {
    textareaRef.value = text;
    // Position cursor at end
    textareaRef.focus();
    textareaRef.setSelectionRange(text.length, text.length);
  }
  closeMenu();
  adjustHeight();
}
```

Add import for the type at top:

```typescript
import type { SlashCommand } from '@/lib/types';
```

**Step 5: Add `onBlur` handling to close menu when clicking outside**

Update the `onBlur` handler on the textarea (line 103):

```typescript
onBlur={() => {
  setIsFocused(false);
  // Delay close to allow click on menu items
  setTimeout(() => {
    if (slashState.isOpen) closeMenu();
  }, 200);
}}
```

**Step 6: Add `SlashCommandMenu` to the JSX**

Wrap the textarea area (the `div` at line 84 with `class="relative max-w-4xl mx-auto"`) so the menu can position above it. Add the menu component inside that wrapper, **before** the `<textarea>`:

```tsx
<SlashCommandMenu
  isOpen={slashState.isOpen}
  commands={filteredCommands()}
  highlightedIndex={slashState.highlightedIndex}
  onSelect={handleSlashSelect}
  onClose={closeMenu}
/>
```

**Step 7: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 8: Commit**

```bash
git add src/components/conversation/MessageInput.tsx
git commit -m "feat: wire SlashCommandMenu into MessageInput with keyboard navigation (CHI-107)"
```

---

## Task 4: Load Slash Commands on App Mount

**Files:**
- Modify: `src/App.tsx`

**Step 1: Import and call `loadCommands` on mount**

In `src/App.tsx`, add:

```typescript
import { loadCommands } from '@/stores/slashStore';
```

In the existing `onMount` (or add one if needed), after the existing reconnect logic, add:

```typescript
// Load slash commands for autocomplete (CHI-107)
loadCommands(projectState.activeProject?.path);
```

Also, if there's a project change handler that runs when the active project changes, add a `loadCommands()` call there too. Check `projectStore.ts` for how project switching works and add a `loadCommands` call in the same place.

**Step 2: Run full verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: load slash commands on app mount (CHI-107)"
```

---

## Task 5: Log Redaction Engine — Types and Rule Framework

**Files:**
- Create: `src-tauri/src/logging/redactor.rs`
- Modify: `src-tauri/src/logging/mod.rs`

**Step 1: Create the redactor module**

Create `src-tauri/src/logging/redactor.rs`:

```rust
//! Log redaction engine — strips sensitive data from log entries at export time.
//!
//! Key design: Redaction operates on CLONED entries, never mutating the originals.
//! This preserves full logs for local debugging while ensuring exports are safe.
//!
//! CHI-95: Epic CHI-93 (Structured Log Collector)

use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;

use super::ring_buffer::LogEntry;

/// Summary of redaction operations performed.
#[derive(Debug, Clone, Serialize)]
pub struct RedactionSummary {
    pub rules_applied: Vec<String>,
    pub entries_redacted: usize,
    pub total_entries: usize,
    pub fields_redacted: usize,
}

/// A single redaction rule: a named regex + replacement.
struct RedactionRule {
    name: &'static str,
    pattern: Regex,
    replacement: String,
}

/// Strips sensitive data from log entries at export time.
///
/// Rules are compiled once on construction and reused across all entries.
pub struct LogRedactor {
    rules: Vec<RedactionRule>,
}

impl LogRedactor {
    /// Create a redactor with all default rules.
    ///
    /// Detects the user's home directory for path redaction automatically.
    pub fn new() -> Self {
        let home_dir = dirs::home_dir();
        Self::with_home_dir(home_dir)
    }

    /// Create a redactor with an explicit home directory (for testing).
    pub fn with_home_dir(home_dir: Option<PathBuf>) -> Self {
        let mut rules = Vec::new();

        // Rule 1: Anthropic API keys (sk-ant-api03-...)
        rules.push(RedactionRule {
            name: "anthropic_api_key",
            pattern: Regex::new(r"sk-ant-[a-zA-Z0-9_-]{10,}").expect("valid regex"),
            replacement: "sk-ant-***[REDACTED]".to_string(),
        });

        // Rule 2: Generic secret keys (sk-...)
        rules.push(RedactionRule {
            name: "generic_sk_key",
            pattern: Regex::new(r"sk-[a-zA-Z0-9_-]{20,}").expect("valid regex"),
            replacement: "sk-***[REDACTED]".to_string(),
        });

        // Rule 3: Bearer tokens
        rules.push(RedactionRule {
            name: "bearer_token",
            pattern: Regex::new(r"Bearer\s+[a-zA-Z0-9._\-/+=]{10,}").expect("valid regex"),
            replacement: "Bearer [REDACTED]".to_string(),
        });

        // Rule 4: Environment variable secrets (KEY=value patterns)
        rules.push(RedactionRule {
            name: "env_secret",
            pattern: Regex::new(
                r"(?i)(ANTHROPIC_API_KEY|OPENAI_API_KEY|API_KEY|SECRET_KEY|AUTH_TOKEN|ACCESS_TOKEN)\s*=\s*\S+"
            ).expect("valid regex"),
            replacement: "$1=[REDACTED]".to_string(),
        });

        // Rule 5: Email addresses
        rules.push(RedactionRule {
            name: "email",
            pattern: Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").expect("valid regex"),
            replacement: "[EMAIL]".to_string(),
        });

        // Rule 6: Home directory paths (platform-specific)
        if let Some(ref home) = home_dir {
            let home_str = home.to_string_lossy().to_string();
            if !home_str.is_empty() {
                // Escape the path for use in regex (handles backslashes on Windows)
                let escaped = regex::escape(&home_str);
                rules.push(RedactionRule {
                    name: "home_directory",
                    pattern: Regex::new(&escaped).expect("valid regex"),
                    replacement: "~".to_string(),
                });
            }
        }

        // Rule 7: Windows-style home paths (C:\Users\username\...)
        rules.push(RedactionRule {
            name: "windows_user_path",
            pattern: Regex::new(r"[A-Z]:\\Users\\[^\\]+").expect("valid regex"),
            replacement: "~".to_string(),
        });

        Self { rules }
    }

    /// Redact a slice of log entries, returning redacted copies + summary.
    ///
    /// The original entries are not modified.
    pub fn redact_entries(&self, entries: &[LogEntry]) -> (Vec<LogEntry>, RedactionSummary) {
        let total_entries = entries.len();
        let mut entries_redacted = 0;
        let mut fields_redacted = 0;
        let mut rules_hit: Vec<bool> = vec![false; self.rules.len()];

        let redacted: Vec<LogEntry> = entries
            .iter()
            .map(|entry| {
                let mut modified = false;

                // Redact message
                let message = self.apply_rules(&entry.message, &mut rules_hit, &mut modified);

                // Redact field values
                let fields: Vec<(String, String)> = entry
                    .fields
                    .iter()
                    .map(|(key, value)| {
                        let mut field_modified = false;
                        let redacted_value = self.apply_rules(value, &mut rules_hit, &mut field_modified);
                        if field_modified {
                            fields_redacted += 1;
                            modified = true;
                        }
                        (key.clone(), redacted_value)
                    })
                    .collect();

                if modified {
                    entries_redacted += 1;
                }

                LogEntry {
                    timestamp: entry.timestamp.clone(),
                    level: entry.level.clone(),
                    target: entry.target.clone(),
                    message,
                    fields,
                }
            })
            .collect();

        let rules_applied: Vec<String> = self
            .rules
            .iter()
            .zip(rules_hit.iter())
            .filter(|(_, hit)| **hit)
            .map(|(rule, _)| rule.name.to_string())
            .collect();

        let summary = RedactionSummary {
            rules_applied,
            entries_redacted,
            total_entries,
            fields_redacted,
        };

        (redacted, summary)
    }

    /// Apply all rules to a string, tracking which rules matched.
    fn apply_rules(&self, input: &str, rules_hit: &mut [bool], modified: &mut bool) -> String {
        let mut result = input.to_string();
        for (i, rule) in self.rules.iter().enumerate() {
            let after = rule.pattern.replace_all(&result, rule.replacement.as_str());
            if after != result {
                rules_hit[i] = true;
                *modified = true;
                result = after.into_owned();
            }
        }
        result
    }
}

impl Default for LogRedactor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_entry(message: &str) -> LogEntry {
        LogEntry {
            timestamp: "2026-02-22T12:00:00Z".to_string(),
            level: "INFO".to_string(),
            target: "test".to_string(),
            message: message.to_string(),
            fields: vec![],
        }
    }

    fn make_entry_with_fields(message: &str, fields: Vec<(&str, &str)>) -> LogEntry {
        LogEntry {
            timestamp: "2026-02-22T12:00:00Z".to_string(),
            level: "INFO".to_string(),
            target: "test".to_string(),
            message: message.to_string(),
            fields: fields.into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        }
    }

    fn redactor_with_home(home: &str) -> LogRedactor {
        LogRedactor::with_home_dir(Some(PathBuf::from(home)))
    }

    #[test]
    fn redacts_anthropic_api_key() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("Using key sk-ant-api03-abc123def456ghi789jkl")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(!redacted[0].message.contains("abc123"));
        assert!(redacted[0].message.contains("[REDACTED]"));
        assert_eq!(summary.entries_redacted, 1);
        assert!(summary.rules_applied.contains(&"anthropic_api_key".to_string()));
    }

    #[test]
    fn redacts_generic_sk_key() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("key=sk-1234567890abcdefghijklmn")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("[REDACTED]"));
        assert_eq!(summary.entries_redacted, 1);
    }

    #[test]
    fn redacts_bearer_token() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test")];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("Bearer [REDACTED]"));
        assert!(!redacted[0].message.contains("eyJhb"));
    }

    #[test]
    fn redacts_env_secrets() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("ANTHROPIC_API_KEY=sk-ant-api03-secret123")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("ANTHROPIC_API_KEY=[REDACTED]"));
        assert!(summary.entries_redacted >= 1);
    }

    #[test]
    fn redacts_email() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("User fcolomas@gmail.com logged in")];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("[EMAIL]"));
        assert!(!redacted[0].message.contains("fcolomas@gmail.com"));
    }

    #[test]
    fn redacts_home_directory() {
        let r = redactor_with_home("/Users/francisco");
        let entries = vec![make_entry("Loading /Users/francisco/projects/chief-wiggum")];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("~/projects/chief-wiggum"));
        assert!(!redacted[0].message.contains("/Users/francisco"));
    }

    #[test]
    fn redacts_windows_user_path() {
        let r = LogRedactor::new();
        let entries = vec![make_entry(r"Loading C:\Users\francisco\projects\cw")];
        let (redacted, _) = r.redact_entries(&entries);

        assert!(redacted[0].message.starts_with("Loading ~"));
        assert!(!redacted[0].message.contains("francisco"));
    }

    #[test]
    fn redacts_fields_not_just_message() {
        let r = LogRedactor::new();
        let entries = vec![make_entry_with_fields(
            "request sent",
            vec![("auth", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload")],
        )];
        let (redacted, summary) = r.redact_entries(&entries);

        assert_eq!(redacted[0].fields[0].1, "Bearer [REDACTED]");
        assert_eq!(summary.fields_redacted, 1);
    }

    #[test]
    fn preserves_clean_entries() {
        let r = LogRedactor::new();
        let entries = vec![make_entry("Session s1 started successfully")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert_eq!(redacted[0].message, "Session s1 started successfully");
        assert_eq!(summary.entries_redacted, 0);
        assert!(summary.rules_applied.is_empty());
    }

    #[test]
    fn multiple_rules_on_same_entry() {
        let r = redactor_with_home("/Users/francisco");
        let entries = vec![make_entry("User fcolomas@gmail.com at /Users/francisco/app used sk-ant-api03-secretkey123")];
        let (redacted, summary) = r.redact_entries(&entries);

        assert!(redacted[0].message.contains("[EMAIL]"));
        assert!(redacted[0].message.contains("~/app"));
        assert!(redacted[0].message.contains("[REDACTED]"));
        assert!(summary.rules_applied.len() >= 3);
    }

    #[test]
    fn original_entries_not_modified() {
        let r = LogRedactor::new();
        let original = vec![make_entry("key=sk-ant-api03-secret123456789")];
        let original_msg = original[0].message.clone();
        let _ = r.redact_entries(&original);

        assert_eq!(original[0].message, original_msg, "Original should be untouched");
    }

    #[test]
    fn empty_input_returns_empty() {
        let r = LogRedactor::new();
        let (redacted, summary) = r.redact_entries(&[]);

        assert!(redacted.is_empty());
        assert_eq!(summary.total_entries, 0);
        assert_eq!(summary.entries_redacted, 0);
    }

    #[test]
    fn summary_counts_are_correct() {
        let r = LogRedactor::new();
        let entries = vec![
            make_entry("clean entry"),
            make_entry("has key sk-ant-api03-abc123def456ghi789jkl"),
            make_entry("another clean"),
            make_entry("email: user@example.com"),
        ];
        let (_, summary) = r.redact_entries(&entries);

        assert_eq!(summary.total_entries, 4);
        assert_eq!(summary.entries_redacted, 2);
    }
}
```

**Step 2: Register module in `logging/mod.rs`**

In `src-tauri/src/logging/mod.rs`, add after `pub mod ring_buffer;` (line 7):

```rust
pub mod redactor;
```

And add to the re-exports after `pub use ring_buffer::{LogEntry, RingBufferHandle};` (line 10):

```rust
pub use redactor::{LogRedactor, RedactionSummary};
```

**Step 3: Run tests**

Run: `cargo test -p chief-wiggum`
Expected: All existing tests pass + ~12 new redactor tests pass

**Step 4: Run clippy**

Run: `cargo clippy -- -D warnings`
Expected: Clean

**Step 5: Commit**

```bash
git add src-tauri/src/logging/redactor.rs src-tauri/src/logging/mod.rs
git commit -m "feat: log redaction engine with 7 rules and 12 tests (CHI-95)"
```

---

## Task 6: Concurrent Session Limit — Backend

**Files:**
- Modify: `src-tauri/src/bridge/manager.rs`
- Modify: `src-tauri/src/commands/bridge.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add `max_concurrent` to `SessionBridgeMap`**

In `src-tauri/src/bridge/manager.rs`, update the struct (line 101):

```rust
pub struct SessionBridgeMap {
    bridges: Arc<RwLock<HashMap<String, Arc<dyn BridgeInterface>>>>,
    mcp_server_prefixes: Arc<RwLock<HashSet<String>>>,
    session_runtimes: Arc<RwLock<HashMap<String, SessionRuntime>>>,
    max_concurrent: usize,
}
```

Add a constant before the struct:

```rust
/// Default maximum number of concurrent CLI sessions.
const DEFAULT_MAX_CONCURRENT: usize = 4;
```

**Step 2: Update `new()` and `Default`**

Update `new()` (line 113):

```rust
pub fn new() -> Self {
    Self {
        bridges: Arc::new(RwLock::new(HashMap::new())),
        mcp_server_prefixes: Arc::new(RwLock::new(HashSet::new())),
        session_runtimes: Arc::new(RwLock::new(HashMap::new())),
        max_concurrent: DEFAULT_MAX_CONCURRENT,
    }
}
```

**Step 3: Add `can_spawn()` and `max_concurrent()` methods**

Add after `active_count()` (after line 189):

```rust
/// Check if a new session can be spawned (under the concurrent limit).
pub async fn can_spawn(&self) -> bool {
    self.active_count().await < self.max_concurrent
}

/// Get the maximum concurrent session limit.
pub fn max_concurrent(&self) -> usize {
    self.max_concurrent
}
```

**Step 4: Add `ResourceLimit` error variant to `AppError`**

In `src-tauri/src/lib.rs`, add a new variant after `BudgetExceeded` (after line 37):

```rust
#[error("Resource limit: maximum {max} concurrent sessions reached ({active} active)")]
ResourceLimit { max: usize, active: usize },
```

**Step 5: Guard `send_to_cli` with `can_spawn()`**

In `src-tauri/src/commands/bridge.rs`, after the existing bridge removal (line 42), add the concurrency check:

```rust
// Check concurrent session limit (CHI-111)
if !bridge_map.has(&session_id).await && !bridge_map.can_spawn().await {
    let active = bridge_map.active_count().await;
    let max = bridge_map.max_concurrent();
    return Err(AppError::ResourceLimit { max, active });
}
```

Note: The check uses `!bridge_map.has()` because if this session already had a bridge (that was just removed above on line 40-42), it doesn't count as a "new" slot — it's replacing an existing one.

**Step 6: Write tests**

Add to the `#[cfg(test)]` block in `manager.rs`:

```rust
#[tokio::test]
async fn can_spawn_respects_limit() {
    let map = SessionBridgeMap::new(); // default limit = 4
    assert!(map.can_spawn().await);

    // Fill up to limit
    for i in 0..4 {
        map.insert_mock(&format!("s{}", i), Arc::new(MockBridge::new(vec![]))).await;
    }
    assert!(!map.can_spawn().await);
    assert_eq!(map.active_count().await, 4);

    // Remove one -> can spawn again
    map.remove("s0").await.unwrap();
    assert!(map.can_spawn().await);
}

#[tokio::test]
async fn max_concurrent_default_is_four() {
    let map = SessionBridgeMap::new();
    assert_eq!(map.max_concurrent(), 4);
}
```

**Step 7: Run tests**

Run: `cargo test -p chief-wiggum`
Expected: All existing tests pass + 2 new tests pass

**Step 8: Run clippy**

Run: `cargo clippy -- -D warnings`
Expected: Clean

**Step 9: Commit**

```bash
git add src-tauri/src/bridge/manager.rs src-tauri/src/commands/bridge.rs src-tauri/src/lib.rs
git commit -m "feat: concurrent session limit with can_spawn() guard (CHI-111)"
```

---

## Task 7: Concurrent Session Limit — Frontend Error + StatusBar Count

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/components/layout/StatusBar.tsx`

**Step 1: Handle "Resource limit" error in conversationStore**

In `src/stores/conversationStore.ts`, the error from `send_to_cli` is already caught at line 522-527:

```typescript
} catch (err) {
    setState('isLoading', false);
    setState('error', `Failed to send message: ${err}`);
    setSessionStatus(sessionId, 'error');
    devWarn('Failed to send message:', err);
}
```

The error message from Rust will be something like `"Resource limit: maximum 4 concurrent sessions reached (4 active)"`. This already shows in the error display in ConversationView. However, let's make it friendlier.

Replace that catch block with:

```typescript
} catch (err) {
    setState('isLoading', false);
    const errStr = String(err);
    // Friendly message for session limit (CHI-111)
    if (errStr.includes('Resource limit')) {
      setState('error', 'Maximum concurrent sessions reached. Stop another session first.');
    } else {
      setState('error', `Failed to send message: ${errStr}`);
    }
    setSessionStatus(sessionId, 'error');
    devWarn('Failed to send message:', err);
}
```

**Step 2: Add active session count to StatusBar**

In `src/components/layout/StatusBar.tsx`, import from conversationStore:

```typescript
import { conversationState, getSessionStatus } from '@/stores/conversationStore';
```

Wait — `getSessionStatus` isn't needed here since the `sessionStatuses` record is already in `conversationState`. Instead, let's compute the count of running sessions.

Add a derived count after the existing `costDisplay` computed (after line 45):

```typescript
const runningCount = () => {
  const statuses = conversationState.sessionStatuses;
  return Object.values(statuses).filter((s) => s === 'running' || s === 'starting').length;
};
```

Then in the left section of the StatusBar, after the process status dot/label section (after line 115), add:

```tsx
<Show when={runningCount() > 1}>
  <span
    class="font-mono px-1 py-0.5 rounded"
    style={{
      'font-size': '9px',
      color: 'var(--color-text-tertiary)',
      background: 'var(--color-bg-elevated)',
    }}
  >
    {runningCount()} active
  </span>
</Show>
```

**Step 3: Run verification**

Run: `npx tsc --noEmit && npx eslint .`
Expected: Clean

**Step 4: Commit**

```bash
git add src/stores/conversationStore.ts src/components/layout/StatusBar.tsx
git commit -m "feat: friendly session limit error + active count in StatusBar (CHI-111)"
```

---

## Task 8: Full Verification

**Step 1: Rust**

Run: `cargo test -p chief-wiggum`
Expected: ~115+ tests pass (103 existing + ~12 redactor + 2 session limit)

Run: `cargo clippy -- -D warnings`
Expected: Clean

**Step 2: Frontend**

Run: `npx tsc --noEmit`
Expected: Clean

Run: `npx eslint .`
Expected: Clean

**Step 3: Build**

Run: `npx vite build`
Expected: Build succeeds

**Step 4: Commit any final fixes if needed**

---

## Summary

| Task | Feature | Files | Tests |
|------|---------|-------|-------|
| 1 | SlashCommand types + slashStore | `types.ts`, `slashStore.ts` | — |
| 2 | SlashCommandMenu component | `SlashCommandMenu.tsx` | — |
| 3 | Wire menu into MessageInput | `MessageInput.tsx` | — |
| 4 | Load commands on mount | `App.tsx` | — |
| 5 | Log Redaction Engine | `redactor.rs`, `logging/mod.rs` | ~12 tests |
| 6 | Session Limit — Backend | `manager.rs`, `bridge.rs`, `lib.rs` | 2 tests |
| 7 | Session Limit — Frontend | `conversationStore.ts`, `StatusBar.tsx` | — |
| 8 | Full verification | — | — |
