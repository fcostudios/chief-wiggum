# GUIDE-003: Development Protocol — Feature Planning, Implementation & Verification

**Version:** 1.0
**Date:** 2026-02-25
**Status:** Active
**Audience:** Francisco (project lead), all developers, AI coding agents (Claude Code, Codex)
**Supersedes:** Portions of GUIDE-002 §3 (pipeline) and §5 (agent workflow)

---

## 1. Purpose

This guide defines the **end-to-end lifecycle** for every feature in Chief Wiggum — from conception through verification. It ensures that features are planned with testability in mind, implemented with quality gates, and verified before they can be considered "Done."

The protocol is **mandatory for all contributors** — human or AI agent. It integrates with the existing handover system (`.claude/handover.json`), Linear issue tracking, and CI pipeline.

### 1.1 Why This Exists

Chief Wiggum is built by a human–AI team where multiple AI agents work in parallel sessions. Without a shared protocol:

- Features ship without tests (current coverage: ~25%)
- Agents mark tasks "done" without verifying they haven't broken other features
- There's no traceability between features and their test coverage
- Regressions are discovered manually instead of automatically

This protocol closes those gaps.

### 1.2 The Three Protocols

```
┌─────────────────────────────────────────────────────┐
│                 DEVELOPMENT LIFECYCLE                │
│                                                     │
│  ┌──────────┐    ┌───────────────┐    ┌──────────┐  │
│  │ PLANNING │ ─→ │IMPLEMENTATION │ ─→ │VERIFY    │  │
│  │ Protocol │    │  Protocol     │    │ Protocol │  │
│  └──────────┘    └───────────────┘    └──────────┘  │
│                                                     │
│  Linear Issue     handover.json       CI Pipeline   │
│  + Test Plan      + Test Execution    + Gates       │
│  + Coverage Map   + Coverage Report   + Matrix      │
└─────────────────────────────────────────────────────┘
```

---

## 2. Feature Planning Protocol

**When:** Before any code is written — when creating a Linear issue or epic.

### 2.1 Linear Issue Template

Every new feature issue MUST include a **Test Requirements** section. This is non-negotiable, whether the issue is created by a human or an AI agent.

```markdown
## Test Requirements

### Test Layers
- [ ] Unit tests (Rust): [list specific functions/modules]
- [ ] Unit tests (Frontend): [list specific stores/components]
- [ ] Integration tests: [list IPC contracts to verify]
- [ ] E2E tests (Playwright): [list user flows]
- [ ] Snapshot tests: [list serialization formats]

### Estimated Test Count
- Rust unit: ~X tests
- Frontend unit: ~X tests
- Integration: ~X tests
- E2E: ~X scenarios

### Regression Risk
- Which existing features could this break?
- Which existing tests should still pass?

### Coverage Target
- New code coverage: ≥85%
- Security/permission code: ≥95%
- Overall project coverage: must not decrease
```

### 2.2 Epic-Level Test Architecture

When planning an epic (3+ related tasks), include a **Test Architecture** section:

```markdown
## Test Architecture

### New Test Files
- `src-tauri/src/{module}/mod.rs` → `#[cfg(test)] mod tests`
- `src/stores/__tests__/{store}.test.ts`
- `tests/e2e/{feature}/{flow}.spec.ts`

### Test Infrastructure Needed
- [ ] New mock/fixture: [describe]
- [ ] New test helper: [describe]
- [ ] CI pipeline changes: [describe]

