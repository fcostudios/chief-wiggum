# Cowork Session Handover — 2026-02-26

> **Purpose:** Provide full context for a new Cowork session to continue Chief Wiggum development.
> Copy-paste the "Session Prompt" section below as your first message in the new session.

---

## Session Prompt

```
I'm continuing work on Chief Wiggum, a Tauri v2 + Rust + SolidJS desktop app wrapping Claude Code CLI. The project folder is already mounted.

READ THESE FILES FIRST (in order):
1. CLAUDE.md — the full project briefing (completed tasks, architecture, rules)
2. .claude/handover.json — machine-readable status with Linear issue IDs
3. docs/tasks/TASKS-004-conversation-experience.md — the active feature spec

CRITICAL: LINEAR MCP CHANGES
The Linear MCP server was updated on Feb 5, 2026. Key changes:
- `create_issue` and `update_issue` tools NO LONGER EXIST
- They were replaced by `save_issue` (handles both create and update)
- If `id` parameter is provided → update; if omitted → create
- Same pattern: `save_project` replaces create/update project
- The SSE endpoint was deprecated; now uses https://mcp.linear.app/mcp (Streamable HTTP)
- Tools must be manually enabled in each new Cowork session

Before using any Linear tools, verify you have `save_issue` available (not `create_issue`/`update_issue`). If not, the connector may need re-enabling in Settings → Connectors → Linear.

PROJECT STATUS SUMMARY:
- Phase 1 (Foundation): COMPLETE
- Phase 2 (Make It Real): COMPLETE
- Phase 3 (Agent SDK Integration): COMPLETE (all epics done including CHI-164)
- CHI-164 (Quality Coverage Enhancement): COMPLETE — all 12 sub-tasks done (CHI-165..176)
- CHI-78 (Custom Context Menus): DONE (completed 2026-02-26T22:07:04)
- CHI-63 (Power User UX Epic): DONE (closed with CHI-78)
- Conversation Experience project: FULLY PLANNED, ready for Wave 1 implementation

WHAT WAS COMPLETED (session 1 — earlier today):
1. Audited current conversation rendering codebase (MarkdownContent, ThinkingBlock, ToolUseBlock, contextStore)
2. Researched competitor UIs (Cursor, Windsurf, Vercel Streamdown) for feature gaps
3. Created TASKS-004-conversation-experience.md with 4 epics, 16 sub-tasks
4. Created Linear project "Conversation Experience" with all 20 issues (CHI-177..197)
5. Set all 16 parent-child relationships in Linear
6. Updated CLAUDE.md and handover.json

WHAT WAS COMPLETED (session 2 — same day, later):
1. Added Epic E: Conversation Utility Features (CHI-198 parent + CHI-200..203 children)
   - CHI-200: In-Session Message Search (High)
   - CHI-201: Conversation Export MD/HTML/TXT (Medium)
   - CHI-202: Voice Input via Web Speech API (Low)
   - CHI-203: Symbol @-Mention — @fn:, @class:, @var: (Medium)
2. Added Epic F: QA Test Coverage (CHI-199 parent + CHI-204..213 children)
   - CHI-204: Unit Tests — Renderer Registry & GFM Tables
   - CHI-205: Unit Tests — Code Block & Mermaid Renderers
   - CHI-206: Unit Tests — Math & Image Renderers
   - CHI-207: Unit Tests — Streaming & Thinking UX
   - CHI-208: Unit Tests — File Attachments
   - CHI-209: Unit Tests — Polish Features
   - CHI-210: Unit Tests — Utility Features
   - CHI-211: E2E Tests — Rich Content Rendering
   - CHI-212: E2E Tests — Attachments & Input
   - CHI-213: E2E Tests — Conversation Utility
3. Updated TASKS-004 with Epic E and F full specs + acceptance criteria
4. Updated CLAUDE.md with Conversation Experience project summary table
5. Updated handover.json with full issue ID map

FULL CONVERSATION EXPERIENCE LINEAR ISSUE MAP:
Epic A - CHI-177: Rich Content Rendering (parent)
  - CHI-181: GFM Table Rendering (Urgent) ← depends on CHI-186
  - CHI-182: Mermaid Diagram Rendering (High) ← depends on CHI-186
  - CHI-183: Enhanced Code Blocks (High) ← depends on CHI-186
  - CHI-184: LaTeX / Math Rendering (Medium) ← depends on CHI-186
  - CHI-185: Inline Image Rendering (Medium) ← depends on CHI-186
  - CHI-186: Renderer Registry & Content Detection (High) ← NO DEPS, START HERE

Epic B - CHI-178: Streaming & Thinking UX (parent)
  - CHI-187: Compact Streaming Thinking Indicator (Urgent) ← NO DEPS
  - CHI-188: Live Tool Execution Output (High)
  - CHI-189: Response Content Priority Layout (Medium) ← depends on CHI-187

Epic C - CHI-179: File Attachments & Input (parent)
  - CHI-190: Clipboard Image Paste (Urgent) ← NO DEPS
  - CHI-191: External File Drag-Drop (High) ← NO DEPS
  - CHI-192: Image Attachment Preview & Encoding (High) ← depends on C1/C2
  - CHI-193: Attachment Button & File Picker (Medium) ← NO DEPS

Epic D - CHI-180: Polish & Differentiators (parent)
  - CHI-194: Streaming Code Block Stability (Urgent) ← depends on CHI-186
  - CHI-195: Copy Actions on All Blocks (High) ← NO DEPS
  - CHI-196: Message Formatting Toggle (Low) ← NO DEPS
  - CHI-197: Response Anchor Links (Low) ← NO DEPS
  - CHI-214: TodoWrite Rich Checklist Block (High) ← NO DEPS [NEW 2026-02-27]

Epic E - CHI-198: Conversation Utility Features (parent) [NEW]
  - CHI-200: In-Session Message Search (High) ← NO DEPS
  - CHI-201: Conversation Export (Medium) ← NO DEPS
  - CHI-202: Voice Input (Low) ← NO DEPS
  - CHI-203: Symbol @-Mention (Medium) ← NO DEPS

Epic F - CHI-199: QA Test Coverage (parent) [NEW]
  - CHI-204: Unit Tests — Renderer Registry & GFM Tables (High)
  - CHI-205: Unit Tests — Code Block & Mermaid Renderers (High)
  - CHI-206: Unit Tests — Math & Image Renderers (Medium)
  - CHI-207: Unit Tests — Streaming & Thinking UX (High)
  - CHI-208: Unit Tests — File Attachments (High)
  - CHI-209: Unit Tests — Polish Features (Medium)
  - CHI-210: Unit Tests — Utility Features (Medium)
  - CHI-211: E2E Tests — Rich Content Rendering (High)
  - CHI-212: E2E Tests — Attachments & Input (High)
  - CHI-213: E2E Tests — Conversation Utility (Medium)
  - CHI-215: Unit Tests — TodoWrite Block & StatusBar Badge (High) [NEW 2026-02-27]

IMPLEMENTATION STATUS:
Wave 1 — COMPLETE (all Done in Linear as of 2026-02-26T23:59):
  ✅ CHI-186: Renderer Registry & Content Detection
  ✅ CHI-187: Compact Streaming Thinking Indicator
  ✅ CHI-190: Clipboard Image Paste (C1)
  ✅ CHI-200: In-Session Message Search (E1)

Wave 2 — NEXT (all Backlog, CHI-186 now done so deps unblocked):
  - CHI-181: GFM Table Rendering (Urgent) ← deps on CHI-186 now MET
  - CHI-183: Enhanced Code Blocks (High) ← deps on CHI-186 now MET
  - CHI-191: External File Drag-Drop (High) ← independent
  - CHI-194: Streaming Code Block Stability (High) ← deps on CHI-186 now MET
  - CHI-204: Unit Tests — Renderer Registry & GFM Tables (High) ← QA for wave 1+2
  - CHI-207: Unit Tests — Streaming & Thinking UX (High) ← QA for CHI-187
  - CHI-208: Unit Tests — File Attachments (High) ← QA for CHI-190/191

Wave 3 — After Wave 2:
  - CHI-182: Mermaid Diagram Rendering (High) ← deps CHI-186 ✅
  - CHI-188: Live Tool Execution Output (High) ← independent
  - CHI-192: Image Attachment Preview & Encoding (High) ← deps CHI-190 ✅
  - CHI-205: Unit Tests — Code Block & Mermaid Renderers

Wave 4 — After Wave 3:
  - CHI-184: LaTeX / Math Rendering (Medium) ← deps CHI-186 ✅
  - CHI-193: Attachment Button & File Picker (Medium) ← independent
  - CHI-195: Copy Actions on All Blocks (Medium) ← independent
  - CHI-206: Unit Tests — Math & Image Renderers

Wave 5 — After Wave 4:
  - CHI-185: Inline Image Rendering (Medium) ← deps CHI-186 ✅
  - CHI-189: Response Content Priority Layout (Medium) ← deps CHI-187 ✅
  - CHI-201: Conversation Export (Medium) ← independent
  - CHI-209: Unit Tests — Polish Features

Wave 6 — Final polish:
  - CHI-196: Message Formatting Toggle (Low) ← independent
  - CHI-197: Response Anchor Links (Low) ← independent
  - CHI-202: Voice Input (Low) ← independent
  - CHI-203: Symbol @-Mention (Medium) ← independent
  - CHI-210: Unit Tests — Utility Features
  - CHI-211: E2E Tests — Rich Content Rendering
  - CHI-212: E2E Tests — Attachments & Input
  - CHI-213: E2E Tests — Conversation Utility

WHAT TO DO NEXT:
Start Wave 2. Highest priority parallel tasks:
- CHI-181 (GFM Tables) — Urgent, CHI-186 done so dep is MET
- CHI-183 (Enhanced Code Blocks) — High, CHI-186 done so dep is MET
- CHI-191 (External Drag-Drop) — High, independent
- CHI-194 (Streaming Code Block Stability) — High, CHI-186 done so dep is MET
Pair with QA tasks CHI-204, CHI-207, CHI-208 in same wave.

For each task:
1. Read the Linear issue for context (use get_issue with CHI-XXX)
2. Read the relevant spec section in TASKS-004
3. Read GUIDE-001-coding-standards.md before writing code
4. Read SPEC-004-architecture.md for module structure
5. Update handover.json status to "in_progress" when starting
6. Implement with tests
7. Run `cargo check && cargo test` for Rust, `npx vitest run` for frontend
8. Update handover.json to "done" with notes
9. Update the Linear issue status using save_issue (pass the issue id to update)

VALIDATION SNAPSHOT (as of session 3 — 2026-02-26 latest):
- 288 Rust tests pass (cargo test + clippy clean)
- Frontend: Vitest 51 files / 359 tests pass
- Frontend typecheck/lint/build/format all pass
- Playwright E2E: 114 scenarios (106 passed / 8 skipped)
- CI coverage gate: 75% combined (per-file store floors active)
- TESTING-MATRIX: 62 COVERED, 40 PARTIAL, 0 GAP, 0 PLANNED, 11 N/A

RESIDUAL OPEN ITEMS (not blocking Wave 1):
- CHI-131 (Token-Optimized Snippets): Backlog — Medium priority, depends on CHI-127
- CHI-134 (Multi-File Bundles): Backlog — Medium priority, depends on CHI-127
- 40 PARTIAL rows in TESTING-MATRIX — coverage improvement opportunity toward 85% gate
- repo-wide prettier --check . baseline drift (known, pre-existing, not introduced by recent work)
```

