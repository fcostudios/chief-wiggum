# Chief Wiggum — Agent Instructions

> **Read this file first.** It is the auto-briefing for any Claude Code session.
> Updated: 2026-02-21

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

| Epic / Task | Status | Notes |
|-------------|--------|-------|
| CHI-6: CLI Bridge | **Done** | `src-tauri/src/bridge/` — all 4 sub-tasks (CHI-13, CHI-14, CHI-15, CHI-16) |
| CHI-8: Scaffold Tauri v2 | **Done** | `main.rs`, `tauri.conf.json`, `capabilities/`, icons, Vite, `package.json` |
| CHI-9: SolidJS + TailwindCSS | **Done** | `src/` frontend with SPEC-002 tokens, Prettier, ESLint, 55 tests pass |
| CHI-11: SQLite Database | **Done** | `src-tauri/src/db/` — migrations, queries, WAL mode, 12 db tests |
| CHI-10: CI/CD Pipeline | **Done** | `.github/workflows/ci.yml` — matrix builds, clippy, fmt, tests |
| CHI-12: CLAUDE.md | **Done** | Agent auto-briefing file |
| CHI-25: Push to GitHub | **Done** | `github.com/fcostudios/chief-wiggum` |
| CHI-17: Layout Shell | **Done** | 5-zone layout, TitleBar, Sidebar, StatusBar, DetailsPanel, MainLayout |
| CHI-19: Message Input | **Done** | Auto-expanding textarea, send/stop controls, keyboard shortcuts |
| CHI-23: Permission Dialog | **Done** | Modal dialog, risk coloring, timeout, focus trap, keyboard shortcuts |
| CHI-18: Conversation View | **Done** | Markdown/code rendering (marked + highlight.js), message bubbles, auto-scroll |
| CHI-21: Terminal Mode | **Done** | xterm.js v5 + WebGL addon, SPEC-002 themed, Cmd+` toggle |
| CHI-26: YOLO Mode | **Done** | Auto-approve permissions, warning dialog, TitleBar/StatusBar indicators, Cmd+Shift+Y |
| CHI-22: Session Persistence | **Done** | IPC commands module, session CRUD, sidebar navigation, conversationStore rewrite |
| CHI-20: Model Selector | **Done** | ModelSelector dropdown, Cmd+M cycling, TitleBar integration |
| CHI-24: Cross-Platform Packaging | **Done** | Bundle metadata, release workflow (.dmg, .msi, .AppImage) |
| CHI-48: CLI Detection | **Done** | `commands/cli.rs`, `cliStore.ts`, StatusBar status, ConversationView guidance |
| CHI-40: Project & Folder Management | **Done** | `tauri-plugin-dialog`, `commands/project.rs`, `projectStore.ts`, Sidebar folder picker |
| CHI-44: SessionBridgeMap | **Done** | `bridge/manager.rs` — session→process manager, 7 unit tests (71 total) |
| CHI-45: IPC Commands for CLI | **Done** | `commands/bridge.rs` — start_session_cli, send_to_cli, stop_session_cli, get_cli_status |
| CHI-46: Streaming Event Loop | **Done** | `bridge/event_loop.rs` — BridgeOutput → Tauri events (chunk, complete, exited, permission) |
| CHI-47: Replace Mock with Real CLI | **Done** | `conversationStore.ts` rewrite — real IPC + event listeners, mock removed |
| CHI-49: Streaming Message Rendering | **Done** | ConversationView streaming bubble, blinking cursor, error display, auto-scroll |

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

### Epic CHI-35: Project & Folder Management (P0) — Partial

| Task | Priority | Status | Description |
|------|----------|--------|-------------|
| CHI-40 | P0 | **Done** | Folder picker + project creation via native dialog |
| CHI-41 | P1 | Todo | Project sidebar section with recent projects |
| CHI-42 | P2 | Todo | Detect and display CLAUDE.md from project folder |
| CHI-43 | P1 | Todo | Bind sessions to projects with inherited settings |

### Epic CHI-36: CLI Connection & Streaming (P0) — DONE

| Task | Priority | Status | Description |
|------|----------|--------|-------------|
| CHI-44 | P0 | **Done** | SessionBridgeMap — session→process manager |
| CHI-45 | P0 | **Done** | IPC commands for CLI (start_cli, send_to_cli, stop_cli, cli_status) |
| CHI-46 | P0 | **Done** | Streaming event loop (bridge output → Tauri events) |
| CHI-47 | P0 | **Done** | Replace mock sendMessage with real CLI streaming |
| CHI-48 | P1 | **Done** | Detect Claude Code CLI on startup with error UI |
| CHI-49 | P1 | **Done** | Streaming message rendering (incremental chunks) |

### Epic CHI-37: Permission Flow Live (P1)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-50 | P0 | Wire permission IPC commands |
| CHI-51 | P0 | Build full permission event pipeline |
| CHI-52 | P1 | Wire YOLO mode frontend toggle to backend IPC |

### Epic CHI-38: Live Cost Tracking (P2)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-53 | P1 | Cost accumulator service with SQLite persistence |
| CHI-54 | P1 | Bind StatusBar + DetailsPanel to live cost events |
| CHI-55 | P2 | Per-message token/cost display in MessageBubble |

### Epic CHI-39: Session Lifecycle Management (P1)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-56 | P0 | Process lifecycle state machine |
| CHI-57 | P0 | Handle session switching (suspend/resume) |
| CHI-58 | P1 | Graceful shutdown on session delete/close |
| CHI-59 | P1 | Crash recovery with error UI |
| CHI-60 | P0 | Shutdown all CLI processes on app quit |

**Start with CHI-40 + CHI-44 in parallel** — folder picker and session-process mapping are independent foundations.

### Parallel: E2E Testing (Epic CHI-27)

Playwright e2e tests covering all 13 UI components (~98 test cases). Can run alongside Phase 2.

| Task | Priority | What to test |
|------|----------|-------------|
| CHI-28 | P0 | Playwright + Tauri WebDriver setup, smoke test |
| CHI-29 | P0 | Layout shell (MainLayout, Sidebar, TitleBar, StatusBar, DetailsPanel) |
| CHI-30 | P0 | Conversation (ConversationView, MessageInput, MessageBubble, MarkdownContent) |
| CHI-31 | P1 | Permissions (PermissionDialog, YoloWarningDialog) |
| CHI-32 | P1 | Terminal (TerminalPane) + Model selector (ModelSelector) |
| CHI-33 | P1 | Integration tests (keyboard shortcuts, session flow) |
| CHI-34 | P0 | CI integration + failure→issue pipeline (JSON reporter, screenshots) |

### UX Polish Epics (Parallel with Phase 2)

CX/UX investigation identified 6 improvement areas. These can be worked on alongside the core Phase 2 tasks.

#### Epic CHI-61: Native Window Chrome & Platform Feel (High)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-67 | Urgent | Native window controls (macOS traffic lights + Windows buttons) |
| CHI-68 | High | Titlebar redesign with platform-aware layout |
| CHI-69 | Low | macOS vibrancy effects on sidebar and titlebar |
| CHI-70 | Medium | Custom scrollbar styling for dark theme |

#### Epic CHI-62: Delightful Interactions & Micro-animations (High)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-71 | Medium | Message enter/exit animations (slide + fade) |
| CHI-72 | High | Premium typing indicator (animated dots, shimmer) |
| CHI-73 | High | Smooth streaming text rendering (typewriter buffer) |
| CHI-74 | Medium | Toast notification system |
| CHI-75 | Medium | Copy feedback animations + hover micro-interactions |

#### Epic CHI-63: Command Palette & Power User UX (Medium)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-76 | High | Command palette UI (Cmd+K, fuzzy search, categorized actions) |
| CHI-77 | Medium | Session quick-switcher (Cmd+Shift+P) |
| CHI-78 | Medium | Custom context menus (messages, sessions, code blocks) |
| CHI-79 | Medium | Keyboard navigation audit + focus management |

#### Epic CHI-64: Onboarding & Empty States (Medium)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-80 | High | Conversation empty state redesign (sample prompts, personality) |
| CHI-81 | Low | First-launch onboarding flow (3-5 step walkthrough) |
| CHI-82 | Medium | Placeholder views for Agents/Diff (informative, not broken) |
| CHI-83 | Medium | "No project selected" guidance state |

#### Epic CHI-65: Sidebar & Navigation Polish (Medium)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-84 | High | Sidebar collapsed icon-rail mode (48px with tooltips) |
| CHI-85 | Medium | Session sections (Pinned, Recent, Older) |
| CHI-86 | Medium | Session rename inline + session actions menu |
| CHI-87 | Medium | View tabs with icons + count badges |
| CHI-88 | Low | Sidebar search/filter |

#### Epic CHI-66: Tool Use Visualization & Inline Activity (High)

| Task | Priority | Description |
|------|----------|-------------|
| CHI-89 | High | ToolUseBlock component (collapsible, color-coded) |
| CHI-90 | Medium | ThinkingBlock component (muted reasoning display) |
| CHI-91 | Medium | Permission inline record (approved/denied after dialog) |
| CHI-92 | Low | File diff preview within conversation |

**Quick wins to start immediately:** CHI-67 (native controls), CHI-70 (scrollbars), CHI-80 (empty state)

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
    │   └── bridge.rs           # start_session_cli, send_to_cli, stop/status (CHI-45)
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
│   │   └── ModelSelector.tsx   # Model dropdown (Sonnet/Opus/Haiku)
│   ├── conversation/           # Conversation UI (DONE — CHI-18, CHI-19)
│   │   ├── ConversationView.tsx # Message list, auto-scroll, empty state
│   │   ├── MessageBubble.tsx   # Role labels, model badges, markdown content
│   │   ├── MarkdownContent.tsx # marked + highlight.js rendering, copy buttons
│   │   └── MessageInput.tsx    # Auto-expanding textarea + send controls
│   ├── terminal/               # Terminal Mode (DONE — CHI-21)
│   │   └── TerminalPane.tsx    # xterm.js v5 + WebGL + FitAddon
│   └── permissions/            # Permission system UI (DONE — CHI-23, CHI-26)
│       ├── PermissionDialog.tsx # Modal permission dialog
│       └── YoloWarningDialog.tsx # YOLO mode confirmation warning
├── stores/
│   ├── uiStore.ts              # UI state (sidebar, panels, views, permissions, yolo)
│   ├── sessionStore.ts         # Session state (CRUD, model cycling, active session)
│   ├── conversationStore.ts    # Conversation state (real CLI streaming, event listeners)
│   ├── cliStore.ts             # CLI detection state (isDetected, location) (CHI-48)
│   └── projectStore.ts         # Project state (folder picker, active project) (CHI-40)
├── lib/
│   ├── types.ts                # TypeScript IPC types (Message, PermissionRequest, etc.)
│   └── keybindings.ts          # Global keyboard shortcuts (Cmd+B, Cmd+`, Cmd+Shift+Y)
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
