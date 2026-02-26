# SPEC-003: UX Design Specification

**Version:** 2.6
**Date:** 2026-02-26
**Status:** Draft — Updated for Phase 2 + UX Polish + Slash Commands + Parallel Sessions v2 + File Explorer + Settings/UX Hardening + Context/i18n/Message Editing + Split/Onboarding/Theme/E2E follow-through + CHI-78 context-menu acceptance parity completion
**Parent:** SPEC-001 (Section 6, 10), SPEC-002 (Design System)
**Audience:** Frontend developers, coding agents, UX reviewers

---

## 1. Purpose

This document specifies every screen, interaction flow, and state transition in Chief Wiggum. Where SPEC-001 says "what" features exist and SPEC-002 says "how they look," this spec says "how they behave." A coding agent should be able to build any screen by reading only this document plus SPEC-002.

**Implementation status (2026-02-26):** The UX follow-through covered here is now implemented for CHI-63 (CHI-78 context menus with message delete/fork, code-block "Open in terminal," and keyboard-accessible custom menus; CHI-79 keyboard help/focus trap), CHI-64 (CHI-81 onboarding, CHI-82 Agents placeholder, CHI-83 no-project guidance), CHI-109 follow-through (CHI-110 split panes, CHI-112 aggregate cost, CHI-113 background activity indicators), CHI-130 (light/dark/system theme system with reactive terminal theming), and CHI-27 (CHI-28..34 Playwright E2E + CI integration with failure artifacts).

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

**Z5 — Status Bar (28px height):**
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

**Implementation status (2026-02-24): DONE (CHI-124)** — Full-screen settings overlay shell shipped with category navigation, searchable settings, debounced autosave, reset actions, Cmd+, shortcut, and TitleBar gear entry. Current UI aligns to the implemented CHI-122 backend settings schema plus an About/raw JSON preview area.

**Implementation status (2026-02-24): DONE (CHI-126, CHI-128)** — UI i18n infrastructure is now live with lazy locale loading and settings-driven locale sync. Current locale coverage includes English (`en`) and Spanish (`es`) for the shipped chrome and interaction strings (StatusBar, Sidebar, ConversationView, PermissionDialog, MessageInput, FileTree, and related surfaces).

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

**Implementation status (2026-02-24): DONE (CHI-137)** — Existing user messages can now be edited in place and assistant responses can be regenerated from a message via hover actions in the conversation UI. Regenerate trims subsequent messages and resends the updated user prompt without duplicating the user bubble.

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

### 4.7 CLI Detection Flow (Phase 2 — CHI-48)

```
App launches
  → cliStore calls get_cli_info IPC
  → [if CLI found]:
    → StatusBar shows "Ready"
    → MessageInput enabled
    → User can start conversations
  → [if CLI not found]:
    → StatusBar shows "CLI not found" in --color-error
    → MessageInput disabled, placeholder: "No CLI bridge connected"
    → ConversationView empty state changes:
      → Shows "Claude Code CLI Not Found" heading (text-error)
      → Shows install instructions: "npm install -g @anthropic-ai/claude-code"
      → Code block with install command (bg-elevated, rounded, monospace)
```

### 4.8 Project Folder Selection Flow (Phase 2 — CHI-40)

```
Sidebar shows "Open Project Folder" button (when no project active)
  → User clicks button
  → Native folder picker dialog opens (tauri-plugin-dialog)
  → User selects a folder
  → Project created in database
  → Sidebar updates: FolderOpen icon (accent color) + folder name (truncated)
  → Sessions scoped to project
  → [if project already selected]:
    → Button shows current project name (click to change)
    → Hover tooltip shows full path
```

### 4.9 Real CLI Streaming Flow (Phase 2 — CHI-47/CHI-49)

```
User sends message
  → MessageInput clears, user message appears in thread
  → [if no CLI process for session]:
    → start_session_cli IPC spawns CLI process
  → send_to_cli IPC writes to PTY stdin
  → Loading indicator: "Thinking..." bubble (bg-secondary, border, rounded)
  → CLI starts streaming response:
    → Streaming bubble appears: "Assistant" label, bg-secondary
    → Content renders incrementally via cli:chunk events
    → Blinking cursor (w-2 h-4 bg-accent animate-pulse) at end of text
    → MarkdownContent component renders markdown as chunks arrive
    → Auto-scroll follows new content (unless user scrolled up)
  → cli:complete event fires:
    → Blinking cursor removed
    → Full message finalized and persisted to SQLite
    → Message saved to conversationStore.messages array
  → [on error]:
    → Error bubble appears (bg-error/10, border-error/30, text-error)
    → Error text shown centered in conversation
  → [on cli:exited]:
    → Process cleanup
    → If unexpected exit: error state shown
```