---

## Key File Paths

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project auto-briefing (read first) |
| `.claude/handover.json` | Machine-readable status + Linear IDs |
| `docs/tasks/TASKS-004-conversation-experience.md` | Active feature spec |
| `docs/tasks/TASKS-003-quality-coverage-enhancement.md` | Quality coverage spec (parallel work) |
| `docs/guides/GUIDE-001-coding-standards.md` | Coding standards (must read before coding) |
| `docs/specs/SPEC-004-architecture.md` | Architecture, modules, IPC contracts |
| `docs/specs/SPEC-002-design-system.md` | Design tokens (no hardcoded colors) |
| `src/components/conversation/MarkdownContent.tsx` | Main file to modify for Epic A |
| `src/components/conversation/StreamingThinkingBlock.tsx` | Main file for CHI-187 |
| `src/components/conversation/MessageInput.tsx` | Main file for Epic C |
| `src/lib/typewriterBuffer.ts` | Streaming buffer (relevant for CHI-194) |
| `src/stores/contextStore.ts` | Context attachments (relevant for Epic C) |
| `src/lib/rendererRegistry.ts` | NEW file to create for CHI-186 |

## Linear MCP Quick Reference

```
# Read an issue
get_issue(id: "CHI-186")

# Create a new issue (save_issue without id)
save_issue(title: "...", team: "Chief Wiggum", description: "...")

# Update an existing issue (save_issue with id)
save_issue(id: "<uuid-from-get_issue>", state: "In Progress")

# List issues
list_issues(project: "Conversation Experience", team: "Chief Wiggum")

# Other working tools: list_teams, get_team, get_project, list_projects,
# create_comment, list_comments, list_issue_statuses
```

