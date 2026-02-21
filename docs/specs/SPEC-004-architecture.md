# SPEC-004: Architecture Deep Dive

**Version:** 2.0
**Date:** 2026-02-21
**Status:** Draft — Updated for Phase 2
**Parent:** SPEC-001 (Sections 4, 8, 9), ADR-001
**Audience:** Backend developers, coding agents implementing Rust/SolidJS code

---

## 1. Purpose

This document specifies the internal module decomposition, IPC contracts, data flow patterns, and error handling strategies for Chief Wiggum. A coding agent implementing any feature should reference this spec to understand how modules communicate and where new code belongs.

---

## 2. Monorepo Structure

Per ADR-002, Chief Wiggum is a single monorepo. The canonical layout:

```
chief-wiggum/
├── src-tauri/                      # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json             # Tauri app config
│   ├── capabilities/               # Tauri v2 capability files
│   ├── src/
│   │   ├── main.rs                 # Entry point, app builder
│   │   ├── lib.rs                  # Module declarations
│   │   ├── commands/               # IPC command handlers (one file per domain)
│   │   │   ├── mod.rs
│   │   │   ├── session.rs          # Session CRUD commands (Phase 1 — CHI-22)
│   │   │   ├── bridge.rs           # CLI lifecycle: start/send/stop/status (Phase 2 — CHI-45)
│   │   │   ├── cli.rs              # CLI detection: get_cli_info (Phase 2 — CHI-48)
│   │   │   ├── project.rs          # Folder picker, project CRUD (Phase 2 — CHI-40)
│   │   │   ├── cost.rs             # Cost tracking commands (Phase 2 — CHI-53)
│   │   │   ├── agent.rs            # Agent lifecycle commands (future)
│   │   │   ├── context.rs          # Context management commands (future)
│   │   │   ├── mcp.rs              # MCP server management commands (future)
│   │   │   ├── settings.rs         # Settings CRUD commands (future)
│   │   │   ├── git.rs              # Git operations commands (future)
│   │   │   └── automation.rs       # Automation CRUD commands (future)
│   │   ├── bridge/                 # Claude Code CLI process management
│   │   │   ├── mod.rs              # BridgeOutput, CliLocation types
│   │   │   ├── process.rs          # CliBridge, MockBridge, BridgeInterface trait
│   │   │   ├── parser.rs           # StreamParser, BridgeEvent, MessageChunk
│   │   │   ├── adapter.rs          # AdapterRegistry, CliVersion
│   │   │   ├── permission.rs       # PermissionManager, PermissionRequest
│   │   │   ├── manager.rs          # SessionBridgeMap — session→process lifecycle (Phase 2 — CHI-44)
│   │   │   └── event_loop.rs       # Streaming event loop — bridge→Tauri events (Phase 2 — CHI-46)
│   │   ├── cost/                   # Cost calculation engine (Phase 2 — CHI-38)
│   │   │   ├── mod.rs
│   │   │   ├── calculator.rs       # Token → cost conversion
│   │   │   ├── budget.rs           # Budget enforcement logic
│   │   │   └── pricing.rs          # Model pricing tables (updatable)
│   │   ├── db/                     # SQLite database layer
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs           # Table definitions, migrations
│   │   │   ├── queries.rs          # Typed query functions
│   │   │   └── export.rs           # Data export/import (SPEC-005)
│   │   ├── git/                    # Git operations via git2-rs
│   │   │   ├── mod.rs
│   │   │   ├── worktree.rs         # Worktree management
│   │   │   ├── status.rs           # Status, branch, log queries
│   │   │   └── commit.rs           # Commit, PR creation
│   │   └── mcp/                    # MCP server management
│   │       ├── mod.rs
│   │       ├── registry.rs         # Server registration, discovery
│   │       ├── transport.rs        # HTTP/STDIO/SSE transport handling
│   │       └── oauth.rs            # OAuth flow management
│   └── tests/                      # Rust integration tests
│       ├── bridge_tests.rs
│       ├── cost_tests.rs
│       └── db_tests.rs
│
├── src/                            # SolidJS frontend
│   ├── App.tsx                     # Root component, router
│   ├── index.tsx                   # Entry point
│   ├── components/                 # UI components (organized by domain)
│   │   ├── common/                 # Shared components
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Panel.tsx
│   │   │   ├── Dropdown.tsx
│   │   │   └── Toast.tsx
│   │   ├── conversation/           # Conversation view components
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── ThinkingBlock.tsx
│   │   │   ├── PlanBlock.tsx
│   │   │   ├── ToolUseBlock.tsx
│   │   │   └── ConversationView.tsx
│   │   ├── agents/                 # Agent dashboard components
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentDashboard.tsx
│   │   │   ├── SpawnDialog.tsx
│   │   │   └── TaskList.tsx
│   │   ├── diff/                   # Diff review components
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── DiffPane.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── HunkControls.tsx
│   │   │   └── DiffQueue.tsx
│   │   ├── terminal/               # Terminal components
│   │   │   ├── TerminalPane.tsx
│   │   │   └── TerminalTabs.tsx
│   │   ├── layout/                 # Layout shell
│   │   │   ├── TitleBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── DetailsPanel.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   └── MainLayout.tsx
│   │   ├── widgets/                # Persistent overlay widgets
│   │   │   ├── CostTracker.tsx
│   │   │   ├── ContextMeter.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   └── EffortSlider.tsx
│   │   ├── settings/               # Settings screen
│   │   │   └── SettingsView.tsx
│   │   ├── mcp/                    # MCP management
│   │   │   ├── MCPPanel.tsx
│   │   │   └── AddServerWizard.tsx
│   │   └── permissions/            # Permission dialogs
│   │       └── PermissionDialog.tsx
│   │   └── permissions/            # Permission dialogs
│   │       ├── PermissionDialog.tsx # Modal permission dialog (Phase 1 — CHI-23)
│   │       └── YoloWarningDialog.tsx # YOLO mode confirmation (Phase 1 — CHI-26)
│   ├── stores/                     # SolidJS reactive stores
│   │   ├── uiStore.ts              # UI state (sidebar, panels, views, permissions, yolo)
│   │   ├── sessionStore.ts         # Session state (CRUD, model cycling, active session)
│   │   ├── conversationStore.ts    # Conversation state (real CLI streaming, events) (Phase 2 — CHI-47)
│   │   ├── cliStore.ts             # CLI detection state (isDetected, location) (Phase 2 — CHI-48)
│   │   ├── projectStore.ts         # Project state (folder picker, active project) (Phase 2 — CHI-40)
│   │   ├── costStore.ts            # Cost tracking state (Phase 2 — CHI-53)
│   │   ├── agentStore.ts           # Agent states (future)
│   │   ├── contextStore.ts         # Context utilization state (future)
│   │   ├── settingsStore.ts        # App settings (future)
│   │   └── mcpStore.ts             # MCP server states (future)
│   ├── lib/                        # Shared utilities
│   │   ├── ipc.ts                  # Typed Tauri IPC wrappers
│   │   ├── events.ts               # Tauri event listeners
│   │   ├── formatters.ts           # Cost, token, time formatting
│   │   └── keybindings.ts          # Keyboard shortcut management
│   └── styles/                     # Global styles
│       ├── tokens.css              # CSS custom properties (from SPEC-002)
│       └── global.css              # Base styles, resets
│
├── docs/                           # Documentation (this folder)
├── tests/                          # E2E and cross-platform tests
├── .github/                        # CI/CD workflows, templates
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts                  # Vite for frontend bundling
└── CLAUDE.md                       # Agent instructions
```

