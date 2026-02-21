# GUIDE-001: Agent/Developer Coding Standards

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Active
**Audience:** All developers and AI coding agents working on Chief Wiggum

---

## 1. Purpose

This guide defines the coding conventions, patterns, and forbidden practices for the Chief Wiggum codebase. Every PR must comply with these standards. This document is referenced by `CLAUDE.md` so that AI agents inherit it automatically.

---

## 2. Rust Backend Standards

### 2.1 Style and Formatting

- **Formatter**: `rustfmt` with default settings. Run `cargo fmt` before every commit.
- **Linter**: `cargo clippy` with `-W clippy::all`. Zero warnings policy — all warnings must be fixed or explicitly allowed with a comment explaining why.
- **Edition**: Rust 2021.

### 2.2 Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Modules | `snake_case` | `cost_calculator` |
| Structs | `PascalCase` | `SessionManager` |
| Enums | `PascalCase` | `AgentStatus` |
| Enum variants | `PascalCase` | `AgentStatus::Thinking` |
| Functions | `snake_case` | `calculate_cost` |
| Constants | `SCREAMING_SNAKE` | `MAX_AGENTS` |
| Tauri commands | `snake_case` | `#[tauri::command] fn create_session` |
| IPC event names | `snake_case:snake_case` | `"agent:state_change"` |

### 2.3 Module Organization

- One file per logical domain in `commands/` (e.g., `session.rs`, `cost.rs`).
- Business logic lives in domain modules (`cost/`, `bridge/`, `db/`), not in command handlers.
- Command handlers are thin: validate input → call business logic → format output.
- Shared types (structs used across modules) live in `lib.rs` or a dedicated `types.rs`.

### 2.4 Error Handling