## Architecture Notes for Conversation Experience

The rendering pipeline currently flows:
```
Raw markdown → marked.parse() → HTML string → innerHTML in MarkdownContent.tsx
                                                  ↓
                                            highlight.js runs on <code> blocks
                                            copy buttons injected via DOM query
```

Target architecture (after CHI-186):
```
Raw markdown → marked tokenizer → RendererRegistry dispatch
  ├── table tokens    → TableRenderer.tsx (sortable, copy-as-MD)
  ├── code("mermaid") → MermaidRenderer.tsx (mermaid.js → SVG)
  ├── code("math")    → MathRenderer.tsx (KaTeX → HTML)
  ├── code(*)         → CodeBlockRenderer.tsx (enhanced highlight.js)
  ├── image tokens    → ImageRenderer.tsx (lazy load, lightbox)
  └── default         → current MarkdownContent flow (unchanged)
```

Each renderer is a SolidJS component. `marked.use({ renderer: { ... } })` returns placeholder `<div data-render="table" data-props="...">` tags. A post-render pass hydrates these into live SolidJS components using `render()` from `solid-js/web`.

---

## Session 3 — 2026-02-26 (Integrity Review)

**What was done:**
1. Full handover integrity check across `handover.json`, `CLAUDE.md`, and Linear
2. Verified CHI-164 (Quality Coverage Enhancement) is fully closed — all 12 sub-tasks (CHI-165..176) have `status: "done"`, `regression_verified: true`, linear IDs, and test file arrays in handover.json
3. Confirmed CHI-78 (Custom Context Menus) is Done in Linear (`completedAt: 2026-02-26T22:07:04`) — this was still listed as a residual in the old handover but is now resolved
4. Confirmed CHI-63 (Power User UX Epic) is fully closed as a result
5. Confirmed CHI-131 and CHI-134 (Context Intelligence follow-through) are still Backlog — both Medium priority, valid future work
6. Updated COWORK-HANDOVER session prompt to reflect true current state (was stale re: CHI-164 still "in progress")

