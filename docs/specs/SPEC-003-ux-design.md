# SPEC-003: UX Design Specification

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Draft
**Parent:** SPEC-001 (Section 6, 10), SPEC-002 (Design System)
**Audience:** Frontend developers, coding agents, UX reviewers

---

## 1. Purpose

This document specifies every screen, interaction flow, and state transition in Chief Wiggum. Where SPEC-001 says "what" features exist and SPEC-002 says "how they look," this spec says "how they behave." A coding agent should be able to build any screen by reading only this document plus SPEC-002.

---

## 2. Navigation Model

### 2.1 Global Layout Zones

The application has five persistent zones:

```
┌────────────────────────────────────────────────────────────────┐
│                        TITLE BAR (Z1)                          │
├──────────┬─────────────────────────────────────┬───────────────┤
│          │                                     │               │
│ SIDEBAR  │          MAIN CONTENT               │   DETAILS     │
│  (Z2)    │             (Z3)                    │   PANEL (Z4)  │
│          │                                     │               │
│          │                                     │               │
│          │                                     │               │
│          │                                     │               │
├──────────┴─────────────────────────────────────┴───────────────┤
│                        STATUS BAR (Z5)                         │
└────────────────────────────────────────────────────────────────┘
```

**Z1 — Title Bar (40px height):**
- Left: hamburger menu icon (toggles sidebar), app name "Chief Wiggum"
- Center: project selector dropdown, model selector dropdown
- Right: cost display (clickable), settings gear icon

**Z2 — Sidebar (240px, collapsible to 48px icons):**
- Section 1: Sessions list (active, recent) — scrollable
- Section 2: Agents list (when Agent Teams active) — scrollable
- Section 3: MCP servers (connection status dots) — collapsible
- Footer: "New Session" button

**Z3 — Main Content (flexible width):**
- Switches between views: Conversation, Agent Dashboard, Diff Review, Terminal
- View selector: tabs at top of Z3 (Conversation | Agents | Diffs | Terminal)
- Default: Conversation view

**Z4 — Details Panel (280px, collapsible):**
- Section 1: Context Meter with breakdown
- Section 2: Memory (CLAUDE.md, auto-memories, skills)
- Section 3: MCP tools (active tools, context cost)
- Section 4: Cost breakdown (current session)
- Each section is a collapsible accordion

**Z5 — Status Bar (32px height):**
- Left: agent status ("Agent Team active (3/3)") or model name
- Center: token usage ("47.2K / 200K")
- Right: cost pill ("$2.47"), connection status dot

### 2.2 View Switching

| View | Tab Label | Keyboard | Content |
|---|---|---|---|
| Conversation | Chat | Cmd+1 | Message thread with input area |
| Agent Dashboard | Agents | Cmd+2 | Grid of agent cards |
| Diff Review | Diffs | Cmd+3 | Three-pane diff viewer with queue |
| Terminal | Terminal | Cmd+4 / Cmd+T | Full xterm.js terminal |

The active view tab has `--color-accent` bottom border (2px). Inactive tabs use `--color-text-secondary`.

---

## 3. Screen Specifications

### 3.1 Conversation View

This is the primary interaction screen.

