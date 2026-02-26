# TASKS-003: Quality Coverage Enhancement (90%+ Line Coverage)

**Created:** 2026-02-26
**Epic:** CHI-164 (created in Linear)
**Parent Project:** Phase 2: Make It Real
**Depends on:** CHI-146 (Test Coverage to 90%+ — DONE)

---

## Overview

CHI-146 built the test foundation (555 tests, 60% CI gate). This epic closes the remaining gaps:
- **37/43 components** at 0% unit coverage → frontend line coverage only 15.92%
- **5 critical E2E flows** untested (slash commands, diff review, diagnostics export, etc.)
- **8 integration paths** unvalidated (settings→theme, session→conversation, context→cost, etc.)
- **CI threshold** stuck at 60% — needs ramp to 75%→85%→90%

---

## Track F: Playwright E2E Critical Flows

### CHI-165: E2E — Slash Command Menu + Discovery

**Priority:** Urgent
**Track:** F1
**Components:** `SlashCommandMenu.tsx`, `MessageInput.tsx`, `slashStore.ts`

**Why critical:** Slash commands are the primary extension/discovery mechanism. Zero E2E coverage today — users cannot validate that typing `/` actually shows commands.

**Test flows:**
1. Type `/` in empty MessageInput → SlashCommandMenu dropdown appears
2. Menu shows categorized commands (Builtin, Project, SDK/MCP)
3. Type filter text (e.g., `/hel`) → fuzzy search narrows results
4. Arrow keys navigate highlighted item up/down (wrap at edges)
5. Enter key selects command → inserts into input with proper formatting
6. Escape key dismisses menu → input retains cursor position
7. Tab key auto-completes highlighted command
8. Menu disappears when input loses focus
9. SDK commands appear after `cli:init` event (if applicable)

**Acceptance criteria:**
- 8-10 Playwright tests in `tests/e2e/conversation/slash-commands.spec.ts`
- Covers slash trigger, filtering, keyboard nav, selection, dismissal
- slashStore `filteredCommands()` verified via DOM content

---

### CHI-166: E2E — Sidebar Session Actions (Rename, Pin, Delete)

**Priority:** High
**Track:** F2
**Components:** `Sidebar.tsx`, `sessionStore.ts`

**Test flows:**
1. Right-click session → context menu with Rename/Pin/Delete options
2. Click Rename → inline text input appears with current name
3. Edit name → Enter saves → title updates in sidebar + TitleBar
4. Edit name → Escape cancels → original name preserved
5. Click Pin → session moves to Pinned section
6. Click Unpin → session moves back to Recent
7. Click Delete → session removed → auto-switches to next session
8. Pinned section collapses/expands
9. Session count badges update correctly

**Acceptance criteria:**
- 8-10 Playwright tests in `tests/e2e/integration/session-actions.spec.ts`
- Covers rename flow, pin/unpin, delete with auto-switch

---

### CHI-167: E2E — Settings Modal Interactions

**Priority:** High
**Track:** F3
**Components:** `SettingsModal.tsx`, `settingsStore.ts`

**Test flows:**
1. Cmd+, opens SettingsModal overlay
2. Category sidebar shows General/Appearance/Keyboard/Advanced sections
3. Click category → content panel switches
4. Search input filters settings by name/label
5. Toggle control (e.g., Dark Mode) updates immediately
6. Theme change (dark/light/system) applies visually
7. Locale change switches UI text (English → Spanish)
8. Number input validates range (e.g., max concurrent sessions)
9. Settings persist after modal close and reopen
10. Escape key closes modal

**Acceptance criteria:**
- 8-10 Playwright tests in `tests/e2e/settings/settings-interactions.spec.ts`
- Covers category nav, search, toggle, theme, locale, validation, persistence

---

### CHI-168: E2E — Diff Review Pane

**Priority:** High
**Track:** F4
**Components:** `DiffPreviewPane.tsx`, `diffReviewStore.ts`

**Test flows:**
1. View tab "Diff" (or Cmd+2) switches to DiffPreviewPane
2. Empty state displays when no diff available
3. Diff content renders with syntax highlighting (added/removed lines)
4. Line range selection works (click + drag or shift+click)
5. Copy diff button copies content to clipboard
6. Pane resizes correctly with layout changes

**Acceptance criteria:**
- 5-7 Playwright tests in `tests/e2e/integration/diff-review.spec.ts`
- Covers view switch, rendering, selection, copy