**True current validation snapshot:**
- 288 Rust tests (up from 282 at CHI-164 start — CHI-78 follow-through added tests)
- Vitest: 51 files / 359 tests (up from 336 at CHI-164 close)
- Playwright: 114 scenarios (106 passed / 8 skipped)
- TESTING-MATRIX: 62 COVERED, 40 PARTIAL, 0 GAP, 11 N/A

**Integrity discrepancies found and corrected:**
- Handover session prompt said "CHI-164: In progress" → corrected to COMPLETE
- Handover listed CHI-78 as residual → CHI-78 is Done in Linear (closed same day)
- Validation snapshot was stale (282 Rust / 203 Vitest / 70 Playwright) → corrected to actual final counts

**Integrity discrepancies found and corrected (session 4 review):**
- Wave 1 tasks (CHI-186, CHI-187, CHI-190, CHI-200) all Done in Linear as of ~2026-02-26T23:59 — handover was stale
- All other Conversation Experience tasks confirmed Backlog (no surprises, no stragglers marked Done prematurely)
- Epic parents (CHI-177, CHI-178, CHI-179) correctly still Backlog — Linear auto-completes epics only when all children done

**Next steps — Wave 2 is unlocked:**

| Issue | Title | Priority | Dep status |
|-------|-------|----------|------------|
| CHI-181 | A1: GFM Table Rendering | **Urgent** | CHI-186 ✅ Done |
| CHI-183 | A3: Enhanced Code Blocks | High | CHI-186 ✅ Done |
| CHI-191 | C2: External File Drag-Drop | High | Independent |
| CHI-194 | D1: Streaming Code Block Stability | High | CHI-186 ✅ Done |
| CHI-204 | F1: Unit Tests — Renderer Registry & GFM Tables | High | QA for wave 1+2 |
| CHI-207 | F4: Unit Tests — Streaming & Thinking UX | High | QA for CHI-187 ✅ |
| CHI-208 | F5: Unit Tests — File Attachments | High | QA for CHI-190 ✅ |

