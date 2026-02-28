# TASKS-006: UX Excellence — Differentiating Product Experience

**Status:** Planned (Backlog)
**Linear Epic:** CHI-224 — UX Excellence
**Created:** 2026-02-28
**Author:** Cowork Session 9
**Input:** CX/UX investigation PDF (KAIMAN Cerebro competitive analysis), full codebase audit

---

## 1. Executive Summary

This spec documents a deep CX/UX research audit of Chief Wiggum benchmarked against KAIMAN Cerebro (the most mature competing agent orchestration platform) and against first-principles developer experience standards. The goal: identify **high-impact, differentiating improvements** that make Chief Wiggum not just usable but genuinely delightful — the kind of product that developers evangelize to their teams.

### Research inputs

1. **Competitive reference:** KAIMAN Cerebro (Agent Orchestration Platform) — screenshot analysis of Screens & Navigation runner, multi-artifact workflow, hierarchical nav model, schema-driven screen generation
2. **Full codebase audit:** All components, stores, keybindings, layout zones, conversation flow
3. **SPEC-002, SPEC-003 review:** Current design system and UX specification
4. **First-principles:** Nielsen's 10 usability heuristics, Fitts's Law, progressive disclosure, cognitive load theory

---

## 2. Competitive Gap Analysis: KAIMAN Cerebro vs. Chief Wiggum

### What Cerebro does that Chief Wiggum doesn't

| Capability | Cerebro | Chief Wiggum | Impact |
|---|---|---|---|
| **Run overview / history** | First-class screen with status, duration, version, artifact count | No run history | High — devs can't audit what happened |
| **Artifact browser** | Hierarchical artifact list (Research, Personas, Journeys, ER Model, etc.) | No artifact concept | High — outputs disappear into conversation |
| **Agent library** | Pre-built agents for different use cases | No agent discovery | Medium — limits accessibility |
| **Schema-driven navigation** | Screens generated from declarative schema with role guards | Static tab system | Medium — Cerebro adapts to project |
| **Analytics tracking per screen** | TrackedEvents per screen with event names | No session analytics | Low — power-user feature |
| **Multi-platform routing** | `/dashboard`, `/run/:id`, `/artifacts/:type` — proper URL-based nav | No routing | Medium — no deep-linking |
| **Governance layer** | Audit Trail, Approvals, Version Control sections | No governance UI | Low — enterprise feature |
| **Confidence scoring** | Agent confidence % displayed per run | No quality indicators | High — trust and transparency |
| **Export artifacts** | Copy JSON, Download JSON buttons on every artifact | Export Diagnostics only | Medium — sharing artifacts |
| **Project context display** | Client/project shown prominently in sidebar | Folder path only | Low — cosmetic |

### Where Chief Wiggum is ahead

| Capability | Chief Wiggum | Cerebro |
|---|---|---|
| **Real-time streaming** | Full typewriter buffer, streaming thinking blocks | No streaming UI shown |
| **Permission system** | Granular per-tool permissions, YOLO mode | Not visible |
| **File context system** | @-mention, range selection, token estimation | Not visible |
| **Slash commands** | 11+ built-in + project + SDK discovery | Not visible |
| **Split panes** | Dual conversation panes, draggable | Not visible |
| **Keyboard-first** | 15+ shortcuts, command palette, focus traps | Not visible |
| **Cost tracking** | Per-message + session + aggregate | Not visible |
| **Inline tool visualization** | ToolUseBlock, ThinkingBlock, TodoWrite checklist | Not visible |

### Strategic conclusion

Chief Wiggum has deeper real-time agent interaction than Cerebro, but Cerebro has stronger **output management** and **session continuity**. The biggest differentiating opportunity for Chief Wiggum is: **making outputs first-class artifacts**, **showing agent work as structured history**, and **reducing the cognitive load of the current session model**.

---

## 3. CX Audit Findings — Critical Issues

### 3.1 Severity 1 — Blocks core workflow

**S1-A: No artifact persistence or browsing**
- Files Claude created, code blocks it wrote, plans it made — all disappear into the chat scroll. There is no way to find "that thing Claude wrote 20 messages ago" without scrolling.
- *Impact:* Every Claude session degrades in usefulness over time because outputs become unfindable.
- *Fix:* Conversation Artifacts panel — auto-detected code blocks, files written, plans — pinnable, copyable, openable.

