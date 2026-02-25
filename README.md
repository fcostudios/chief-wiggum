<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="Chief Wiggum logo" />
</p>

<h1 align="center">Chief Wiggum</h1>

<p align="center">
  <em>"Bake 'em away, toys." — but for Claude Code.</em>
</p>

<p align="center">
  A cross-platform desktop GUI that wraps Claude Code CLI in the warm embrace it never asked for.<br />
  Split-pane conversations. File-aware context tooling. Project Actions. YOLO Mode.<br />
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

It wraps Claude Code workflows in a native desktop UI with persistent sessions, permission handling, project-aware context tools, cost tracking, diagnostics, and keyboard-first navigation.

**The pitch in 10 seconds:** Claude Code in the terminal is excellent. Chief Wiggum adds the desktop ergonomics around it: sessions, context, settings, permissions, cost visibility, and testing/quality rails.

> Current scope note: the **Agents** tab is still a polished placeholder while the core Claude Code + project workflows are already usable.

## Why "Chief Wiggum"?

Every good project needs a codename that has absolutely nothing to do with what it does. Chief Wiggum from The Simpsons is bumbling, lovable, and technically in charge of keeping things safe — much like our permission system. The name stuck.

---

## Highlights

**Native Desktop Shell (Tauri v2)** — Rust backend + system webview. No Electron runtime.

**Claude Code Agent SDK Bridge** — Persistent CLI sessions, structured streaming, permission interception, YOLO mode, and legacy fallback handling.

**Project-Aware Context Tooling** — File explorer, `@` mentions, code-range attachments, context quality scoring, and smart file suggestions.

**Split-Pane Parallel Sessions** — Side-by-side conversation panes, aggregate cost display, and background activity indicators.

**Settings + i18n + Theme System** — Full settings UI (`Cmd+,`), autosave/retry, English + Spanish locale support, and light/dark/system theme modes.

**Project Actions Runner** — Discover/run project commands, stream logs in-app, and hand action output back to the conversation.

**Embedded Terminal** — Full xterm.js pane with WebGL rendering and reactive theming.

**Diagnostics & Reliability** — Structured logging, redacted diagnostic bundle export, and CI coverage with formatting/lint/test gates.

**Playwright E2E + CI Integration** — Browser-mode E2E suite (25 tests) with CI artifact reporting for failures.

**YOLO Mode** — For the brave (or the reckless). One toggle auto-approves permission requests, with loud UI warnings so you know what you're doing.

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

# Frontend checks
npm run format:check
npm run typecheck
npm run lint
npm run build

# Rust checks
cd src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy -- -D warnings

# E2E (from repo root)
cd ..
npm run test:e2e

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

**Frontend:** SolidJS + TailwindCSS v4 + Lucide + xterm.js + `@solid-primitives/i18n`.

**Backend:** Rust + Tokio async runtime. PTY management via `portable-pty`. SQLite with WAL mode for session persistence. Typed error handling and tracing across backend modules.

**Bridge:** Agent SDK control protocol (persistent JSONL sessions) with version-adaptive behavior and legacy CLI fallback paths.

---

## Keyboard Shortcuts

| Shortcut      | Action                                |
| ------------- | ------------------------------------- |
| `Cmd+B`       | Toggle sidebar                        |
| `Cmd+Shift+B` | Toggle details panel                  |
| `Cmd+,`       | Open settings                         |
| `Cmd+/`       | Open keyboard shortcuts help          |
| `Cmd+K`       | Open command palette                  |
| `Cmd+Shift+P` | Session quick-switcher                |
| `Cmd+Shift+T` | Context breakdown modal               |
| `Cmd+\\`      | Split conversation pane               |
| `Cmd+\``      | Toggle terminal / conversation        |
| `Cmd+M`       | Cycle model (Sonnet → Opus → Haiku)   |
| `Cmd+Shift+Y` | Toggle YOLO Mode (you've been warned) |
| `Cmd+1-4`     | Switch views                          |
| `Enter`       | Send message                          |
| `Shift+Enter` | New line in message                   |

---

## Project Status

**Status snapshot (February 25, 2026):**
- **Phase 1: Foundation** — Complete
- **Phase 2: Make It Real (core epics)** — Complete
- **Phase 3: Advanced UX / Context Intelligence** — In progress (major sub-epics shipped; context follow-up remains)

Latest verified snapshot:
- **230 Rust tests passing**
- **25 Playwright E2E tests passing**
- Frontend checks pass (`format:check`, `typecheck`, `lint`, `build`)
- Rust quality gates pass (`cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`)
- DB schema version: **v3**
- CI + release workflows are configured (including E2E job + failure artifacts)

### Phase Progress

| Phase                         | Status             | Notes                                                                      |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------- |
| Phase 1 — Foundation          | Done               | Core scaffolding, CLI bridge, persistence, and base UI shipped             |
| Phase 2 — Make It Real        | Done (core epics)  | Core product UX and workflows delivered; follow-up polish epics largely shipped |
| Phase 3 — Advanced UX / Context Intelligence | In Progress | Agent SDK migration is done; remaining focus is context follow-up (`CHI-131`, `CHI-134`) |

### Recently Shipped (high impact)

- **Agent SDK bridge migration + SDK slash discovery** — persistent CLI sessions, runtime permissions, and slash command discovery from `system:init` (`CHI-101`, `CHI-108`)
- **Context intelligence v1** — file explorer, `@` mentions, range editing, context scoring, smart file suggestions (`CHI-114`, `CHI-123`, `CHI-125`, `CHI-127`, `CHI-133`)
- **Settings / i18n / theme** — settings backend+UI, locale extraction, Spanish locale, light/dark/system themes (`CHI-122`, `CHI-124`, `CHI-126`, `CHI-128`, `CHI-130`)
- **UX hardening** — missing error states, accessibility pass, message edit/regenerate (`CHI-135`, `CHI-136`, `CHI-137`)
- **Parallel sessions v2 follow-through** — split panes, aggregate cost tracking, background activity indicators (`CHI-109`, `CHI-110`, `CHI-112`, `CHI-113`)
- **Power-user + onboarding polish** — context menus, keyboard help overlay, onboarding flow, improved empty states (`CHI-63`, `CHI-64`, `CHI-78`, `CHI-79`, `CHI-81`, `CHI-82`, `CHI-83`)
- **Project Actions** — discover/run project commands, output panel, command palette/status bar integration (`CHI-138` to `CHI-145`)
- **Playwright E2E + CI integration** — layout/conversation/permissions/terminal/integration suites, CI failure artifact reporter (`CHI-27`, `CHI-28..34`)

### What's Next

- **CHI-131** — Token-Optimized Snippets (context intelligence follow-up)
- **CHI-134** — Multi-File Bundles (context intelligence follow-up)
- Manual desktop QA / polish passes for newly shipped onboarding, theming, and E2E-covered flows on release builds

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
| E2E testing        | Playwright        | Regression coverage + CI failure artifacts    |
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
