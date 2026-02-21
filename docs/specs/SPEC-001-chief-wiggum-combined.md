# SPEC-001: Chief Wiggum — Combined Product Specification

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Draft
**Project Codename:** Chief Wiggum (aka ClaudeDesk)

---

## 1. Executive Summary

Chief Wiggum is a cross-platform desktop application built with **Tauri v2** that provides a superior graphical interface for Claude Code. It fills the critical gap between Claude Code's terminal-first power and the polished desktop experience that OpenAI's Codex App delivers — while being lighter, faster, and cross-platform from day one.

The application targets professional developers who want Claude Code's capabilities (Opus 4.6, Sonnet 4.6, Agent Teams, MCP, hooks) without the terminal-only limitation, and who demand a lighter, faster experience than Codex Desktop App's Electron shell.

**Core value proposition:** The only cross-platform, lightweight, native-feeling GUI for Claude Code that provides visual multi-agent orchestration, real-time cost tracking, and intelligent context management — capabilities neither Claude Code nor Codex Desktop App delivers today.

---

## 2. Market Context and Competitive Landscape

### 2.1 The Agentic Development Paradigm (2026)

Software engineering in February 2026 has transitioned from granular autocomplete-style assistance to autonomous agentic orchestration. Developers now operate as high-level orchestrators managing parallel autonomous agents capable of navigating complex codebases, executing multi-step refactors, and interacting with diverse deployment environments.

Key paradigm shifts driving this project:

- **Collapse of sequential bottlenecks.** Traditional IDEs supported single-threaded, sequential coding. Modern agentic development requires multi-threaded orchestration — a developer can dispatch agents to build a frontend, write backend migrations, and configure deployments simultaneously.
- **Transparent planning mechanics.** Plan Mode is no longer optional — agents that immediately output code plunge into architectural dead-ends, wasting API context limits and computational time.
- **Productivity metrics have shifted.** Lines of code and commit volume are irrelevant when agents generate code autonomously. Real productivity is measured in system stability, incident rates, and speed of architectural iterations.

### 2.2 Competitive Feature Matrix

| Dimension | Claude Code (v2.1.39 + 4.6 models) | OpenAI Codex Desktop App (Feb 2026) | Chief Wiggum Target |
|---|---|---|---|
| **UI type** | Terminal CLI + VS Code extension | Standalone Electron desktop app | Tauri v2 native GUI + embedded terminal |
| **Platform** | macOS, Linux, Windows | macOS only (Apple Silicon) | macOS, Windows, Linux from day one |
| **Architecture** | N/A (CLI) | Electron (bundled Chromium) | Tauri v2 (OS-native WebView, Rust backend) |
| **Primary models** | Opus 4.6, Sonnet 4.6, Haiku 4.5 | GPT-5.3-Codex variants | Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **Context window** | 200K standard, 1M beta | ~128K–256K | Full 1M beta support with visual management |
| **Max output tokens** | 128K (Opus), 64K (Sonnet) | Model-dependent | Full support with streaming optimization |
| **Multi-agent** | Agent Teams (research preview) | Multi-thread parallel with git worktrees | Visual Agent Teams dashboard |
| **Sandbox execution** | OS-level sandboxing | OS-level per-thread | Inherited + visual controls |
| **Git worktrees** | `--worktree` flag | Built-in per-agent | Visual worktree manager |
| **Diff review** | VS Code extension diffs | Inline diff with commenting | Three-pane diff viewer with hunk controls |
| **Approval model** | Permission system with wildcards | Three modes (untrusted/on-request/never) | Four modes with visual dialogs |
| **Memory** | CLAUDE.md, auto-memory, Skills | Skills, AGENTS.md | Visual memory/skills browser |
| **Context management** | Compaction API, "Summarize from here" | Session continuity | Visual context meter + manual controls |
| **MCP support** | HTTP, STDIO, SSE, OAuth | STDIO only | Full (HTTP/STDIO/SSE/OAuth) + visual management |
| **Cost tracking** | Token usage visible, unpredictable | Bundled in subscription | Real-time cost intelligence + budgets |
| **Idle RAM** | N/A | 300–500 MB | <80 MB |
| **Installer size** | N/A | ~200 MB | <15 MB |
| **SWE-bench** | 80.8% (Opus 4.6) | ~80.0% (GPT-5.2-Codex) | N/A (model-dependent) |

### 2.3 Key Competitive Insight