### Contract Tests
- IPC command `{name}` → expected input/output shape
- Event `{name}` → expected payload shape
```

### 2.3 Test Categorization by Feature Type

Use this matrix when planning tests for a new feature:

| Feature Type | Unit (Rust) | Unit (Frontend) | Integration | E2E | Snapshot | Property |
|---|---|---|---|---|---|---|
| **Backend command** | Required | — | Required | — | Optional | — |
| **IPC bridge** | Required | Required | Required | Optional | Required | — |
| **UI component** | — | Required | — | Required | — | — |
| **Store logic** | — | Required | — | Optional | — | — |
| **Parser/codec** | Required | — | — | — | Required | Required |
| **Permission/security** | Required | Required | Required | Required | — | Required |
| **Database query** | Required | — | Required | — | — | — |
| **File I/O** | Required | — | Required | Optional | — | — |
| **Keyboard shortcut** | — | — | — | Required | — | — |
| **Settings/config** | Required | Required | Required | — | — | — |

### 2.4 Coverage Map Maintenance

The project maintains a living **Feature Coverage Matrix** at `docs/TESTING-MATRIX.md`. This file maps every CHI issue to its test coverage status.

Format:

```markdown
| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Coverage % | Status |
|-----|---------|----------|----------|-------------|-----|------------|--------|
| 45  | start_session_cli | ✅ 4 | — | ✅ 2 | ✅ 1 | 88% | COVERED |
| 46  | Streaming event loop | ❌ 0 | — | ❌ 0 | ⚠️ 1 | 12% | GAP |
| 117 | @-mention autocomplete | — | ❌ 0 | — | ⚠️ 1 | 35% | AT RISK |
```

**Update rules:**
- New features: Add a row when the Linear issue is created (pre-implementation)
- Implementation complete: Update counts and coverage %
- Every sync check: Verify matrix matches actual test files

---

## 3. Implementation Protocol

**When:** During development — whether by human or AI agent.

### 3.1 The Implementation Sequence

Every feature follows this exact order:

```
1. Read the spec + test requirements from Linear issue
2. Write the test plan (what will be tested, how)
3. Write failing tests first (TDD where practical)
4. Implement the feature
5. Make all tests pass
6. Run full validation suite
7. Update handover.json with test metadata
8. Update TESTING-MATRIX.md
```

Steps 3-5 can overlap (not every feature suits strict TDD), but **steps 6-8 are mandatory before marking "done."**

### 3.2 Test Writing Standards

#### 3.2.1 Rust Unit Tests

Every public function in business logic modules gets at least one test. Tests live in the same file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_happy_path() {
        // Arrange
        let input = create_test_input();
        // Act
        let result = function_under_test(input);
        // Assert
        assert!(result.is_ok());
        assert_eq!(result.unwrap().field, expected_value);
    }

    #[test]
    fn test_function_error_case() {
        let result = function_under_test(invalid_input());
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::SpecificVariant { .. }));
    }
}
```

**Naming convention:** `test_{function}_{scenario}` — e.g., `test_parse_chunk_with_unicode`, `test_spawn_session_when_limit_reached`.

#### 3.2.2 Frontend Unit Tests (Vitest + solid-testing-library)

Store logic and component behavior get Vitest tests:

```typescript
// src/stores/__tests__/sessionStore.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';

describe('sessionStore', () => {
  it('creates a new session with default model', () => {
    createRoot((dispose) => {
      const store = createSessionStore();
      store.createSession();
      expect(store.sessions().length).toBe(1);
      expect(store.sessions()[0].model).toBe('sonnet');
      dispose();
    });
  });
});
```

**IPC mocking:** Use `@tauri-apps/api/mocks` to mock backend calls:

```typescript
import { mockIPC } from '@tauri-apps/api/mocks';

beforeEach(() => {
  mockIPC((cmd, args) => {
    if (cmd === 'create_session') return { id: 'test-id', title: 'New Session' };
    if (cmd === 'list_sessions') return [];
  });
});
```

#### 3.2.3 Integration Tests

Test the contract between frontend and backend without spinning up the full Tauri app:

- **Rust side:** Test command handlers with real database (in-memory SQLite) but mocked external processes
- **Frontend side:** Test stores with mocked IPC that returns realistic data shapes

#### 3.2.4 E2E Tests (Playwright)

Test critical user flows end-to-end. Follow the existing structure:

```
tests/e2e/
├── smoke.spec.ts                    # App boots, basic rendering
├── layout/                          # 5-zone layout
├── conversation/                    # Message flow
├── permissions/                     # Permission dialogs
├── terminal/                        # Terminal pane
├── integration/                     # Cross-component flows
├── actions/                         # Project actions (NEW)
├── settings/                        # Settings overlay (NEW)
├── explorer/                        # File tree + @-mention (NEW)
└── reporters/
    └── failure-reporter.ts          # CI failure → structured output
```

**E2E naming:** `{feature}-{flow}.spec.ts` — e.g., `actions-discovery.spec.ts`, `settings-theme-switch.spec.ts`.

**E2E golden rule:** Test the **user's journey**, not implementation details. Each spec should read like a user story:

```typescript
test('user can discover and run a project action', async ({ page }) => {
  // Open actions panel
  await page.click('[data-testid="view-tab-actions"]');
  // Verify discovery found package.json scripts
  await expect(page.locator('[data-testid="action-row"]')).toHaveCount.greaterThan(0);
  // Run an action
  await page.click('[data-testid="action-run-dev"]');
  // Verify output appears
  await expect(page.locator('[data-testid="action-output"]')).toBeVisible();
});
```

#### 3.2.5 Snapshot Tests (insta for Rust, Vitest for TS)

Use for serialization stability — bridge events, IPC payloads, parsed structures:

```rust
use insta::assert_yaml_snapshot;

#[test]
fn test_bridge_event_serialization() {
    let event = BridgeEvent::Chunk { content: "hello".into(), session_id: "s1".into() };
    assert_yaml_snapshot!(event);
}
```

First run creates a snapshot file. Subsequent runs compare. Changes require explicit `cargo insta review`.

#### 3.2.6 Property-Based Tests (proptest)