### 4.10 YOLO Mode Toggle Flow (Phase 2 — CHI-26/CHI-52)

```
User presses Cmd+Shift+Y (or clicks YOLO indicator in TitleBar)
  → [if YOLO currently OFF]:
    → YoloWarningDialog appears:
      → Warning icon (⚠️) + "YOLO Mode" heading
      → Risk description: "Auto-approves all permission requests"
      → Red-tinted styling for gravity
      → "Enable YOLO Mode" button (danger variant)
      → "Cancel" button (secondary variant)
    → [if user confirms]:
      → uiStore.yoloMode = true
      → TitleBar shows yellow "YOLO" badge
      → StatusBar shows "YOLO MODE" in --color-warning, font-semibold
  → [if YOLO currently ON]:
    → Toggles off immediately (no confirmation needed)
    → TitleBar badge removed
    → StatusBar returns to "Ready"
```

### 4.11 Session Lifecycle Flow (Phase 2 — CHI-56/CHI-57/CHI-58)

```
Session switching:
  → User clicks different session in sidebar
  → Current session's CLI process suspended (not killed)
  → New session's messages loaded from SQLite
  → [if new session has a running CLI process]:
    → Resume existing process
  → [if new session has no process]:
    → No CLI process started until user sends a message

Session deletion:
  → User clicks trash icon on session item
  → [if session has running CLI process]:
    → Graceful shutdown: SIGTERM → wait 5s → SIGKILL
    → Process removed from SessionBridgeMap
  → Session removed from SQLite
  → Sidebar updates
  → [if deleted session was active]:
    → Switch to most recent remaining session or show empty state

App quit:
  → All CLI processes receive SIGTERM
  → Wait max 3s for graceful shutdown
  → Force kill any remaining processes
  → Close database connection
```

### 4.12 Cost Tracking Flow (Phase 2 — CHI-53/CHI-54)

```
Each CLI response completes
  → event_loop extracts token counts from CLI output
  → cost/calculator.rs converts tokens to cost (model-specific pricing)
  → CostEvent persisted to SQLite
  → emit('cost:update') to frontend

Frontend cost display:
  → StatusBar right section: "$X.XX" (font-mono, text-sm)
  → DetailsPanel Section 4: "Cost Breakdown"
    → Session total (text-xl, font-mono)
    → Model breakdown bars (Opus=purple, Sonnet=blue, Haiku=green)
    → Last message cost
    → Budget progress bar (if budget set)

Budget enforcement:
  → [at 80%]: StatusBar cost pill flashes yellow (3 times)
  → [at 100% hard limit]: Modal: "Budget Reached" with options
  → [at 100% soft limit]: Toast warning, execution continues
```

### 4.13 Slash Command Interaction Flow (Phase 3 — CHI-105/CHI-107)

```
User types "/" as first character in MessageInput
  → slashStore.open()
  → SlashCommandMenu renders anchored above input
  → Commands grouped by category:
    ┌─────────────────────────────────────┐
    │ Built-in                            │
    │  /review   Review code changes      │
    │  /test     Run test suite           │
    │ Project (.claude/commands/)          │
    │  /deploy   Deploy to staging        │
    │  /lint     Run linter               │
    │ MCP Tools (after CHI-108)           │
    │  /github:create-pr  Create pull req │
    └─────────────────────────────────────┘

User continues typing → fuzzy filter (reuses CHI-76 logic)
  → e.g., "/dep" → matches "/deploy"

Navigation:
  → Arrow Up/Down: highlight item
  → Enter: insert command name into input, close menu
  → Escape: close menu, keep text
  → Backspace past "/": close menu
  → Click outside: close menu

After command selection:
  → Command text inserted into MessageInput
  → User adds arguments and sends normally
  → Backend processes as regular prompt (Phase A)
  → After CHI-101: SDK routes to correct handler (Phase B)

Visual design:
  → Positioned above MessageInput (popover, not modal)
  → Max height 300px with scroll
  → /name in accent color + description in text-secondary
  → Highlighted item: --color-surface-hover background
  → All SPEC-002 tokens
```

### 4.14 Split Pane Layout Flow (Phase 3 — CHI-109/CHI-110)