- Use `thiserror` for defining error types.
- Every public function returns `Result<T, AppError>`.
- Never use `.unwrap()` in production code. Use `.expect("reason")` only in initialization code where failure is truly unrecoverable.
- Tauri commands return `Result<T, String>` (Tauri's requirement). Convert via `.map_err(|e| e.to_string())`.
- Log errors with `tracing` before converting: `tracing::error!("Failed to create session: {}", e);`

### 2.5 Async Patterns

- Use `tokio` for all async operations.
- Never block the main thread. File I/O, network, and SQLite operations must be async or run on a blocking thread via `tokio::task::spawn_blocking`.
- PTY reads use a dedicated thread that sends messages to the async runtime via `tokio::sync::mpsc`.

### 2.6 Database Patterns

- All queries go through typed functions in `db/queries.rs` — no raw SQL in command handlers.
- Use parameterized queries exclusively. Never interpolate strings into SQL.
- Wrap multi-statement operations in transactions.
- SQLite WAL mode is enabled at startup for concurrent read access.

### 2.7 Testing

- Every public function in business logic modules must have at least one unit test.
- Tests live in the same file using `#[cfg(test)] mod tests`.
- Integration tests that require a database use an in-memory SQLite instance.
- Bridge tests use `MockBridge` with recorded fixtures (see SPEC-004 Section 11.1).

---

## 3. TypeScript/SolidJS Frontend Standards

### 3.1 Style and Formatting

- **Formatter**: Prettier with project config (2-space indent, single quotes, trailing commas).
- **Linter**: ESLint with `@typescript-eslint/recommended` + Solid-specific rules.
- **Strict mode**: `"strict": true` in `tsconfig.json`. No `any` types except in IPC boundary wrappers (typed as `unknown` and narrowed).

### 3.2 Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Components | `PascalCase.tsx` | `AgentCard.tsx` |
| Stores | `camelCase.ts` | `costStore.ts` |
| Utilities | `camelCase.ts` | `formatters.ts` |
| CSS classes | Tailwind utilities | `class="bg-bg-secondary text-text-primary"` |
| Event handlers | `on` + `PascalCase` | `onSendMessage` |
| Boolean props | `is` / `has` prefix | `isLoading`, `hasError` |
| Store signals | descriptive nouns | `const [sessions, setSessions]` |

### 3.3 Component Patterns

**File structure for every component:**

```typescript
// components/agents/AgentCard.tsx

import { Component, Show, For } from 'solid-js';
import { Badge } from '../common/Badge';
import type { Agent } from '../../lib/types';

interface AgentCardProps {
  agent: Agent;
  onPause?: (id: string) => void;
  onKill?: (id: string) => void;
}

export const AgentCard: Component<AgentCardProps> = (props) => {
  // 1. Derived signals (computed values)
  const statusColor = () => statusColorMap[props.agent.status];

  // 2. Effects (side effects)
  // ...

  // 3. Event handlers
  const handleKill = () => props.onKill?.(props.agent.id);

  // 4. Render
  return (
    <div class="bg-bg-secondary border border-border-primary rounded-lg p-3">
      {/* ... */}
    </div>
  );
};
```

**Rules:**
- One component per file. File name matches component name.
- Props interface defined in the same file (or imported from `types.ts` if shared).
- No `class` toggling logic in JSX — extract to helper functions.
- Use `<Show>` for conditional rendering, `<For>` for lists (not ternaries or `.map()`).
- Never put business logic in components — keep it in stores.

### 3.4 Store Patterns

```typescript
// stores/costStore.ts

import { createStore } from 'solid-js/store';
import { onMount, onCleanup } from 'solid-js';
import { onCostUpdate, onBudgetWarning } from '../lib/events';
import type { CostSummary, BudgetStatus } from '../lib/types';

interface CostState {
  sessionTotal: number;
  lastMessageCost: number;
  budgetStatus: BudgetStatus | null;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

const [state, setState] = createStore<CostState>({
  sessionTotal: 0,
  lastMessageCost: 0,
  budgetStatus: null,
  byModel: {},
});

// Actions (exported functions that modify state)
export function resetCost() {
  setState({ sessionTotal: 0, lastMessageCost: 0, byModel: {} });
}

// Event listeners (initialized once)
export function initCostListeners() {
  const unlisten1 = onCostUpdate((event) => {
    setState('sessionTotal', (prev) => prev + event.cost_cents);
    setState('lastMessageCost', event.cost_cents);
  });

  const unlisten2 = onBudgetWarning((warning) => {
    setState('budgetStatus', warning);
  });

  return () => { unlisten1(); unlisten2(); };
}

// Read-only exports
export { state as costState };
```

**Rules:**
- Stores are singletons (module-level `createStore`).
- State is read-only outside the store — mutations only via exported action functions.
- Event listeners return cleanup functions for component lifecycle management.
- No IPC calls inside stores — pass data in via actions. IPC wrappers live in `lib/ipc.ts`.

### 3.5 Styling Rules

- **Use Tailwind classes exclusively.** No inline styles, no CSS modules, no styled-components.
- **All colors must use design system tokens** (e.g., `bg-bg-secondary`, not `bg-[#161B22]`).
- **All spacing must use the 4px grid** (e.g., `p-3` = 12px, not `p-[13px]`).
- **No arbitrary values** in Tailwind classes unless there is no token equivalent (must be rare and commented).
- **Dark theme is the only theme for Phase 1–2.** Do not add `dark:` prefixes or conditional theme logic yet.

### 3.6 Accessibility Rules (Enforced in Every Component)

- Every `<button>` that only has an icon must have `aria-label`.
- Every `<input>` must have an associated `<label>` (visible or `sr-only`).
- Focus order must follow visual order. Use `tabindex` sparingly.
- Modals trap focus. Escape closes the topmost modal.
- Use semantic HTML (`<nav>`, `<main>`, `<aside>`, `<section>`, `<article>`) over generic `<div>`.
- Streaming content (messages, terminal) must use `aria-live="polite"`.

---

## 4. Git and Commit Standards

### 4.1 Branch Naming

```
{type}/{linear-issue-id}-{short-description}
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

**Examples:**
- `feat/CW-42-agent-dashboard`
- `fix/CW-67-cost-tracker-overflow`
- `refactor/CW-89-bridge-parser-adapter`

### 4.2 Commit Message Format

```
{type}({scope}): {description}

{optional body}

{optional footer}
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`
**Scopes:** `bridge`, `cost`, `db`, `git`, `mcp`, `ui`, `agents`, `diff`, `terminal`, `settings`

**Examples:**
```
feat(agents): add agent spawn dialog with model selection

Implements SPEC-003 Section 3.2 spawn dialog with model
selector, task description, and budget limit input.

Closes CW-42
```

```
fix(cost): correct Opus Fast Mode pricing calculation

Fast Mode uses $30/$150 per MTok, not standard rates.
Updated pricing table and added regression test.

Fixes CW-67
```

### 4.3 PR Requirements

Every PR must:
- Reference a Linear issue (CW-NNN) in the title
- Include a description explaining what and why (not how — the code shows how)
- Pass all CI checks (lint, type-check, test, build)
- Have no merge conflicts with `main`
- Follow the coding standards in this guide

---

## 5. Forbidden Patterns

These patterns are explicitly banned from the codebase. CI checks or code review must catch them.

### 5.1 Rust Forbidden Patterns

| Pattern | Why | Do Instead |
|---|---|---|
| `.unwrap()` in production code | Panics crash the app | Use `?` or `.expect("reason")` in init only |
| Raw SQL strings in command handlers | SQL injection risk, poor maintainability | Use `db/queries.rs` functions |
| `std::thread::sleep` | Blocks the async runtime | Use `tokio::time::sleep` |
| `println!` / `eprintln!` | Not captured by logging system | Use `tracing::info!` / `tracing::error!` |
| `clone()` without justification | Performance concern | Comment why clone is necessary, or use references |
| Mutex poisoning via `.lock().unwrap()` | Panics if another thread panicked | Use `.lock().map_err(...)` |

### 5.2 TypeScript Forbidden Patterns

| Pattern | Why | Do Instead |
|---|---|---|
| `any` type | Defeats type safety | Use `unknown` + type narrowing |
| `document.querySelector` | Bypasses SolidJS reactivity | Use refs (`let ref: HTMLElement`) |
| Inline styles | Unmaintainable, bypasses design system | Use Tailwind classes |
| `console.log` in production | Not captured by logging | Use a logging utility that can be disabled |
| Direct IPC `invoke()` calls | No error handling | Use `safeInvoke()` wrapper from `lib/ipc.ts` |
| Hardcoded colors/spacing | Violates design system | Use Tailwind tokens from SPEC-002 |
| `setTimeout`/`setInterval` without cleanup | Memory leaks | Use `onCleanup` in SolidJS lifecycle |
| `localStorage` / `sessionStorage` | Data must be in SQLite via Rust | Use IPC to read/write persistent state |

### 5.3 General Forbidden Patterns

| Pattern | Why | Do Instead |
|---|---|---|
| Committing `.env` files | Secrets in version control | Use `.env.example` with placeholder values |
| Large binary assets in git | Bloats the repo | Use git-lfs or external hosting |
| TODO comments without issue link | TODOs get lost | `// TODO(CW-123): description` |
| Magic numbers | Unmaintainable | Use named constants |
| Commented-out code | Clutters the codebase | Delete it (git has history) |

---

## 6. Code Review Checklist

Reviewers (human or AI) should check:

- [ ] Follows naming conventions (Section 2.2 / 3.2)
- [ ] Error handling uses `Result` / `safeInvoke` (Section 2.4 / SPEC-004 Section 7)
- [ ] No forbidden patterns (Section 5)
- [ ] UI components reference SPEC-002 design tokens
- [ ] Accessibility requirements met (Section 3.6)
- [ ] New public functions have tests
- [ ] Commit messages follow format (Section 4.2)
- [ ] No hardcoded values (colors, spacing, strings)
- [ ] IPC types match between Rust and TypeScript (SPEC-004 Section 6)
- [ ] Performance: no blocking calls on main thread