**Layout:**
```
┌─────────────────────────────────────────┐
│  [Chat] [Agents] [Diffs] [Terminal]     │  ← View tabs
├─────────────────────────────────────────┤
│                                         │
│  ┌─ System ────────────────────────┐    │
│  │ Using Opus 4.6 • Project: myapp │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─ User ──────────────────────────┐    │  ← Message bubbles
│  │ Refactor the auth module to     │    │    (scrollable)
│  │ use JWT instead of sessions     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─ Assistant ─────────────────────┐    │
│  │ ▼ Thinking (collapsed)          │    │
│  │                                 │    │
│  │ I'll plan the refactoring...    │    │
│  │                                 │    │
│  │ ┌─ Plan ──────────────────┐     │    │
│  │ │ ☑ Update auth middleware│     │    │  ← Interactive plan
│  │ │ ☑ Create JWT utilities  │     │    │
│  │ │ ☐ Migrate user sessions │     │    │
│  │ │ ☑ Update API routes     │     │    │
│  │ │ [Execute Plan]          │     │    │
│  │ └────────────────────────┘     │    │
│  │                                 │    │
│  │ ┌─ Tool: EditFile ─────────┐   │    │  ← Tool use (collapsed)
│  │ │ auth/middleware.ts (+42)  │   │    │
│  │ └──────────────────────────┘   │    │
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ Message input area              │    │  ← Input area
│  │                                 │    │
│  ├─────────────────────────────────┤    │
│  │ [●●●○ Effort] [Fast: OFF]      │    │
│  │            [Attach] [Send ↵]    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Message Bubble Anatomy:**

Each message contains:
1. **Role label**: "User" / "Assistant" / "System" — text-sm, text-secondary
2. **Model badge**: (assistant only) Opus/Sonnet/Haiku badge — per SPEC-002 Section 10.3
3. **Thinking block**: (assistant only) Collapsible. Header: "Thinking" with chevron. Content: italic, text-secondary. Collapsed by default after response completes.
4. **Content**: Markdown rendered. Code blocks with syntax highlighting and copy button.
5. **Plan block**: (when present) Interactive checklist. Checkboxes toggle plan steps. "Execute Plan" button activates execution with current checked steps.
6. **Tool use blocks**: Collapsible accordion. Header shows tool name + summary. Expand to see full input/output. File modifications show mini-diff preview.
7. **Footer**: Timestamp (text-xs, text-tertiary), token count, cost for this message. "Copy" and "Retry" icons on hover.

**Context menu (right-click on any message):**
- Copy message
- Summarize from here
- Fork session from here
- Delete message (with confirmation)

**Input Area:**
- Auto-expanding textarea (min 80px, max 300px before scrolling)
- Enter sends, Shift+Enter for newline
- Left footer: Effort slider (4 dots: ○○○○ to ●●●● for low/medium/high/max), Fast Mode toggle
- Right footer: Attach button (file picker), Send button
- Drag-and-drop files onto the input area to attach

### 3.2 Agent Dashboard View

Visible when Agent Teams is active or when multiple background agents are running.

**Layout:**
```
┌─────────────────────────────────────────┐
│  [Chat] [Agents●3] [Diffs] [Terminal]   │
├─────────────────────────────────────────┤
│                                         │
│  ┌── Team Lead ──────────────────────┐  │
│  │  Agent: Lead • Opus 4.6           │  │
│  │  Task: Orchestrating auth refactor│  │
│  │  Status: ● Thinking               │  │
│  │  ┌───────────────────────┐        │  │
│  │  │ Task List (shared)    │        │  │
│  │  │ ☑ Auth middleware     │        │  │
│  │  │ ◐ JWT utilities       │        │  │  ← Shared task kanban
│  │  │ ○ Session migration   │        │  │
│  │  │ ○ API route updates   │        │  │
│  │  └───────────────────────┘        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ Teammate 1 ─────┐ ┌─ Teammate 2 ─┐ │
│  │ Sonnet 4.6        │ │ Sonnet 4.6   │ │
│  │ JWT utilities     │ │ Waiting...   │ │
│  │ ● Executing       │ │ ○ Idle       │ │  ← Agent cards
│  │ ┌──────────────┐  │ │              │ │
│  │ │ $ npm test   │  │ │              │ │  ← Mini terminal
│  │ │ PASS auth... │  │ │              │ │
│  │ └──────────────┘  │ │              │ │
│  │ 12.4K tok • $0.18 │ │ 0 tok • $0  │ │
│  │ [Pause][Kill][Fork]│ │ [Assign]    │ │
│  └───────────────────┘ └──────────────┘ │
│                                         │
│  [+ Spawn Agent]                        │
└─────────────────────────────────────────┘
```

**Agent Card Interactions:**
- Click card → expands to full view with complete terminal and conversation
- Pause button → sends agent to background
- Kill button → confirmation dialog, then terminates
- Fork button → creates new session from agent's current state
- Assign button (idle agents) → opens task assignment dialog

**Agent Status Indicators:**
| Status | Icon | Color | Label |
|---|---|---|---|
| Idle | ○ (empty circle) | text-tertiary | "Idle" |
| Thinking | ● (pulsing) | model color | "Thinking" |
| Executing | ● (solid) | model color | "Executing" |
| Waiting | ◐ (half) | warning | "Waiting for input" |
| Complete | ✓ (check) | success | "Complete" |
| Error | ✕ (x) | error | "Error" |

**Spawn Agent Dialog:**
- Model selector (Opus/Sonnet/Haiku)
- Task description textarea
- Budget limit input (optional)
- Worktree toggle (isolated vs shared)
- "Create Agent" button

### 3.3 Diff Review View

**Layout:**
```
┌─────────────────────────────────────────┐
│  [Chat] [Agents] [Diffs●5] [Terminal]   │
├──────┬──────────────────────────────────┤
│      │                                  │
│ File │  ┌─ Original ─┬─ Diff ──┬─ Res ─┐│
│ Tree │  │ 14 const   │-const   │ const ││
│      │  │ 15 auth =  │+auth =  │ auth =││
│ auth/│  │ 16 ...     │ ...     │ ...   ││
│  ├ m…│  │            │         │       ││
│  ├ j…│  │            │ [✓][✕]  │       ││  ← Hunk controls
│  └ r…│  │            │         │       ││
│      │  └────────────┴─────────┴───────┘│
│ pkg/ │                                  │
│  └ p…│  ┌─ Hunk 2/4 ───────────────────┐│
│      │  │ + import { verify } from...   ││
│      │  │ + import { sign } from...     ││
│      │  │                     [✓][✕][💬]││
│      │  └───────────────────────────────┘│
│      │                                  │
│ [Accept All] [Reject All]               │
├──────┴──────────────────────────────────┤
│  Agent: Teammate 1 • 4 files changed    │
│  +142 lines, -67 lines • $0.34          │
└─────────────────────────────────────────┘
```

**File Tree (left pane):**
- Grouped by directory
- Icons: + (added, green), ~ (modified, yellow), - (deleted, red)
- Click file to navigate to its diff
- Badge showing number of pending hunks

**Diff Pane (center):**
- Defaults to three-pane (original | annotated diff | result)
- Toggle to unified diff (two-pane) via toolbar button
- Syntax highlighting matches file type
- Line numbers in gutter

**Hunk Controls (per hunk):**
- ✓ (accept) — green, applies the change
- ✕ (reject) — red, discards the change
- 💬 (comment) — opens inline comment input
- "Edit" — opens the proposed change in an editable textarea

**Diff Queue (when multiple agents have results):**
- Tab bar above the diff pane: one tab per agent's batch
- Badge count shows pending reviews
- "Accept All" and "Reject All" at the bottom with confirmation

### 3.4 Terminal View

**Layout:** Full xterm.js terminal filling the main content area.

**Overlay widgets (floating, semi-transparent):**
- Top-right: Context Meter pill (compact)
- Bottom-right: Cost pill
- Top-left: Agent selector dropdown (when multiple terminals exist)

**Terminal tabs:** When per-agent terminals exist, a tab bar appears above the terminal. Each tab shows agent name + model badge.

**Keyboard behavior:** All keystrokes go to the terminal except global shortcuts (Cmd+1–4 for view switching, Cmd+K for compact, Cmd+, for settings).

### 3.5 Settings Screen

Opened via Cmd+, or gear icon. Renders as a full-screen overlay (not a modal).

**Left sidebar navigation:**
- General (theme, startup mode, auto-update)
- Models (default model, effort, fast mode, 1M context toggle)
- Cost & Budgets (budget limits, currency, warnings)
- Context (compaction threshold, auto-compact, API preference)
- Permissions (default mode, custom rules, trust zones)
- Terminal (font, size, scrollback, WebGL toggle)
- Keyboard Shortcuts (searchable, customizable)
- MCP Servers (managed in detail panel, link here)
- About (version, license, links)

**Right content:** Form fields for the selected category. Save is automatic (debounced). No explicit save button.

### 3.6 Command Palette

Opened via Cmd+Shift+P. Centered modal, 560px wide.

**Structure:**
- Search input at top (autofocused)
- Results list below (scrollable, max 10 visible)
- Each result: icon + label + keyboard shortcut (right-aligned)
- Arrow keys to navigate, Enter to select, Escape to close

**Available commands (examples):**
- New Session, Open Project, Switch Model
- Toggle Terminal/Agents/Diffs
- Compact Context, Summarize From Here
- Spawn Agent, Kill Agent
- Open Settings, Toggle Sidebar

### 3.7 Permission Dialog

Triggered when Claude Code requests approval for an operation.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ⚠ Permission Required                   [X] │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─ Bash Command ─────────────────────────┐  │
│ │ npm install jsonwebtoken bcryptjs      │  │  ← Syntax highlighted
│ └────────────────────────────────────────┘  │
│                                             │
│ Risk: [Low ●○○]                             │  ← Risk badge
│                                             │
│ ☐ Always allow commands matching:           │
│   Bash(*npm install*)                       │  ← Pattern preview
│                                             │
│        [Deny (N)]  [Allow Once (Y)]         │
│                    [Always Allow (A)]        │
└─────────────────────────────────────────────┘
```

