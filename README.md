<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="Chief Wiggum logo" />
</p>

<h1 align="center">Chief Wiggum</h1>

<p align="center">
  <em>"Bake 'em away, toys." — but for Claude Code.</em>
</p>

<p align="center">
  A cross-platform desktop GUI that wraps Claude Code CLI in the warm embrace it never asked for.<br />
  Visual multi-agent orchestration. Real-time cost tracking. YOLO Mode.<br />
  Built with Tauri v2 + Rust + SolidJS. Electron need not apply.
</p>

<p align="center">
  <a href="https://github.com/fcostudios/chief-wiggum/actions/workflows/ci.yml"><img src="https://github.com/fcostudios/chief-wiggum/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platforms" />
  <img src="https://img.shields.io/badge/Tauri-v2-orange" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## What Is This?

Chief Wiggum is a desktop app for developers who love Claude Code but wish it had... well, a window.

It gives you everything Claude Code CLI does — Opus 4.6, Sonnet 4.6, Agent Teams, MCP, hooks — wrapped in a native desktop experience that doesn't eat your RAM for breakfast like certain Electron-based competitors we won't name (we'll name them: Codex Desktop App).

**The pitch in 10 seconds:** Claude Code is a beast. The terminal is great. But when you're orchestrating multiple agents, tracking costs across sessions, reviewing diffs, and managing permissions — a real GUI matters. That's Chief Wiggum.

## Why "Chief Wiggum"?

Every good project needs a codename that has absolutely nothing to do with what it does. Chief Wiggum from The Simpsons is bumbling, lovable, and technically in charge of keeping things safe — much like our permission system. The name stuck.

---

## Highlights

**Native & Lightweight** — Tauri v2 means no bundled Chromium. The app ships under 15 MB. Your laptop fans can finally rest.

**Visual Agent Orchestration** — See all your Claude agents in one place. Dispatch tasks, monitor progress, review results. Like air traffic control, but for code.

**Real-Time Cost Intelligence** — Watch your API spend in real-time with per-session breakdowns. Set budgets. Get warnings before Opus 4.6 bankrupts your side project.

**YOLO Mode** — For the brave (or the reckless). One toggle auto-approves every permission request. A pulsing lightning bolt reminds you that you're living dangerously. Named after what the community already calls `--dangerously-skip-permissions`.

**Cross-Platform From Day One** — macOS, Windows, Linux. Not "macOS first and we'll think about it."

**Embedded Terminal** — Full xterm.js with WebGL rendering. `Cmd+\`` toggles between GUI and raw terminal. Best of both worlds.

---

## Quick Start

> **Prerequisites:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated.

### Download

Grab the latest release for your platform:

| Platform          | Download                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| macOS (Universal) | [`.dmg`](https://github.com/fcostudios/chief-wiggum/releases/latest)      |
| Windows           | [`.msi`](https://github.com/fcostudios/chief-wiggum/releases/latest)      |
| Linux             | [`.AppImage`](https://github.com/fcostudios/chief-wiggum/releases/latest) |

### Build From Source

```bash
# Clone the repo
git clone https://github.com/fcostudios/chief-wiggum.git
cd chief-wiggum

# Install dependencies
npm install

# Run in dev mode (Rust compiles on first run — go get coffee)
npm run tauri dev

# Build for production
npm run tauri build
```

**Requirements:** Rust 1.75+, Node.js 20+, platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Chief Wiggum App                 │
│                                              │
│  ┌─────────────┐    IPC    ┌──────────────┐  │
│  │   SolidJS   │◄────────►│  Rust Backend │  │
│  │  Frontend   │  (Tauri)  │   (Tokio)    │  │
│  │             │           │              │  │
│  │ • UI Views  │           │ • CLI Bridge │  │
│  │ • Stores    │           │ • PTY Mgmt   │  │
│  │ • Terminal  │           │ • SQLite DB  │  │
│  │ • Themes    │           │ • Permissions│  │
│  └─────────────┘           └──────┬───────┘  │
│                                   │          │
│                              PTY / stdin     │
│                                   │          │
│                            ┌──────▼───────┐  │
│                            │  Claude Code  │  │
│                            │     CLI       │  │
│                            └──────────────┘  │
└──────────────────────────────────────────────┘
```

**Frontend:** SolidJS 2.x + TailwindCSS v4 — fine-grained reactivity, ~7 KB JS bundle. No virtual DOM.

**Backend:** Rust + Tokio async runtime. PTY management via `portable-pty`. SQLite with WAL mode for session persistence. Zero `.unwrap()` in production — every function returns `Result`.

**Bridge:** Structured JSON parsing of Claude Code's `--output-format stream-json`. Version-adaptive adapter system so CLI updates don't break things.

---

## Keyboard Shortcuts

| Shortcut      | Action                                |
| ------------- | ------------------------------------- |
| `Cmd+B`       | Toggle sidebar                        |
| `Cmd+Shift+B` | Toggle details panel                  |
| `Cmd+\``      | Toggle terminal / conversation        |
| `Cmd+M`       | Cycle model (Sonnet → Opus → Haiku)   |
| `Cmd+Shift+Y` | Toggle YOLO Mode (you've been warned) |
| `Cmd+1-4`     | Switch views                          |
| `Enter`       | Send message                          |
| `Shift+Enter` | New line in message                   |

---

## Project Status

**Status snapshot (February 23, 2026):**
- **Phase 1: Foundation** — Complete
- **Phase 2: Make It Real (core epics)** — Complete
- **Phase 3: Agent SDK Integration / Advanced UX** — In progress (partial delivery)

Latest verified snapshot:
- **144 Rust tests passing**
- Frontend checks pass (`typecheck`, `lint`, `build`)
- DB schema version: **v3**
- CI + release workflows are configured

### Phase Progress

| Phase                         | Status             | Notes                                                                      |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------- |
| Phase 1 — Foundation          | Done               | Core scaffolding, CLI bridge, persistence, and base UI shipped             |
| Phase 2 — Make It Real        | Done (core epics)  | Core product UX and workflows delivered; polish work continues in follow-up epics |
| Phase 3 — Agent SDK Integration | In Progress      | `CHI-101` (Agent SDK migration) remains the major pending architecture milestone |

### Recently Shipped (high impact)

- **Slash commands (Phase A)** — command discovery + inline `/` autocomplete (`CHI-106`, `CHI-107`)
- **File Explorer + `@` mentions** — file tree, preview, code-range selection, prompt context assembly (`CHI-114` / `CHI-115..119`)
- **Inline tool diff previews** — conversation diff preview + "Open in Diff" bridge (`CHI-92`)
- **Sidebar polish additions** — session actions menu + inline rename + duplicate (`CHI-86`)
- **Platform feel improvements** — macOS vibrancy chrome enhancements (`CHI-69`)

### What's Next

- **CHI-101** — Agent SDK control protocol migration (high-priority architectural upgrade)
- Follow-up Phase 3 epics already defined in Linear/specs:
  - **CHI-120** Settings & i18n
  - **CHI-121** Context Intelligence
  - **CHI-129** UX Hardening

---

## Tech Stack

| Layer              | Technology        | Why                                           |
| ------------------ | ----------------- | --------------------------------------------- |
| Desktop framework  | Tauri v2          | Native webview, tiny footprint, Rust security |
| Frontend           | SolidJS 2.x       | Fine-grained reactivity, ~7 KB, no VDOM       |
| Styling            | TailwindCSS v4    | Utility-first, dark mode native               |
| Terminal           | xterm.js + WebGL  | GPU-accelerated, full PTY support             |
| Backend runtime    | Tokio             | Async Rust, battle-tested                     |
| Database           | SQLite (rusqlite) | Embedded, zero-config, WAL mode               |
| Process management | portable-pty      | Cross-platform PTY spawning                   |
| CI/CD              | GitHub Actions    | Matrix builds (macOS, Windows, Ubuntu)        |

---

## Contributing

We welcome contributions. Whether you're fixing a typo or adding a whole new feature, the process is the same:

1. Check the [Linear team board](https://linear.app/chief-wiggum/team/CHI/all) for open issues
2. Fork the repo and create a branch: `chi-{number}-{slug}`
3. Read `CLAUDE.md` — it's the auto-briefing for any coding session (human or AI)
4. Read `docs/guides/GUIDE-001-coding-standards.md` — the non-negotiable rules
5. Make your changes. Write tests.
6. Submit a PR. Reference the Linear issue.

**For AI-assisted development:** This repo is designed to be worked on by both humans and AI agents. The `CLAUDE.md` file and `.claude/handover.json` system enable seamless handoff between Cowork, Claude Code, and human developers.

---

## Documentation

All specs and guides live in `docs/`:

| Document    | What it covers                                     |
| ----------- | -------------------------------------------------- |
| `SPEC-001`  | Product requirements — the "what"                  |
| `SPEC-002`  | Design system tokens — colors, spacing, typography |
| `SPEC-003`  | UX design — screens, flows, interactions           |
| `SPEC-004`  | Architecture — modules, IPC contracts, types       |
| `SPEC-005`  | Data export and migration                          |
| `GUIDE-001` | Coding standards — the law                         |
| `GUIDE-002` | Workflow and Linear integration                    |

---

## License

MIT. Do what you want. Just don't blame us if YOLO Mode deletes your production database.

---

<p align="center">
  <sub>Built with equal parts Rust, TypeScript, and questionable Simpsons references.</sub>
</p>