**S1-B: Session context amnesia**
- When you switch sessions, the entire mental model resets. There's no "what was I doing" summary. No session notes, no last-action indicator, no "Claude was last working on X."
- *Impact:* High cognitive tax to resume work, especially across days.
- *Fix:* Session resume card — last message, last file touched, last tool used, elapsed time.

**S1-C: No visibility into what Claude is about to do**
- The only pre-execution signal is the permission dialog. Users have no way to preview Claude's plan before it executes, only approve individual tools one-by-one.
- *Impact:* YOLO mode is attractive even for users who want control because the permission granularity is too fine.
- *Fix:* Pre-flight plan view — when Claude generates a multi-step plan (TodoWrite), show a collapsible preview before execution begins.

### 3.2 Severity 2 — Significant friction

**S2-A: TitleBar information overload**
- The title bar contains: mode badge (YOLO/DEV), app name, model selector, permission tier cycle button, details panel toggle, settings gear, window controls. That's 7 interactive elements in 40px.
- *Impact:* Users don't understand what half these controls do. Discoverability is low.
- *Fix:* Consolidate permission tier into Settings; promote project name to TitleBar center.

**S2-B: StatusBar too information-dense**
- StatusBar has: YOLO indicator, process status, running count badge, todo progress badge, actions popover, token display, export button, cost pill, aggregate cost. 9 elements in 28px.
- *Impact:* Users ignore it entirely (information overload = none of it registers).
- *Fix:* Progressive disclosure — show only 3 key metrics by default, expand on hover/click.

**S2-C: Message input lacks context awareness**
- The textarea looks identical whether you're at message 1 or message 200, whether Claude is mid-task or idle, whether there's a relevant file open or not.
- *Impact:* No ambient intelligence — users miss contextual suggestions.
- *Fix:* Contextual input hints — smart suggestions based on last Claude message, open files, recent errors.

**S2-D: Empty Agents view is a dead end**
- The Agents tab shows "coming soon" placeholder. Users who click it once learn to never click it again — but that also means they don't discover parallel sessions or agent features that DO exist.
- *Impact:* Parallel sessions, split panes — powerful features that are invisible.
- *Fix:* Agents view becomes a real parallel session manager.

**S2-E: No onboarding for power features**
- Features like @-mention, slash commands, split panes, context scoring, developer mode — none are discoverable except through documentation.
- *Impact:* 80% of power features go undiscovered by most users.
- *Fix:* Progressive feature discovery — contextual hints that appear once, inline at the right moment.

### 3.3 Severity 3 — Polish gaps

**S3-A: Code block actions buried on hover**
- Copy, wrap-toggle, open-in-terminal actions on code blocks only appear on hover and are small. Contrast: VS Code shows persistent action bar.
- *Fix:* Persistent slim action bar on code blocks (3 icons, always visible).

**S3-B: No keyboard shortcut for "new session from current project"**
- Cmd+N is unmapped. Creating a new session requires clicking + in sidebar.
- *Fix:* Cmd+N → new session (already in project context).

**S3-C: File tree has no sorting or grouping options**
- Files are shown in filesystem order. For large projects, finding a file requires using search.
- *Fix:* Sort toggle (name / modified / size) + group by (type / directory).

**S3-D: Conversation has no visual session boundary**
- When switching between sessions, there's no "session started" / "session resumed" visual marker.
- *Fix:* Session header chip in conversation view showing project, date, model, total cost.

**S3-E: No diff review for Claude's proposed changes**
- Claude often proposes code changes inline in the conversation. The Diff tab exists but isn't wired to inline "apply this diff" actions.
- *Fix:* Inline diff accept/reject buttons on assistant messages that contain `--- a/` patches.

---

## 4. Epic CHI-224: UX Excellence

### 4.1 Scope

Six focused sub-epics, each delivering a complete, shippable UX improvement:

| ID | Name | Theme | Priority | Est. |
|---|---|---|---|---|
| CHI-225 | Conversation Artifacts Panel | Output persistence | P0 | 3d |
| CHI-226 | Session Resume & Context Continuity | Cognitive load | P0 | 2d |
| CHI-227 | Agents View — Parallel Session Manager | Feature discoverability | P1 | 2d |
| CHI-228 | Progressive Feature Discovery | Onboarding | P1 | 1.5d |
| CHI-229 | Information Hierarchy Redesign | Visual clarity | P1 | 2d |
| CHI-230 | Inline Diff Accept/Reject | Core workflow | P0 | 2.5d |

**Total estimated effort:** ~13d

---

## 5. CHI-225: Conversation Artifacts Panel

### Problem

