# Chief Wiggum — Agent Instructions

> **Read this file first.** It is the auto-briefing for any Claude Code session.
> Updated: 2026-02-23

---

## What Is This Project?

**Chief Wiggum** is a cross-platform desktop app (Tauri v2 + Rust + SolidJS) that wraps Claude Code CLI in a polished GUI. It gives professional developers visual multi-agent orchestration, real-time cost tracking, and intelligent context management — without leaving the desktop.

---

## Current Phase

**Phase 2: Make It Real**

- Linear project: https://linear.app/chief-wiggum/project/phase-2-make-it-real-951a81a3c66b
- Team identifier: CHI
- Workspace: https://linear.app/chief-wiggum
- Previous: Phase 1 Foundation — COMPLETE (https://linear.app/chief-wiggum/project/phase-1-foundation-ba6f471a516b)

---

## What's Done

| Epic / Task                         | Status   | Notes                                                                                               |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| CHI-6: CLI Bridge                   | **Done** | `src-tauri/src/bridge/` — all 4 sub-tasks (CHI-13, CHI-14, CHI-15, CHI-16)                          |
| CHI-8: Scaffold Tauri v2            | **Done** | `main.rs`, `tauri.conf.json`, `capabilities/`, icons, Vite, `package.json`                          |
| CHI-9: SolidJS + TailwindCSS        | **Done** | `src/` frontend with SPEC-002 tokens, Prettier, ESLint, 55 tests pass                               |
| CHI-11: SQLite Database             | **Done** | `src-tauri/src/db/` — migrations, queries, WAL mode, 12 db tests                                    |
| CHI-10: CI/CD Pipeline              | **Done** | `.github/workflows/ci.yml` — matrix builds, clippy, fmt, tests                                      |
| CHI-12: CLAUDE.md                   | **Done** | Agent auto-briefing file                                                                            |
| CHI-25: Push to GitHub              | **Done** | `github.com/fcostudios/chief-wiggum`                                                                |
| CHI-17: Layout Shell                | **Done** | 5-zone layout, TitleBar, Sidebar, StatusBar, DetailsPanel, MainLayout                               |
| CHI-19: Message Input               | **Done** | Auto-expanding textarea, send/stop controls, keyboard shortcuts                                     |
| CHI-23: Permission Dialog           | **Done** | Modal dialog, risk coloring, timeout, focus trap, keyboard shortcuts                                |
| CHI-18: Conversation View           | **Done** | Markdown/code rendering (marked + highlight.js), message bubbles, auto-scroll                       |
| CHI-21: Terminal Mode               | **Done** | xterm.js v5 + WebGL addon, SPEC-002 themed, Cmd+` toggle                                            |
| CHI-26: YOLO Mode                   | **Done** | Auto-approve permissions, warning dialog, TitleBar/StatusBar indicators, Cmd+Shift+Y                |
| CHI-22: Session Persistence         | **Done** | IPC commands module, session CRUD, sidebar navigation, conversationStore rewrite                    |
| CHI-20: Model Selector              | **Done** | ModelSelector dropdown, Cmd+M cycling, TitleBar integration                                         |
| CHI-24: Cross-Platform Packaging    | **Done** | Bundle metadata, release workflow (.dmg, .msi, .AppImage)                                           |
| CHI-48: CLI Detection               | **Done** | `commands/cli.rs`, `cliStore.ts`, StatusBar status, ConversationView guidance                       |
| CHI-40: Project & Folder Management | **Done** | `tauri-plugin-dialog`, `commands/project.rs`, `projectStore.ts`, Sidebar folder picker              |
| CHI-44: SessionBridgeMap            | **Done** | `bridge/manager.rs` — session→process manager, 7 unit tests (71 total)                              |
| CHI-45: IPC Commands for CLI        | **Done** | `commands/bridge.rs` — start_session_cli, send_to_cli, stop_session_cli, get_cli_status             |
| CHI-46: Streaming Event Loop        | **Done** | `bridge/event_loop.rs` — BridgeOutput → Tauri events (chunk, complete, exited, permission)          |
| CHI-47: Replace Mock with Real CLI  | **Done** | `conversationStore.ts` rewrite — real IPC + event listeners, mock removed                           |
| CHI-49: Streaming Message Rendering | **Done** | ConversationView streaming bubble, blinking cursor, error display, auto-scroll                      |
| CHI-50: Permission IPC              | **Done** | `respond_permission`, `toggle_yolo_mode` commands, PermissionManager state                          |
| CHI-51: Permission Event Pipeline   | **Done** | `permission:request` listener → PermissionDialog → IPC response flow                                |
| CHI-52: YOLO Mode IPC               | **Done** | Frontend toggle wired to `invoke('toggle_yolo_mode')`                                               |
| CHI-60: App Shutdown Cleanup        | **Done** | Window close handler calls `shutdown_all()` on SessionBridgeMap                                     |
| CHI-67: Native Window Controls      | **Done** | `titleBarStyle: overlay`, platform detection, macOS traffic lights                                  |
| CHI-89: ToolUseBlock                | **Done** | Collapsible, color-coded tool blocks (file=blue, bash=green, neutral=gray), structured JSON storage |
| CHI-90: ThinkingBlock               | **Done** | Collapsible thinking display, streaming + persisted, ~80 char preview when collapsed                |
| CHI-56: Process Status              | **Done** | ProcessStatus tracking in conversationStore, StatusBar indicator                                    |
| CHI-57: Session Switching           | **Done** | switchSession() stops CLI, cleans listeners, loads messages                                         |
| CHI-58: Graceful Shutdown           | **Done** | stopSessionCli() before delete, auto-switch to next session                                         |
| CHI-59: Crash Recovery              | **Done** | retryLastMessage(), Retry button in error display                                                   |
| CHI-80: Empty State                 | **Done** | CW branding, 3 clickable sample prompt cards                                                        |
| CHI-41: Project Sidebar             | **Done** | Recent projects list (max 5), click-to-switch                                                       |
| CHI-42: CLAUDE.md Detection         | **Done** | Detect and display CLAUDE.md from project folder                                                    |
| CHI-43: Session-Project Binding     | **Done** | Bind sessions to projects with inherited settings                                                   |
| CHI-53: Cost Accumulator            | **Done** | Cost accumulator service with SQLite persistence                                                    |
| CHI-54: StatusBar Cost Display      | **Done** | Bind StatusBar + DetailsPanel to live cost events                                                   |
| CHI-55: Per-message Cost            | **Done** | K-formatted tokens, dollar cost, copy button in MessageBubble                                       |
| CHI-68: Titlebar Redesign           | **Done** | Settings gear, removed sidebar toggle, cleaner layout                                               |
| CHI-72: Typing Indicator            | **Done** | Premium animated dots with shimmer effect                                                           |
| CHI-73: Typewriter Buffer           | **Done** | Smooth streaming text via adaptive character buffer                                                 |
| CHI-74: Toast System                | **Done** | `toastStore.ts`, `ToastContainer.tsx`, slide animations, max 3, auto-dismiss                        |
| CHI-75: Micro-interactions          | **Done** | Copy icon swap, hover-lift, session border slide, press feedback                                    |
| CHI-76: Command Palette             | **Done** | Cmd+K, fuzzy search, categorized actions                                                            |
| CHI-77: Session Quick-Switcher      | **Done** | Cmd+Shift+P, filtered CommandPalette mode                                                           |
| CHI-84: Sidebar Icon-Rail           | **Done** | 48px collapsed mode with tooltips                                                                   |
| CHI-85: Session Sections            | **Done** | Pinned/Recent/Older collapsible sections, DB migration v3                                           |
| CHI-91: Permission Records          | **Done** | Inline allowed/denied/YOLO blocks in conversation                                                   |
| CHI-102: Developer Mode             | **Done** | Three-tier permission model, Bash allowedTools patterns                                             |
| CHI-103: HMR Resilience             | **Done** | SessionRuntime event buffer (200-event ring), reconnectAfterReload(), dedup replay                  |
| CHI-104: Parallel Sessions          | **Done** | Per-session processStatus, per-session listeners, non-destructive switching, sidebar indicators     |
| CHI-94: 3-Layer Tracing             | **Done** | `logging/` module — console + rolling file (JSON) + ring buffer (36K entries), platform-aware paths |
| CHI-96: Diagnostic Bundle Export    | **Done** | Redacted ZIP export (`logs.jsonl`, system info, redaction summary) + StatusBar export action         |
| CHI-106: Slash Command Discovery    | **Done** | `slash/` module — 11 built-in + project + user `.md` scanning, IPC commands                         |
| CHI-107: SlashCommandMenu UI        | **Done** | Inline autocomplete dropdown, categorized, fuzzy search, keyboard nav (Arrow/Enter/Esc/Tab)         |
| CHI-108: SDK Command Discovery      | **Done** | `system:init` tools/mcp_servers → SDK slash commands merged into slash IPC + auto-refresh listener   |
| CHI-95: Log Redaction Engine        | **Done** | `logging/redactor.rs` — 7 regex rules, export-time redaction, RedactionSummary, 13 tests            |
| CHI-111: Concurrent Session Limits  | **Done** | `can_spawn()` guard (default 4), ResourceLimit error, StatusBar running count badge                 |
| CHI-115: Backend File Scanner       | **Done** | `files/` module — gitignore-aware scanner + notify watcher + 4 IPC commands, 142 tests              |
| CHI-116: File Tree Sidebar          | **Done** | `explorer/FileTree.tsx` + `FileTreeNode.tsx`, `fileStore.ts`, lazy loading, search                  |
| CHI-117: @-Mention Autocomplete     | **Done** | `FileMentionMenu.tsx`, `ContextChip.tsx`, `contextStore.ts`, XML context assembly                   |
| CHI-118: File Content Preview       | **Done** | `FilePreview.tsx` in DetailsPanel, syntax highlighting, paginated expansion, copy path              |
| CHI-119: Code Range Selection       | **Done** | Click/drag/shift+click line selection, token estimates, `@file:start-end` shorthand                 |
| CHI-122: Settings Backend & Types   | **Done** | `settings/` module + validation + IPC persistence (`tauri-plugin-store`) + TS settings types        |
| CHI-123: File Explorer Quick Wins   | **Done** | Git status indicators, drag-drop attach, hover preview tooltip, breadcrumb navigation                |
| CHI-132: Conversation Virtualization| **Done** | `ConversationView` virtual scrolling with `@tanstack/solid-virtual` + jump-to-latest                |

## Phase 1 Status

**Phase 1: Foundation is COMPLETE.** All 3 epics done:

- **CHI-5: Core Scaffolding** — 5/5 tasks
- **CHI-6: CLI Bridge** — 4/4 tasks
- **CHI-7: Basic UI** — 9/9 tasks

---

## Phase 2: Make It Real

**Goal:** Wire the existing CliBridge, StreamParser, and PermissionManager to the frontend. Replace the mock conversation flow with real Claude Code CLI interaction. Add project/folder management.

**The Gap:** `CliBridge`, `StreamParser`, `PermissionManager` exist as standalone Rust modules but nothing connects them to IPC commands or the frontend. `conversationStore.ts` lines 73-106 use `setTimeout` + a canned response. Phase 2 closes every gap.

**Critical Path:** CHI-40 → CHI-44 → CHI-45 → CHI-46 → CHI-47 = minimum to "it actually works"

### Epic CHI-35: Project & Folder Management (P0) — DONE

| Task   | Priority | Status   | Description                                        |
| ------ | -------- | -------- | -------------------------------------------------- |
| CHI-40 | P0       | **Done** | Folder picker + project creation via native dialog |
| CHI-41 | P1       | **Done** | Project sidebar section with recent projects       |
| CHI-42 | P2       | **Done** | Detect and display CLAUDE.md from project folder   |
| CHI-43 | P1       | **Done** | Bind sessions to projects with inherited settings  |

### Epic CHI-36: CLI Connection & Streaming (P0) — DONE

| Task   | Priority | Status   | Description                                                         |
| ------ | -------- | -------- | ------------------------------------------------------------------- |
| CHI-44 | P0       | **Done** | SessionBridgeMap — session→process manager                          |
| CHI-45 | P0       | **Done** | IPC commands for CLI (start_cli, send_to_cli, stop_cli, cli_status) |
| CHI-46 | P0       | **Done** | Streaming event loop (bridge output → Tauri events)                 |
| CHI-47 | P0       | **Done** | Replace mock sendMessage with real CLI streaming                    |
| CHI-48 | P1       | **Done** | Detect Claude Code CLI on startup with error UI                     |
| CHI-49 | P1       | **Done** | Streaming message rendering (incremental chunks)                    |

### Epic CHI-37: Permission Flow Live (P1) — DONE

| Task   | Priority | Status   | Description                                                         |
| ------ | -------- | -------- | ------------------------------------------------------------------- |
| CHI-50 | P0       | **Done** | Wire permission IPC commands (respond_permission, toggle_yolo_mode) |
| CHI-51 | P0       | **Done** | Build full permission event pipeline (frontend→backend)             |
| CHI-52 | P1       | **Done** | Wire YOLO mode frontend toggle to backend IPC                       |

### Epic CHI-38: Live Cost Tracking (P2) — DONE

| Task   | Priority | Status   | Description                                       |
| ------ | -------- | -------- | ------------------------------------------------- |
| CHI-53 | P1       | **Done** | Cost accumulator service with SQLite persistence  |
| CHI-54 | P1       | **Done** | Bind StatusBar + DetailsPanel to live cost events |
| CHI-55 | P2       | **Done** | Per-message token/cost display in MessageBubble   |

### Epic CHI-39: Session Lifecycle Management (P1) — DONE

| Task   | Priority | Status   | Description                               |
| ------ | -------- | -------- | ----------------------------------------- |
| CHI-56 | P0       | **Done** | Process lifecycle state machine           |
| CHI-57 | P0       | **Done** | Handle session switching (suspend/resume) |
| CHI-58 | P1       | **Done** | Graceful shutdown on session delete/close |
| CHI-59 | P1       | **Done** | Crash recovery with error UI              |
| CHI-60 | P0       | **Done** | Shutdown all CLI processes on app quit    |

### Parallel: E2E Testing (Epic CHI-27)

Playwright e2e tests covering all 13 UI components (~98 test cases). Can run alongside Phase 2.

| Task   | Priority | What to test                                                                  |
| ------ | -------- | ----------------------------------------------------------------------------- |
| CHI-28 | P0       | Playwright + Tauri WebDriver setup, smoke test                                |
| CHI-29 | P0       | Layout shell (MainLayout, Sidebar, TitleBar, StatusBar, DetailsPanel)         |
| CHI-30 | P0       | Conversation (ConversationView, MessageInput, MessageBubble, MarkdownContent) |
| CHI-31 | P1       | Permissions (PermissionDialog, YoloWarningDialog)                             |
| CHI-32 | P1       | Terminal (TerminalPane) + Model selector (ModelSelector)                      |
| CHI-33 | P1       | Integration tests (keyboard shortcuts, session flow)                          |
| CHI-34 | P0       | CI integration + failure→issue pipeline (JSON reporter, screenshots)          |

### UX Polish Epics (Parallel with Phase 2)

CX/UX investigation identified 6 improvement areas. These can be worked on alongside the core Phase 2 tasks.

#### Epic CHI-61: Native Window Chrome & Platform Feel (High)

| Task   | Priority | Status   | Description                                                     |
| ------ | -------- | -------- | --------------------------------------------------------------- |
| CHI-67 | Urgent   | **Done** | Native window controls (macOS traffic lights + Windows buttons) |
| CHI-68 | High     | **Done** | Titlebar redesign with platform-aware layout                    |
| CHI-69 | Low      | **Done** | macOS vibrancy effects on sidebar and titlebar                  |
| CHI-70 | Medium   | **Done** | Custom scrollbar styling for dark theme                         |

#### Epic CHI-62: Delightful Interactions & Micro-animations (High)

| Task   | Priority | Status   | Description                                         |
| ------ | -------- | -------- | --------------------------------------------------- |
| CHI-71 | Medium   | **Done** | Message enter/exit animations (slide + fade)        |
| CHI-72 | High     | **Done** | Premium typing indicator (animated dots, shimmer)   |
| CHI-73 | High     | **Done** | Smooth streaming text rendering (typewriter buffer) |
| CHI-74 | Medium   | **Done** | Toast notification system                           |
| CHI-75 | Medium   | **Done** | Copy feedback animations + hover micro-interactions |

#### Epic CHI-63: Command Palette & Power User UX (Medium)

| Task   | Priority | Status                                                 | Description                                                   |
| ------ | -------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| CHI-76 | High     | **Done**                                               | Command palette UI (Cmd+K, fuzzy search, categorized actions) |
| CHI-77 | Medium   | **Done**                                               | Session quick-switcher (Cmd+Shift+P)                          |
| CHI-78 | Medium   | Custom context menus (messages, sessions, code blocks) |
| CHI-79 | Medium   | Keyboard navigation audit + focus management           |

#### Epic CHI-64: Onboarding & Empty States (Medium)

| Task   | Priority | Description                                                 |
| ------ | -------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| CHI-80 | High     | **Done**                                                    | Conversation empty state redesign (sample prompts, personality) |
| CHI-81 | Low      | First-launch onboarding flow (3-5 step walkthrough)         |
| CHI-82 | Medium   | Placeholder views for Agents/Diff (informative, not broken) |
| CHI-83 | Medium   | "No project selected" guidance state                        |

#### Epic CHI-65: Sidebar & Navigation Polish (Medium)

| Task   | Priority | Status                                       | Description                                           |
| ------ | -------- | -------------------------------------------- | ----------------------------------------------------- |
| CHI-84 | High     | **Done**                                     | Sidebar collapsed icon-rail mode (48px with tooltips) |
| CHI-85 | Medium   | **Done**                                     | Session sections (Pinned, Recent, Older)              |
| CHI-86 | Medium   | **Done** | Session rename inline + session actions menu                    |
| CHI-87 | Medium   | **Done**                                     | View tabs with icons + count badges          |
| CHI-88 | Low      | **Done**                                     | Sidebar search/filter                        |

#### Epic CHI-66: Tool Use Visualization & Inline Activity (High)

| Task   | Priority | Status   | Description                                             |
| ------ | -------- | -------- | ------------------------------------------------------- |
| CHI-89 | High     | **Done** | ToolUseBlock component (collapsible, color-coded)       |
| CHI-90 | Medium   | **Done** | ThinkingBlock component (muted reasoning display)       |
| CHI-91 | Medium   | **Done** | Permission inline record (approved/denied after dialog) |
| CHI-92 | Low      | **Done** | File diff preview within conversation                   |

**Quick wins completed:** CHI-72 (typing indicator), CHI-84 (sidebar collapsed), CHI-76 (command palette) — all done

### Phase 3: Agent SDK Integration (In Progress)

| Task    | Priority | Status   | Description                                                                     |
| ------- | -------- | -------- | ------------------------------------------------------------------------------- |
| CHI-101 | High     | **Done** | Migrate CLI bridge from `-p` mode to Agent SDK control protocol (SPEC-004 §5.6) |
| CHI-102 | Urgent   | **Done** | Add granular Bash allowedTools patterns (Developer Mode — interim fix)          |

**CHI-101** is now implemented: the bridge supports persistent Agent SDK sessions with bidirectional JSONL control protocol (`--input-format stream-json`), true interactive permissions, runtime model switching, and clean interruption. The app also retains legacy `-p` fallback for older Claude Code CLI versions (< 2.1). See SPEC-004 §5.6 for protocol details.

**CHI-102** is the quick fix: pre-authorize common Bash patterns (`git *`, `gh *`, `npm *`, etc.) via `--allowedTools` so developers can use shell commands without YOLO mode.

**Recent Phase 3 completions:** CHI-108 (SDK slash discovery integration), CHI-96 (diagnostic bundle ZIP export + frontend trigger), CHI-122 (settings persistence backend + TS types), CHI-123 (file explorer quick wins: git status, drag-drop, hover preview, breadcrumbs), CHI-132 (virtualized `ConversationView` with jump-to-latest), and CHI-138 (Project Actions epic complete: discovery, process manager, `/run`, sidebar, output panel, Ask AI pipeline, statusbar/palette integration, custom action configuration). Current validation snapshot: 224 Rust tests pass; frontend format/typecheck/lint/build pass.

### Epic CHI-105: Slash Commands & Skill Invocation (Phase 3)

| Task    | Priority | Status   | Description                                                                       |
| ------- | -------- | -------- | --------------------------------------------------------------------------------- |
| CHI-106 | Urgent   | **Done** | Command Discovery Backend — file scanning `.claude/commands/` + IPC               |
| CHI-107 | High     | **Done** | SlashCommandMenu UI Component — inline autocomplete on `/`                        |
| CHI-108 | Medium   | **Done** | SDK Command Discovery Integration (Phase B) — `system:init` tools/MCP merged into slash menu |

Two-phase architecture is now fully implemented: Phase A (CHI-106/107) file scanning remains the fallback/base discovery path, and Phase B (CHI-108) augments slash discovery from Agent SDK `system:init` (`tools`, `mcp_servers`) with backend merge + frontend `cli:init` refresh. See SPEC-003 §4.13, §10.7 and SPEC-004 §4.4.7, §5.7.

### Epic CHI-109: Parallel Sessions v2 — Split Panes & Resource Management (Phase 3)

| Task    | Priority | Status   | Description                                                                 |
| ------- | -------- | -------- | --------------------------------------------------------------------------- |
| CHI-110 | High     | Todo     | Split Pane Layout System — Cmd+\\, draggable divider, dual ConversationView |
| CHI-111 | High     | **Done** | Concurrent Session Resource Limits — configurable max (default 4)           |
| CHI-112 | Medium   | Todo     | Aggregate Cost Tracking Across Sessions                                     |
| CHI-113 | Medium   | Todo     | Session Activity Notifications — unread badges, background toasts           |

Builds on CHI-104's per-session state and non-destructive switching. See SPEC-003 §4.14, §10.8 and SPEC-004 §4.4.8, §5.8.

### Epic CHI-114: File Explorer & @-Mention Context System (Phase 3) — DONE

| Task    | Priority | Status   | Description                                                                    |
| ------- | -------- | -------- | ------------------------------------------------------------------------------ |
| CHI-115 | Urgent   | **Done** | Backend File Scanner — Rust IPC for directory walking (ignore + notify crates) |
| CHI-116 | High     | **Done** | File Tree Sidebar Component — visual file browser with lazy loading            |
| CHI-117 | High     | **Done** | @-Mention Autocomplete — type `@` in MessageInput to reference files           |
| CHI-118 | Medium   | **Done** | File Content Preview — syntax-highlighted viewer in DetailsPanel               |
| CHI-119 | Medium   | **Done** | Code Range Selection — select lines/ranges to attach to prompt                 |

Five incremental layers: backend scanner → file tree → @-mention → preview → range selection. Token-aware context assembly, gitignore-respecting, reuses CommandPalette fuzzy search. See SPEC-003 §4.15, §10.9 and SPEC-004 §4.4.9, §5.9.

### Epic CHI-138: Project Actions — AI-Aware Command Runner (Phase 3) — DONE

| Task    | Priority | Status   | Description                                                        |
| ------- | -------- | -------- | ------------------------------------------------------------------ |
| CHI-139 | Urgent   | **Done** | Action Discovery Engine (Backend) — scan scripts/tasks across files |
| CHI-140 | Urgent   | **Done** | Action Process Manager (Backend) — concurrent PTY action runners    |
| CHI-141 | Urgent   | **Done** | Log-to-Agent Pipeline — `/run` and Ask AI output → conversation     |
| CHI-142 | High     | **Done** | Actions Sidebar Panel — discovery, start/stop/restart, live status  |
| CHI-143 | High     | **Done** | Action Output View — streaming logs in DetailsPanel                 |
| CHI-144 | Medium   | **Done** | StatusBar & Command Palette Integration                             |
| CHI-145 | Medium   | **Done** | Custom Action Configuration                                         |

The Project Actions epic is now usable end-to-end: backend multi-format discovery (`package.json`, `Makefile`, `Cargo.toml`, `docker-compose`, `.claude/actions.json`), concurrent action process management, `/run` slash command integration, sidebar controls, StatusBar + Command Palette quick controls, a DetailsPanel output stream with an `Ask AI` handoff path, and inline custom action configuration (advanced fields + argument prompt support).

Post-merge UI stability follow-up (local/main bugfix batch): Chief Wiggum fixed focused-pane scrolling by propagating full-height layout wrappers in `MainLayout.tsx` and switching focused `Files` / `Actions` panes to a single-scroll-container mode (avoids nested scroll traps). Conversation overlap regressions on older tool-heavy chats were reduced by disabling `ConversationView` virtualization for active turns and complex/very long message layouts, plus forcing mode-switch reflow. A stale `--resume` CLI session error (`No conversation found with session ID`) is now treated as a recoverable case (clear stale `cli_session_id`, stop stale bridge, show friendly retry message).

---

## Document Map (Read Before Coding)

```
docs/
├── reference/INDEX.md          ← START HERE: project overview, reading order
├── specs/
│   ├── SPEC-001-*.md           ← Combined PRD (the "what")
│   ├── SPEC-002-*.md           ← Design system tokens
│   ├── SPEC-003-*.md           ← UX design, screens, flows
│   ├── SPEC-004-*.md           ← Architecture, modules, IPC, types
│   └── SPEC-005-*.md           ← Data export/migration
├── adr/
│   ├── ADR-001-*.md            ← Technology choices
│   └── ADR-002-*.md            ← Monorepo structure
├── guides/
│   ├── GUIDE-001-*.md          ← Coding standards (MUST READ)
│   └── GUIDE-002-*.md          ← Workflow, Linear, agent process
└── tasks/
    └── TASKS-001-*.md          ← Phase 1 task breakdown + Linear URLs
```

### Minimum Reading Before Any Code

1. `GUIDE-001-coding-standards.md` — naming, patterns, forbidden practices
2. `SPEC-004-architecture.md` — module structure, IPC contracts, types
3. The specific spec section referenced by your Linear issue

---

## Non-Negotiable Rules

- **Framework:** Tauri v2 + Rust backend. No Electron. No wry alternatives.
- **Frontend:** SolidJS 2.x. Not React.
- **Styling:** TailwindCSS v4 with SPEC-002 tokens only. No hardcoded colors.
- **Rust:** All functions return `Result`. No `.unwrap()` in production code. No `println!` (use `tracing`).
- **Error handling:** `thiserror` for enums, typed variants per GUIDE-001 §2.4.
- **Async:** `tokio` runtime. PTY I/O on dedicated OS threads, mpsc to async (GUIDE-001 §2.5).
- **Testing:** All new business logic must have unit tests. MockBridge for bridge tests.
- **Accessibility:** WCAG 2.1 AA minimum (SPEC-002 §12).

---

## File Locations

```
src-tauri/
├── Cargo.toml                  # Rust dependencies
├── build.rs                    # Tauri build script
├── tauri.conf.json             # Tauri app config
└── src/
    ├── lib.rs                  # Crate root, AppError, AppResult
    ├── bridge/                 # CLI Bridge (DONE)
    │   ├── mod.rs              # BridgeOutput, CliLocation
    │   ├── process.rs          # CliBridge, MockBridge, BridgeInterface
    │   ├── parser.rs           # StreamParser, BridgeEvent, MessageChunk
    │   ├── adapter.rs          # AdapterRegistry, CliVersion
    │   ├── permission.rs       # PermissionManager, PermissionRequest
    │   ├── manager.rs          # SessionBridgeMap — session→process manager (CHI-44)
    │   └── event_loop.rs       # Streaming event loop — bridge→Tauri events (CHI-46)
    ├── capabilities/
    │   └── default.json        # Tauri v2 permissions (core, shell)
    ├── icons/                  # App icons (.icns, .ico, .png)
    ├── commands/               # Tauri IPC command handlers
    │   ├── mod.rs              # Module root
    │   ├── session.rs          # 8 session/message IPC commands (CHI-22)
    │   ├── cli.rs              # get_cli_info IPC command (CHI-48)
    │   ├── project.rs          # pick_project_folder, create_project, list_projects (CHI-40)
    │   ├── bridge.rs           # start_session_cli, send_to_cli, stop/status (CHI-45)
    │   ├── slash.rs            # list_slash_commands, refresh_slash_commands (CHI-106)
    │   └── files.rs            # list_files, read_file_content, search_files, estimate_tokens (CHI-115)
    ├── files/                  # File explorer backend (CHI-115)
    │   ├── mod.rs              # Module root, FileNode, FileContent types
    │   ├── scanner.rs          # Gitignore-aware directory walker (ignore crate)
    │   └── watcher.rs          # File system watcher (notify crate, debounced events)
    ├── logging/                # 3-layer tracing system (CHI-94)
    │   ├── mod.rs              # Module root, re-exports
    │   ├── init.rs             # init_logging(), get_ring_buffer(), log cleanup
    │   └── ring_buffer.rs      # RingBufferLayer, LogEntry, 36K capacity
    ├── slash/                  # Slash command discovery (CHI-106)
    │   ├── mod.rs              # SlashCommand, CommandCategory, builtin_commands()
    │   └── scanner.rs          # Filesystem scanner, discover_all(), YAML parsing
    ├── db/                     # SQLite database layer (DONE)
    │   ├── mod.rs              # Module root, re-exports Database
    │   ├── connection.rs       # Database struct, Mutex<Connection>, WAL mode
    │   ├── migrations.rs       # Forward-only migration system, schema_version
    │   └── queries.rs          # Typed query functions, row types
    └── main.rs                 # Tauri app entry point (DONE) — initializes DB

package.json                    # Root: Vite + SolidJS + Tailwind + ESLint + Prettier
index.html                      # Vite entry — loads SolidJS via /src/index.tsx
vite.config.ts                  # Vite + vite-plugin-solid + @tailwindcss/vite
tsconfig.json                   # TypeScript strict, JSX preserve, @/ path aliases
.prettierrc                     # Prettier config per GUIDE-001 §3.1
eslint.config.js                # ESLint flat config with solid + typescript plugins
.gitignore                      # Rust + Node + Tauri patterns
.github/workflows/ci.yml       # CI/CD pipeline (DONE — CHI-10)
.github/workflows/release.yml  # Release workflow (DONE — CHI-24)

src/                            # SolidJS frontend
├── index.tsx                   # SolidJS render entry point
├── App.tsx                     # Root component → renders MainLayout
├── components/
│   ├── layout/                 # 5-zone layout (DONE — CHI-17)
│   │   ├── MainLayout.tsx      # Layout orchestrator, view tabs, panel transitions
│   │   ├── TitleBar.tsx        # Custom title bar with window controls
│   │   ├── Sidebar.tsx         # Left panel (real session list, CRUD)
│   │   ├── StatusBar.tsx       # Bottom bar (status, tokens, cost)
│   │   └── DetailsPanel.tsx    # Right panel (context, cost sections)
│   ├── common/                 # Shared UI components (DONE — CHI-20)
│   │   ├── ModelSelector.tsx   # Model dropdown (Sonnet/Opus/Haiku)
│   │   ├── CommandPalette.tsx  # Command palette + session switcher (CHI-76, CHI-77)
│   │   └── ToastContainer.tsx  # Toast notifications (CHI-74)
│   ├── conversation/           # Conversation UI (DONE — CHI-18, CHI-19)
│   │   ├── ConversationView.tsx # Message list, auto-scroll, empty state
│   │   ├── MessageBubble.tsx   # Role labels, model badges, markdown content
│   │   ├── MarkdownContent.tsx # marked + highlight.js rendering, copy buttons
│   │   ├── MessageInput.tsx    # Auto-expanding textarea + send controls + @-mention (CHI-117)
│   │   ├── FileMentionMenu.tsx # @-mention file autocomplete dropdown (CHI-117)
│   │   ├── ContextChip.tsx     # Removable file reference pills (CHI-117)
│   │   ├── ToolUseBlock.tsx    # Collapsible tool use display, color-coded (CHI-89)
│   │   ├── ToolResultBlock.tsx # Tool result display with error state (CHI-89)
│   │   ├── ThinkingBlock.tsx   # Collapsible thinking display (CHI-90)
│   │   ├── StreamingThinkingBlock.tsx # Live thinking with cursor blink (CHI-90)
│   │   └── PermissionRecordBlock.tsx # Inline permission records (CHI-91)
│   ├── explorer/               # File explorer (CHI-116, CHI-118)
│   │   ├── FileTree.tsx        # Tree container with search (CHI-116)
│   │   ├── FileTreeNode.tsx    # Recursive tree node component (CHI-116)
│   │   └── FilePreview.tsx     # Syntax-highlighted file viewer (CHI-118)
│   ├── terminal/               # Terminal Mode (DONE — CHI-21)
│   │   └── TerminalPane.tsx    # xterm.js v5 + WebGL + FitAddon
│   └── permissions/            # Permission system UI (DONE — CHI-23, CHI-26)
│       ├── PermissionDialog.tsx # Modal permission dialog
│       └── YoloWarningDialog.tsx # YOLO mode confirmation warning
├── stores/
│   ├── uiStore.ts              # UI state (sidebar, panels, views, permissions, yolo, command palette)
│   ├── sessionStore.ts         # Session state (CRUD, model cycling, active session, pin)
│   ├── conversationStore.ts    # Conversation state (real CLI streaming, event listeners, typewriter)
│   ├── toastStore.ts           # Toast notification state (max 3, auto-dismiss) (CHI-74)
│   ├── cliStore.ts             # CLI detection state (isDetected, location) (CHI-48)
│   ├── projectStore.ts         # Project state (folder picker, active project) (CHI-40)
│   ├── fileStore.ts            # File tree state (lazy loading, search, preview) (CHI-116)
│   └── contextStore.ts         # Context attachment management (token budgets, XML assembly) (CHI-117)
├── lib/
│   ├── types.ts                # TypeScript IPC types (Message, PermissionRequest, etc.)
│   ├── keybindings.ts          # Global keyboard shortcuts (Cmd+B, Cmd+`, Cmd+Shift+Y, Cmd+Shift+P)
│   └── typewriterBuffer.ts     # Smooth streaming character buffer (CHI-73)
└── styles/
    └── tokens.css              # SPEC-002 design tokens + TailwindCSS v4 @theme
```

---

## Do Not

- Do not add dependencies without checking if an existing one covers the use case.
- Do not modify the database schema without updating `SPEC-005`.
- Do not introduce new design tokens without adding them to `SPEC-002` first.
- Do not skip tests for new business logic.
- Do not use `unwrap()`, `expect()`, or `panic!()` in production code.
- Do not use `println!()` — use `tracing::info!()`, `tracing::warn!()`, etc.
- Do not auto-approve permissions. Permission system is security-critical.

---

## Handover Protocol

This project uses a **Cowork ↔ Claude Code handover system**. Both tools read and write to:

- **`.claude/handover.json`** — Machine-readable status file. Updated after every task.
- **This file (`CLAUDE.md`)** — Human-readable briefing. Updated by Cowork when assigning work.

### When You Start a Task

1. Read `.claude/handover.json` to see current status
2. Read the Linear issue description for acceptance criteria
3. Read the relevant spec sections
4. Update `handover.json`: set your task to `"in_progress"`
5. Implement the task
6. Update `handover.json`: set your task to `"done"`, add notes
7. Run `cargo check` and `cargo test` to verify

### When You Finish

Update `.claude/handover.json` with:

- What was completed (files created/modified)
- Any issues encountered
- What should be done next
- Set status to `"done"`

This lets Cowork (or another Claude Code session) pick up exactly where you left off.

---

## Linear Integration

**Workspace:** `linear.app/chief-wiggum`
**Team:** Chief Wiggum (CHI)

When working on a Linear issue:

- Branch name: `chi-{number}-{slug}` (e.g., `chi-8-scaffold-tauri-v2`)
- Commit format: `CHI-{number}: {description}` (e.g., `CHI-8: scaffold Tauri v2 project`)
- Reference the issue ID in PR descriptions

You do NOT need to update Linear directly — Cowork handles that. Just update `handover.json`.