Future (not blocking Wave 2):
- CHI-131 / CHI-134 — Context Intelligence v2 (Backlog / Medium)
- 40 PARTIAL rows in TESTING-MATRIX — coverage ramp toward 85% CI gate

**What was done (session 5 — 2026-02-27, context continuation):**
- Added CHI-214 (D5: TodoWrite Rich Checklist Block) to handover.json under `conversation_experience_epic.CHI-180`
- Added CHI-215 (F11: Unit Tests — TodoWrite Block & StatusBar Badge) to handover.json under `conversation_experience_epic.CHI-199`
- Extended TASKS-004 with full D5 spec (acceptance criteria, architecture, file map) and F11 spec (15 pre-written tests breakdown)
- Updated D5 in priority/dependency chart: no blocking deps, independent of Wave 2
- CLAUDE.md and COWORK-HANDOVER Epic D/F lists were already updated in session 4

**Handover integrity — fully current as of session 5:**
- handover.json: CE epic has 6 entries (CHI-177, CHI-178, CHI-179, CHI-198, CHI-180, CHI-199)
- CLAUDE.md: CHI-214 + CHI-215 rows present in completion table
- TASKS-004: D5 and F11 specs appended with full acceptance criteria
- Linear: CHI-214 (High, Backlog, parent CHI-180) and CHI-215 (High, Backlog, parent CHI-199) both confirmed existing

**Ready for implementation (no further planning needed):**
- CHI-214 full plan: `docs/plans/2026-02-27-chi-todo-write-block.md`
- CHI-215 test code: pre-written in same plan doc
- Wave 2 tasks (CHI-181, CHI-183, CHI-191, CHI-194): all Backlog, deps met

---

**INTEGRITY CHECK — Session 6 (2026-02-27, post CHI-214 completion)**

**CHI-214 confirmed Done in Linear** (`completedAt: 2026-02-27T17:27:51`). handover.json updated.

