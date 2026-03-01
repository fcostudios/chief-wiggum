# TASKS-006: UX Excellence — Differentiating Product Experience

**Status:** Planned (Backlog)
**Linear Epic:** CHI-224 — UX Excellence
**Created:** 2026-02-28
**Author:** Cowork Session 9
**Input:** KAIMAN Cerebro UX investigation report (audit of Chief Wiggum's own screens), full codebase audit

---

## 1. Executive Summary

**KAIMAN Cerebro** is an AI-powered design & product intelligence platform. It performed a structured UX investigation *of Chief Wiggum* — evaluating 12 product screens with 91% confidence across navigation, layout, interaction, and progressive disclosure dimensions. This is an internal audit report, not a competitive analysis.

This spec translates those findings into six targeted, implementation-ready tasks that will make Chief Wiggum genuinely delightful to use — the kind of product developers evangelize to their teams.

### Research inputs

1. **KAIMAN Cerebro UX audit:** Structured evaluation of Chief Wiggum's 12 screens — SessionView, FileExplorer, TitleBar, Sidebar, StatusBar, SettingsModal, CommandPalette, PermissionDialog, DetailsPanel, ThinkingBlock, ToolUseBlock, OnboardingFlow
2. **Full codebase audit:** All components, stores, keybindings, layout zones, conversation flow
3. **SPEC-002, SPEC-003 review:** Current design system and UX specification
4. **First-principles:** Nielsen's 10 usability heuristics, Fitts's Law, progressive disclosure, cognitive load theory

---

## 2. Cerebro Audit Findings Summary

The KAIMAN Cerebro platform analyzed Chief Wiggum's UX across these dimensions: navigation clarity, layout efficiency, interaction feedback, progressive disclosure, accessibility, and visual hierarchy. Key findings (91% confidence):

| Finding | Affected Screen(s) | Severity |
|---|---|---|
| Session history lacks run-level metadata (status, duration, artifact count) | SessionView, Sidebar | High |
| Dismissal of "resume session" card not remembered — shows on every launch | SessionView | Medium |
| Agents tab is a dead-end placeholder with no scaffolding | Sidebar nav | Medium |
| Contextual onboarding hints shown globally instead of per-feature | All views | Medium |
| Actions Center UX quality gates need definition before implementation | ActionsPanel | High |
| Diff Review pane missing real write-back and sharing pathway | DetailsPanel | High |

---

## 3. Epic Structure

Six sub-tasks under CHI-224. Each maps to one Cerebro finding:

| Task | Title | Priority |
|------|-------|----------|
| CHI-225 | Session History & Artifact Index | High |
| CHI-226 | Session Resume Persistence | High |
| CHI-227 | Agents Tab Scaffolding v2 | Medium |
| CHI-228 | Contextual Onboarding Hints | Medium |
| CHI-229 | Actions Center UX Quality Gates | High |
| CHI-230 | Diff Review Write-Back & Sharing | High |

---

## 4. CHI-225: Session History & Artifact Index

**Linear ID:** `828e298e-...`
**Priority:** High
**Spec ref:** SPEC-003 §4 (SessionView)

### Problem

Sessions in the sidebar show only a title. Developers cannot see what happened in a session — no tool use summary, no artifact count, no duration. This makes Chief Wiggum feel like a chat app, not a professional dev tool.

### Acceptance Criteria

- [ ] Each session entry in Sidebar shows: duration (human-readable), artifact count badge, last-used model
- [ ] Clicking a session opens a DetailsPanel tab "History" with: message count, tool invocations list, artifacts list
- [ ] Artifacts panel (new DetailsPanel tab) shows all code/file/plan/diagram blocks from the session, searchable
- [ ] DB migration v5 adds `artifacts` table with `block_index` column for dedup

### DB Migration v5

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id    TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  block_index   INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL CHECK(type IN ('code','file','plan','diagram','data')),
  language      TEXT,
  title         TEXT NOT NULL,
  preview       TEXT NOT NULL,
  content       TEXT NOT NULL,
  line_count    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_artifacts_session ON artifacts(session_id, created_at DESC);
```

> Note: v4 = `action_history` (CHI-219, Actions Center). v5 = `artifacts` here. Must not conflict.

### IPC Commands

- `get_session_artifacts(session_id)` → `Vec<Artifact>`
- `get_session_summary(session_id)` → `SessionSummary { message_count, tool_count, artifact_count, duration_secs, models_used }`

### Files to create/modify

- `src-tauri/src/db/queries.rs` — add artifact CRUD
- `src-tauri/src/commands/session.rs` — add `get_session_artifacts`, `get_session_summary`
- `src/stores/sessionStore.ts` — add `sessionSummaries` map
- `src/components/layout/Sidebar.tsx` — session metadata chips
- `src/components/layout/DetailsPanel.tsx` — History + Artifacts tabs

---

## 5. CHI-226: Session Resume Persistence

**Linear ID:** `e50e0d52-...`
**Priority:** High
**Spec ref:** SPEC-003 §5 (Session Lifecycle)

### Problem

When the app reopens and detects a prior session, it shows a "Resume session?" card. If the user dismisses it, the card reappears every single launch. There is no memory of "I don't want to resume this session."

### Acceptance Criteria

- [ ] If user dismisses a resume card, a `dismissedResume` flag is set for that session (in-memory signal in `sessionStore`, not localStorage — resets per 5-min gap)
- [ ] The card does not reappear during the same app session after dismissal
- [ ] After a 5-minute gap (cold launch), the card reappears once more (new opportunity)
- [ ] "Resume" action clears the dismissed flag

### Implementation Notes

- `dismissedResume` lives in `sessionStore` as a `Set<string>` (session IDs) — plain reactive signal, not persisted to localStorage or SQLite. It resets on cold boot, which is correct.
- The 5-minute gap is detected by comparing `lastLaunchAt` (stored in settings) to `Date.now()`.
- No DB migration needed.

### Files to modify

- `src/stores/sessionStore.ts` — add `dismissedResumeSessions` set, `dismissResume(id)`, `clearDismissed(id)` actions
- `src/components/conversation/ConversationView.tsx` — check dismissed flag before rendering resume card

---

## 6. CHI-227: Agents Tab Scaffolding v2

**Linear ID:** `52fb4bdf-...`
**Priority:** Medium
**Spec ref:** SPEC-003 §6 (Navigation)

### Problem

The Agents tab in the sidebar opens to a blank placeholder. Users don't know what Agents will do, how it differs from Sessions, or when it will be available. This creates confusion and erodes trust.

### Acceptance Criteria

- [ ] Agents tab shows a rich placeholder: title, 2-sentence description of the future vision, 3 example use cases, a "Coming in Phase 4" badge
- [ ] Visual treatment uses the same empty-state pattern as CHI-80 (CW branding, muted tone, no broken UI)
- [ ] Tab badge is removed (currently shows "0" which is confusing)

### Agents vs. Actions Center separation

The Agents tab (CHI-227) is about **multi-session orchestration** — running multiple Claude agents in parallel with coordination logic. This is distinct from the **Actions Center** (CHI-138, CHI-220, CHI-221, CHI-223), which is about running project scripts/commands (`npm run dev`, `make build`, etc.) and piping their output to the active session. Do not conflate them in the UI copy.

Suggested Agents description:
> "Agents let you run multiple AI workers in parallel — each with its own session, context, and goal. Coordinate complex multi-step workflows across your codebase without losing track of what's happening."

### Files to modify

- `src/components/layout/Sidebar.tsx` — remove count badge from Agents tab
- `src/components/` — add `AgentsPlaceholder.tsx` (or extend existing `PlaceholderView.tsx`)

---

## 7. CHI-228: Contextual Onboarding Hints

**Linear ID:** `51a0fb5d-...`
**Priority:** Medium
**Spec ref:** SPEC-003 §7 (Onboarding)

### Problem

The existing onboarding flow (CHI-81) runs once on first launch as a modal walkthrough. After that, users discover features entirely by accident. Power features like `@`-mention, slash commands, split panes, context scoring, and the Actions Center go undiscovered by most users.

### Acceptance Criteria

- [ ] 10 contextual one-time hints implemented (see rule table below)
- [ ] Each hint is a dismissible tooltip anchored to the relevant UI element
- [ ] Hints are shown at most once per feature, per install (tracked in `settingsStore` under `seenHints: string[]`)
- [ ] Hints respect the 45-second queue — no two hints shown within 45s of each other
- [ ] Hints can be disabled globally in Settings → General → "Show feature hints"
- [ ] `session-resume` hint fires on first resume card *dismissal* (teaches the keyboard shortcut alternative)

### Hint Rules (10 total)

| Hint ID | Trigger | Content |
|---|---|---|
| `at-mention` | User types `@` for first time | "Type `@filename` to attach file context to your message" |
| `slash-commands` | User types `/` for first time | "Slash commands run Claude skills — type `/` to browse" |
| `split-panes` | Session count ≥ 2 for first time | "Run two sessions side-by-side with `Cmd+\\`" |
| `context-scoring` | ContextChip added for first time | "See context quality score with `Cmd+Shift+T`" |
| `message-search` | Session has ≥ 20 messages for first time | "Search conversation history with `Cmd+F`" |
| `keyboard-shortcuts` | User has been in app ≥ 5 min without using any shortcut | "Press `Cmd+/` to see all keyboard shortcuts" |
| `developer-mode` | First Bash tool invocation | "Enable Developer Mode for pre-approved Bash patterns — Settings → Developer" |
| `artifacts` | First code block in response | "Right-click code blocks to save as artifact or open in terminal" |
| `actions-center` | Project with `package.json` detected AND CHI-220 done | "Run project scripts from the Actions panel — click ▶ in the sidebar" |
| `session-resume` | Resume card dismissed for first time | "Next time, press `Cmd+Shift+R` to resume the last session instantly" |

> `actions-center` hint requires CHI-220 (Action Discovery Engine) to be implemented. Guard behind `hasActionsCenter` feature flag.

### Implementation

```typescript
// settingsStore.ts additions
interface Settings {
  // ... existing ...
  seenHints: string[];          // list of hint IDs already shown
  hintsEnabled: boolean;        // master toggle (default: true)
}

// hintStore.ts (new)
function maybeShowHint(id: HintId, anchorEl: HTMLElement): void {
  if (!settingsStore.hintsEnabled) return;
  if (settingsStore.seenHints.includes(id)) return;
  if (isInHintCooldown()) return;  // 45s between hints
  showHint(id, anchorEl);
  markHintSeen(id);              // persisted via invoke('save_settings')
}
```

### Files to create/modify

- `src/stores/hintStore.ts` — new: hint queue, cooldown, `maybeShowHint()`
- `src/stores/settingsStore.ts` — add `seenHints`, `hintsEnabled`
- `src/components/common/HintTooltip.tsx` — new: dismissible tooltip component
- `src-tauri/src/settings/` — add `seen_hints` to settings schema
- Trigger sites: `MessageInput.tsx` (`@`/`/`), `Sidebar.tsx` (split pane), `ContextChip.tsx`, `ConversationView.tsx` (message count, resume card), `ToolUseBlock.tsx` (bash), `MarkdownContent.tsx` (code block)

---

## 8. CHI-229: Actions Center UX Quality Gates

**Linear ID:** `ade63305-...`
**Priority:** High
**Spec ref:** SPEC-003 §8 (Actions Panel)

### Problem

The Actions Center (CHI-138 epic: CHI-139..145) is implemented and functional, but the KAIMAN Cerebro UX audit identified several quality gaps in the flow: no run overview screen, unclear status transitions, missing stop confirmation, no "Ask AI about this output" discoverability.

### Acceptance Criteria (quality gates)

- [ ] **G1 — Run overview:** Actions panel shows per-run metadata: start time, duration, exit code, truncated last line
- [ ] **G2 — Status chips:** `idle` / `running` / `succeeded` / `failed` / `cancelled` — color-coded, never ambiguous
- [ ] **G3 — Stop confirmation:** Stopping a running action shows a one-line confirm banner ("Stop `npm run dev`?") before kill
- [ ] **G4 — Ask AI discoverability:** "Ask AI about this output" button is always visible in the output panel header (not just on hover)
- [ ] **G5 — Empty state:** When no actions are discovered, show actionable guidance: "Add scripts to `package.json` or `.claude/actions.json`"
- [ ] **G6 — Error distinction:** Distinguish process errors (non-zero exit) from discovery errors (can't read config) with different icons and copy

### UX separation note

Actions Center (CHI-138 tasks CHI-139..145) = project scripts runner. This is NOT the same as the Agents tab (CHI-227). Ensure all copy in the Actions panel refers to "scripts" or "commands", not "agents" or "sessions".

### Files to modify

- `src/components/layout/DetailsPanel.tsx` — output panel header with "Ask AI" button always visible
- `src/stores/actionStore.ts` — add `runMetadata` (start time, duration, exit code)
- `src/components/` — `ActionStatusChip.tsx` (new: color-coded status)
- `src/components/` — `ActionStopConfirm.tsx` (new: inline confirm banner)

---

## 9. CHI-230: Diff Review Write-Back & Sharing

**Linear ID:** `0db731f6-...`
**Priority:** High
**Spec ref:** SPEC-003 §9 (Diff Review)

### Problem

The Diff Review pane (CHI-92, CHI-133) shows proposed file changes with syntax highlighting and context. But accepting a diff only marks it "applied" in memory — it doesn't write the file. There is also no way to share or export a diff for review.

### Acceptance Criteria

- [ ] "Apply" button in DiffReview pane calls `write_file_content(path, newContent)` IPC and writes the actual file
- [ ] After successful write: diff block shows "Applied ✓" badge, file is marked modified in FileTree (git status indicator)
- [ ] "Reject" marks the diff as rejected in `diffStates` map in `conversationStore` (in-memory, keyed `${messageId}:${blockIndex}`)
- [ ] "Copy diff" button copies unified diff format to clipboard
- [ ] "Share" button exports diff as a `.patch` file via `tauri-plugin-dialog` save dialog

### `diffStates` persistence note

`diffStates` is a `Record<string, 'pending'|'applied'|'rejected'>` map in `conversationStore`, keyed by `${messageId}:${blockIndex}`. It is **in-memory only** — not persisted to SQLite or localStorage. On session reload, all diffs revert to `pending`. This is intentional: stale apply/reject state from a prior session could be confusing.

### IPC reuse

`write_file_content(path: string, content: string)` — this IPC command is shared with CHI-217 (FilePreview inline editing). Ensure the command exists before implementing; if CHI-217 is not yet merged, stub it.

### Files to modify

- `src/components/conversation/` — `DiffReviewBlock.tsx` (Apply/Reject/Copy/Share actions)
- `src/stores/conversationStore.ts` — `diffStates` map, `applyDiff()`, `rejectDiff()` actions
- `src-tauri/src/commands/files.rs` — `write_file_content` (shared with CHI-217)

---

## 10. Actions Center Coupling & Quality Gates

The Actions Center (CHI-138 epic) is implemented but several UX quality gates (CHI-229, above) need to be added as comments/checklist items to the existing Linear issues:

- **CHI-220** (Action Discovery Engine — already done): Add G5 (empty state guidance) as a follow-up acceptance criterion
- **CHI-221** (Action Process Manager — already done): Add G3 (stop confirmation) and G2 (status chips) as follow-up
- **CHI-223** (Custom Action Config — already done): Add G1 (run overview metadata) as follow-up

These are polish items on top of functional implementations, not regressions.

---

## 11. Dependencies

```
CHI-225 → DB migration v5 (no blocker)
CHI-226 → sessionStore (no blocker)
CHI-227 → Sidebar component (no blocker)
CHI-228 → settingsStore + CHI-220 (for actions-center hint only)
CHI-229 → CHI-139..145 (Actions Center must be implemented first — DONE)
CHI-230 → CHI-217 (write_file_content IPC — check if merged)
```

---

## 12. Implementation Order

1. **CHI-226** (smallest, no deps) — resume persistence
2. **CHI-227** (UI-only, no deps) — agents placeholder
3. **CHI-229** (Actions Center gates, no new deps) — quality polish
4. **CHI-230** (reuses CHI-217 IPC) — diff write-back
5. **CHI-225** (DB migration, most complex) — session history
6. **CHI-228** (last, depends on settings schema) — contextual hints

---

## 13. Testing Notes

- CHI-225: Integration test for artifact extraction from a real conversation with tool blocks
- CHI-226: Unit test `dismissResume()` and cold-launch gap detection
- CHI-228: Unit test hint queue (cooldown, seen dedup, master toggle)
- CHI-229: E2E test each quality gate (G1–G6) against a mock action run
- CHI-230: Integration test `write_file_content` IPC + `diffStates` transitions