Every useful output Claude produces — code files, plans, JSON structures, summaries — exists only in the chat scroll. There is no extractable, browsable artifact layer. As conversations grow, outputs become unfindable. This is the single biggest gap vs. competitors like KAIMAN Cerebro.

### Solution: Right-panel Artifacts tab

Add a second tab to the Details Panel: **Artifacts**. The panel auto-populates as Claude responds, extracting:

- **Code blocks** with detected language + filename (from fence label or first comment)
- **Files written** (detected from ToolUseBlock `write_file`, `create_file` tool calls)
- **Plans/todos** (detected from TodoWrite tool blocks)
- **Structured data** (JSON/YAML code blocks > 10 lines)
- **Mermaid diagrams** (already rendered separately — link from artifact panel)

### Artifact card anatomy

```
┌──────────────────────────────────────────────┐
│ 📄 src/auth/jwt.ts                [↗] [Copy] │
│ typescript • 47 lines • from msg #12         │
│ ▸ Preview: export function sign(payload...   │
└──────────────────────────────────────────────┘
```

Fields:
- Icon (file type emoji or language badge)
- Title: filename if detected, else `<language> block` or `Plan`
- Actions: jump-to-message (↗), copy, open-in-file-preview (if file exists in project)
- Metadata: language, line count, which message it came from
- 1-line preview of content (first meaningful line)

### Artifact detection rules

| Source | Detection | Title fallback |
|---|---|---|
| Code block with fence label | `\`\`\`typescript src/auth/jwt.ts` | `typescript block` |
| `write_file` tool call | `path` arg from tool input JSON | `<filename>` |
| TodoWrite tool block | Always | `Task Plan` |
| JSON > 10 lines | Language = JSON | `JSON data` |
| Mermaid block | Language = mermaid | `Diagram` |
| Plain code > 5 lines with no label | Language badge | `<language> snippet` |

### Spec details

**Panel tab:** "Context" (existing) | **"Artifacts"** (new)

Default tab: Context (no change to existing behavior). Artifacts tab shows badge count of detected artifacts (max 99).

**Empty state:**
```
No artifacts yet.
As Claude writes code, files, or plans
they'll appear here for quick access.
```

**Artifact list:** vertical stack, no virtualization needed (max ~50 artifacts per session). Newest at top.

**Jump to message:** scrolls ConversationView to the message containing the artifact, highlights the code block with a 2s accent-color border pulse.

**Session-scoped:** Artifacts clear when session switches. Persisted to SQLite `artifacts` table alongside messages.

### New files

| File | Purpose |
|---|---|
| `src/components/details/ArtifactsPanel.tsx` | Artifact list component |
| `src/components/details/ArtifactCard.tsx` | Single artifact card |
| `src/stores/artifactStore.ts` | Artifact detection + state |

### Modified files

| File | Change |
|---|---|
| `src/components/layout/DetailsPanel.tsx` | Add Artifacts tab, tab switcher |
| `src/components/conversation/ConversationView.tsx` | Expose `jumpToMessage(id)` via store |
| `src-tauri/src/db/migrations.rs` | Add `artifacts` table (migration v5) |
| `src-tauri/src/db/queries.rs` | `insert_artifact`, `list_artifacts_by_session` |
| `src-tauri/src/commands/session.rs` | `list_artifacts` IPC command |

### Artifact detection implementation

```typescript
// src/stores/artifactStore.ts

export interface Artifact {
  id: string;
  session_id: string;
  message_id: string;
  message_index: number;   // for scroll-to
  type: 'code' | 'file' | 'plan' | 'diagram' | 'data';
  language?: string;
  title: string;
  preview: string;         // first 120 chars of content
  content: string;         // full content
  line_count: number;
  created_at: number;
}

// Detection runs after every assistant message is committed
function detectArtifacts(message: Message): Artifact[] {
  const artifacts: Artifact[] = [];

  // 1. Tool-based detection (highest confidence)
  for (const block of message.content ?? []) {
    if (block.type === 'tool_use' && block.name === 'write_file') {
      artifacts.push(fromWriteFileTool(block));
    }
    if (block.type === 'tool_use' && block.name === 'TodoWrite') {
      artifacts.push(fromTodoWriteTool(block));
    }
  }

  // 2. Code block detection from markdown
  const codeBlocks = extractCodeBlocks(message.content_text ?? '');
  for (const block of codeBlocks) {
    if (block.lines >= 5 || block.language === 'mermaid') {
      artifacts.push(fromCodeBlock(block, message));
    }
  }

  return artifacts;
}
```