---

## 3. Module Responsibilities

### 3.1 Rust Backend Modules

| Module | Responsibility | Key Dependencies | Phase |
|---|---|---|---|
| `commands/session.rs` | Session/message CRUD IPC handlers. | `db/` | Phase 1 |
| `commands/bridge.rs` | CLI lifecycle IPC: start_session_cli, send_to_cli, stop_session_cli, get_cli_status. | `bridge/` | Phase 2 |
| `commands/cli.rs` | CLI detection: get_cli_info (checks PATH for `claude` binary). | — | Phase 2 |
| `commands/project.rs` | Folder picker + project CRUD: pick_project_folder, create_project, list_projects. | `db/`, `tauri-plugin-dialog` | Phase 2 |
| `commands/cost.rs` | Cost tracking IPC: get_session_cost, set_budget. | `cost/`, `db/` | Phase 2 |
| `bridge/process.rs` | Spawn Claude Code CLI via PTY. Implements `BridgeInterface` trait. | `portable-pty`, `tokio` | Phase 1 |
| `bridge/parser.rs` | Parse structured CLI output into `BridgeEvent` variants. | — | Phase 1 |
| `bridge/adapter.rs` | Versioned parser selection via `AdapterRegistry`. | — | Phase 1 |
| `bridge/permission.rs` | Intercept permission requests from CLI output. | — | Phase 1 |
| `bridge/manager.rs` | `SessionBridgeMap` — maps session IDs to bridge processes. Manages process lifecycle. | `bridge/process.rs` | Phase 2 |
| `bridge/event_loop.rs` | Streaming event loop: reads bridge output, emits Tauri events (chunk, complete, exited, permission). | `bridge/`, `tauri` | Phase 2 |
| `cost/` | Calculate token costs, enforce budgets, emit cost events. | `db/` | Phase 2 |
| `db/` | SQLite CRUD operations, schema migrations, data export/import. | `rusqlite` | Phase 1 |
| `git/` | Git operations: status, worktree management, commit, branch. | `git2-rs` | Future |
| `mcp/` | MCP server registration, connection lifecycle, OAuth flows. | `reqwest`, `tokio` | Future |