Claude Code wins on **raw capability** — better models, larger context, richer extensibility (MCP, hooks, plugins), and cross-platform support. Codex Desktop App wins on **UX polish** — a dedicated GUI command center with visual multi-agent orchestration, built-in worktrees, and scheduled automations. **Chief Wiggum must combine Claude Code's superior engine with a UX that surpasses the Codex Desktop App**, while being dramatically lighter than Electron.

---

## 3. Feature Tiers and Prioritization

### Tier 1 — Critical Gaps (neither tool solves well)

1. **Predictable cost tracking and budget controls** — Both tools suffer from unpredictable costs. Claude Code users report $37 debugging sessions and $623/month spikes. Chief Wiggum must show real-time token spend, set per-session/daily/weekly budgets, and alert before expensive operations.

2. **Graceful context management with visual feedback** — Claude Code's #1 GitHub feature request (#25695): when context fills, accumulated understanding is lost in a hard cliff. Chief Wiggum needs a visual context meter, intelligent session branching with summarized handoff, and user control over what gets compacted.

3. **Cross-platform native GUI from day one** — Codex Desktop is macOS-only Electron. Claude Code has no GUI at all. Chief Wiggum fills this gap on all three platforms using Tauri v2's native webview (~80% less memory than Electron).

4. **Visual multi-agent orchestration dashboard** — Both tools now have multi-agent capabilities but neither provides excellent visual management. Chief Wiggum needs a purpose-built UI showing all agents, their status, resource consumption, diffs, and coordination.

5. **Reliable session continuity and context persistence** — Codex offers session continuity across CLI/IDE/app. Claude Code loses context between sessions. Chief Wiggum should persist full session state and allow resumption.

### Tier 2 — High-Value Differentiators

6. **Scheduled automations with inbox review** — Background jobs that run overnight (code review, test suites, dependency updates) and present results for morning review.

7. **Integrated terminal per agent** — Embed terminal instances per agent thread with full PTY support.

8. **Smart model routing with visual controls** — Expose opusplan (Opus for planning, Sonnet for execution) visually with cost implications in real-time.

9. **Native diff review with inline commenting** — Built-in, polished diff review with commenting, approval, and partial acceptance.

10. **One-click MCP server management** — Visual MCP server browser, one-click installation, OAuth flow management, and status monitoring.

### Tier 3 — Nice-to-Have

11. Shared context between Claude Chat and Claude Code
12. Visual git worktree management
13. Plugin/extension marketplace
14. Offline/local model fallback (Ollama, llama.cpp)
15. Collaborative/team features (real-time shared sessions)

---

## 4. Systems Architecture

### 4.1 The Tauri v2 Imperative

The architecture strictly avoids Electron's JavaScript-heavy containerization. Tauri 2.0 with a compiled Rust backend resolves the performance complaints that plague the official Claude Code Desktop application.

**Why not Electron:**

- Bundles entire Chromium browser engine + Node.js runtime per application
- Installer sizes >100 MB, idle RAM 200–400 MB
- Garbage collection spikes, UI thread blocking, scrolling unresponsiveness under heavy AI workloads

**Why Tauri v2:**

- Uses OS-native WebView (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux)
- Compiles to <10 MB, operates at 30–50 MB ambient RAM
- Startup in <500ms
- True multi-threaded Rust backend: heavy operations (semantic search, AST graphs, 128K token stream serialization) execute without blocking the UI

| Performance Metric | Electron | Tauri v2 | Improvement |
|---|---|---|---|
| Rendering engine | Bundled Chromium | OS-native WebView | Eliminates browser engine overhead |
| Backend runtime | Node.js (V8) | Rust (compiled) | Prevents thread blocking |
| Bundle size | >100 MB | <10 MB | ~10x smaller |
| Idle RAM | 200–400 MB | 30–50 MB | ~6x less |
| Startup | 1–2 seconds | <500ms | ~3x faster |

