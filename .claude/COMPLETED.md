# Chief Wiggum — Completed Tasks

> Full history of all completed work. Read this on demand — not auto-loaded.
> CLAUDE.md links here for agents that need to check prior work.
> Updated: 2026-02-28

---

## Phase 1: Foundation (COMPLETE)

| Task | Notes |
|------|-------|
| CHI-6: CLI Bridge | `src-tauri/src/bridge/` — CHI-13, CHI-14, CHI-15, CHI-16 |
| CHI-8: Scaffold Tauri v2 | `main.rs`, `tauri.conf.json`, `capabilities/`, icons, Vite, `package.json` |
| CHI-9: SolidJS + TailwindCSS | `src/` frontend with SPEC-002 tokens, Prettier, ESLint, 55 tests |
| CHI-11: SQLite Database | `src-tauri/src/db/` — migrations, queries, WAL mode, 12 db tests |
| CHI-10: CI/CD Pipeline | `.github/workflows/ci.yml` — matrix builds, clippy, fmt, tests |
| CHI-12: CLAUDE.md | Agent auto-briefing file |

**Phase 1 Epics:** CHI-5 (Core Scaffolding 5/5), CHI-6 (CLI Bridge 4/4), CHI-7 (Basic UI 9/9) — all done.

---

## Phase 2: Make It Real (COMPLETE)

