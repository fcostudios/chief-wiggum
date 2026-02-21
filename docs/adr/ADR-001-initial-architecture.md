# ADR-001: Initial Architecture Decisions for Chief Wiggum

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Francisco Colomas
**Context:** Initial project setup and technology selection

---

## 1. Context

Chief Wiggum aims to be a cross-platform, lightweight desktop GUI for Claude Code that outperforms the Codex Desktop App in UX while being dramatically lighter. Two specification documents were produced during the research phase analyzing the competitive landscape, Claude 4.6 model capabilities, and available desktop frameworks. This ADR captures the key architectural decisions made during the consolidation of those specs into a single actionable blueprint.

---

## 2. Decisions

### 2.1 Desktop Framework: Tauri v2 over Electron

**Decision:** Use Tauri v2 with a Rust backend.

**Considered alternatives:**
- **Electron** — Used by Codex Desktop App. Bundles Chromium + Node.js. Proven ecosystem.
- **Flutter** — Cross-platform with native compilation. Strong mobile story.
- **Native per-platform** — Swift/AppKit (macOS), WinUI (Windows), GTK (Linux). Maximum performance.

**Rationale:**
- Electron's bundled Chromium imposes 200–400 MB idle RAM. Users of the current Claude Code Desktop (Electron-based) report freezing, glitching, and hanging. This is the #1 UX complaint we must solve.
- Tauri v2 uses the OS-native webview (WKWebView/WebView2/WebKitGTK), targeting <80 MB RAM and <15 MB installer — an order-of-magnitude improvement.
- Rust backend provides true multi-threading for heavy operations (token serialization, file I/O, git operations) without blocking the UI.
- Tauri 2.0's multi-window capability system supports the HUD overlay and per-agent webviews.
- Native per-platform would maximize performance but triple the development effort and maintenance burden.
- Flutter lacks mature desktop terminal emulation (xterm.js) and tree-sitter integration that the web stack provides.

**Consequences:**
- Must handle WebView inconsistencies across macOS Safari/WebKit, Windows WebView2, and Linux WebKitGTK.
- Cannot use Node.js libraries directly in the backend; must find Rust equivalents or use IPC.
- Smaller ecosystem of Tauri plugins compared to Electron.

### 2.2 Frontend Framework: SolidJS over React

**Decision:** Use SolidJS 2.x for the frontend.

**Considered alternatives:**
- **React 19** — Industry standard, massive ecosystem, recommended in the first spec document.
- **Svelte 5** — Compiled reactivity, small bundles.
- **Vue 3** — Middle ground between React and Svelte.

**Rationale:**
- The first spec document recommended React 19 with Zustand. The second spec recommended SolidJS. After analysis, SolidJS was chosen because:
  - Fine-grained reactivity without virtual DOM diffing is critical for rendering streaming token output from multiple agents simultaneously without frame drops.
  - ~7KB bundle size vs React's ~40KB+ reduces initial load and memory pressure.
  - SolidJS stores integrate cleanly with Tauri's event system for real-time state synchronization.
  - The application's performance-critical rendering paths (terminal emulation, streaming tokens, multiple agent panels) benefit directly from avoiding vDOM reconciliation overhead.
- React was considered for its ecosystem size, but the components needed (terminal emulation via xterm.js, code highlighting via tree-sitter) are framework-agnostic.

**Consequences:**
- Smaller hiring pool familiar with SolidJS.
- Fewer off-the-shelf component libraries (mitigated by using unstyled primitives).
- Team must learn SolidJS idioms (signals, effects, stores).

### 2.3 Integration Strategy: CLI Wrapper over API Reimplementation

**Decision:** Wrap the Claude Code CLI as a subprocess via PTY rather than reimplementing against the Anthropic API directly.

**Considered alternatives:**
- **Direct Anthropic API integration** — Call the API directly, implementing all tooling, permissions, and agent logic.
- **Claude Code as a library** — Import Claude Code's internals as a dependency.

**Rationale:**
- The Claude Code CLI already implements Agent Teams, hooks, skills, MCP server management, permissions, memory, compaction, and dozens of tool integrations. Reimplementing this is months of work that would always lag behind.
- By spawning the `claude` CLI via PTY, Chief Wiggum inherits every feature Anthropic ships, immediately. When Claude Code v2.2 drops, Chief Wiggum supports it without code changes.
- Claude Code is closed-source, so library-level integration is not available.
- The Codex Desktop App's open-source CLI demonstrates that the "app wraps CLI" pattern is viable at scale.

**Consequences:**
- Chief Wiggum depends on the Claude Code CLI being installed and updated separately.
- CLI output format changes could break the parser — must abstract behind a versioned adapter interface with integration tests.
- Cannot modify Claude Code's internal behavior, only observe and augment it.
- If Anthropic deprecates the CLI in favor of API-only, Chief Wiggum needs a fallback direct API mode.