### 3.2 Frontend Stores

| Store | Owns | Updated By | Phase |
|---|---|---|---|
| `uiStore` | Active view, sidebar/panel visibility, permission dialog, yolo mode | Direct user interaction | Phase 1 |
| `sessionStore` | Active session, session list, model cycling | IPC commands (session CRUD) | Phase 1 |
| `conversationStore` | Messages, streaming content, loading/error state | IPC commands + Tauri event listeners (message:chunk, message:complete, cli:exited, permission:request) | Phase 2 |
| `cliStore` | CLI detection (isDetected, location, version) | IPC command (get_cli_info) on startup | Phase 2 |
| `projectStore` | Project list, active project | IPC commands (pick/create/list projects) | Phase 2 |
| `costStore` | Running cost totals, budget status | Tauri events from cost engine | Phase 2 |
| `agentStore` | Agent list, states, task assignments | Tauri events from bridge | Future |
| `contextStore` | Token utilization, zone, compaction state | Tauri events from bridge parser | Future |
| `settingsStore` | User preferences, model defaults | IPC commands (read/write) | Future |
| `mcpStore` | Server list, connection status, tools | IPC commands + events | Future |

---

## 4. IPC Contract Specification

All communication between frontend (SolidJS) and backend (Rust) uses Tauri's IPC system. There are two mechanisms:

### 4.1 Commands (Request/Response)

Frontend calls backend, waits for result. Used for user-initiated actions.

```typescript
// Frontend: lib/ipc.ts (typed wrapper)
import { invoke } from '@tauri-apps/api/core';

// Session commands
export const createSession = (project_id: string, model: string) =>
  invoke<Session>('create_session', { project_id, model });

export const listSessions = (project_id: string) =>
  invoke<Session[]>('list_sessions', { project_id });

export const forkSession = (session_id: string, from_message_id: string) =>
  invoke<Session>('fork_session', { session_id, from_message_id });

// Message commands
export const sendMessage = (session_id: string, content: string, effort: string) =>
  invoke<void>('send_message', { session_id, content, effort });

// Agent commands
export const spawnAgent = (session_id: string, model: string, task: string, budget_cents?: number) =>
  invoke<Agent>('spawn_agent', { session_id, model, task, budget_cents });

export const killAgent = (agent_id: string) =>
  invoke<void>('kill_agent', { agent_id });

// Cost commands
export const getSessionCost = (session_id: string) =>
  invoke<CostSummary>('get_session_cost', { session_id });

export const setBudget = (scope: string, limit_cents: number) =>
  invoke<void>('set_budget', { scope, limit_cents });

// Context commands
export const compactContext = (session_id: string, strategy: string) =>
  invoke<void>('compact_context', { session_id, strategy });

// Settings commands
export const getSettings = () => invoke<Settings>('get_settings');
export const updateSettings = (settings: Partial<Settings>) =>
  invoke<void>('update_settings', { settings });

// MCP commands
export const addMcpServer = (config: McpServerConfig) =>
  invoke<McpServer>('add_mcp_server', { config });

export const removeMcpServer = (server_id: string) =>
  invoke<void>('remove_mcp_server', { server_id });

// Git commands
export const getGitStatus = (project_path: string) =>
  invoke<GitStatus>('get_git_status', { project_path });

export const createWorktree = (project_path: string, branch_name: string) =>
  invoke<string>('create_worktree', { project_path, branch_name });

// Export commands
export const exportData = (format: string, path: string) =>
  invoke<void>('export_data', { format, path });
```