### DB migration v5

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id    TEXT NOT NULL,
  message_index INTEGER NOT NULL,
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

### IPC contract

```typescript
// commands/session.rs adds:
#[tauri::command]
async fn list_artifacts(session_id: String, state: State<AppState>) -> AppResult<Vec<ArtifactRow>>

#[tauri::command]
async fn save_artifact(artifact: ArtifactInput, state: State<AppState>) -> AppResult<String>
```

### Acceptance criteria

1. Artifacts tab appears in DetailsPanel with badge count
2. Code blocks ≥5 lines auto-detected and listed within 500ms of message commit
3. `write_file` tool calls auto-detected with full path as title
4. Jump-to-message scrolls and highlights the source block
5. Artifacts persist to SQLite, reload on session switch
6. Empty state shown when no artifacts yet
7. Newest artifact at top of list
8. Copy button copies full content to clipboard
9. All interactive elements keyboard-accessible
10. Badge count never exceeds "99+"

---

## 6. CHI-226: Session Resume & Context Continuity

### Problem

When a developer opens Chief Wiggum after a break, they must scroll the conversation to re-establish context. There's no "session briefing" — no summary of what was accomplished, what's pending, what files were touched. Context amnesia between sessions is the #1 cause of abandoning deep work sessions.

### Solution: Session Resume Card

When switching to a session (or opening the app to a session that was last active > 5 minutes ago), show a **Session Resume Card** at the top of the conversation view, collapsible, showing:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Resumed — 3 hours ago  ·  Project: my-app  ·  $2.47 spent   │
│                                                                 │
│ Last message: "Added JWT refresh token logic to auth/service.ts"│
│                                                                 │
│ Files touched (4): auth/service.ts · auth/types.ts · +2 more   │
│ Open todos (2): ✗ Write tests  ✗ Update env docs                │
│ Last tool used: write_file                                      │
│                                                                 │
│ [Continue ▸]  [Show full summary]  [✕ dismiss]                 │
└─────────────────────────────────────────────────────────────────┘
```

### Resume card data model

```typescript
interface SessionResume {
  session_id: string;
  last_active_at: number;        // ms since epoch
  last_message_preview: string;  // first 100 chars of last assistant msg
  files_touched: string[];       // paths from write_file/edit_file tools
  open_todos: string[];          // unchecked items from last TodoWrite
  last_tool: string | null;      // most recent tool_use name
  message_count: number;
  total_cost: number;
  project_name: string;
}
```

### Resume card behavior

- **Trigger:** Switch to session where `last_active_at` is > 5 minutes ago, OR app cold-start to last-active session
- **Position:** Pinned above message list (not part of scroll), below view tabs
- **Dismiss:** [✕] button OR after sending a new message (auto-dismisses)
- **"Continue ▸":** Focuses MessageInput, no other action
- **"Show full summary":** Expands to show full last assistant message text
- **Collapsed state:** Shows only "📋 Resumed X ago · [expand ▾]"
- **5-minute threshold:** Configurable in Settings → Session → Resume card threshold

### Files touched detection

Parsed from `tool_use` blocks in conversation messages:
- `write_file(path)` → extract `path`
- `edit_file(path)` → extract `path`
- `create_file(path)` → extract `path`
- De-duplicated, max 10 shown, "+N more" overflow

### Open todos detection

From the last `TodoWrite` tool call in the session, extract items where `status !== 'completed'`. Max 3 shown inline.

### New files

| File | Purpose |
|---|---|
| `src/components/conversation/SessionResumeCard.tsx` | Resume card component |
| `src/lib/resumeDetector.ts` | Data extraction logic from message history |

### Modified files

| File | Change |
|---|---|
| `src/components/conversation/ConversationView.tsx` | Render SessionResumeCard above message list |
| `src/stores/sessionStore.ts` | `lastActiveAt` tracking, `resumeData` signal |
| `src-tauri/src/db/queries.rs` | `get_session_resume_data` query |

### Acceptance criteria

1. Resume card appears when session inactive > 5 minutes
2. Shows last assistant message preview (truncated at 100 chars)
3. Shows up to 4 files touched, "+N more" if more
4. Shows up to 3 open todos from last TodoWrite
5. Dismiss button and auto-dismiss on new message
6. "Show full summary" expands to full last message
7. Card does not appear for brand-new sessions (no messages)
8. Card never overlaps the message scroll area
9. Cold-start to last active session triggers resume card

---

## 7. CHI-227: Agents View — Parallel Session Manager

### Problem

The Agents tab currently shows a "coming soon" placeholder. This is a wasted navigation destination and hides the fact that parallel sessions and split panes DO exist. Every developer who clicks Agents, sees nothing, and clicks away has had their trust in the product eroded.

Meanwhile, split panes (Cmd+\\) are invisible — no developer discovers them without reading docs.

### Solution: Real parallel session manager

Replace the Agents placeholder with a functional **Parallel Session Manager** that surfaces existing parallel session capabilities with a visual grid UI.

```
AGENTS VIEW
┌─────────────────────────────────────────────────────────────────┐
│  ○ 2 active sessions  ·  $5.83 today  [+ New Parallel Session]  │
├──────────────────┬──────────────────┬──────────────────────────┤
│ SESSION A        │ SESSION B        │  + Start another         │
│ ● Running        │ ○ Idle           │                          │
│ my-app           │ cerebro-ui       │   Run sessions in        │
│                  │                  │   parallel to tackle     │
│ Refactoring auth │ Reviewing PR #47 │   different tasks        │
│ module...        │                  │   simultaneously.        │
│                  │ $1.20  3 msgs    │                          │
│ $4.63  47 msgs   │                  │   [Open in Split View]   │
│                  │                  │   [New Session]          │
│ [Focus] [Stop]   │ [Focus] [Stop]   │                          │
└──────────────────┴──────────────────┴──────────────────────────┘