```
User triggers split: Cmd+\
  → viewStore.splitSession('horizontal')
  → MainLayout renders SplitConversationView
  → Two panes, each with full ConversationView + MessageInput

Split view layout:
  ┌──────────────────────────────────────────┐
  │ TitleBar                                 │
  ├─────────┬───────────────┬────────────────┤
  │         │   Pane A      │   Pane B       │
  │ Sidebar │ [active]      │                │
  │         │ ConvView      │ ConvView       │
  │         │ MsgInput      │ MsgInput       │
  │         │               │                │
  ├─────────┴───────────────┴────────────────┤
  │ StatusBar (aggregate cost, session count)│
  └──────────────────────────────────────────┘

Pane interaction:
  → Click pane to focus → subtle border highlight (accent)
  → Keyboard shortcuts scoped to focused pane
  → Draggable divider between panes (min 300px each)
  → Cmd+W closes focused pane → returns to single mode

Background session notifications (CHI-113):
  → Non-focused session receives response → sidebar unread dot
  → Permission needed in background → toast notification
  → User switches to session → unread state cleared

Resource limits (CHI-111):
  → Max 4 concurrent CLI sessions (configurable)
  → Attempt to exceed → toast: "Maximum sessions reached"
  → Active count shown in StatusBar
```

### 4.15 File Explorer & @-Mention Context Flow (Phase 3 — CHI-114)

**Implementation status (2026-02-24): DONE (CHI-125, CHI-127)** — Context intelligence now includes quality scoring (relevance + token efficiency badges on `ContextChip`s, plus a Context Breakdown modal on `Cmd+Shift+T`) and smart file suggestions sourced from parsed imports/test-path heuristics (`get_file_suggestions`) shown inline near the message input.

```
File Tree browsing (CHI-116):
  User clicks file icon in Sidebar (Cmd+E toggle)
  → Sidebar switches to file tree view
  → invoke('list_project_files', { path: '/', max_depth: 1 })
  → Renders FileTreeView with lazy-loaded directory nodes

  File tree layout (replaces session list when active):
  ┌──────────────────┐
  │ 📁 src/          │  ← click to expand
  │   📁 components/ │
  │   📁 stores/     │
  │   📄 App.tsx     │  ← click to preview
  │   📄 index.tsx   │
  │ 📁 src-tauri/    │
  │ 📄 package.json  │
  │ 📄 CLAUDE.md     │
  └──────────────────┘

  Expand folder:
  → invoke('list_project_files', { path: 'src/components', max_depth: 1 })
  → Children inserted under parent with indent
  → Arrow icon rotates 90° (transition 150ms)

  Click file:
  → DetailsPanel shows file content preview (CHI-118)
  → invoke('read_project_file', { path, max_lines: 200 })
  → Syntax-highlighted with line numbers

  Keyboard navigation:
  → ↑/↓ navigate nodes
  → → expand folder / ← collapse folder
  → Enter opens preview in DetailsPanel
  → Escape returns to session list view

@-Mention autocomplete (CHI-117):
  User types "@" in MessageInput
  → FileMentionMenu appears above cursor (anchored to @)
  → invoke('search_project_files', { query: '', limit: 10 })
  → Shows recently-accessed files by default

  Continue typing after "@":
  → Debounced fuzzy search (150ms) against file index
  → invoke('search_project_files', { query: typed_text, limit: 10 })
  → Results ranked by score, grouped: files first, then directories

  Menu layout:
  ┌────────────────────────────┐
  │ 📄 App.tsx                 │  ← highlighted
  │ 📄 AppLayout.tsx           │
  │ 📁 components/             │
  │ 📄 conversation/Conv...    │
  └────────────────────────────┘

  Select file:
  → Enter or click → inserts ContextChip inline in MessageInput
  → Chip shows: [📄 App.tsx ✕] (removable)
  → File added to contextStore.attachedFiles[]

  Escape or empty results:
  → Menu closes, "@" text remains editable

Context assembly on send (CHI-117):
  → conversationStore.sendMessage() checks contextStore.attachedFiles
  → For each file reference:
    → If full file: prepend <file path="src/App.tsx">...content...</file>
    → If range: prepend <file path="src/App.tsx" lines="10-25">...content...</file>
  → Token estimation shown in StatusBar: "~2.4K tokens attached"
  → Warning toast at 50K tokens, hard cap at 100K tokens

Code range selection (CHI-119):
  File preview in DetailsPanel shows line numbers
  → Click line number → selects single line (highlighted)
  → Click+drag or Shift+click → selects range (highlighted block)
  → "Add to prompt" button appears above selection
  → Click "Add to prompt" → inserts ContextChip: [📄 App.tsx:10-25 ✕]
  → Only selected lines included in context assembly

  Range display in DetailsPanel:
  ┌──────────────────────────────────────┐
  │  8 │ import { Component } from ...   │
  │  9 │                                 │
  │ 10 │ export default function App() { │ ← selection start (blue bg)
  │ 11 │   const [count, setCount] = ... │
  │ 12 │   return (                      │
  │ 13 │     <div>                       │ ← selection end
  │ 14 │       <h1>Hello</h1>            │
  │ 15 │     </div>                      │
  │    │  [➕ Add lines 10-13 to prompt] │ ← floating button
  └──────────────────────────────────────┘
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
| Cmd+Shift+Y | Toggle YOLO mode |
| Cmd+` | Toggle terminal (when in conversation) |
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