---

### CHI-169: E2E — Diagnostics Export Dialog

**Priority:** High
**Track:** F5
**Components:** `ExportDialog.tsx`, `diagnosticsStore.ts`

**Test flows:**
1. Cmd+Shift+D opens ExportDialog
2. Dialog shows consent preview (what data will be included)
3. "Copy Debug Info" button copies JSON to clipboard
4. Redaction summary shows what was sanitized
5. Dialog closes on cancel/escape
6. StatusBar export button also opens dialog

**Acceptance criteria:**
- 5-7 Playwright tests in `tests/e2e/integration/diagnostics-export.spec.ts`
- Covers open triggers, consent preview, copy action, close

---

## Track G: Component Unit Tests

### CHI-170: Component Tests — Conversation Rendering

**Priority:** High
**Track:** G1
**Components:** `ConversationView.tsx`, `MessageBubble.tsx`, `MarkdownContent.tsx`
**Blocked by:** CHI-147 (frontend test infrastructure — DONE)

**What to test:**
- **ConversationView:** Empty state rendering, message list, auto-scroll trigger, virtual scrolling fallback
- **MessageBubble:** Role labels (human/assistant), model badge, cost display, copy button, markdown content delegation
- **MarkdownContent:** Code block rendering with highlight.js, copy button feedback, inline code, link handling

**Target:** 20-25 unit tests
**Expected coverage impact:** +3-5% frontend line coverage (these are large components)

**Acceptance criteria:**
- Tests in `src/components/conversation/ConversationView.test.tsx`, `MessageBubble.test.tsx`, `MarkdownContent.test.tsx`
- Cover core rendering paths, prop variations, user interactions

---

### CHI-171: Component Tests — Slash & Context UI

**Priority:** Urgent
**Track:** G2
**Components:** `SlashCommandMenu.tsx`, `FileMentionMenu.tsx`, `ContextSuggestions.tsx`, `ContextBreakdownModal.tsx`

**What to test:**
- **SlashCommandMenu:** Renders command list, category headers, highlight state, selection callback, empty filter state
- **FileMentionMenu:** File list rendering, search filtering, selection inserts chip
- **ContextSuggestions:** Suggestion chip rendering, click-to-add, dismiss
- **ContextBreakdownModal:** Score display, quality badge, token breakdown

**Target:** 20-25 unit tests
**Expected coverage impact:** +2-3% frontend line coverage

**Acceptance criteria:**
- Tests in `src/components/conversation/SlashCommandMenu.test.tsx`, `FileMentionMenu.test.tsx`, etc.
- SlashCommandMenu tests validate category grouping, fuzzy match rendering, keyboard nav indicators

---

### CHI-172: Component Tests — Layout Shell

**Priority:** High
**Track:** G3
**Components:** `Sidebar.tsx`, `StatusBar.tsx`, `DetailsPanel.tsx`, `TitleBar.tsx`, `MainLayout.tsx`

**What to test:**
- **Sidebar:** Session list rendering, pinned/recent/older sections, collapsed icon-rail mode, search filter
- **StatusBar:** Cost display, token count, running process badge, export button
- **DetailsPanel:** Panel switching (context/cost/preview), file preview delegation
- **TitleBar:** Model selector integration, settings gear, platform-aware controls
- **MainLayout:** View tab rendering, panel transitions, split pane container

**Target:** 25-30 unit tests
**Expected coverage impact:** +5-8% frontend line coverage (Sidebar alone is 1178 LOC)

**Acceptance criteria:**
- Tests in `src/components/layout/*.test.tsx`
- Cover core rendering, prop-driven state changes, collapsed/expanded modes

---

### CHI-173: Component Tests — Settings, Onboarding, Permissions

**Priority:** Medium
**Track:** G4
**Components:** `SettingsModal.tsx`, `OnboardingFlow.tsx`, `PermissionDialog.tsx`, `YoloWarningDialog.tsx`

**What to test:**
- **SettingsModal:** Category rendering, search filtering, control types (toggle, input, select), validation
- **OnboardingFlow:** Step progression (5 steps), next/back/skip, step content rendering
- **PermissionDialog:** Risk coloring (low=green, medium=yellow, high=red), timeout display, approve/deny buttons
- **YoloWarningDialog:** Warning text, confirm/cancel flow

**Target:** 20-25 unit tests
**Expected coverage impact:** +3-5% frontend line coverage