**Risk levels:**
- Low (green): read operations, help commands, package installs
- Medium (yellow): file writes, build commands
- High (red): delete operations, system commands, network access

**Keyboard shortcuts shown in button labels.** Dialog is modal — blocks all other interaction until resolved.

### 3.8 Onboarding Flow (First Launch)

**Step 1:** Welcome screen — "Chief Wiggum" logo, "Get started" button.

**Step 2:** Claude Code detection — checks if `claude` CLI is installed. If not: link to installation instructions. If yes: shows version and ✓.

**Step 3:** Project setup — "Open a project" file picker or "Start without a project."

**Step 4:** Permission preference — choose default mode (Strict/Standard/Autonomous) with explanation of each.

**Step 5:** Optional — Set a daily budget. Skip allowed.

**Step 6:** "You're ready" — opens the Conversation view with a welcome message from the system.

---

## 4. Interaction Flows

### 4.1 Send Message Flow

```
User types in input area
  → Enter pressed
  → Input cleared, message appears in thread as User bubble
  → Loading indicator appears below (3 bouncing dots)
  → Assistant bubble starts streaming (token by token)
    → If thinking: thinking block appears (collapsed after completion)
    → If plan: interactive checklist renders
    → If tool use: collapsible tool block appears
  → Streaming completes
  → Footer shows: token count, cost, timestamp
  → Context meter updates
  → Cost tracker updates
```