Use for parsers, codecs, and any function that should handle arbitrary input:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn stream_parser_never_panics(input in "\\PC{0,500}") {
        // Property: parser must not panic on any input
        let mut parser = StreamParser::new();
        let _ = parser.feed(&input);
    }

    #[test]
    fn cost_calculation_non_negative(
        input_tokens in 0u64..1_000_000,
        output_tokens in 0u64..1_000_000,
    ) {
        let cost = calculate_cost(input_tokens, output_tokens, "sonnet");
        prop_assert!(cost >= 0.0);
    }
}
```

### 3.3 Handover Test Metadata

When updating `.claude/handover.json` after completing a task, include test metadata:

```json
{
  "CHI-XX": {
    "title": "Feature Name",
    "status": "done",
    "testing": {
      "rust_unit_tests": 5,
      "frontend_unit_tests": 3,
      "integration_tests": 2,
      "e2e_tests": 1,
      "snapshot_tests": 2,
      "property_tests": 0,
      "coverage_percent": 88,
      "test_files": [
        "src-tauri/src/module/mod.rs (tests mod)",
        "tests/e2e/feature/flow.spec.ts"
      ],
      "regression_verified": true
    }
  }
}
```

**Rule:** A task cannot be marked `"status": "done"` without the `testing` object populated and `regression_verified: true`.

### 3.4 Agent-Specific Guardrails

When an AI agent (Claude Code, Codex) implements a feature:

**Pre-implementation:**
1. Agent reads Linear issue including Test Requirements section
2. Agent outputs test plan in commit message or PR description
3. Agent confirms which existing tests could be affected

**During implementation:**
1. Agent writes tests alongside feature code (not after)
2. Agent runs `cargo test` after every significant change
3. Agent does NOT use `.unwrap()` in production code
4. Agent does NOT skip tests "to save time"

**Post-implementation:**
1. Agent runs full validation: `cargo test && cargo clippy && npm run typecheck && npm run lint`
2. Agent verifies all pre-existing tests still pass
3. Agent updates handover.json with testing metadata
4. Agent updates TESTING-MATRIX.md

**Forbidden agent behaviors:**
- Marking a task "done" without tests
- Writing mock-heavy tests that don't test real behavior
- Deleting or modifying existing tests to make new code pass
- Skipping E2E tests for user-facing features

---

## 4. Verification Protocol

**When:** Before merge, during CI, and at phase gates.

### 4.1 Local Verification (Pre-Push)

Every contributor (human or agent) runs this before pushing:

```bash
# Full local validation
cargo fmt --all -- --check           # Rust formatting
cargo clippy -- -W clippy::all       # Rust linting
cargo test --all                     # Rust unit + integration tests
npm run typecheck                    # TypeScript type checking
npm run lint                         # ESLint
npm run format:check                 # Prettier
npm run test:unit                    # Frontend unit tests (Vitest)
npx playwright test                  # E2E tests (optional locally)
```

**Shortcut for agents:** `npm run validate` (to be added — runs all checks in sequence).

### 4.2 CI Pipeline Gates

The CI pipeline (`.github/workflows/ci.yml`) enforces these gates on every PR:

```
┌─────────────────────────────────────────────────────┐
│                    CI PIPELINE                       │
│                                                     │
│  Stage 1: Format & Lint (parallel)                  │
│  ├── cargo fmt --check          (ubuntu)            │
│  ├── cargo clippy               (ubuntu)            │
│  ├── npm run typecheck          (ubuntu)            │
│  ├── npm run lint               (ubuntu)            │
│  └── npm run format:check       (ubuntu)            │
│                                                     │
│  Stage 2: Tests (parallel, matrix)                  │
│  ├── cargo test                 (ubuntu, mac, win)  │
│  ├── npm run test:unit          (ubuntu)            │
│  └── npm run test:coverage      (ubuntu)            │
│                                                     │
│  Stage 3: E2E (after Stage 1+2)                     │
│  └── npx playwright test        (ubuntu)            │
│                                                     │
│  Stage 4: Build (after Stage 1+2)                   │
│  └── cargo tauri build          (ubuntu, mac, win)  │
│                                                     │
│  Gate: ALL stages must pass to merge                │
└─────────────────────────────────────────────────────┘
```

**Coverage enforcement:**
- Overall coverage must not decrease from main branch
- New files must have ≥85% coverage
- Permission/security modules must have ≥95% coverage

### 4.3 PR Checklist

Every PR description includes this checklist (enforced by PR template):

```markdown
## Test Checklist

- [ ] New tests added for all new business logic
- [ ] All existing tests still pass (`cargo test && npm run test:unit`)
- [ ] E2E test added for user-facing changes (if applicable)
- [ ] No `.unwrap()` or `panic!()` in production code
- [ ] Coverage has not decreased
- [ ] `TESTING-MATRIX.md` updated with new coverage data
- [ ] `handover.json` updated with testing metadata

## Regression Check