**Wave 2 tasks — ALL Done in Linear** (completed earlier same day, found stale in handover):
- CHI-181 A1: GFM Table Rendering → Done 14:38
- CHI-183 A3: Enhanced Code Blocks → Done 14:38
- CHI-194 D1: Streaming Code Block Stability → Done 14:38
- CHI-191 C2: External File Drag-Drop → Done 15:17
- CHI-204 F1: Unit Tests — Renderer Registry & GFM Tables → Done 15:17
- CHI-207 F4: Unit Tests — Streaming & Thinking UX → Done 15:17
- CHI-208 F5: Unit Tests — File Attachments → Done 15:28

**handover.json corrections applied (session 6):**
- CHI-214: `backlog` → `done` with completed_at + regression_verified
- CHI-181, CHI-183 added to CHI-177 (Epic A) task entries
- CHI-194 added to CHI-180 (Epic D) task entries
- CHI-191, CHI-208 added to CHI-179 (Epic C) task entries
- CHI-204, CHI-207, CHI-208 added to CHI-199 (Epic F) task entries
- `recommended_next` fully refreshed

**Current project state — Wave 3 unlocked:**

| Epic | Done | Remaining Backlog |
|------|------|-------------------|
| A: Rich Content | CHI-186 ✅ CHI-181 ✅ CHI-183 ✅ CHI-204 ✅ | CHI-182 (Mermaid) CHI-184 (Math) CHI-185 (Images) |
| B: Streaming/Thinking | CHI-187 ✅ CHI-194 ✅ CHI-207 ✅ | CHI-188 (Live Tool Output) CHI-189 (Priority Layout) |
| C: Attachments | CHI-190 ✅ CHI-191 ✅ CHI-208 ✅ | CHI-192 (Image Encoding) CHI-193 (Attach Button) |
| D: Polish | CHI-194 ✅ CHI-214 ✅ | CHI-195 (Copy Actions) CHI-196 (Format Toggle) CHI-197 (Anchor Links) |
| E: Utility | CHI-200 ✅ | CHI-201 (Export) CHI-202 (Voice) CHI-203 (Symbol @) |
| F: QA | CHI-204 ✅ CHI-207 ✅ CHI-208 ✅ | CHI-215 (pre-written, needs CI run) + CHI-205/206/209..213 |

**Wave 3 — recommended execution order:**

Priority 1 (High, all deps met):
- **CHI-215**: Run pre-written 15 TodoWrite tests — code already exists, just needs CI run & verification
- **CHI-182**: Mermaid diagram rendering — strongest differentiator not yet shipped
- **CHI-188**: Live Tool Execution Output — needs new `tool:output` Tauri event + LiveToolOutput component
- **CHI-192**: Image Attachment Preview & Encoding — deps CHI-190 ✅ CHI-191 ✅

Priority 2 (Medium, deps met):
- **CHI-189**: Response Content Priority Layout — dep CHI-187 ✅
- **CHI-193**: Attach Button & File Picker — independent, quick win
- **CHI-184**: LaTeX/Math via KaTeX — dep CHI-186 ✅
- **CHI-195**: Copy Actions on All Blocks — independent

Priority 3 (Medium/Low):
- CHI-185: Inline Image Rendering (dep CHI-186 ✅)
- CHI-196 / CHI-197: Format Toggle / Anchor Links (independent)
- CHI-201: Conversation Export (independent)
- CHI-205, CHI-206, CHI-209..213: Remaining QA companion tests

---

**INTEGRITY CHECK — Session 7 (2026-02-27, post wave 3 partial completion + new features)**

**Confirmed Done in Linear (found stale in handover):**
- CHI-215 F11: Unit Tests TodoWrite → Done 17:38
- CHI-182 A2: Mermaid Diagram Rendering → Done 20:41
- CHI-188 B2: Live Tool Execution Output → Done 20:41