### 4.2 Context Compaction Flow

```
Context meter enters yellow zone (60%)
  → Details panel shows "Consider compacting" hint

Context meter enters red zone (80%)
  → Status bar pulses yellow
  → "Compact" button appears on context meter

Context meter enters critical (95%)
  → Modal appears: "Context Nearly Full"
  → Three options presented:
    1. Auto-compact (recommended) — one click
    2. Manual select — opens context editor showing all messages
       → User checks/unchecks messages to keep/discard
       → Preview shows estimated token savings
    3. Branch session — creates new session with summarized history
       → Preview shows the summary that will be carried over
  → User selects option
  → Action executes
  → Context meter resets to green/yellow
  → System message in thread confirms what happened
```

### 4.3 Agent Spawn Flow

```
User clicks [+ Spawn Agent] on dashboard
  → Spawn dialog appears
  → User selects model, enters task, optionally sets budget
  → Clicks "Create Agent"
  → New agent card appears with "Initializing..." status
  → CLI spawns new Claude Code subprocess
  → Agent begins working (status → Thinking/Executing)
  → Mini terminal shows real-time output
  → On completion: status → Complete, diff count shown
  → User clicks card → full agent view
  → User navigates to Diffs tab to review
```

### 4.4 Diff Review Flow

```
Agent completes task
  → Diffs tab badge increments
  → User switches to Diffs view
  → File tree shows all changed files
  → User clicks a file
  → Three-pane diff renders
  → For each hunk:
    → User clicks ✓ (accept) or ✕ (reject)
    → Or clicks 💬 to add a comment
    → Or clicks "Edit" to modify the proposed change
  → After reviewing all hunks:
    → "Apply Accepted Changes" button becomes enabled
    → User clicks it
    → Changes are applied to the working tree
    → Git status updates in the sidebar
  → User can then commit via Git Integration panel
```

### 4.5 MCP Server Connection Flow

```
User opens MCP panel (sidebar or details panel)
  → Clicks "+ Add Server"
  → Wizard step 1: Transport type (HTTP / STDIO / SSE)
  → Wizard step 2: Connection details
    → HTTP: URL input
    → STDIO: command input, args, env vars
    → SSE: URL input
  → Wizard step 3: Authentication
    → If OAuth: "Authorize" button → browser popup → callback
    → If API key: input field
    → If none: skip
  → Wizard step 4: Scope (user-global or project-local)
  → "Connect" button
  → Server appears in list with status indicator
  → If error: error message with retry option
  → If success: green dot, tool count shown
```

### 4.6 Budget Alert Flow

```
Cost reaches 80% of budget
  → Cost tracker in status bar flashes yellow (3 times)
  → Toast notification: "80% of daily budget used ($16.00 / $20.00)"
  → User can dismiss or click to open cost breakdown

Cost reaches 100% of budget
  → If hard limit enabled:
    → Modal: "Budget Reached"
    → "Your daily budget of $20.00 has been reached."
    → Options: "Increase budget" (input field) or "Continue anyway" (override) or "Stop for today"
  → If soft limit:
    → Toast warning, but execution continues
```

---

## 5. State Machines

### 5.1 Agent Lifecycle States