```rust
// Backend: commands/session.rs (example)
#[tauri::command]
async fn create_session(
    state: State<'_, AppState>,
    project_id: String,
    model: String,
) -> Result<Session, String> {
    let db = state.db.lock().await;
    let session = db.create_session(&project_id, &model)
        .map_err(|e| e.to_string())?;
    Ok(session)
}
```

### 4.2 Events (Push)

Backend pushes to frontend asynchronously. Used for streaming data and state changes.

```typescript
// Frontend: lib/events.ts
import { listen } from '@tauri-apps/api/event';

// Message streaming events
export const onMessageChunk = (handler: (chunk: MessageChunk) => void) =>
  listen<MessageChunk>('message:chunk', (event) => handler(event.payload));

export const onMessageComplete = (handler: (msg: Message) => void) =>
  listen<Message>('message:complete', (event) => handler(event.payload));

// Agent state events
export const onAgentStateChange = (handler: (state: AgentState) => void) =>
  listen<AgentState>('agent:state_change', (event) => handler(event.payload));

// Cost events
export const onCostUpdate = (handler: (cost: CostEvent) => void) =>
  listen<CostEvent>('cost:update', (event) => handler(event.payload));

export const onBudgetWarning = (handler: (warning: BudgetWarning) => void) =>
  listen<BudgetWarning>('cost:budget_warning', (event) => handler(event.payload));

// Context events
export const onContextUpdate = (handler: (ctx: ContextState) => void) =>
  listen<ContextState>('context:update', (event) => handler(event.payload));

// Permission events
export const onPermissionRequest = (handler: (req: PermissionRequest) => void) =>
  listen<PermissionRequest>('permission:request', (event) => handler(event.payload));

// MCP events
export const onMcpStatusChange = (handler: (status: McpStatus) => void) =>
  listen<McpStatus>('mcp:status_change', (event) => handler(event.payload));
```

```rust
// Backend: emitting events
app_handle.emit("message:chunk", MessageChunk {
    session_id: session.id.clone(),
    content: chunk_text,
    token_count: chunk_tokens,
})?;
```

### 4.3 Event Naming Convention

Pattern: `{domain}:{action}` in lowercase snake_case.

| Event | Payload | Direction |
|---|---|---|
| `message:chunk` | `{ session_id, content, token_count }` | Backend → Frontend |
| `message:complete` | Full `Message` struct | Backend → Frontend |
| `message:thinking` | `{ session_id, content, is_streaming }` | Backend → Frontend |
| `agent:state_change` | `{ agent_id, old_state, new_state, details }` | Backend → Frontend |
| `agent:output` | `{ agent_id, output_line }` | Backend → Frontend |
| `cost:update` | `{ session_id, agent_id?, cost_event }` | Backend → Frontend |
| `cost:budget_warning` | `{ scope, percent, limit_cents, spent_cents }` | Backend → Frontend |
| `context:update` | `{ session_id, tokens_used, tokens_limit, zone }` | Backend → Frontend |
| `permission:request` | `{ request_id, tool, command, risk_level }` | Backend → Frontend |
| `permission:response` | `{ request_id, action, pattern? }` | Frontend → Backend |
| `mcp:status_change` | `{ server_id, old_status, new_status }` | Backend → Frontend |

### 4.4 Phase 2 IPC Contracts (Implemented)