**Acceptance criteria:**
- Tests in `src/components/settings/SettingsModal.test.tsx`, `src/components/onboarding/OnboardingFlow.test.tsx`, `src/components/permissions/*.test.tsx`

---

### CHI-174: Component Tests — Explorer, Actions, Terminal

**Priority:** Medium
**Track:** G5
**Components:** `FileTree.tsx`, `FileTreeNode.tsx`, `FilePreview.tsx`, `ActionsPanel.tsx`, `ActionOutputPanel.tsx`, `TerminalPane.tsx`

**What to test:**
- **FileTree:** Root node rendering, expand/collapse, search filter, loading state
- **FileTreeNode:** Icon by file type, indent level, click handler, git status indicator
- **FilePreview:** Syntax highlighting, line numbers, pagination, copy path button
- **ActionsPanel:** Action list rendering, run/stop buttons, status indicators
- **ActionOutputPanel:** Streaming output, Ask AI button, clear button
- **TerminalPane:** Mount/unmount lifecycle (xterm.js mocking), theme prop application

**Target:** 25-30 unit tests
**Expected coverage impact:** +4-6% frontend line coverage

**Acceptance criteria:**
- Tests in `src/components/explorer/*.test.tsx`, `src/components/actions/*.test.tsx`, `src/components/terminal/TerminalPane.test.tsx`

---

## Track H: Integration Tests + CI Threshold

### CHI-175: Cross-Store Integration Tests

**Priority:** Medium
**Track:** H1
**Blocked by:** CHI-170-174

**Integration paths to test:**
1. **Settings → Theme:** Change theme in settingsStore → CSS variables update → terminal re-themes
2. **Session → Conversation:** Switch session → conversationStore loads messages → unread badge clears
3. **Context → Cost:** Add @-mention → contextStore updates tokens → cost estimate in StatusBar
4. **Action → Output → Conversation:** Start action → output streams → "Ask AI" inserts into conversation
5. **Slash → MessageInput:** Type `/` → slashStore opens menu → select command → input receives text
6. **Permission → Conversation:** Permission request → dialog response → inline record appears

**Target:** 15-20 integration tests
**Test approach:** Multi-store tests using shared IPC mock layer, testing reactive signal chains

**Acceptance criteria:**
- Tests in `src/stores/__integration__/` directory
- Each integration path has at least 2 tests (happy path + error)

---

### CHI-176: CI Coverage Threshold Ramp

**Priority:** Medium
**Track:** H2
**Blocked by:** CHI-165-175

**Tasks:**
1. Measure actual combined coverage after Track F+G complete
2. Bump `.github/workflows/ci.yml` coverage-gate threshold: 60% → 75%
3. Add per-file coverage thresholds in vitest.config.ts for critical stores (contextStore ≥ 85%, slashStore ≥ 80%)
4. Add coverage trend comment to PR (show delta vs main)
5. Update TESTING-MATRIX.md with final coverage numbers
6. Document threshold ramp plan: 75% → 85% → 90% with dates

**Acceptance criteria:**
- CI coverage gate at 75% and passing
- Per-file thresholds for top 5 stores
- PR coverage comment shows delta
- TESTING-MATRIX updated with measured coverage

---

## Dependency Graph

```
Track F (E2E):     CHI-165 ──┐
                   CHI-166 ──┤
                   CHI-167 ──┤── all parallel, no dependencies
                   CHI-168 ──┤
                   CHI-169 ──┘

Track G (Unit):    CHI-170 ──┐
                   CHI-171 ──┤── all parallel (depend on CHI-147 DONE)
                   CHI-172 ──┤
                   CHI-173 ──┤
                   CHI-174 ──┘

Track H (Integ):   CHI-175 ── depends on Track G
                   CHI-176 ── depends on Track F + G + H1
```

**Critical path:** All of Track F+G can run in parallel → CHI-175 → CHI-176

---

## Expected Impact

| Metric | Before | After Track F+G | After Track H |
|--------|--------|-----------------|---------------|
| Frontend line coverage | 15.92% | ~55-65% | ~65-75% |
| Component test coverage | 7% (3/43) | ~65% (28/43) | ~65% |
| E2E test count | 70 | ~110 | ~110 |
| Unit test count | 203 | ~330 | ~350 |
| CI threshold | 60% | 60% | 75% |
| TESTING-MATRIX GAPs | 1 | 0 | 0 |
| Total tests | 555 | ~700 | ~740 |