### 4.2 Application Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Chief Wiggum App                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Tauri v2 Frontend (WebView)              │  │
│  │   Framework: SolidJS + TailwindCSS v4              │  │
│  │   State: SolidJS stores + Tauri event system       │  │
│  │   Rendering: Native OS webview (no Chromium)       │  │
│  └──────────────────┬────────────────────────────────┘  │
│                     │ Tauri IPC (JSON-RPC)               │
│  ┌──────────────────▼────────────────────────────────┐  │
│  │            Tauri v2 Rust Backend                    │  │
│  │                                                    │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────┐      │  │
│  │  │ Session │ │  Agent   │ │  Cost Tracking │      │  │
│  │  │ Manager │ │ Manager  │ │    Engine      │      │  │
│  │  └────┬────┘ └────┬─────┘ └───────┬────────┘      │  │
│  │       │           │               │                │  │
│  │  ┌────▼───────────▼───────────────▼─────────┐      │  │
│  │  │         Claude Code Process Bridge        │      │  │
│  │  │   (spawns/manages claude CLI via PTY)     │      │  │
│  │  └────┬──────────────────────────────────┬──┘      │  │
│  │       │                                  │         │  │
│  │  ┌────▼──────┐                    ┌──────▼──┐      │  │
│  │  │ Terminal  │                    │  MCP    │      │  │
│  │  │ Emulator  │                    │ Manager │      │  │
│  │  │ (xterm.js)│                    │         │      │  │
│  │  └───────────┘                    └─────────┘      │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │                │
    Claude Code CLI     Anthropic API      MCP Servers
    (subprocess)        (cost queries)     (HTTP/STDIO/SSE)