These commands and events were added in Phase 2 to wire the CLI bridge to the frontend.

#### 4.4.1 CLI Detection Command

```typescript
// Frontend: stores/cliStore.ts
export const getCliInfo = () =>
  invoke<CliLocation>('get_cli_info');

// CliLocation: { path_override: string | null; resolved_path: string | null; version: string | null }
```

```rust
// Backend: commands/cli.rs
#[tauri::command]
fn get_cli_info(cli: State<'_, CliLocation>) -> Result<CliLocation, String> {
    // Returns the CliLocation detected at startup (path_override, resolved_path, version)
}
```

#### 4.4.2 Project Management Commands

```typescript
// Frontend: stores/projectStore.ts
export const pickProjectFolder = () => invoke<string | null>('pick_project_folder');
export const createProject = (name: string, path: string) =>
  invoke<Project>('create_project', { name, path });
export const listProjects = () => invoke<Project[]>('list_projects');
```

#### 4.4.3 CLI Bridge Commands

```typescript
// Frontend: stores/conversationStore.ts
export const startSessionCli = (session_id: string, project_path: string, model: string) =>
  invoke<void>('start_session_cli', { session_id, project_path, model });

export const sendToCli = (session_id: string, message: string) =>
  invoke<void>('send_to_cli', { session_id, message });

export const stopSessionCli = (session_id: string) =>
  invoke<void>('stop_session_cli', { session_id });

export const getCliStatus = (session_id: string) =>
  invoke<string>('get_cli_status', { session_id });
```

#### 4.4.4 Phase 2 Event Contracts (Streaming)

| Event | Payload | Source | Consumer |
|---|---|---|---|
| `message:chunk` | `{ session_id: string, content: string }` | `event_loop.rs` | `conversationStore.ts` |
| `message:complete` | `{ session_id: string, content: string }` | `event_loop.rs` | `conversationStore.ts` |
| `cli:exited` | `{ session_id: string, code: number \| null }` | `event_loop.rs` | `conversationStore.ts` |
| `permission:request` | `{ session_id: string, tool: string, command: string, risk_level: string }` | `event_loop.rs` | `uiStore.ts` |

```typescript
// Frontend: stores/conversationStore.ts — event listeners
listen<{ session_id: string; content: string }>('message:chunk', (event) => {
  appendStreamingContent(event.payload.content);
});

listen<{ session_id: string; content: string }>('message:complete', (event) => {
  finalizeMessage(event.payload.session_id, event.payload.content);
});

listen<{ session_id: string; code: number | null }>('cli:exited', (event) => {
  handleCliExit(event.payload.session_id, event.payload.code);
});
```

#### 4.4.5 Permission IPC (Phase 2 — CHI-50/CHI-51, In Progress)

```typescript
// Frontend → Backend: respond to a permission request
export const respondPermission = (request_id: string, action: PermissionAction) =>
  invoke<void>('respond_permission', { request_id, action });

// PermissionAction: 'Approve' | 'Deny' | 'AlwaysAllow'
```

```rust
// Backend: commands/bridge.rs
#[tauri::command]
async fn respond_permission(
    state: State<'_, AppState>,
    request_id: String,
    action: String,
) -> Result<(), String> {
    // Routes response to the correct bridge process via SessionBridgeMap
}
```

#### 4.4.6 Cost Tracking IPC (Phase 2 — CHI-53/CHI-54, Planned)

```typescript
// Commands
export const getSessionCost = (session_id: string) =>
  invoke<CostSummary>('get_session_cost', { session_id });
export const setBudget = (scope: string, limit_cents: number) =>
  invoke<void>('set_budget', { scope, limit_cents });

// Events
listen<CostEvent>('cost:update', (event) => { /* update costStore */ });
listen<BudgetWarning>('cost:budget_warning', (event) => { /* show toast/modal */ });
```

---

## 5. Data Flow Diagrams

### 5.1 Message Send Flow