```
            ┌──────────┐
    spawn → │   Idle   │ ← pause
            └────┬─────┘
                 │ assign task
            ┌────▼─────┐
         ┌──│ Thinking │──┐
         │  └────┬─────┘  │
         │       │        │ error
         │  ┌────▼─────┐  │
         │  │Executing │──┤
         │  └────┬─────┘  │
         │       │        │
         │  ┌────▼─────┐  │
         │  │ Waiting  │  │  (waiting for permission or input)
         │  └────┬─────┘  │
         │       │        │
         │  ┌────▼─────┐  ├──→ ┌────────┐
         └──│ Complete │  │    │ Error  │
            └──────────┘  │    └────────┘
                          │         │
                     kill │    retry │
                     ┌────▼─────┐   │
                     │  Dead    │◄──┘
                     └──────────┘
```

### 5.2 Session States

```
┌────────┐  pause   ┌────────┐  resume  ┌────────┐
│ Active │────────→ │ Paused │────────→ │ Active │
└───┬────┘          └────────┘          └────────┘
    │ complete
┌───▼──────┐  archive  ┌──────────┐
│Completed │──────────→│ Archived │
└──────────┘           └──────────┘
```

### 5.3 Permission Dialog States

```
┌──────────┐
│ Pending  │ (dialog shown, waiting for user)
└────┬─────┘
     │
     ├── Allow Once → action executes, dialog closes
     ├── Always Allow → pattern saved, action executes, future matches auto-allowed
     ├── Deny → action blocked, agent notified
     └── Timeout (60s) → Deny (with notification)
```

---

## 6. Keyboard Navigation Map

### Global Shortcuts (always active)

| Shortcut | Action |
|---|---|
| Cmd+1 | Switch to Conversation view |
| Cmd+2 | Switch to Agent Dashboard |
| Cmd+3 | Switch to Diff Review |
| Cmd+4 / Cmd+T | Switch to Terminal |
| Cmd+N | New session |
| Cmd+O | Open project |
| Cmd+K | Compact context |
| Cmd+M | Switch model |
| Cmd+, | Open settings |
| Cmd+Shift+P | Command palette |
| Cmd+B | Toggle sidebar |
| Cmd+Shift+B | Toggle details panel |
| Escape | Close active modal/dropdown/palette |

### Conversation View

| Shortcut | Action |
|---|---|
| Enter | Send message |
| Shift+Enter | Newline in input |
| Cmd+Shift+C | Focus cost tracker |
| Up/Down (when input empty) | Navigate message history |

### Diff Review

| Shortcut | Action |
|---|---|
| J/K | Next/previous hunk |
| A | Accept current hunk |
| R | Reject current hunk |
| C | Comment on current hunk |
| Cmd+Enter | Accept all in current file |
| Cmd+Backspace | Reject all in current file |
| [ / ] | Previous/next file |

### Agent Dashboard

| Shortcut | Action |
|---|---|
| Cmd+Shift+↑/↓ | Navigate between agents |
| Cmd+Shift+F | Kill focused agent |
| Cmd+Shift+N | Spawn new agent |

### Permission Dialog

| Shortcut | Action |
|---|---|
| Y | Allow once |
| N | Deny |
| A | Always allow |
| Escape | Deny |

---

## 7. Empty States

Every view must handle the case where there is no content.

| View | Empty State |
|---|---|
| Conversation (new session) | Centered: "Start a conversation" with suggested prompts |
| Agent Dashboard (no agents) | Centered: "No agents running" with [Spawn Agent] button |
| Diff Review (no diffs) | Centered: "No changes to review" with explanation |
| Terminal (no session) | Terminal cursor ready, system prompt printed |
| MCP Panel (no servers) | "No MCP servers configured" with [Add Server] button |
| Session List (first time) | "Welcome to Chief Wiggum" with onboarding link |

---

## 8. Error States

| Error Type | Display | Recovery |
|---|---|---|
| Claude Code not installed | Onboarding step blocks progress | Link to install instructions |
| CLI process crash | Toast: "Claude Code process exited unexpectedly" | "Restart" button in toast |
| API rate limit | Toast: "Rate limited. Retrying in Xs" | Auto-retry with countdown |
| Network error | Toast: "Network error" | "Retry" button |
| Permission denied (OS-level) | Toast with OS-specific instructions | Link to system preferences |
| Budget exceeded (hard limit) | Modal requiring override | "Increase" or "Stop" options |
| Context overflow | Compaction modal (see flow 4.2) | Three compaction options |

---

## 9. Loading States

| Component | Loading State |
|---|---|
| Message streaming | Typing indicator (3 dots bouncing) → progressive text render |
| Agent initializing | Card with "Initializing..." and spinner |
| Diff loading | Skeleton placeholder matching diff layout |
| MCP connecting | Server row with pulsing dot |
| Settings saving | Debounced auto-save, no visible indicator |
| Session loading | Skeleton placeholder for message list |