```

### 4.3 Key Architecture Decisions

- **Claude Code as subprocess, not reimplementation.** Chief Wiggum spawns the `claude` CLI binary as a child process via PTY, parsing its structured output. This ensures instant compatibility with every Claude Code update, all models, and all features. Chief Wiggum does not reimplement Claude Code — it wraps it.

- **SolidJS over React.** Fine-grained reactivity without virtual DOM diffing. Critical for rendering streaming token output, multiple agent panels, and terminal emulation simultaneously without frame drops. Bundle size ~7KB vs React's ~40KB+.

- **Rust backend for performance-critical paths.** Cost calculation, session state persistence, file watching, git operations, and process management all run in Rust. The frontend never touches the filesystem directly.

- **Multi-window orchestration.** Tauri 2.0's capability system allows granular permission management across multiple windows/webviews. The Rust backend can spawn secondary lightweight webviews for background agents while keeping state synchronized via IPC.

---

## 5. Model Integration: Claude 4.6 Generation

### 5.1 Supported Models

**Opus 4.6** (`claude-opus-4-6`)
- Default for complex tasks, architecture decisions, multi-file refactoring
- 200K context (1M beta), 128K max output
- $5/$25 per MTok (input/output), prompt caching up to 90% savings
- Adaptive thinking with effort controls (low/medium/high/max)
- Interleaved thinking — reasons during tool calls, not just before
- Agent Teams orchestration capability
- Fast Mode: 2.5x faster output at $30/$150 per MTok
- Benchmarks: SWE-bench 80.8%, Terminal-Bench 65.4%, GPQA Diamond 91.3%

**Sonnet 4.6** (`claude-sonnet-4-6`)
- Default for routine coding tasks, quick edits, code generation
- 200K context (1M beta), 64K max output
- $3/$15 per MTok — same price as Sonnet 4.5
- Adaptive thinking with effort controls (low/medium/high)
- Benchmarks: SWE-bench 79.6%, GPQA Diamond 74.1%
- Users prefer Sonnet 4.6 over Opus 4.5 59% of the time
- Less prone to overengineering, better instruction following

**Haiku 4.5** (`claude-haiku-4-5`)
- Auto-routed for simple tasks: file lookups, formatting, quick Q&A
- $1/$5 per MTok — 5x cheaper than Sonnet
- Fastest response times for low-complexity operations

### 5.2 Model-Specific UI Features

- **Visual model router**: UI component showing which model handles the current task, why it was selected, and cost differential. One-click override.
- **opusplan visualization**: Show handoff points — "Opus is architecting → Sonnet is implementing → Opus is reviewing."
- **Effort control slider**: Expose effort parameter (low/medium/high/max) as visual slider with estimated cost and speed impact.
- **Fast Mode toggle**: One-click toggle for Opus 4.6 Fast Mode with clear speed boost (2.5x) and cost increase (6x) display.
- **1M context indicator**: When using beta 1M context, show extended window visually with marker at 200K boundary and premium pricing zone.

### 5.3 Multimodal Capabilities: Computer Use

Claude 4.6's generalized Computer Use capability (view screen via screenshots, calculate coordinates, execute keystrokes) introduces a "Heads-Up Display" requirement:

- **HUD Mode**: Transparent, non-blocking overlay using Tauri's multi-window system with color-coded borders indicating AI control.
- **Intent Casting**: Before the agent acts, the HUD projects a targeting reticle and textual tooltip (e.g., "Agent Intent: Initiating staging deployment via Vercel Dashboard").
- **Emergency Stop**: Physical mouse movement or designated escape key immediately revokes agent permissions and halts the API request.

---

## 6. Core Feature Specifications

### 6.1 Agent Orchestration Dashboard

The centerpiece of Chief Wiggum — a visual command center for managing multiple Claude Code agents.

**Agent panel layout**: Main area showing all active agents as cards/panels. Each card displays name/role, current task, model, status (thinking/executing/waiting/complete), token consumption, elapsed time, and mini-terminal preview.

**Agent Teams integration**: Automatically detects Agent Teams structure (requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Team Lead agent displayed prominently with task list. Teammate agents as subordinate cards with progress indicators. Shared task lists as interactive kanban/checklist.

**Agent lifecycle controls**: Spawn new agents with model selection. Pause/resume (background/foreground toggle). Kill agents with visual confirmation. Fork session (branch from current state). Merge results back to main workspace.

**Diff aggregation view**: Unified diff view aggregating all changes when multiple agents complete. Group changes by agent with color coding. Per-agent approval, rejection, or partial acceptance. Conflict detection for same-file modifications.

### 6.2 Real-Time Cost Tracking Engine

**Per-session display**: Running total in status bar. Breakdown by model. Cost-per-message for most recent exchange. Comparison against session budget.

**Budget system**: Session, daily, weekly, monthly granularity. Soft limits (warning at 80%) and hard limits (require override). Per-agent budgets. Estimated remaining capacity.

**Cost optimization suggestions**: Auto-detect when Opus is used for simple tasks (suggest Sonnet). Detect high effort on routine tasks (suggest lowering). Track prompt caching hit rates. Show batch API savings opportunity.

**Historical analytics**: Daily/weekly spend charts. Cost per project breakdown. Most expensive sessions analysis. Exportable CSV.

**Implementation**: Rust backend intercepts Claude Code API calls or reads usage metadata to extract token counts. Local pricing rate application — no additional API calls needed.

### 6.3 Context Management System

**Visual context meter**: Prominent gauge showing utilization as percentage. Color-coded: green (0–60%), yellow (60–80%), red (80–95%), critical (95%+). Breakdown: system prompt, conversation, tool results, cached content.

**Compaction controls**: Three options when approaching limit — auto-compact (Compaction API), manual select (choose messages to keep/summarize/discard), session branch (new session with summarized context).

**"Summarize from here"**: Right-click menu on any message. Preview before confirming.

**Memory persistence**: CLAUDE.md inline editing. Auto-memory review/edit/delete. Memory scope visualization (user/project/local). Skills browser with context budget consumption.

### 6.4 Dual Mode Operation

**GUI Mode (default)**: Full graphical interface with panels, visual diffs, agent dashboard, cost tracking, context meter.

**Terminal Mode**: Full-featured embedded terminal (xterm.js with WebGL renderer) running Claude Code natively. GUI overlays (cost tracker, context meter) remain as floating widgets.

**Hybrid Mode**: Split view — GUI panels on one side, terminal on the other.

### 6.5 Integrated Terminal Emulator

**Technology**: xterm.js with WebGL renderer (GPU-accelerated). Full PTY via Tauri shell plugin. 256-color, truecolor, Unicode, ligatures.

**Per-agent terminals**: Each agent has its own terminal tab. Lazy initialization. Split terminal views within agent panels.

**Overlay widgets**: Cost tracker (always visible, semi-transparent). Context meter. Agent status indicators. Persist in all modes.

### 6.6 Diff Review Interface

**Three-pane viewer**: Original file | Annotated diff | Result after changes. Syntax highlighting via tree-sitter WASM bindings (50+ languages).

**Interactive controls**: Accept all. Accept/reject individual hunks. Edit proposed changes inline. Add line comments. Request revision of specific hunks.

**Diff queue**: Multi-agent review inbox. Badge count for pending reviews. Sort by agent/file/timestamp. Batch approve/reject.

### 6.7 MCP Server Management Panel

**Visual server browser**: Status (connected/disconnected/error). Add via GUI form (name, transport, command/URL, env vars). OAuth flow management. Server logs viewer.

**Transport support**: HTTP, STDIO, SSE — all surfaced as radio buttons.

**Scope management**: Toggle user-scope vs project-scope. Visual indicators.

**Quick-install**: One-click for popular servers (GitHub, Notion, Sentry, Linear, Cloudflare, Docker, Jira).

### 6.8 Scheduled Automations

**Builder**: Cron-like scheduling. Task prompt, model selection, budget limit. Background execution. Results in review inbox.

**Use cases**: Nightly code review, weekly dependency updates, pre-commit security scans, scheduled test analysis.

**Inbox**: Status (success/needs-review/failed). Diff, cost, duration, model. One-click approve/PR creation.

### 6.9 Interactive Plan Mode

When a complex prompt is submitted, the agent generates a hierarchical outline before writing code. The plan renders as an interactive React checklist component, not raw markdown. Users can deselect steps, forcing the model to recalculate its strategy. This ensures architectural alignment before expensive token generation begins.

### 6.10 Planner-Reviewer Workflow

Formalizes the pattern of using Sonnet 4.6 for drafting and Opus 4.6 for review. A "Review Pipeline" dispatches Sonnet to execute in a background worktree, then automatically sends Opus to critique, verify null-safety, and check best practices. Opus presents an interactive list of proposed fixes — replicating a senior engineer reviewing a junior's PR.

### 6.11 Project and Session Management

**Project sidebar**: Tree view of all projects (git repositories). Active/recent/saved sessions per project. Quick-switch without losing state.

**Session persistence**: SQLite database. Survives restarts, reboots, process crashes. Search by content/date/project/model. Forking. Export (markdown, JSON).

**Git integration**: Current branch/status/commits. One-click commit with auto-generated messages. PR creation with templates. Visual worktree manager.

---

## 7. Permission and Security Model

Chief Wiggum inherits Claude Code's permission system and adds a visual layer.

**Permission modes:**
- **Strict**: Approve every file write and bash command (default for new users)
- **Standard**: Approve bash commands, auto-allow file writes in project directory
- **Autonomous**: Auto-approve everything (equivalent to Codex "never"/yolo)
- **Custom**: Granular rules with wildcard patterns (e.g., `Bash(*test*)` auto-allowed)

**Visual permission dialogs**: Rich dialog showing exact command/operation, file path with syntax-highlighted preview, estimated risk level (safe/caution/dangerous), "always allow this pattern" option.

**Sandbox configuration**: GUI for directory access boundaries, network access controls, environment variable management.

**Security protocols**: Multi-layered protection with lightweight model pre-screening for jailbreaking patterns. Agentic tasks isolated within virtualized sandboxes or restricted git worktrees. Strict adherence to ASL-3 standards.

---

## 8. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Desktop framework | Tauri v2 (Rust) | Native webview, tiny footprint, cross-platform, strong security |
| Frontend framework | SolidJS 2.x | Fine-grained reactivity, ~7KB bundle, excellent streaming |
| Styling | TailwindCSS v4 | Utility-first, tree-shaken, dark mode native |
| Terminal emulator | xterm.js + WebGL addon | Industry-standard, GPU-accelerated, full PTY |
| Diff engine | tree-sitter (WASM) + custom renderer | Syntax-aware diffing, 50+ languages |
| State management | SolidJS stores + Tauri event bridge | Reactive frontend synced with Rust backend |
| Database | SQLite (rusqlite) | Session persistence, cost history — embedded, zero-config |
| Process management | tokio + portable-pty | Async Rust for Claude Code subprocesses with full PTY |
| IPC protocol | Tauri v2 commands + events | Type-safe Rust ↔ JS with auto serialization |
| Git operations | git2-rs (libgit2) | Native git without shelling out, worktree management |
| Packaging | Tauri bundler | .dmg (macOS), .msi/.exe (Windows), .deb/.AppImage (Linux) |
| Auto-update | Tauri updater plugin | Delta updates, signature verification, background download |

---

## 9. Data Model

```sql
-- Core tables for Chief Wiggum local storage (SQLite)

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    default_model TEXT DEFAULT 'claude-sonnet-4-6',
    default_effort TEXT DEFAULT 'high',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_opened_at DATETIME
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    title TEXT,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- active, paused, completed, archived
    parent_session_id TEXT REFERENCES sessions(id), -- forked sessions
    context_tokens INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_cents INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    role TEXT NOT NULL, -- user, assistant, system, tool_use, tool_result
    content TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    thinking_tokens INTEGER,
    cost_cents INTEGER,
    is_compacted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    name TEXT,
    role TEXT, -- lead, teammate, background
    model TEXT,
    status TEXT DEFAULT 'idle', -- idle, thinking, executing, waiting, complete, error
    task_description TEXT,
    worktree_path TEXT,
    total_tokens INTEGER DEFAULT 0,
    total_cost_cents INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cost_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    agent_id TEXT REFERENCES agents(id),
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    cost_cents INTEGER NOT NULL,
    event_type TEXT, -- message, tool_call, thinking, compaction
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL, -- session, daily, weekly, monthly
    project_id TEXT REFERENCES projects(id),
    limit_cents INTEGER NOT NULL,
    spent_cents INTEGER DEFAULT 0,
    period_start DATETIME,
    period_end DATETIME
);

CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport TEXT NOT NULL, -- http, stdio, sse
    command_or_url TEXT NOT NULL,
    scope TEXT DEFAULT 'user', -- user, project
    project_id TEXT REFERENCES projects(id),
    status TEXT DEFAULT 'disconnected',
    config_json TEXT
);

CREATE TABLE automations (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT DEFAULT 'claude-sonnet-4-6',
    budget_limit_cents INTEGER,
    cron_expression TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT REFERENCES automations(id),
    status TEXT NOT NULL, -- running, success, needs_review, failed
    result_summary TEXT,
    diff_data TEXT,
    tokens_used INTEGER,
    cost_cents INTEGER,
    started_at DATETIME,
    completed_at DATETIME
);
```

---

## 10. UI Specifications

### 10.1 Global Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  [≡] Chief Wiggum  [Project: myapp ▾]  [◉ Opus 4.6 ▾]   [$2.47]│
├────────┬─────────────────────────────────────────────┬───────────┤
│        │                                             │           │
│  Proj  │          Main Content Area                  │  Details  │
│  Nav   │                                             │  Panel    │
│        │  ┌─────────────────────────────────────┐    │           │
│  □ Ses │  │  Conversation / Agent Dashboard /   │    │  Context  │
│  □ Ses │  │  Diff Review / Terminal             │    │  Meter    │
│  □ Ses │  │                                     │    │  [████░]  │
│        │  │                                     │    │  67%      │
│  ──── │  │                                     │    │           │
│  Agents│  │                                     │    │  Memory   │
│  □ A1  │  │                                     │    │  □ skill1 │
│  □ A2  │  │                                     │    │  □ skill2 │
│  □ A3  │  │                                     │    │           │
│        │  └─────────────────────────────────────┘    │  MCP      │
│  ──── │                                             │  ● GitHub │
│  MCPs  │  ┌─────────────────────────────────────┐    │  ● Linear │
│  ● GH  │  │  Message Input                      │    │  ○ Sentry │
│  ● Lin │  │  [Effort: ●●●○] [Fast Mode: OFF]    │    │           │
│        │  │  [Send] [Attach] [Terminal]          │    │  Cost     │
│        │  └─────────────────────────────────────┘    │  $2.47    │
├────────┴─────────────────────────────────────────────┴───────────┤
│  Status: Agent Team active (3/3 agents) │ Tokens: 47.2K/200K    │
└──────────────────────────────────────────────────────────────────┘
```