| Task | Notes |
|------|-------|
| CHI-17: Layout Shell | 5-zone layout, TitleBar, Sidebar, StatusBar, DetailsPanel, MainLayout |
| CHI-18: Conversation View | Markdown/code rendering (marked + highlight.js), message bubbles, auto-scroll |
| CHI-19: Message Input | Auto-expanding textarea, send/stop controls, keyboard shortcuts |
| CHI-20: Model Selector | ModelSelector dropdown, Cmd+M cycling, TitleBar integration |
| CHI-21: Terminal Mode | xterm.js v5 + WebGL addon, SPEC-002 themed, Cmd+\` toggle |
| CHI-22: Session Persistence | IPC commands module, session CRUD, sidebar navigation, conversationStore rewrite |
| CHI-23: Permission Dialog | Modal dialog, risk coloring, timeout, focus trap, keyboard shortcuts |
| CHI-24: Cross-Platform Packaging | Bundle metadata, release workflow (.dmg, .msi, .AppImage) |
| CHI-25: Push to GitHub | `github.com/fcostudios/chief-wiggum` |
| CHI-26: YOLO Mode | Auto-approve permissions, warning dialog, TitleBar/StatusBar indicators, Cmd+Shift+Y |
| CHI-40: Project & Folder Mgmt | `tauri-plugin-dialog`, `commands/project.rs`, `projectStore.ts`, Sidebar folder picker |
| CHI-41: Project Sidebar | Recent projects list (max 5), click-to-switch |
| CHI-42: CLAUDE.md Detection | Detect and display CLAUDE.md from project folder |
| CHI-43: Session-Project Binding | Bind sessions to projects with inherited settings |
| CHI-44: SessionBridgeMap | `bridge/manager.rs` — session→process manager, 7 unit tests |
| CHI-45: IPC Commands for CLI | `commands/bridge.rs` — start_session_cli, send_to_cli, stop_session_cli, get_cli_status |
| CHI-46: Streaming Event Loop | `bridge/event_loop.rs` — BridgeOutput → Tauri events |
| CHI-47: Replace Mock with Real CLI | `conversationStore.ts` rewrite — real IPC + event listeners, mock removed |
| CHI-48: CLI Detection | `commands/cli.rs`, `cliStore.ts`, StatusBar status, ConversationView guidance |
| CHI-49: Streaming Message Rendering | ConversationView streaming bubble, blinking cursor, error display, auto-scroll |
| CHI-50: Permission IPC | `respond_permission`, `toggle_yolo_mode` commands, PermissionManager state |
| CHI-51: Permission Event Pipeline | `permission:request` listener → PermissionDialog → IPC response flow |
| CHI-52: YOLO Mode IPC | Frontend toggle wired to `invoke('toggle_yolo_mode')` |
| CHI-53: Cost Accumulator | Cost accumulator service with SQLite persistence |
| CHI-54: StatusBar Cost Display | Bind StatusBar + DetailsPanel to live cost events |
| CHI-55: Per-message Cost | K-formatted tokens, dollar cost, copy button in MessageBubble |
| CHI-56: Process Status | ProcessStatus tracking in conversationStore, StatusBar indicator |
| CHI-57: Session Switching | switchSession() stops CLI, cleans listeners, loads messages |
| CHI-58: Graceful Shutdown | stopSessionCli() before delete, auto-switch to next session |
| CHI-59: Crash Recovery | retryLastMessage(), Retry button in error display |
| CHI-60: App Shutdown Cleanup | Window close handler calls `shutdown_all()` on SessionBridgeMap |

---

## Phase 3: UX Polish Epics (COMPLETE)

### Epic CHI-61: Native Window Chrome
| CHI-67 | Native window controls (macOS traffic lights + Windows buttons) |
| CHI-68 | Titlebar redesign — Settings gear, cleaner layout |
| CHI-69 | macOS vibrancy effects on sidebar and titlebar |
| CHI-70 | Custom scrollbar styling for dark theme |

### Epic CHI-62: Delightful Interactions
| CHI-71 | Message enter/exit animations (slide + fade) |
| CHI-72 | Premium typing indicator (animated dots, shimmer) |
| CHI-73 | Smooth streaming text rendering (typewriter buffer) |
| CHI-74 | Toast notification system (`toastStore.ts`, `ToastContainer.tsx`) |
| CHI-75 | Copy feedback animations + hover micro-interactions |

### Epic CHI-63: Command Palette & Power User UX (COMPLETE)
| CHI-76 | Command palette UI (Cmd+K, fuzzy search, categorized actions) |
| CHI-77 | Session quick-switcher (Cmd+Shift+P) |
| CHI-78 | Custom context menus (messages/sessions/files/code blocks) |
| CHI-79 | Keyboard help overlay + focus trap audit |

### Epic CHI-64: Onboarding & Empty States (COMPLETE)
| CHI-80 | Conversation empty state redesign (sample prompts, personality) |
| CHI-81 | First-launch onboarding flow (3-5 step walkthrough) |
| CHI-82 | Placeholder views for Agents/Diff |
| CHI-83 | "No project selected" guidance state |

### Epic CHI-65: Sidebar & Navigation Polish (COMPLETE)
| CHI-84 | Sidebar collapsed icon-rail mode (48px with tooltips) |
| CHI-85 | Session sections (Pinned, Recent, Older) — DB migration v3 |
| CHI-86 | Session rename inline + session actions menu |
| CHI-87 | View tabs with icons + count badges |
| CHI-88 | Sidebar search/filter |

### Epic CHI-66: Tool Use Visualization (COMPLETE)
| CHI-89 | ToolUseBlock — collapsible, color-coded (file=blue, bash=green, gray=neutral) |
| CHI-90 | ThinkingBlock — collapsible thinking display, streaming + persisted |
| CHI-91 | Permission inline record (approved/denied/YOLO blocks in conversation) |
| CHI-92 | File diff preview within conversation |

---

## Phase 3: Core Features (COMPLETE)

| Task | Notes |
|------|-------|
| CHI-101 | Agent SDK control protocol (SPEC-004 §5.6), `--input-format stream-json`, persistent sessions |
| CHI-102 | Developer Mode — granular Bash allowedTools patterns |
| CHI-103 | HMR Resilience — SessionRuntime event buffer (200-event ring), reconnectAfterReload() |
| CHI-104 | Parallel Sessions — per-session processStatus, per-session listeners, sidebar indicators |
| CHI-106 | Slash Command Discovery — 11 built-in + project + user `.md` scanning |
| CHI-107 | SlashCommandMenu UI — inline autocomplete, fuzzy search, keyboard nav |
| CHI-108 | SDK Command Discovery — `system:init` tools/mcp_servers merged into slash IPC |
| CHI-110 | Split Pane Layout — Cmd+\\, draggable divider, dual ConversationView |
| CHI-111 | Concurrent Session Limits — configurable max (default 4), ResourceLimit error |
| CHI-112 | Aggregate Cost Tracking across sessions |
| CHI-113 | Session Activity Notifications — unread badges, background toasts |
| CHI-115 | Backend File Scanner — gitignore-aware scanner + notify watcher, 142 tests |
| CHI-116 | File Tree Sidebar — lazy loading, search |
| CHI-117 | @-Mention Autocomplete — `FileMentionMenu.tsx`, `ContextChip.tsx`, XML context assembly |
| CHI-118 | File Content Preview — syntax-highlighted viewer in DetailsPanel |
| CHI-119 | Code Range Selection — click/drag/shift+click, token estimates, `@file:start-end` |
| CHI-122 | Settings Backend & Types — `settings/` module, `tauri-plugin-store`, TS types |
| CHI-123 | File Explorer Quick Wins — git status indicators, drag-drop, hover preview, breadcrumb |
| CHI-124 | Settings UI — overlay shell + controls, autosave, Cmd+, shortcut |
| CHI-125 | Context Quality Scoring — scoring engine, chip badges, breakdown modal (Cmd+Shift+T) |
| CHI-126 | i18n Infrastructure — `i18nStore`, lazy locale loading, extracted UI strings |
| CHI-127 | Smart File Suggestions — Rust import/test suggestion engine + inline suggestion chips |
| CHI-128 | Spanish Locale — `src/locales/es.json` |
| CHI-130 | Theme System — light/dark/system mode, reactive CSS variables, terminal theme sync |
| CHI-132 | Conversation Virtualization — `@tanstack/solid-virtual`, jump-to-latest |
| CHI-133 | FilePreview Editable Ranges — resizable preview, sticky gutter, ContextChip click-to-edit |
| CHI-135 | Missing Error States — file tree/preview error UI + retry, store error flags |
| CHI-136 | Accessibility Pass — skip link, ARIA labels/roles, keyboard tree nav |
| CHI-137 | Message Edit/Regenerate — backend edit/delete-after IPC, frontend edit/regenerate UX |
| CHI-217 | FilePreview Inline Editing — CodeMirror, blur auto-save, dirty indicators, conflict handling |

---

## Phase 3: Actions Center Epic CHI-138 (COMPLETE)

| Task | Notes |
|------|-------|
| CHI-139 | Action Discovery Engine — scan scripts/tasks across package.json, Makefile, Cargo.toml, docker-compose, .claude/actions.json |
| CHI-140 | Action Process Manager — concurrent PTY runners |
| CHI-141 | Log-to-Agent Pipeline — `/run` and Ask AI output → conversation |
| CHI-142 | Actions Sidebar Panel — discovery, start/stop/restart, live status |
| CHI-143 | Action Output View — streaming logs in DetailsPanel |
| CHI-144 | StatusBar & Command Palette Integration — Cmd+Shift+R, running count popover |
| CHI-145 | Custom Action Configuration — inline ActionEditor, `.claude/actions.json` CRUD |

---

## Phase 3: Structured Log Collector Epic CHI-93 (COMPLETE)

| CHI-94 | 3-Layer Tracing — console + rolling file (JSON) + ring buffer (36K entries) |
| CHI-95 | Log Redaction Engine — 7 regex rules, export-time redaction, 13 tests |
| CHI-96 | Diagnostic Bundle Export — redacted ZIP (`logs.jsonl`, system info) + StatusBar action |
| CHI-97 | Frontend Log Forwarding — `src/lib/logger.ts` IPC forwarding, replaced all `console.*` |
| CHI-98 | Export Diagnostic UI — `ExportDialog.tsx`, consent preview, Cmd+Shift+D |
| CHI-99 | DB Query Tracing — `#[tracing::instrument]` on all `queries.rs` functions |
| CHI-100 | GitHub Issue Templates — `.github/ISSUE_TEMPLATE/` bug report + feature request |