**CHI-192 (C3: Image Attachment Preview & Encoding) — AUDIT NEEDED:**
Deps met (CHI-190 ✅ CHI-191 ✅) but CHI-190 already delivered: ImageAttachment type, contextStore image APIs, thumbnail chips in MessageInput, paste handler + ImageAttachmentChip. CHI-208 covered test coverage. Remaining gap is only the base64 API encoding pipeline for actual Claude API submission in `conversationStore.ts sendMessage`. **Recommend auditing before scheduling** — may be a small patch, not a full task.

**New Linear issues created (CX research-backed):**

| Issue | Title | Linear ID | Priority |
|-------|-------|-----------|----------|
| CHI-216 | G1: Gitignore Toggle — Optional File Visibility in Explorer | `46791693` | High |
| CHI-217 | G2: Inline File Editing in FilePreview Panel | `240b18b6` | High |

**CX Decisions embedded in specs:**
- G1: Toolbar icon (not settings-only) — differentiates from VS Code/Cursor; dimming+badge for WCAG AA; Cmd+Shift+I shortcut; per-project persisted
- G2: Click-to-edit (no mode switch); auto-save on blur (no Cmd+S); CodeMirror 6; conflict lock when Claude editing; reload banner on disk change; full undo history

**Current prioritized backlog (Wave 4):**

| Priority | Issue | Title | Effort | Notes |
|----------|-------|-------|--------|-------|
| 🔴 High | CHI-216 | Gitignore Toggle | ~4h | Independent, high differentiation |
| 🔴 High | CHI-217 | Inline File Editing | ~2d | CodeMirror 6 + write IPC |
| 🔴 High | CHI-205 | F2: Code Block + Mermaid Tests | ~4h | CHI-182+183 now done, QA unblocked |
| 🟡 Medium | CHI-189 | B3: Priority Layout | ~4h | Dep CHI-187 ✅ |
| 🟡 Medium | CHI-193 | C4: Attach Button | ~2h | Independent, quick win |
| 🟡 Medium | CHI-184 | A4: LaTeX/KaTeX | ~4h | Dep CHI-186 ✅ |
| 🟡 Medium | CHI-195 | D2: Copy Actions | ~2h | Independent |
| 🟡 Medium | CHI-201 | E2: Conversation Export | ~4h | Independent |
| ⚪ Audit | CHI-192 | C3: Image Encoding | ? | Audit CHI-190 coverage first |
| ⚪ Low | CHI-185 | A5: Inline Images | ~4h | Dep CHI-186 ✅ |
| ⚪ Low | CHI-196/197 | D3/D4: Format Toggle/Anchors | ~3h ea | Independent |

---

**PLANNING SESSION — Session 8 (2026-02-28, Actions Center feature)**

## New Epic: Actions Center (CHI-218..223)

**Motivation:** The current actions system (CHI-138) is powerful but ergonomically fragile at scale. Three core problems:
1. Stop/restart requires navigating back to a discovery sidebar with hundreds of items
2. No cross-project overview — you can't see at a glance what's running across all projects
3. No run history — output disappears on completion, no audit trail

**Design concept:** Assembly-line spatial metaphor — inspired by idle/factory games but grounded in serious UX:
- **Warehouse** = a project (contains its running actions)
- **Lane** = one running action (shows animated conveyor belt while active)
- **Overview** = grid of warehouse cards with active lane count badges
- **Warehouse Detail** = drill-down showing active lanes + history tab

**CX research conducted:**

| Tool | Strength borrowed | Weakness avoided |
|------|-------------------|-----------------|
| GitHub Actions | Run history per workflow, status colors | No cross-repo overview (4+ clicks to find a job) |
| Vercel Dashboard | Project cards with pulsing active indicators | No all-projects-running summary |
| Temporal UI | Timeline view, retry icons, running vs history tabs | Too technical for non-developers |
| Sidekiq Web UI | Busy/Enqueued/Dead count badges at a glance | Dense text table, no visual differentiation |
| Factorio / Factory games | Process monitoring as enjoyable ownership, spatial metaphor | — |

