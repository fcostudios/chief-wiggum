# Chief Wiggum — Agent Instructions

> **Read this file first.** It is the auto-briefing for any Claude Code session.
> Updated: 2026-02-21

---

## What Is This Project?

**Chief Wiggum** is a cross-platform desktop app (Tauri v2 + Rust + SolidJS) that wraps Claude Code CLI in a polished GUI. It gives professional developers visual multi-agent orchestration, real-time cost tracking, and intelligent context management — without leaving the desktop.

---

## Current Phase

**Phase 1: Foundation** (Weeks 1–4)
- Linear project: https://linear.app/chief-wiggum/project/phase-1-foundation-ba6f471a516b
- Team identifier: CHI
- Workspace: https://linear.app/chief-wiggum

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

## Phase 1 Status

**Phase 1: Foundation is COMPLETE.** All 3 epics done:
- **CHI-5: Core Scaffolding** — 5/5 tasks
- **CHI-6: CLI Bridge** — 4/4 tasks
- **CHI-7: Basic UI** — 9/9 tasks

See `docs/tasks/TASKS-001-phase1-foundation.md` for full task list.

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
    │   └── permission.rs       # PermissionManager, PermissionRequest
    ├── capabilities/
    │   └── default.json        # Tauri v2 permissions (core, shell)
    ├── icons/                  # App icons (.icns, .ico, .png)
    ├── commands/               # Tauri IPC command handlers (DONE — CHI-22)
    │   ├── mod.rs              # Module root
    │   └── session.rs          # 8 session/message IPC commands
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
│   └── conversationStore.ts    # Conversation state (messages, loading, send, persistence)
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