---

## 10. UX Polish Specifications (Phase 2.5)

The following sections specify UX improvements identified during the Phase 2 CX/UX investigation. These are organized by epic and can be implemented in parallel with Phase 2 core work.

**Implementation status (2026-02-24):** CHI-135 (Missing Error States) and CHI-136 (Accessibility Pass) are now implemented across the current UI shell, including retry/error surfaces for FileTree/FilePreview and keyboard/ARIA/text-alternative improvements for navigation, status indicators, and the file tree.

### 10.1 Native Window Chrome & Platform Feel (CHI-61)

**Problem:** Custom window controls (`Minus`, `Maximize2`, `X` from Lucide) feel like a web app, not a native desktop application.

**CHI-67: Native Window Controls (Urgent)**

On macOS:
- Use `hiddenTitle` mode in `tauri.conf.json` or `tauri-plugin-decorum`
- Traffic light buttons positioned at: 12px from left edge, 12px from top, 8px gap between buttons
- App title hidden from native bar (custom title in TitleBar component)
- `decorations: true` with `titleBarStyle: "hiddenInset"` on macOS

On Windows:
- Use native window decorations (Win32 title bar)
- OR use `tauri-controls` for HTML-rendered Windows-style minimize/maximize/close buttons
- Windows snap behavior must work correctly

On Linux:
- Use native GTK/Qt window decorations
- Respect system theme for window chrome

**CHI-68: Titlebar Redesign (High)**

Updated TitleBar layout:
```
macOS:
┌──[🔴🟡🟢]──[Chief Wiggum]──────[ModelSelector]──────[⚙️]──┐
│  traffic   app name        center: model         settings  │
│  lights    (drag region)   selector dropdown      gear icon │

Windows:
┌──[Chief Wiggum]──────[ModelSelector]──────[⚙️]──[─][□][✕]──┐
│  app name            center: model        settings  native  │
│  (drag region)       selector             gear      buttons │
```

- Entire TitleBar is drag region except interactive elements
- `data-tauri-drag-region` attribute on drag areas
- Model selector centered between app name and settings

**CHI-69: macOS Vibrancy (Low)**

- Use `window-vibrancy` crate for NSVisualEffectView
- Apply `Sidebar` material to sidebar panel
- Apply `Titlebar` material to title bar
- Conditional: only on macOS, graceful fallback on other platforms