**Key CX decisions:**
- Separation of concerns: Actions Center (control plane) vs. Sidebar Actions panel (discovery plane) — complementary
- Animated CSS conveyor strip: `@keyframes conveyorSlide` on `repeating-linear-gradient`, stops when idle, `prefers-reduced-motion` respected
- Inline stop/restart/Ask AI — hover reveal, never leave the view to manage a running action
- Technical mode toggle (gear icon): friendly view (category icon + name) vs. detail view (command, PID, exit code)
- Non-technical users: status is communicated by icon + color alone (no CLI text required)

**Linear issues created:**

| Issue | Title | Linear ID | Effort |
|-------|-------|-----------|--------|
| CHI-218 | Actions Center epic parent | `9df8c5a1` | ~4d total |
| CHI-219 | H1a: Backend — list_all_running_actions + ActionHistory DB | `6147bcb1` | ~4h |
| CHI-220 | H1b: WarehouseCard + ActionsCenter Overview UI | `41f95aec` | ~1d |
| CHI-221 | H1c: LaneCard + Warehouse Detail + conveyor animations | `d154230e` | ~1.5d |
| CHI-222 | H1d: History tab + LaneHistory component | `53775aa7` | ~0.5d |
| CHI-223 | H1e: ActionQuickLaunch + Cmd+Shift+A + sidebar integration | `c4427fe8` | ~1d |

**Implementation order (critical path):**
CHI-219 (backend) → CHI-220 (overview UI + store) → CHI-221 (lane UI + animations) → CHI-223 (launch + keyboard + badges) → CHI-222 (history tab)

**Backend additions:**
- `ActionBridgeMap` gains `project_id`/`project_name` on each runtime
- DB migration v4: `action_history` table (action_id, project_id, exit_code, duration_ms, output_preview)
- New IPC: `list_all_running_actions()` → `Vec<CrossProjectRunningAction>`
- New IPC: `get_action_history(project_id, limit)` → `Vec<ActionHistoryEntry>`
- `action:status_changed` event gets `project_id` + `project_name` fields

**Frontend additions:**
- New components: `ActionsCenter.tsx`, `WarehouseCard.tsx`, `LaneCard.tsx`, `LaneHistory.tsx`, `ActionQuickLaunch.tsx`
- `actionStore.ts` additions: `crossProjectRunning`, `history`, `loadAllRunningActions()`
- New view tab in `MainLayout.tsx` + icon-rail entry in `Sidebar.tsx`
- `Cmd+Shift+A` → open/focus Actions Center
- StatusBar "N running" pill (visible only when actions are active)
- "View in Actions Center" context menu item on running actions

**Current full backlog priority order:**

| Priority | Issue | Title | Effort |
|----------|-------|-------|--------|
| 🔴 P0 | CHI-219 | Actions Center backend | ~4h |
| 🔴 P0 | CHI-220 | ActionsCenter Overview + WarehouseCard | ~1d |
| 🔴 P0 | CHI-221 | LaneCard + conveyor animations | ~1.5d |
| 🔴 P0 | CHI-223 | QuickLaunch + Cmd+Shift+A | ~1d |
| 🟡 P1 | CHI-222 | History tab | ~0.5d |
| 🟡 P1 | CHI-216 | Gitignore Toggle | ~4h |
| 🟡 P1 | CHI-217 | Inline File Editing | ~2d |
| 🟡 P1 | CHI-205 | F2: Code Block + Mermaid Tests | ~4h |
| ⚪ P2 | CHI-189 | B3: Priority Layout | ~4h |
| ⚪ P2 | CHI-193 | C4: Attach Button | ~2h |
| ⚪ P2 | CHI-195 | D2: Copy Actions | ~2h |
| ⚪ P2 | CHI-201 | E2: Conversation Export | ~4h |
| ⚪ Low | CHI-206/209..213 | QA companions | varies | After features done |