- [ ] Ran full test suite locally
- [ ] Verified features listed in "Regression Risk" section still work
- [ ] No snapshot changes without explicit review
```

### 4.4 Contract Testing (IPC Boundary)

The IPC layer between Rust and SolidJS is the most fragile boundary. Every IPC command has a contract test:

**Rust side** (command handler test):
```rust
#[test]
fn test_create_session_returns_expected_shape() {
    let result = create_session(test_db(), "Test".into(), "sonnet".into());
    let json = serde_json::to_value(result.unwrap()).unwrap();
    // Verify the shape matches what frontend expects
    assert!(json["id"].is_string());
    assert!(json["title"].is_string());
    assert!(json["model"].is_string());
    assert!(json["created_at"].is_string());
}
```

**Frontend side** (store test with mocked IPC):
```typescript
it('handles create_session response shape', async () => {
  mockIPC((cmd) => {
    if (cmd === 'create_session') return {
      id: 'uuid', title: 'Test', model: 'sonnet', created_at: '2026-01-01T00:00:00Z'
    };
  });
  const session = await invoke('create_session', { title: 'Test', model: 'sonnet' });
  expect(session.id).toBeTypeOf('string');
  expect(session.model).toBe('sonnet');
});
```

If either side changes the shape, the other side's test breaks — catching integration bugs before they reach users.

### 4.5 Regression Prevention Strategy

#### Snapshot Tests (Golden Files)
- All IPC event payloads have snapshot tests (`insta` crate)
- All serialized database rows have snapshot tests
- Snapshot diffs are reviewed in PRs like code changes

#### Property-Based Tests
- Stream parser: cannot panic on any input
- Cost calculator: output always non-negative
- Permission manager: always returns a valid state

#### E2E Smoke Suite
- The `smoke.spec.ts` test runs first and gates all other E2E tests
- If the app can't boot, nothing else runs

### 4.6 Phase Gate Verification

At the end of each development phase, run the full verification:

```bash
# Phase gate verification
cargo test --all                     # All Rust tests
npm run test:unit                    # All frontend unit tests
npm run test:coverage                # Coverage report
npx playwright test                  # Full E2E suite
npm run build                        # Production build
```

Phase gate criteria:
- All tests pass on all 3 platforms (macOS, Windows, Linux)
- Coverage meets thresholds (85% overall, 95% security)
- No known P0 or P1 bugs
- TESTING-MATRIX.md is up to date
- All features in the phase have at least one test per required layer

---

## 5. Testing Infrastructure

### 5.1 Test Framework Stack

| Layer | Tool | Config File |
|---|---|---|
| Rust unit/integration | `cargo test` (built-in) | `Cargo.toml` |
| Rust snapshots | `insta` | `cargo-insta.yaml` |
| Rust property | `proptest` | Inline config |
| Rust coverage | `cargo-tarpaulin` | `.tarpaulin.toml` |
| Frontend unit | `vitest` + `solid-testing-library` | `vitest.config.ts` |
| Frontend coverage | `vitest --coverage` (v8) | `vitest.config.ts` |
| E2E | `playwright` | `playwright.config.ts` |
| IPC mocking | `@tauri-apps/api/mocks` | — |

### 5.2 Test File Conventions

```
src-tauri/src/
├── bridge/
│   ├── mod.rs              # #[cfg(test)] mod tests at bottom
│   ├── process.rs          # #[cfg(test)] mod tests at bottom
│   └── parser.rs           # #[cfg(test)] mod tests at bottom
├── ...

src/
├── stores/
│   └── __tests__/
│       ├── sessionStore.test.ts
│       ├── conversationStore.test.ts
│       └── ...
├── components/
│   └── __tests__/
│       ├── MessageBubble.test.tsx
│       └── ...

tests/
├── e2e/
│   ├── smoke.spec.ts
│   ├── layout/
│   ├── conversation/
│   ├── permissions/
│   ├── actions/
│   ├── settings/
│   ├── explorer/
│   ├── integration/
│   └── reporters/
└── fixtures/
    ├── bridge-events/       # JSON fixtures for bridge event tests
    ├── mock-sessions/       # Database fixtures
    └── cli-output/          # Recorded CLI output for parser tests