KEYBOARD SHORTCUTS
  Cmd+\   Split the current session into side-by-side panes
  Cmd+[   Focus left pane       Cmd+]   Focus right pane
  Cmd+N   New session
```

### Session card anatomy

```
┌──────────────────────────────────┐
│ ● Running                 [Stop] │  ← status badge + action
│ my-app                           │  ← project name
│ ─────────────────────────────── │
│ Refactoring auth module to use   │  ← last message preview
│ JWT...                           │
│ ─────────────────────────────── │
│ $4.63  ·  47 msgs  ·  3h ago    │  ← metadata row
│ [Focus ▸]  [Open in Split ▸]    │  ← actions
└──────────────────────────────────┘
```

States:
- **Running** (green pulse dot): agent is actively responding
- **Idle** (gray dot): session exists, no active agent
- **Waiting** (amber dot): permission dialog pending user action

### Session grid layout

- 2-column grid, responsive to panel width
- Empty slot card ("+") shows parallel session pitch + "New Session" button
- Max visible without scroll: 4 sessions (2×2 grid)
- Overflow: scroll within Agents view

### Actions

- **Focus:** Switch active session to this session (same as clicking session in sidebar)
- **Stop:** Stop CLI for this session
- **Open in Split:** Open this session in a split pane alongside the current focused session (Cmd+\\)
- **New Parallel Session:** Create new session in project context, open in split pane immediately

### Keyboard shortcut education strip

Collapsed by default. Shown on first visit, then collapsed after user sees it. Shows 4 key parallel session shortcuts.

### New files

| File | Purpose |
|---|---|
| `src/components/agents/AgentsView.tsx` | Main agents view, replaces placeholder |
| `src/components/agents/SessionCard.tsx` | Individual session card component |

### Modified files

| File | Change |
|---|---|
| `src/components/layout/MainLayout.tsx` | Swap agents placeholder with `AgentsView` |
| `src/stores/sessionStore.ts` | Expose `allSessions` signal for grid |

### Acceptance criteria

1. Agents view shows all open sessions in 2-column card grid
2. Running/Idle/Waiting status reflected accurately
3. Last message preview shown (first 80 chars of last assistant message)
4. "Focus" action switches active session
5. "Open in Split" opens session in split pane
6. "New Parallel Session" creates + opens in split
7. Cost, message count, and last-active time shown per card
8. Empty state with explainer shown when 0 or 1 sessions
9. Keyboard shortcut education strip shown on first visit
10. Session cards update in real-time (running status, cost)

---

## 8. CHI-228: Progressive Feature Discovery

### Problem

Chief Wiggum has 15+ keyboard shortcuts, @-mention file attachment, slash commands, context scoring, split panes, developer mode, and more. None of these are discoverable without reading documentation. The onboarding flow (CHI-81) covers only the basics. Power features — the real differentiators — are invisible.

### Solution: Contextual feature hints

A lightweight hint system that surfaces one relevant feature hint at the **right moment**, once per feature, non-intrusively.

### Hint trigger rules

| Feature | Trigger condition | Hint text |
|---|---|---|
| @-mention | User types in MessageInput for the 3rd time, project has files | "Tip: Type @ to attach files from your project" |
| Slash commands | User types in MessageInput for the 5th time | "Tip: Type / for built-in commands and skills" |
| Split panes | User has 2+ sessions, in conversation view | "Tip: Press Cmd+\\ to run two sessions side-by-side" |
| Context scoring | User attaches 3+ files in one session | "Tip: Press Cmd+Shift+T to see context quality score" |
| Message search | Conversation has 20+ messages | "Tip: Press Cmd+F to search this conversation" |
| Keyboard shortcuts | User opens command palette 3 times in session | "Tip: Press Cmd+/ to see all keyboard shortcuts" |
| Developer mode | User enables YOLO mode | "Tip: Developer Mode pre-approves common tools without full YOLO" |
| Session artifacts | First time Claude writes a file (write_file tool) | "Tip: Check the Artifacts tab — Claude's outputs are saved there" |

### Hint UI

**Location:** Floating pill, bottom-right of conversation area, above MessageInput, 12px gap.

```
┌─────────────────────────────────────────┐
│ 💡 Tip: Type @ to attach files  [✕]    │
└─────────────────────────────────────────┘
```

Styling:
- Background: `--color-bg-elevated` with 1px `--color-border-secondary` border
- Text: `--color-text-secondary` 12px
- Icon: 💡 emoji or LightbulbIcon (14px, `--color-warning` color)
- [✕] dismiss button
- Appears with fade-in (200ms), auto-dismisses after 8s with fade-out
- Max 1 hint visible at a time
- Queue: if multiple triggers fire, show one at a time, 30s apart

### Hint persistence

Shown-once tracking via `localStorage` key `cw:hints:shown` — array of hint IDs. Once a hint's ID is in this array, it never shows again.

### Hint opt-out

Settings → General → "Show feature hints" toggle (default: on). If off, no hints ever shown.

### New files

| File | Purpose |
|---|---|
| `src/components/common/FeatureHint.tsx` | Hint pill component |
| `src/lib/hintEngine.ts` | Trigger evaluation + shown-once tracking |

### Modified files

| File | Change |
|---|---|
| `src/components/conversation/ConversationView.tsx` | Render FeatureHint above MessageInput |
| `src/stores/uiStore.ts` | `activeHint` signal, `dismissHint()`, `triggerHint(id)` |
| Settings store | `hintsEnabled` setting |

### Acceptance criteria

1. Each hint appears at most once per install (localStorage tracking)
2. Max 1 hint visible at a time
3. Hints auto-dismiss after 8s
4. [✕] manual dismiss persists (never shows again)
5. Hints appear in correct contextual moment (not at startup)
6. "Show feature hints" setting disables all hints
7. Hint is fully keyboard-accessible (focus on [✕] to dismiss)
8. Hints respect `prefers-reduced-motion` (no animation)

---

## 9. CHI-229: Information Hierarchy Redesign

### Problem

Current TitleBar has 7+ interactive elements in 40px. Current StatusBar has 9+ elements in 28px. Both are information-dense to the point of being ignored. The visual hierarchy doesn't guide the eye to what matters: **what Claude is doing right now**, **how much it's costing**, and **what permission mode you're in**.

### Solution: Redesigned chrome with progressive disclosure

#### 9.1 TitleBar redesign

**Before (7 elements):**
`[YOLO badge] [Chief Wiggum] [Model selector] [Permission cycle] [Details toggle] [Settings] [Window controls]`

**After (4 elements + overflow):**
```
[Window controls]  [Project: my-app ▾]  [● Running — claude-sonnet-4-6]  [⚙]
```

Changes:
- Remove "Chief Wiggum" text (brand is in app icon, everyone knows what app they're in)
- Promote **project name** to TitleBar center — the most important context
- Merge **model selector** into a status chip showing model + running state
- Remove permission tier cycle from TitleBar — move to Settings → Security
- Remove Details panel toggle from TitleBar — Cmd+Shift+B is sufficient; add to View menu
- Keep Settings gear ⚙ (right-most before window controls)

**Status chip variants:**
- `○ claude-sonnet-4-6` — idle, gray dot
- `● Responding...` — running, green pulse dot
- `⚠ Permission needed` — amber warning dot
- `✗ CLI not found` — red dot

Click on status chip → opens model selector dropdown (existing behavior).

**YOLO/DEV badge:** Move from TitleBar to StatusBar (left section, already has mode indicators). Remove from TitleBar entirely.

#### 9.2 StatusBar redesign

**Before (9 elements):**
`[YOLO] [status] [running count] [todo badge] [actions popover] [tokens] [export] [cost] [aggregate cost]`

**After — 3 zones, progressive disclosure:**

```
[● 2 running ▾]  ·  [47.2K tokens]  ·  [$2.47 ▾]
```

- **Left zone:** Combined session status. Single pill showing: running count (if >0), or "Idle" (if 0). Click → expands to running sessions popover (existing behavior, already implemented)
- **Center zone:** Token count only (most frequently referenced metric)
- **Right zone:** Cost pill. Click → expands to cost breakdown popover
- **Overflow menu (⋯):** Export Diagnostics, Aggregate Cost (when 2+ sessions)
- **YOLO indicator:** Moves here from TitleBar. Shown as left-most text in red: `YOLO ·`

**Cost breakdown popover:**
```
┌─────────────────────────┐
│ Session cost   $2.47    │
│ Today total    $8.20    │  (new — aggregate across all sessions today)
│ This week      $31.44   │  (new — weekly spend)
│                         │
│ [Export Diagnostics]    │
└─────────────────────────┘
```

#### 9.3 i18n strings (new)

```json
"status.idle": "Idle",
"status.responding": "Responding…",
"status.permission_needed": "Permission needed",
"status.cli_not_found": "CLI not found",
"status.running_count": "{{count}} running",
"cost.today": "Today",
"cost.this_week": "This week",
"titlebar.project_none": "No Project"
```

### Modified files

| File | Change |
|---|---|
| `src/components/layout/TitleBar.tsx` | Full redesign per spec |
| `src/components/layout/StatusBar.tsx` | Progressive disclosure redesign |
| `src/stores/uiStore.ts` | `statusChipMode` signal, cost popover state |
| `src/locales/en.json` | New i18n strings |
| `src/locales/es.json` | Spanish translations |

### Acceptance criteria

1. TitleBar has ≤4 interactive elements
2. Project name shown prominently in TitleBar center
3. Model shown in status chip with real-time running state dot
4. YOLO/DEV mode indicator moved to StatusBar
5. StatusBar shows ≤3 elements by default
6. Cost pill expands to popover with session + today + weekly breakdown
7. Running sessions pill expands to existing sessions popover
8. "Export Diagnostics" moved to cost popover overflow
9. All existing functionality preserved (no regressions)
10. All new elements keyboard-accessible

---

## 10. CHI-230: Inline Diff Accept/Reject

### Problem

Claude frequently produces code changes formatted as unified diffs (```diff blocks) or describes file changes in assistant messages. The Diff tab exists but is disconnected from the conversation — users must manually apply changes using an external editor. This is the primary workflow friction point that makes Claude feel like a "suggestion machine" rather than an "autonomous coding partner."

