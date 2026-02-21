# SPEC-004: Architecture Deep Dive

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Draft
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
│   │   │   ├── session.rs          # Session CRUD commands
│   │   │   ├── message.rs          # Message send/receive commands
│   │   │   ├── agent.rs            # Agent lifecycle commands
│   │   │   ├── cost.rs             # Cost tracking commands
│   │   │   ├── context.rs          # Context management commands
│   │   │   ├── mcp.rs              # MCP server management commands
│   │   │   ├── settings.rs         # Settings CRUD commands
│   │   │   ├── git.rs              # Git operations commands
│   │   │   └── automation.rs       # Automation CRUD commands
│   │   ├── bridge/                 # Claude Code CLI process management
│   │   │   ├── mod.rs
│   │   │   ├── process.rs          # PTY spawn, lifecycle, I/O
│   │   │   ├── parser.rs           # Structured output parser
│   │   │   ├── adapter.rs          # Versioned parser adapter interface
│   │   │   └── permission.rs       # Permission request interception
│   │   ├── cost/                   # Cost calculation engine
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
│   ├── stores/                     # SolidJS reactive stores
│   │   ├── sessionStore.ts         # Active session state
│   │   ├── agentStore.ts           # Agent states
│   │   ├── costStore.ts            # Cost tracking state
│   │   ├── contextStore.ts         # Context utilization state
│   │   ├── settingsStore.ts        # App settings
│   │   ├── mcpStore.ts             # MCP server states
│   │   └── uiStore.ts              # UI state (active view, panel visibility)
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

| Module | Responsibility | Key Dependencies |
|---|---|---|
| `commands/` | IPC command handlers. Thin layer: validate input, call business logic, return result. | All other modules |
| `bridge/` | Spawn and manage Claude Code CLI subprocesses via PTY. Parse structured output. Intercept permission requests. | `portable-pty`, `tokio` |
| `cost/` | Calculate token costs, enforce budgets, emit cost events. | `db/` for persistence |
| `db/` | SQLite CRUD operations, schema migrations, data export/import. | `rusqlite` |
| `git/` | Git operations: status, worktree management, commit, branch. | `git2-rs` |
| `mcp/` | MCP server registration, connection lifecycle, OAuth flows. | `reqwest`, `tokio` |

### 3.2 Frontend Stores

| Store | Owns | Updated By |
|---|---|---|
| `sessionStore` | Active session, messages, session list | IPC commands + Tauri events |
| `agentStore` | Agent list, states, task assignments | Tauri events from bridge |
| `costStore` | Running cost totals, budget status | Tauri events from cost engine |
| `contextStore` | Token utilization, zone, compaction state | Tauri events from bridge parser |
| `settingsStore` | User preferences, model defaults | IPC commands (read/write) |
| `mcpStore` | Server list, connection status, tools | IPC commands + events |
| `uiStore` | Active view, panel states, modal stack | Direct user interaction |

---

## 4. IPC Contract Specification

All communication between frontend (SolidJS) and backend (Rust) uses Tauri's IPC system. There are two mechanisms:

### 4.1 Commands (Request/Response)

Frontend calls backend, waits for result. Used for user-initiated actions.

```typescript
// Frontend: lib/ipc.ts (typed wrapper)
import { invoke } from '@tauri-apps/api/core';

// Session commands
export const createSession = (projectId: string, model: string) =>
  invoke<Session>('create_session', { projectId, model });

export const listSessions = (projectId: string) =>
  invoke<Session[]>('list_sessions', { projectId });

export const forkSession = (sessionId: string, fromMessageId: string) =>
  invoke<Session>('fork_session', { sessionId, fromMessageId });

// Message commands
export const sendMessage = (sessionId: string, content: string, effort: string) =>
  invoke<void>('send_message', { sessionId, content, effort });

// Agent commands
export const spawnAgent = (sessionId: string, model: string, task: string, budgetCents?: number) =>
  invoke<Agent>('spawn_agent', { sessionId, model, task, budgetCents });

export const killAgent = (agentId: string) =>
  invoke<void>('kill_agent', { agentId });

// Cost commands
export const getSessionCost = (sessionId: string) =>
  invoke<CostSummary>('get_session_cost', { sessionId });

export const setBudget = (scope: string, limitCents: number) =>
  invoke<void>('set_budget', { scope, limitCents });

// Context commands
export const compactContext = (sessionId: string, strategy: string) =>
  invoke<void>('compact_context', { sessionId, strategy });

// Settings commands
export const getSettings = () => invoke<Settings>('get_settings');
export const updateSettings = (settings: Partial<Settings>) =>
  invoke<void>('update_settings', { settings });

// MCP commands
export const addMcpServer = (config: McpServerConfig) =>
  invoke<McpServer>('add_mcp_server', { config });

export const removeMcpServer = (serverId: string) =>
  invoke<void>('remove_mcp_server', { serverId });

// Git commands
export const getGitStatus = (projectPath: string) =>
  invoke<GitStatus>('get_git_status', { projectPath });

export const createWorktree = (projectPath: string, branchName: string) =>
  invoke<string>('create_worktree', { projectPath, branchName });

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