```
Frontend                    Rust Backend                    Claude Code CLI
   │                            │                               │
   │ invoke('send_message')     │                               │
   ├──────────────────────────→ │                               │
   │                            │ write to PTY stdin            │
   │                            ├─────────────────────────────→ │
   │                            │                               │
   │                            │ ◄── stdout stream ────────── │
   │                            │ parse structured output       │
   │                            │                               │
   │ ◄── emit('message:chunk') │                               │
   │ ◄── emit('cost:update')   │                               │
   │ ◄── emit('context:update')│                               │
   │                            │                               │
   │                            │ ◄── output complete ──────── │
   │                            │ persist to SQLite             │
   │ ◄── emit('message:complete')                              │
   │                            │                               │
```

### 5.2 Permission Flow

```
Claude Code CLI          Rust Backend (bridge)          Frontend
     │                         │                           │
     │ requests permission     │                           │
     │ (detected in output)    │                           │
     ├───────────────────────→ │                           │
     │                         │ check YOLO mode           │
     │                         │ [if YOLO: auto-approve,   │
     │                         │  log with [YOLO] prefix,  │
     │                         │  emit toast, skip dialog] │
     │                         │                           │
     │                         │ check auto-allow rules    │
     │                         │                           │
     │                         │ [if not auto-allowed]     │
     │                         │ emit('permission:request')│
     │                         ├─────────────────────────→ │
     │                         │                           │ show dialog
     │                         │                           │
     │                         │ ◄── invoke('respond_permission')
     │                         │                           │
     │ ◄── allow/deny ─────── │                           │
     │                         │ [if always: save pattern] │
     │                         │                           │
```

**YOLO Mode IPC:**

| Event | Payload | Direction |
|-------|---------|-----------|
| `yolo_mode:changed` | `{ enabled: bool }` | Backend → Frontend |
| `toggle_yolo_mode` | `{ enable: bool }` | Frontend → Backend (IPC command) |

### 5.3 CLI Detection Flow (Phase 2 — CHI-48)

```
App Launch                     Rust Backend                    OS
   │                              │                            │
   │ onMount: invoke('get_cli_info')                           │
   ├────────────────────────────→ │                            │
   │                              │ which claude / where claude│
   │                              ├──────────────────────────→ │
   │                              │ ◄── path or not found ──── │
   │                              │ claude --version (if found)│
   │                              ├──────────────────────────→ │
   │                              │ ◄── version string ─────── │
   │                              │                            │
   │ ◄── CliLocation { path_override, resolved_path, version }  │
   │                              │                            │
   │ cliStore updates             │                            │
   │ [if !detected]:              │                            │
   │   StatusBar → "CLI not found"│                            │
   │   MessageInput → disabled    │                            │
   │   ConversationView → install │                            │
   │   guidance                   │                            │
```

### 5.4 Session Bridge Lifecycle (Phase 2 — CHI-44/CHI-46)

```
Frontend                    SessionBridgeMap              CliBridge Process
   │                              │                            │
   │ invoke('start_session_cli')  │                            │
   ├────────────────────────────→ │                            │
   │                              │ spawn CLI process          │
   │                              ├──────────────────────────→ │
   │                              │ store session→bridge map   │
   │                              │ spawn event_loop task      │
   │ ◄── Ok(())                   │                            │
   │                              │                            │
   │ invoke('send_to_cli')        │                            │
   ├────────────────────────────→ │                            │
   │                              │ lookup bridge by session   │
   │                              │ write to PTY stdin         │
   │                              ├──────────────────────────→ │
   │                              │                            │
   │                              │ ◄── event_loop reads ───── │
   │ ◄── emit('message:chunk')    │                            │
   │ ◄── emit('message:chunk')   │                            │
   │ ◄── emit('message:complete')│                            │
   │                              │                            │
   │ invoke('stop_session_cli')   │                            │
   ├────────────────────────────→ │                            │
   │                              │ kill process               │
   │                              ├──────────────────────────→ │
   │                              │ remove from map            │
   │ ◄── Ok(())                   │                            │
```

### 5.5 Cost Tracking Flow (Phase 2 — CHI-53, Planned)