### Solution: Inline diff actions on assistant messages

When an assistant message contains a unified diff block (detected by `--- a/` or `+++ b/` patterns), add action buttons directly below the code block:

```
┌──────────────────────────────────────────────────────┐
│ ```diff                                              │
│ --- a/src/auth/service.ts                            │
│ +++ b/src/auth/service.ts                            │
│ @@ -12,7 +12,9 @@                                   │
│ -  const token = sessions.get(userId);              │
│ +  const token = await jwt.sign({ userId }, secret); │
│ ```                                                  │
│                                                      │
│ [✓ Apply to src/auth/service.ts]  [✗ Reject]        │
│                                    [↗ Open in Diff]  │
└──────────────────────────────────────────────────────┘
```

### Diff detection

A diff block is detected when a markdown code fence has language `diff` OR the raw content matches:
```
/^--- a\/.+\n\+\+\+ b\/.+/m
```

File path is extracted from `--- a/<path>` line. If the path resolves to an existing file in the project, "Apply" is enabled. If not found, show "Apply" as disabled with tooltip "File not found in project."

### Apply action

1. Parse unified diff to extract hunks
2. Read current file content via `read_file_content` IPC
3. Apply hunks using a pure-JS diff application library (`diff` npm package — already likely available, else add)
4. Write back via `write_file_content` IPC (CHI-217 IPC, shares the same command)
5. Show toast: "Applied to src/auth/service.ts"
6. Action buttons replaced with `✓ Applied` confirmation chip (green)
7. File entry updated in FileTree if visible