### 2.4 State Management: SolidJS Stores + Tauri Events

**Decision:** Use SolidJS reactive stores for frontend state, synchronized with the Rust backend via Tauri's event system and IPC commands.

**Rationale:**
- SolidJS stores provide fine-grained reactivity — only components that depend on changed data re-render.
- Tauri's `#[tauri::command]` system provides type-safe Rust↔JS communication.
- The Rust backend owns the source of truth (session state, cost tracking, agent status) and emits events that the frontend subscribes to.
- No need for a separate state management library (Redux, Zustand, etc.).

**Consequences:**
- State synchronization logic lives across two layers (Rust + JS).
- Must carefully design event schemas to prevent over-emitting and UI stuttering.

### 2.5 Data Storage: SQLite via rusqlite

**Decision:** Use SQLite for all local persistent data (sessions, messages, costs, budgets, settings).

**Rationale:**
- Zero-config, embedded, single-file database.
- Handles the expected data volumes easily (thousands of sessions, millions of messages over time).
- Excellent Rust support via `rusqlite` crate.
- Session data, cost history, and automation state all benefit from relational querying.
- File-based — easy to backup, migrate, and inspect.

**Consequences:**
- No multi-device sync out of the box (acceptable for v1; could add sync layer later).
- Must handle schema migrations as the app evolves.

### 2.6 Terminal Emulation: xterm.js with WebGL

**Decision:** Use xterm.js with the WebGL addon for embedded terminal emulation.

**Rationale:**
- Industry standard for web-based terminal emulation.
- WebGL renderer provides GPU-accelerated text rendering — critical when running multiple terminals simultaneously.
- Full PTY support via Tauri's shell plugin + `portable-pty` Rust crate.
- Supports 256-color, truecolor, Unicode, ligatures.
- Framework-agnostic — works in SolidJS, React, or plain JS.

**Consequences:**
- WebGL support varies across OS webviews (must test on all platforms).
- Multiple concurrent terminals consume PTY file descriptors — must implement lazy initialization and suspension.

### 2.7 Styling: TailwindCSS v4

**Decision:** Use TailwindCSS v4 for all styling.

**Rationale:**
- Utility-first approach with tree-shaking produces minimal CSS bundles.
- Native dark mode support (the default theme for Chief Wiggum).
- Consistent design system with 4px spacing grid.
- v4 offers improved performance over v3.
- Well-documented, large community, works with any JS framework.

**Consequences:**
- HTML/JSX is more verbose with utility classes.
- Custom component styling requires Tailwind configuration extensions.

### 2.8 Diff Engine: tree-sitter (WASM)

**Decision:** Use tree-sitter compiled to WASM for syntax-aware diff rendering.

**Rationale:**
- Provides accurate syntax highlighting for 50+ languages.
- WASM compilation runs in the webview without native dependencies.
- Syntax-aware diffing can group changes more intelligently than line-based diffing.
- Same engine used by many modern editors (Zed, Neovim, Helix).

**Consequences:**
- WASM loading adds startup cost for the diff viewer (mitigated by lazy loading).
- Must bundle grammar files for supported languages.

### 2.9 Project Name: Chief Wiggum (Codename)

**Decision:** Use "Chief Wiggum" as the project codename during development. The second spec document uses "ClaudeDesk" as a potential public name.

**Rationale:**
- Internal codenames reduce attachment to names that may need to change for branding/legal reasons.
- "ClaudeDesk" is a candidate for the public-facing name but this decision is deferred.

---

## 3. Deferred Decisions

| Decision | Reason for Deferral | Target Phase |
|---|---|---|
| Public product name | Branding review needed | Pre-launch |
| Offline/local model fallback | Tier 3 feature, not critical path | Post-v1 |
| Collaborative/team features | Requires server infrastructure | Post-v1 |
| Plugin marketplace architecture | Needs community adoption first | Phase 4+ |
| Computer Use HUD implementation | Depends on Claude API stability | Phase 3–4 |
| Open-source licensing | Business decision pending | Pre-launch |

---

## 4. Decision Log

| # | Decision | Date | Status |
|---|---|---|---|
| 2.1 | Tauri v2 over Electron | 2026-02-20 | Accepted |
| 2.2 | SolidJS over React | 2026-02-20 | Accepted |
| 2.3 | CLI wrapper over API reimplementation | 2026-02-20 | Accepted |
| 2.4 | SolidJS stores + Tauri events | 2026-02-20 | Accepted |
| 2.5 | SQLite via rusqlite | 2026-02-20 | Accepted |
| 2.6 | xterm.js with WebGL | 2026-02-20 | Accepted |
| 2.7 | TailwindCSS v4 | 2026-02-20 | Accepted |
| 2.8 | tree-sitter WASM for diffs | 2026-02-20 | Accepted |
| 2.9 | Chief Wiggum codename | 2026-02-20 | Accepted |