```
event_loop.rs              cost/calculator.rs           db/queries.rs
     │                           │                          │
     │ BridgeEvent::MessageEnd   │                          │
     │ { tokens, model }         │                          │
     ├─────────────────────────→ │                          │
     │                           │ calculate cost           │
     │                           │ check budget             │
     │                           │                          │
     │                           │ persist cost event       │
     │                           ├────────────────────────→ │
     │                           │                          │
     │ ◄── CostEvent             │                          │
     │                           │                          │
     │ emit('cost:update')       │                          │
     │ [if budget > 80%]:        │                          │
     │   emit('cost:budget_warning')                        │
```

---

## 6. Type Definitions

Shared types used across the IPC boundary. These must be kept in sync between Rust structs and TypeScript interfaces.

```typescript
// Frontend: lib/types.ts

interface Session {
  id: string;
  project_id: string;
  title: string | null;
  model: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  parent_session_id: string | null;
  context_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_cents: number;
  created_at: string; // ISO 8601
  updated_at: string;
}

interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  cost_cents: number | null;
  is_compacted: boolean;
  created_at: string;
}

interface Agent {
  id: string;
  session_id: string;
  name: string | null;
  role: 'lead' | 'teammate' | 'background';
  model: string;
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'complete' | 'error';
  task_description: string | null;
  worktree_path: string | null;
  total_tokens: number;
  total_cost_cents: number;
  created_at: string;
}

interface CostEvent {
  session_id: string;
  agent_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_cents: number;
  event_type: 'message' | 'tool_call' | 'thinking' | 'compaction';
}

interface CostSummary {
  session_total_cents: number;
  by_model: Record<string, { input_tokens: number; output_tokens: number; cost_cents: number }>;
  last_message_cost_cents: number;
  budget_status: BudgetStatus | null;
}

interface BudgetStatus {
  scope: 'session' | 'daily' | 'weekly' | 'monthly';
  limit_cents: number;
  spent_cents: number;
  percent: number;
}

interface ContextState {
  session_id: string;
  tokens_used: number;
  tokens_limit: number;
  percent: number;
  zone: 'green' | 'yellow' | 'red' | 'critical';
}

interface PermissionRequest {
  request_id: string;
  tool: string;
  command: string;
  file_path: string | null;
  risk_level: 'low' | 'medium' | 'high';
}

// Phase 2: Project (CHI-40)
interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

// Phase 2: CLI Location (CHI-48)
interface CliLocation {
  path_override: string | null;
  resolved_path: string | null;
  version: string | null;
}

// Phase 2: Bridge Status (CHI-45)
type BridgeStatus = 'running' | 'stopped' | 'error';

interface McpServer {
  id: string;
  name: string;
  transport: 'http' | 'stdio' | 'sse';
  command_or_url: string;
  scope: 'user' | 'project';
  status: 'connected' | 'disconnected' | 'error';
  tool_count: number;
}

interface Settings {
  theme: 'dark' | 'light' | 'system';
  default_model: string;
  default_effort: 'low' | 'medium' | 'high' | 'max';
  startup_mode: 'gui' | 'terminal' | 'hybrid';
  auto_update: boolean;
  cost: CostSettings;
  context: ContextSettings;
  terminal: TerminalSettings;
  permissions: PermissionSettings;
  agents: AgentSettings;
}
```

---

## 7. Error Handling Strategy

### 7.1 Rust Backend Errors

Use a unified `AppError` enum that maps to user-friendly messages:

```rust
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Claude Code process error: {0}")]
    Bridge(String),

    #[error("Git operation failed: {0}")]
    Git(#[from] git2::Error),

    #[error("MCP connection failed: {0}")]
    Mcp(String),

    #[error("Budget exceeded: {scope} limit of ${limit_cents} reached")]
    BudgetExceeded { scope: String, limit_cents: i64 },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

// Serialize for IPC
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> { ... }
}
```

### 7.2 Frontend Error Handling

All IPC calls use a wrapper that catches errors and routes them to the toast system:

```typescript
// lib/ipc.ts
async function safeInvoke<T>(command: string, args?: any): Promise<T | null> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = typeof error === 'string' ? error : 'Unknown error';
    toastStore.addToast({ type: 'error', message, action: 'retry' });
    console.error(`IPC error [${command}]:`, error);
    return null;
  }
}
```

### 7.3 Bridge Process Recovery