### 10.2 Component Catalog

| Component | Purpose | Key Behaviors |
|---|---|---|
| **MessageBubble** | Render single message | Syntax highlighting (tree-sitter), collapsible thinking, tool use indicators, copy/retry |
| **AgentCard** | Display agent status | Mini-terminal preview, progress indicator, model badge (color-coded), token/cost display |
| **CostTracker** | Session cost in status bar | Hover for breakdown, click for analytics, flashes at 80%/95% budget |
| **ContextMeter** | Context utilization gauge | Color-coded zones, click for breakdown, "Compact now" quick action |
| **DiffViewer** | Code diff review | Side-by-side/unified, tree-sitter highlighting, hunk controls, inline commenting |
| **TerminalPane** | Embedded terminal | xterm.js WebGL, resizable splits, floating overlays, search |
| **ModelSelector** | Model switching | Cost comparison tooltip, effort slider, Fast Mode toggle |
| **PermissionDialog** | Approve/deny operations | Syntax-highlighted preview, risk badge, "always allow" checkbox, Y/N/A shortcuts |
| **MCPPanel** | MCP server management | Connection status, add wizard, OAuth flow, server logs, tool counts |
| **AutomationBuilder** | Scheduled tasks | Cron picker, prompt editor, model/budget selectors, test run, history |

### 10.3 Design System

**Color palette (dark theme — default):**

| Token | Value | Usage |
|---|---|---|
| Background | `#0D1117` | App background |
| Surface | `#161B22` | Cards, panels |
| Surface elevated | `#1C2128` | Modals, dropdowns |
| Border | `#30363D` | Dividers, outlines |
| Text primary | `#E6EDF3` | Main content |
| Text secondary | `#8B949E` | Labels, hints |
| Accent | `#E8825A` | Anthropic orange, CTAs |
| Success | `#3FB950` | Completed, Haiku badge |
| Warning | `#D29922` | Budget alerts |
| Error | `#F85149` | Failures, critical |
| Opus badge | `#A371F7` | Purple |
| Sonnet badge | `#58A6FF` | Blue |