### Reject action

- Buttons replaced with `✗ Rejected` muted chip
- No file changes
- No toast (silent rejection)

### "Open in Diff" action

- Switches to Diff tab (Cmd+3)
- Passes diff content to DiffPreviewPane
- This bridges the existing Diff view into the conversation workflow

### Error handling

- File not found → Apply button disabled, tooltip explains
- Apply fails (conflict, permissions) → toast: "Could not apply — file has changed. Open in Diff to review." + "Open in Diff" button in toast
- Partial apply (some hunks succeed, some fail) → toast with hunk count

### Multiple diffs per message

If a message contains multiple diff blocks, each gets its own accept/reject button bar. Applied/rejected state tracked per block (by index within message).

### New files

| File | Purpose |
|---|---|
| `src/components/conversation/InlineDiffBlock.tsx` | Diff block with apply/reject actions |
| `src/lib/diffApplicator.ts` | Unified diff parser + applicator |

### Modified files

| File | Change |
|---|---|
| `src/components/conversation/MarkdownContent.tsx` | Detect diff blocks, render InlineDiffBlock |
| `src-tauri/src/commands/files.rs` | `write_file_content` IPC (share with CHI-217) |

### Acceptance criteria

1. Diff blocks detected by language tag `diff` or `--- a/` pattern
2. Apply / Reject / Open in Diff buttons shown below each diff block
3. Apply reads file, patches hunks, writes back, shows toast
4. Reject silently dismisses buttons, shows "Rejected" chip
5. Applied state persists per block within the message (no double-apply)
6. File-not-found disables Apply with tooltip
7. Apply failure shows helpful error toast with "Open in Diff" option
8. "Open in Diff" switches to Diff tab and passes diff content
9. Multiple diffs in one message each independently accept/reject-able
10. All buttons keyboard-accessible