If the Claude Code CLI process crashes:
1. Bridge module detects process exit
2. Emits `bridge:disconnected` event
3. Frontend shows reconnection toast with "Restart" button
4. On restart: spawn new process, restore session context from SQLite
5. Emit `bridge:reconnected` event

---

## 8. Database Schema Versioning

### 8.1 Migration System

SQLite schema migrations use a `schema_version` table:

```sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);
```

Each migration is a Rust function:

```rust
// db/schema.rs
const MIGRATIONS: &[(i32, &str, fn(&Connection) -> Result<()>)] = &[
    (1, "Initial schema", migrate_v1),
    (2, "Add export tables", migrate_v2),
    // ...
];

fn run_migrations(conn: &Connection) -> Result<()> {
    let current_version = get_current_version(conn)?;
    for (version, desc, migrate_fn) in MIGRATIONS {
        if *version > current_version {
            migrate_fn(conn)?;
            conn.execute(
                "INSERT INTO schema_version (version, description) VALUES (?1, ?2)",
                params![version, desc],
            )?;
        }
    }
    Ok(())
}
```

### 8.2 Migration Rules

- Migrations are append-only — never modify a past migration.
- Every migration must be backwards-compatible (the app should function if migration is interrupted).
- Destructive changes (column drops, table drops) require a two-phase approach: deprecate in version N, remove in version N+2.

---

## 9. Performance Architecture

### 9.1 Frontend Performance Rules

- **Lazy component loading**: Diff viewer, settings screen, MCP panel load on first access.
- **Virtualized lists**: Message list and session list use virtual scrolling (only render visible items).
- **Debounced updates**: Cost tracker and context meter updates debounced to 100ms to prevent render thrashing.
- **Web Workers**: Syntax highlighting via tree-sitter WASM runs in a Web Worker, never on the main thread.
- **Terminal rendering**: xterm.js WebGL addon for GPU-accelerated text. Offscreen terminals suspend rendering.

### 9.2 Backend Performance Rules

- **Async I/O**: All file and network operations use `tokio` async runtime.
- **Connection pooling**: Single SQLite connection with WAL mode for concurrent reads.
- **Batch writes**: Cost events are batched (100ms window) before writing to SQLite to avoid write amplification.
- **PTY buffer management**: Bridge reads PTY output in 4KB chunks. Parser operates on chunks, not full messages.
- **Memory limits**: Agent process output buffers capped at 10MB per agent. Older output written to SQLite and evicted from memory.

---

## 10. Security Architecture

### 10.1 Tauri Capabilities

Tauri v2 uses a capability-based permission system. Each capability file in `src-tauri/capabilities/` declares what the app can access:

```json
// src-tauri/capabilities/main-window.json
{
  "identifier": "main-window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "shell:allow-open",
    "fs:allow-read",
    "fs:allow-write",
    "dialog:allow-open",
    "dialog:allow-save"
  ]
}
```

### 10.2 Process Isolation

- Claude Code CLI runs as a child process with inherited (but not elevated) permissions.
- Worktree agents operate in isolated directories.
- MCP servers connect via specific transports — no arbitrary network access.
- Environment variables with secrets (API keys) are passed to the CLI process only, never to the frontend webview.

---

## 11. Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Rust unit tests | `cargo test` | Business logic in cost/, db/, bridge/ |
| Rust integration tests | `cargo test --test` | CLI bridge parsing, SQLite operations |
| Frontend unit tests | Vitest | Store logic, formatters, IPC wrappers |
| Frontend component tests | Vitest + Solid Testing Library | Component rendering, interactions |
| E2E tests | Tauri's built-in WebDriver support | Full app workflows (requires Claude Code mock) |
| Cross-platform | CI matrix (macOS, Windows, Ubuntu) | Build + test on all platforms |

### 11.1 Claude Code Mock

For testing without the actual CLI, the bridge module supports a `MockBridge` that replays recorded CLI interactions:

```rust
trait BridgeInterface {
    async fn send(&self, input: &str) -> Result<()>;
    async fn receive(&self) -> Result<Option<BridgeOutput>>;
}

struct LiveBridge { /* PTY-based */ }
struct MockBridge { /* replay-based */ }
```

Tests record CLI sessions as JSON fixtures and replay them through `MockBridge`.