**Typography:**
- UI text: system font stack
- Code/terminal: JetBrains Mono or Fira Code (bundled)
- Messages: 15px / 1.6 line-height
- Code blocks: 13px / 1.5 line-height

**Design principles:**
- Information density over whitespace (developer audience)
- Every pixel earns its place — no decorative elements
- Keyboard-first, mouse-optional
- Animations only for state transitions (<200ms)
- Consistent 4px spacing grid

### 10.4 Keybinding Specification

| Action | macOS | Windows/Linux |
|---|---|---|
| New session | Cmd+N | Ctrl+N |
| Open project | Cmd+O | Ctrl+O |
| Toggle terminal | Cmd+T | Ctrl+T |
| Toggle agent dashboard | Cmd+D | Ctrl+D |
| Send message | Enter | Enter |
| Newline in input | Shift+Enter | Shift+Enter |
| Accept all diffs | Cmd+Enter | Ctrl+Enter |
| Reject all diffs | Cmd+Backspace | Ctrl+Backspace |
| Compact context | Cmd+K | Ctrl+K |
| Switch model | Cmd+M | Ctrl+M |
| Navigate agents up/down | Cmd+Shift+↑/↓ | Ctrl+Shift+↑/↓ |
| Kill background agent | Cmd+Shift+F | Ctrl+Shift+F |
| Settings | Cmd+, | Ctrl+, |
| Command palette | Cmd+Shift+P | Ctrl+Shift+P |
| Search sessions | Cmd+Shift+S | Ctrl+Shift+S |
| Toggle sidebar | Cmd+B | Ctrl+B |
| Focus cost tracker | Cmd+Shift+C | Ctrl+Shift+C |

---

## 11. Configuration

### 11.1 File Structure

```
~/.chiefwiggum/
├── config.toml              # Global app settings
├── themes/                  # Custom themes
│   └── custom-dark.toml
├── keybindings.toml         # Custom keybinding overrides
├── db/
│   └── chiefwiggum.sqlite   # All persistent data
└── logs/
    └── chiefwiggum.log      # Application logs (rotated)

# Per-project (inside project directory)
.chiefwiggum/
├── project.toml             # Project-specific settings
└── automations/             # Automation definitions
```

### 11.2 config.toml Example