**CHI-70: Custom Scrollbar Styling (Medium)**

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(139, 148, 158, 0.2);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover { background: rgba(139, 148, 158, 0.35); }
::-webkit-scrollbar-corner { background: transparent; }
```

**Status: DONE** — Applied globally in `tokens.css`. Thin 6px scrollbars with transparent track, rgba thumbs matching the dark theme. Applied to all scrollable containers: conversation view, sidebar, details panel.

### 10.2 Delightful Interactions & Micro-animations (CHI-62)

**CHI-71: Message Enter/Exit Animations (Medium) — DONE**

New messages slide in from bottom + fade with staggered delays:
```css
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fade-in-up var(--duration-entrance) var(--ease-out) both;
}
```
- Staggered `animation-delay: Math.min(index * 30, 200)ms` per message for cascade effect
- Uses `--duration-entrance: 300ms` and `--ease-out` timing
- Respects `prefers-reduced-motion` (all animations disabled via global rule)

**CHI-72: Premium Typing Indicator (High) — PARTIALLY DONE**

Animated thinking dots with accent color and staggered animation:
```
┌────────────────────────────┐
│  Assistant                 │
│  ● ● ●                    │  ← 3 dots with staggered glow-pulse
│                            │     + accent color (#E8825A)
└────────────────────────────┘
```
- 3 dots, `w-1.5 h-1.5` (6px), accent-colored with `glow-pulse` animation
- Staggered `animation-delay`: 0ms, 150ms, 300ms between dots
- Transitions to streaming cursor (`w-[3px] h-4 rounded-[1px] animate-cursor-blink`) when first chunk arrives
- **Remaining:** Optional shimmer gradient across bubble surface (not yet implemented)

**CHI-73: Smooth Streaming Text Rendering (High)**

Instead of raw chunk-by-chunk rendering, buffer characters and flush at 5ms intervals for a typewriter effect:
```typescript
// Pseudocode for typewriter buffer
const FLUSH_INTERVAL = 5; // ms per character
let buffer = '';
function onChunk(text: string) {
  buffer += text;
  if (!flushing) startFlush();
}
function startFlush() {
  flushing = true;
  const char = buffer[0];
  buffer = buffer.slice(1);
  appendToDisplay(char);
  if (buffer.length > 0) setTimeout(startFlush, FLUSH_INTERVAL);
  else flushing = false;
}
```

**CHI-74: Toast Notification System (Medium)**

Toast container: fixed bottom-right, 16px from edges, max 3 visible.
```
┌────────────────────────────────┐
│ ✓ Message sent successfully    │  ← success variant
│                           [✕]  │
└────────────────────────────────┘
```
Variants: success (green left stripe), warning (yellow), error (red), info (blue).
Auto-dismiss: 5s for info/success, 10s for warning, persistent for error.
Slide in from right + fade, slide out left + fade.

**CHI-75: Copy Feedback & Hover Micro-interactions (Medium)**

- Code block copy button: on click, icon changes from clipboard → checkmark for 2s
- Message hover: subtle background lightening (+2% luminance)
- Button press: scale(0.97) for 100ms tactile feedback
- Session item hover: left border accent line slides in (3px)

### 10.3 Command Palette & Power User UX (CHI-63)

**Implementation status (2026-02-26):** CHI-78 and CHI-79 are implemented. CHI-78 now includes custom context menus for conversation messages, sidebar sessions, file-tree items, and markdown code blocks, with message delete/fork actions wired to backend IPC plus keyboard-accessible menu opening/navigation (`ContextMenu` key / `Shift+F10`, arrow keys, Home/End, Enter). CHI-79 includes a keyboard shortcuts help overlay (`Cmd+/`) and reusable focus trap.

**CHI-76: Command Palette UI (High)**

Triggered by Cmd+K. Centered overlay, 560px wide, max 400px tall.

```
┌─────────────────────────────────────────────┐
│ 🔍 Type a command...                        │
├─────────────────────────────────────────────┤
│ Sessions                                    │
│   ⊕ New Session                    Cmd+N    │
│   ↗ Switch Session                 Cmd+Shift+P │
│ Navigation                                  │
│   💬 Conversation                  Cmd+1    │
│   🤖 Agents                       Cmd+2    │
│   📄 Diffs                        Cmd+3    │
│   ⌨️ Terminal                     Cmd+4    │
│ Actions                                     │
│   📁 Open Project                  Cmd+O    │
│   🔄 Switch Model                  Cmd+M    │
│   ⚙️ Settings                     Cmd+,    │
└─────────────────────────────────────────────┘
```

- Fuzzy search with character highlighting
- Results grouped by category
- Arrow keys navigate, Enter selects, Escape closes
- Keyboard shortcut shown right-aligned per result
- Max 10 visible results, scrollable

**CHI-77: Session Quick-Switcher (Medium)**

Cmd+Shift+P opens a filtered version of command palette showing only sessions:
- Search by session title
- Model badge shown per session
- Most recent sessions first
- Enter switches to selected session

**CHI-78: Custom Context Menus (Medium)**

Right-click context menus on:
- **Messages**: Copy, Retry, Fork from here, Delete
- **Sessions** (sidebar): Rename, Duplicate, Delete
- **Code blocks**: Copy code, Copy as markdown, Open in terminal

Rendered as custom HTML menus (not native), matching app theme.

**CHI-79: Keyboard Navigation Audit (Medium)**

- All interactive elements in logical tab order
- Focus trap in modals/dialogs
- Arrow key navigation in lists (sidebar sessions, command palette results)
- Visible focus rings on all elements
- Skip-navigation link for accessibility

### 10.4 Onboarding & Empty States (CHI-64)

**Implementation status (2026-02-25):** CHI-81, CHI-82, and CHI-83 are implemented. The first-launch onboarding flow persists completion in user settings and is dismissible/skippable; the Agents view uses an upgraded placeholder, and the no-project guidance appears in the conversation empty state.

**CHI-80: Conversation Empty State Redesign (High)**

Replace bland "No messages yet" with personality:

```
┌─────────────────────────────────────────────┐
│                                             │
│           🔍                                │
│     Chief Wiggum                            │
│     Your Claude Code companion              │
│                                             │
│     Try asking:                             │
│     ┌─────────────────────────────────┐     │
│     │ "Refactor this module to use    │     │
│     │  dependency injection"          │     │
│     └─────────────────────────────────┘     │
│     ┌─────────────────────────────────┐     │
│     │ "Write tests for the auth       │     │
│     │  middleware"                     │     │
│     └─────────────────────────────────┘     │
│     ┌─────────────────────────────────┐     │
│     │ "Explain how the caching layer  │     │
│     │  works"                         │     │
│     └─────────────────────────────────┘     │
│                                             │
└─────────────────────────────────────────────┘
```

- Sample prompts are clickable (populate input area)
- Subtle gradient background or illustration
- Shows CLI status at bottom if not detected

**CHI-82: Placeholder Views for Agents/Diff (Medium)**

Replace "Agent dashboard (future)" with informative states:
```
┌─────────────────────────────────────────────┐
│                                             │
│     🤖 Agent Teams                          │
│     Coming soon                             │
│                                             │
│     Spawn multiple Claude agents to work    │
│     on parallel tasks with shared context.  │
│                                             │
│     What you'll be able to do:              │
│     • Assign agents to sub-tasks            │
│     • Review changes in the Diff view       │
│     • Set per-agent budgets                 │
│                                             │
└─────────────────────────────────────────────┘
```

**CHI-83: "No Project Selected" Guidance (Medium)**

When no project is selected, show contextual guidance:
- Sidebar: "Open Project Folder" button with folder icon
- Conversation view: hint text "Open a project folder to get started with context-aware conversations"
- DetailsPanel: show "No project selected" where context would appear

### 10.5 Sidebar & Navigation Polish (CHI-65)

**CHI-84: Sidebar Collapsed Icon-Rail Mode (High)**

Three sidebar states:
```
Expanded (240px)     Collapsed (48px)     Hidden (0px)
┌──────────────┐     ┌────┐               (invisible)
│ 📁 Project   │     │ 📁 │
│──────────────│     │────│
│ Sessions     │     │ 💬 │  ← icon tooltips on hover
│ 💬 Session 1 │     │ 💬 │
│ 💬 Session 2 │     │ 💬 │
│──────────────│     │────│
│ [+ New]      │     │ ⊕  │
└──────────────┘     └────┘
```

- Cmd+B cycles: Expanded → Collapsed → Hidden → Expanded
- Collapsed mode shows only icons with tooltips
- Active session highlighted with accent left border

**CHI-85: Session Sections (Medium)**

Group sessions in sidebar:
- **Pinned** (user can pin important sessions)
- **Recent** (last 24 hours)
- **Older** (everything else, collapsible)

**CHI-86: Session Rename Inline (Medium)**

- Double-click session title → inline text input
- Enter confirms, Escape cancels
- Session actions menu (right-click or ⋮ button): Rename, Pin/Unpin, Duplicate, Delete

**CHI-87: View Tabs with Icons (Medium)**

```
[💬 Chat] [🤖 Agents] [📄 Diffs●5] [⌨️ Terminal]
```
- Icons from Lucide: MessageSquare, Bot, FileDiff, Terminal
- Count badges on Agents and Diffs tabs (when items pending)

### 10.6 Tool Use Visualization & Inline Activity (CHI-66)

**CHI-89: ToolUseBlock Component (High)**

Inline collapsible block within assistant messages showing tool execution:

```
┌─ 🔧 EditFile ──────────────────────────┐
│  auth/middleware.ts                     │
│  +42 lines, -18 lines                  │  ← collapsed (default)
│                                    [▼]  │
└─────────────────────────────────────────┘

┌─ 🔧 EditFile ──────────────────────────┐
│  auth/middleware.ts                     │
│  +42 lines, -18 lines              [▲] │  ← expanded
│─────────────────────────────────────────│
│  + import { verify } from 'jsonweb...' │
│  + import { sign } from 'jsonweb...'   │
│  - const session = req.session;        │
│  + const token = req.headers.auth...   │
└─────────────────────────────────────────┘
```

Color-coding by tool type:
- File operations (Edit, Write): blue left stripe
- Bash commands: green left stripe
- Read operations: gray left stripe (less prominent)

**CHI-90: ThinkingBlock Component (Medium)**

Collapsible block showing Claude's reasoning:

```
┌─ 💭 Thinking ──────────────────────────┐
│  Collapsed by default after response    │
│  completes. Italic text, text-secondary.│
│  Shows first ~2 lines as preview.       │
│                                    [▼]  │
└─────────────────────────────────────────┘
```

- Collapsed by default after response completes
- Expanded while streaming
- Muted styling: italic, text-secondary, bg-bg-secondary

**CHI-91: Permission Inline Record (Medium)**

After a permission dialog is resolved, show inline record in conversation:

```
┌─ 🔐 Permission ────────────────────────┐
│  ✓ Allowed: Bash(npm install jwt)       │  ← green for allowed
│  ✕ Denied: Bash(rm -rf /tmp/*)          │  ← red for denied
│  🟡 YOLO: Bash(npm test)               │  ← yellow for auto-approved
└─────────────────────────────────────────┘
```

**CHI-92: File Diff Preview (Low)**

Mini inline diff within ToolUseBlock for file modifications:
- Shows +/- line counts
- Expandable to show actual diff hunks
- Click to open full diff in Diff Review view

### 10.7 Slash Commands & Skill Invocation (CHI-105)

**CHI-106: Command Discovery Backend (Urgent)**

File-based command scanner for `.claude/commands/` directory:
- Scans project directory and user home for command files
- Parses YAML frontmatter for description and category
- Returns `SlashCommand[]` via IPC
- Caches results, refreshes on project switch

**CHI-107: SlashCommandMenu UI Component (High)**

Inline autocomplete dropdown triggered by `/` at input start:

```
User types "/" →
┌─────────────────────────────────────────┐
│ Built-in                                │
│  /review    Review current changes  [↵] │  ← highlighted
│  /test      Run test suite              │
│ Project                                 │
│  /deploy    Deploy to staging           │
│  /lint      Run project linter          │
│ User                                    │
│  /mycommand Custom user command         │
└─────────────────────────────────────────┘
```

Behavior:
- Positioned above MessageInput (popover, uses portal)
- Max height 300px, overflow scroll
- Grouped by category with section headers
- `/name` in accent color, description in text-secondary
- Fuzzy search filter as user types (reuse CHI-76 logic)
- Keyboard: Up/Down navigate, Enter select, Escape close
- Selected command inserted into input field
- All SPEC-002 tokens

**CHI-108: SDK Command Discovery Integration (Medium)**

After CHI-101 Agent SDK migration:
- `system:init` event provides tools, MCP servers, slash commands
- SDK-discovered commands merged with file-scanned (SDK wins conflicts)
- MCP tools appear with server prefix (e.g., `/github:create-pr`)
- File-scanned commands remain as fallback

### 10.8 Split Pane & Parallel Sessions v2 (CHI-109)

**Implementation status (2026-02-25):** CHI-110, CHI-112, and CHI-113 are implemented (split conversation panes, aggregate cost tracking UI, and background session activity indicators/toasts).

**CHI-110: Split Pane Layout System (High)**

Horizontal/vertical split of the main content area:

```
┌──────────────────────────────────────────┐
│ TitleBar                                 │
├────────┬───────────────┬─────────────────┤
│        │   Pane A      ┃   Pane B        │
│Sidebar │ [focused]     ┃                 │
│        │ ┌──────────┐  ┃ ┌──────────┐   │
│        │ │ Messages │  ┃ │ Messages │    │
│        │ └──────────┘  ┃ └──────────┘   │
│        │ ┌──────────┐  ┃ ┌──────────┐   │
│        │ │  Input   │  ┃ │  Input   │    │
│        │ └──────────┘  ┃ └──────────┘   │
├────────┴───────────────┴─────────────────┤
│ StatusBar: $4.23 total │ 2 active        │
└──────────────────────────────────────────┘
```

Controls:
- Cmd+\\ to split (horizontal default)
- Cmd+W to close focused pane
- Click to focus pane (subtle accent border)
- Draggable divider (min 300px per pane)
- Keyboard shortcuts scoped to active pane

**CHI-111: Concurrent Session Resource Limits (High)**

- Configurable max concurrent sessions (default 4)
- `can_spawn()` check before starting new CLI process
- StatusBar shows active session count
- Toast notification when limit reached

**CHI-112: Aggregate Cost Tracking (Medium)**

- StatusBar shows total cost across all active sessions
- Sidebar shows per-session cost badge
- Budget warnings consider aggregate, not per-session

**CHI-113: Session Activity Notifications (Medium)**

- Unread dot badge on sidebar for background session activity
- Toast for permission requests from non-focused sessions
- Badge clears when session is focused
- Only fires on `complete` and `permission` events (not streaming chunks)

### 10.9 File Explorer & @-Mention Context System (CHI-114)

**Implementation status (2026-02-24):** CHI-133 follow-up is done: `FilePreview` supports drag resizing with a sticky line-number gutter, and existing context chips can reopen a file preview for range editing and update the attached range/token estimate in place.

**CHI-115: Backend File Scanner (Urgent)**

Rust IPC module providing project file operations:

- `list_project_files(path, max_depth)` — gitignore-aware directory walking via `ignore` crate
- `read_project_file(path, max_lines, offset)` — paginated file reading with language detection
- `search_project_files(query, limit)` — fuzzy filename matching, score-ranked results
- `get_file_token_estimate(path, start_line, end_line)` — `chars/4` token estimation
- `files:changed` Tauri event — `notify` crate watching with 500ms debounce
- Binary file detection (skip content read, show metadata only)
- Hidden directory exclusion (`.git/`, `node_modules/`, `target/`)
- Unit tests: 8+ covering walker, search, token estimation, binary detection

Types:
```typescript
interface FileNode {
  name: string;
  relative_path: string;
  node_type: 'file' | 'directory' | 'symlink';
  size_bytes: number | null;
  extension: string | null;
  children: FileNode[] | null;
  is_binary: boolean;
}
```

**CHI-116: File Tree Sidebar Component (High)**

Visual file browser in the Sidebar zone (Z2):

- Toggle between session list and file tree via Cmd+E or icon click
- Lazy-loaded: only fetches children when folder expanded
- Virtual scrolling for projects with 1000+ visible nodes
- Expand/collapse folders with arrow icons (animated rotate)
- File icons by extension (`.ts` → TypeScript, `.rs` → Rust, `.md` → Markdown)
- Keyboard navigation: ↑/↓ navigate, →/← expand/collapse, Enter preview
- Right-click context menu: "Copy path", "Add to prompt", "Open in editor"
- Respects gitignore: hidden files dimmed or excluded
- File tree auto-refreshes on `files:changed` events

Layout:
```
┌──────────────────┐
│ 🔍 Filter files  │  ← search input
├──────────────────┤
│ 📁 src/          │
│   📁 components/ │
│     📄 App.tsx   │
│     📄 ...       │
│ 📁 src-tauri/    │
│ 📄 package.json  │
└──────────────────┘
```

**CHI-117: @-Mention Autocomplete (High)**

Inline file reference system in MessageInput:

- `@` character triggers FileMentionMenu (popover anchored to cursor)
- Fuzzy search against project file index (debounced 150ms)
- Results show: file icon + name + relative path (truncated)
- Keyboard nav: ↑/↓ move highlight, Enter select, Escape dismiss
- Selection inserts ContextChip inline: `[📄 filename.ext ✕]`
- Multiple files can be attached (each gets a chip)
- ContextChip is removable (click ✕ or Backspace when focused)
- `contextStore.ts` manages attached files array
- On send: context XML assembled and prepended to user message
- Token budget display: "~2.4K tokens attached" in StatusBar
- Warning toast at 50K tokens, hard cap at 100K tokens
- Reuses SlashCommandMenu trigger pattern from CHI-107
- Reuses CommandPalette fuzzy filter from CHI-76

**CHI-118: File Content Preview (Medium)**

Syntax-highlighted file viewer in DetailsPanel (Z4):

- Triggered by clicking file in tree or @-mention chip
- `read_project_file()` with paginated loading (200 lines at a time)
- Syntax highlighting via highlight.js (reuses MarkdownContent renderer)
- Line numbers gutter (monospace, dimmed)
- "Add to prompt" action button in header
- File metadata header: name, path, size, estimated tokens
- Binary files show metadata only (no content)
- Scroll-to-line support for range references
- Loading skeleton while fetching

Layout:
```
┌──────────────────────────────────────┐
│ 📄 App.tsx  ·  src/App.tsx           │
│ 245 lines  ·  ~1.2K tokens          │
│ [➕ Add to prompt]                   │
├──────────────────────────────────────┤
│  1 │ import { Component } from ...   │
│  2 │ import { createSignal } from .. │
│  3 │                                 │
│  4 │ export default function App() { │
│  5 │   // ...                        │
│ ...│                                 │
└──────────────────────────────────────┘
```

**CHI-119: Code Range Selection (Medium)**

Select specific lines/ranges for targeted context attachment:

- Click line number in preview to select single line
- Click+drag or Shift+click for range selection
- Selected lines highlighted with accent background
- Floating "Add lines X-Y to prompt" button above selection
- Inserts ranged ContextChip: `[📄 App.tsx:10-25 ✕]`
- Only selected lines included in context XML assembly:
  ```xml
  <file path="src/App.tsx" lines="10-25">
  ...selected content only...
  </file>
  ```
- Range token estimation via `get_file_token_estimate(path, start, end)`
- Multiple ranges from same file allowed (merged if overlapping)
- `@file.ext:10-25` syntax supported in MessageInput text (parsed on send)