```

### 5.3 Mock and Fixture Strategy

| What | Mock Strategy |
|---|---|
| Claude Code CLI | `MockBridge` (existing in `process.rs`) with recorded fixtures |
| Database | In-memory SQLite with test migrations |
| File system | `tempdir` crate for isolated test directories |
| Tauri IPC | `@tauri-apps/api/mocks` → `mockIPC()` |
| Time-dependent logic | Inject clock trait / mock `Instant::now()` |
| PTY processes | Mock `portable-pty` with predefined output sequences |

---

## 6. Integration with Existing Systems

### 6.1 Handover Protocol Integration

The existing `.claude/handover.json` gains a `testing` section per task (see §3.3). The sync check protocol (Cowork ↔ Claude Code) now includes:

1. Verify `testing` metadata exists for all "done" tasks
2. Verify `regression_verified: true` for all "done" tasks
3. Flag tasks marked "done" without test metadata as **incomplete**

### 6.2 Linear Integration

Linear issues gain the Test Requirements section (see §2.1). The acceptance criteria for any issue now implicitly includes "tests written and passing per GUIDE-003."

### 6.3 CLAUDE.md Integration

Add to the **Non-Negotiable Rules** section of CLAUDE.md:

```markdown
- **Testing:** Every feature must ship with tests per GUIDE-003. No task is "done" without tests.
- **Coverage:** New code ≥85% coverage. Permission/security code ≥95%.
- **Regression:** All existing tests must pass before marking any task complete.
```

### 6.4 CI Integration

The CI pipeline (`.github/workflows/ci.yml`) is extended with:

- `npm run test:unit` job (frontend Vitest tests)
- `npm run test:coverage` job with threshold enforcement
- Coverage report uploaded as PR comment
- TESTING-MATRIX.md validation (optional automation)

---

## 7. Coverage Gap Remediation Plan

Current state (as of 2026-02-25): ~25% estimated coverage, 212 tests (186 Rust + 26 E2E, 0 frontend unit).

### 7.1 Priority 1 — Critical Gaps (0% coverage, high-risk modules)

| Module | LOC | Risk | Action |
|---|---|---|---|
| `bridge/manager.rs` | 507 | Session lifecycle | Add 8-10 unit tests |
| `bridge/event_loop.rs` | 551 | Real-time streaming | Add 6-8 unit tests + snapshot tests |
| `actions/manager.rs` | 202 | Concurrent execution | Add 5-7 unit tests |
| `commands/bridge.rs` | 419 | IPC handlers | Add integration tests |

### 7.2 Priority 2 — Frontend Testing Foundation

| Action | Effort |
|---|---|
| Configure Vitest + solid-testing-library | 2-3 hours |
| Add IPC mock helpers | 2-3 hours |
| Test all 8 stores (basic CRUD operations) | 8-12 hours |
| Test critical components (MessageInput, ConversationView) | 6-8 hours |

### 7.3 Priority 3 — Expand E2E Coverage

| Missing E2E Suite | Scenarios |
|---|---|
| Actions (CHI-138) | Discover → Run → Stop → Ask AI |
| Settings (CHI-124) | Open → Change → Verify persistence |
| File Explorer (CHI-116) | Browse → @-mention → Preview → Range select |
| Theme (CHI-130) | Switch dark/light/system → Verify colors |
| i18n (CHI-126) | Switch locale → Verify strings |

---

## 8. Quick Reference Card

### Before Creating a Feature (Planning)
- [ ] Test Requirements section in Linear issue
- [ ] Row added to TESTING-MATRIX.md
- [ ] Test architecture defined for epics

### Before Marking "Done" (Implementation)
- [ ] Tests written per categorization matrix (§2.3)
- [ ] `cargo test` passes all Rust tests
- [ ] `npm run test:unit` passes all frontend tests
- [ ] Coverage ≥85% on new code
- [ ] `handover.json` updated with `testing` metadata
- [ ] `TESTING-MATRIX.md` updated

### Before Merging (Verification)
- [ ] CI pipeline all green
- [ ] PR checklist complete (§4.3)
- [ ] No snapshot changes without review
- [ ] No coverage regression

---

## Appendix A: npm Scripts Reference

Add these to `package.json`:

```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "validate": "cargo fmt --all -- --check && cargo clippy -- -W clippy::all && cargo test --all && npm run typecheck && npm run lint && npm run format:check && npm run test:unit"
  }
}
```

## Appendix B: Useful Commands

```bash
# Run specific Rust test module
cargo test --lib bridge::parser::tests

# Run with output visible
cargo test -- --nocapture

# Update snapshots (insta)
cargo insta review

# Run single Playwright test
npx playwright test tests/e2e/actions/discovery.spec.ts

# Generate coverage report
cargo tarpaulin --out html --output-dir coverage/rust
npm run test:coverage -- --reporter=html

# Quick regression check (all layers)
cargo test --all && npm run test:unit && npx playwright test tests/e2e/smoke.spec.ts
```