---

## 11. Cross-Cutting Concerns

### 11.1 Testing requirements

Each sub-epic must include:

| Layer | Minimum |
|---|---|
| Rust unit tests | Any new IPC command handler must have ≥2 tests |
| Frontend unit tests (Vitest) | Each new store + key component: ≥5 tests |
| Playwright E2E | Each feature: ≥3 happy-path E2E tests |

### 11.2 Accessibility requirements (WCAG 2.1 AA)

- All new interactive elements: keyboard accessible, ARIA labels, visible focus ring
- All new text: ≥4.5:1 contrast ratio
- No new motion without `prefers-reduced-motion` guard
- All new icons: `aria-label` or `title` attribute

### 11.3 Performance requirements

- Artifact detection: ≤200ms after message commit
- Resume card: data available within 100ms of session switch
- No new paint-blocking operations
- Artifact panel renders ≤50 items without virtualization

### 11.4 Internationalization

All new user-facing strings must be added to:
- `src/locales/en.json`
- `src/locales/es.json`

See Section 9.3 for new StatusBar/TitleBar strings. Additional strings per sub-epic are noted in each section.

---

## 12. Epic-Level Acceptance Criteria

1. Artifacts panel auto-populates during any session where Claude writes code or files
2. Session resume card appears correctly after 5-minute gap
3. Agents view shows real session grid (no more placeholder)
4. Feature hints appear contextually, each shown at most once
5. TitleBar has ≤4 interactive elements, project name is center-prominent
6. StatusBar shows ≤3 elements by default with progressive disclosure
7. Inline diff blocks in assistant messages show Apply / Reject actions
8. All sub-epics pass their individual acceptance criteria
9. No regressions in existing keyboard shortcuts, permission system, or session management
10. CI passes: Rust tests (≥288), frontend unit tests (≥359), Playwright (≥114 scenarios)
11. Coverage gate maintained (≥75%)
12. All new UI strings translated to Spanish

---

## 13. Spec Doc Reference Table

| Sub-epic | Spec sections | Architecture sections |
|---|---|---|
| CHI-225 Artifacts | §5 | SPEC-004 §4.4 (IPC), SPEC-005 §6 (migration v5) |
| CHI-226 Resume | §6 | SPEC-004 §4.4 (IPC), SPEC-003 §3.1 (conversation) |
| CHI-227 Agents View | §7 | SPEC-003 §2.2 (view switching), SPEC-004 §4.4.8 |
| CHI-228 Hints | §8 | SPEC-003 §3 (all screens) |
| CHI-229 Info Hierarchy | §9 | SPEC-002 §3 (color), SPEC-003 §2.1 (zones) |
| CHI-230 Inline Diff | §10 | SPEC-004 §4.4.9 (file IPC) |

---

*End of TASKS-006*