---

## Phase 3: Quality & Testing Epics (COMPLETE)

### Epic CHI-27: Playwright E2E (COMPLETE — 114 scenarios, 106 passed / 8 skipped)
CHI-28..34: Playwright + Tauri WebDriver setup, layout, conversation, permissions, terminal, keyboard shortcuts, CI integration.

### Epic CHI-164: Quality Coverage Enhancement (COMPLETE)
| CHI-147 | Frontend Test Infrastructure — Vitest + jsdom + solid-testing-library, 12 tests |
| CHI-148 | Event Loop Tests — 12 Rust unit tests |
| CHI-149 | Bridge IPC Command Tests — 12 Rust unit tests |
| CHI-150..152 | Actions, Session, Permission backend tests |
| CHI-153..157 | Store + component + utility frontend tests (200+ tests) |
| CHI-158..162 | E2E: Explorer, Actions, Settings, Permissions, Split Panes (42 E2E tests) |
| CHI-163 | CI Coverage Gates — LCOV merge, PR comment, threshold ramp |
| CHI-165..176 | Additional E2E + component + integration tests; CI gate ramped to 75% |

**Validation snapshot:** 288 Rust tests · 359 frontend unit tests (51 files) · 114 Playwright scenarios.

---

## Backlog (Planned, Not Started)

See `docs/tasks/TASKS-005-actions-center.md` (CHI-218..223) and `docs/tasks/TASKS-006-ux-excellence.md` (CHI-224..230) for full specs.

| Task | Priority | Depends on |
|------|----------|------------|
| CHI-225: Session History & Artifact Index | High | — |
| CHI-226: Session Resume Persistence | High | — |
| CHI-227: Agents Tab Scaffolding v2 | Medium | — |
| CHI-228: Contextual Onboarding Hints | Medium | CHI-220 |
| CHI-229: Actions Center UX Quality Gates | High | CHI-138 (done) |
| CHI-230: Inline Diff Accept/Reject | High | CHI-217 (done) |
| CHI-218..223: Actions Center v2 | High/Medium | CHI-138 (done) |