```toml
[general]
theme = "dark"
default_model = "claude-sonnet-4-6"
default_effort = "high"
startup_mode = "gui"           # gui, terminal, hybrid
auto_update = true

[cost]
currency = "USD"
daily_budget_cents = 2000      # $20/day
weekly_budget_cents = 10000    # $100/week
warn_threshold = 0.8
hard_limit = true

[context]
auto_compact = true
compact_threshold = 0.9
use_1m_context = false
prefer_compaction_api = true

[terminal]
font_family = "JetBrains Mono"
font_size = 14
webgl_renderer = true
scrollback_lines = 10000

[permissions]
default_mode = "standard"
auto_allow_patterns = [
    "Bash(*--help*)",
    "Bash(*--version*)",
    "Bash(*ls*)",
    "Bash(*cat*)",
    "Bash(*grep*)",
]

[agents]
enable_agent_teams = true
max_concurrent_agents = 10
default_agent_model = "claude-sonnet-4-6"
worktree_isolation = true
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Weeks 1–4)

**Goal**: Bootable app that wraps Claude Code with basic GUI messaging.

**Deliverables:**
- Tauri v2 project scaffolding with SolidJS frontend
- Claude Code process bridge (spawn CLI, parse structured output via PTY)
- Basic message conversation UI (send, display with markdown/code rendering)
- Model selector (Opus 4.6 / Sonnet 4.6 / Haiku 4.5)
- Terminal Mode (embedded xterm.js running Claude Code directly)
- Basic session persistence (SQLite)
- Permission dialog system
- Cross-platform packaging (.dmg, .msi, .AppImage)

**Technical risks**: Claude Code output format changes (mitigate with versioned adapter); PTY handling cross-platform differences (mitigate with portable-pty crate).

### Phase 2: Intelligence Layer (Weeks 5–8)

**Goal**: Cost tracking, context management, multi-session support.

**Deliverables:**
- Real-time cost tracking engine (token counting, pricing, budgets)
- CostTracker status bar with drill-down analytics
- ContextMeter with visual gauge and zone coloring
- Compaction controls UI
- "Summarize from here" integration
- Project sidebar with multi-project support
- Session management (persistence, search, forking, resume)
- Effort control slider with cost preview
- Fast Mode toggle
- opusplan visualization
- Settings panel

### Phase 3: Multi-Agent and Diff Review (Weeks 9–12)

**Goal**: Visual Agent Teams orchestration and professional diff review.

**Deliverables:**
- Agent orchestration dashboard (cards, status, controls)
- Agent Teams detection and visual rendering
- Per-agent terminal instances
- Diff review interface (three-pane, hunk controls, commenting)
- Diff queue (inbox pattern)
- Git integration panel (branch, status, commit, PR)
- Worktree manager
- Background agent support

### Phase 4: Extensibility and Polish (Weeks 13–16)

**Goal**: MCP management, automations, production polish.

**Deliverables:**
- MCP server management panel + quick-install templates
- Scheduled automations builder and inbox
- Memory and Skills browser
- Hooks visualization
- Plugin system foundation
- Comprehensive keyboard shortcut system
- Accessibility audit (screen reader, high contrast)
- Performance optimization pass
- Auto-update system
- Onboarding flow
- Documentation and help system

---

## 13. Performance Targets

| Metric | Target | Codex Desktop (Electron) | Improvement |
|---|---|---|---|
| Idle RAM | <80 MB | 300–500 MB | 4–6x less |
| Installer size | <15 MB | ~200 MB | 13x smaller |
| Cold startup | <2 seconds | 4–8 seconds | 2–4x faster |
| Warm startup | <500 ms | 2–4 seconds | 4–8x faster |
| CPU at idle | <1% | 3–8% | 3–8x less |
| Concurrent agents | 10+ | ~5–7 | ~2x capacity |

---

## 14. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CLI output format changes break parser | High | High | Versioned adapter interface, integration tests against multiple versions |
| Anthropic ships official Claude Code GUI | Medium | Critical | Speed-to-market (16 weeks); differentiate on cost tracking + cross-platform |
| Tauri v2 webview inconsistencies | Medium | Medium | Test matrix across all platforms; polyfill where needed |
| xterm.js performance with many terminals | Medium | Medium | Lazy init; limit concurrent PTYs; suspend offscreen rendering |
| Token counting inaccuracy | Low | Medium | Cross-validate against Claude Code usage reports |
| Claude Code deprecates CLI for API-only | Low | High | Maintain fallback direct API mode |

---

## 15. Success Metrics (6 Months Post-Launch)

| Metric | Target |
|---|---|
| RAM usage (idle, 1 session) | <80 MB |
| RAM usage (5 concurrent agents) | <200 MB |
| Cold startup | <2 seconds |
| Installer download size | <15 MB |
| Daily active users | 10,000+ |
| GitHub stars | 5,000+ |
| User cost savings via budget/routing | 30%+ average reduction |
| Cross-platform split | ~50% macOS, ~35% Windows, ~15% Linux |
| NPS score | >50 |
| Crash rate | <0.1% of sessions |

---

## 16. Unique Differentiators

1. **4–6x lighter than Codex Desktop** — Tauri native webview vs Electron Chromium
2. **Cross-platform from day one** — macOS, Windows, Linux simultaneously
3. **Real-time cost intelligence** — Budgets, per-agent cost breakdown, optimization suggestions
4. **Visual context management** — Context meter, intelligent branching, compaction controls
5. **Dual mode (GUI + Terminal)** — Plus hybrid split view
6. **Superior MCP management** — Visual layer on top of Claude Code's full protocol support (HTTP+STDIO+SSE+OAuth)
7. **Open architecture, closed to Claude Code ecosystem** — Wraps CLI, inherits every feature Anthropic ships

---

## Appendix A: Source Documents

This combined specification was synthesized from two source documents:

1. **"Architecture and User Experience Specification for a Next-Generation Claude Code Interface"** — High-level architectural vision, competitive analysis, UX design innovations, Tauri vs Electron analysis, and implementation blueprint.

2. **"ClaudeDesk: Complete Product Specification v2.0"** — Detailed product spec with verified research on model capabilities, complete feature specifications, data models, UI component catalog, design system, and implementation phases.

Where the documents overlapped, the more detailed and actionable specification was retained. Where they diverged (e.g., React vs SolidJS for frontend), the more technically justified choice was adopted with rationale documented in ADR-001.
