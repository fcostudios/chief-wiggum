# Chief Wiggum — Project Reference Index

**Last updated:** 2026-02-20
**Purpose:** This document is the entry point for any agent or contributor picking up work on Chief Wiggum. Read this first, then follow the onboarding steps.

---

## 1. Project Overview

**Chief Wiggum** is a cross-platform desktop application (Tauri v2 + Rust + SolidJS) that wraps Claude Code in a polished graphical interface. It targets professional developers who need Claude Code's power with visual multi-agent orchestration, real-time cost tracking, and intelligent context management.

**Read the combined spec first:** `docs/specs/SPEC-001-chief-wiggum-combined.md`

---

## 2. Folder Structure

```
ChiefWiggum/
├── docs/                              # All project documentation
│   ├── specs/                         # Product and technical specifications
│   │   ├── SPEC-001-chief-wiggum-combined.md   # PRD (the "what")
│   │   ├── SPEC-002-design-system.md           # Visual language and tokens
│   │   ├── SPEC-003-ux-design.md               # Screens, flows, interactions
│   │   ├── SPEC-004-architecture.md            # Modules, IPC, data flow
│   │   └── SPEC-005-data-export.md             # Data portability and migration
│   ├── adr/                           # Architecture Decision Records
│   │   ├── ADR-001-initial-architecture.md     # Technology choices
│   │   └── ADR-002-monorepo-structure.md       # Frontend/backend in one repo
│   ├── guides/                        # Developer and process guides
│   │   ├── GUIDE-001-coding-standards.md       # Conventions, patterns, forbidden practices
│   │   └── GUIDE-002-workflow.md               # Priorities, Linear, CI/CD, agent workflow
│   ├── tasks/                         # Implementation task breakdowns (per phase)
│   │   └── TASKS-001-phase1-foundation.md    # Phase 1 tasks synced with Linear
│   └── reference/                     # Reference material
│       ├── INDEX.md                   # ← You are here
│       └── STRATEGY.md               # Strategic decisions and documentation plan
├── src/                               # SolidJS frontend (future)
├── src-tauri/                         # Rust backend (future)
├── assets/                            # Design assets, mockups, icons
├── tests/                             # E2E and cross-platform tests (future)
├── CLAUDE.md                          # Agent auto-briefing (future)
├── Redesigning Claude Code Desktop App.md          # Source doc 1 (archived)
└── compass_artifact_wf-*.md           # Source doc 2 (archived)
```

**Conventions:**
- `docs/specs/` — Numbered `SPEC-NNN-<topic>.md`. Self-contained specifications.
- `docs/adr/` — Numbered `ADR-NNN-<topic>.md`. Architecture Decision Records.
- `docs/guides/` — Numbered `GUIDE-NNN-<topic>.md`. Process and coding guides.
- `docs/tasks/` — Numbered `TASKS-NNN.md`. Per-phase implementation breakdowns.
- `docs/reference/` — Supporting material, indexes, glossaries.

---

## 3. Document Registry

### Specifications

| ID | Title | Purpose | Status |
|---|---|---|---|
| SPEC-001 | Combined PRD | The "what" — product scope, features, competitive analysis, data model, implementation phases, performance targets, risk matrix. **Read this first.** | Draft |
| SPEC-002 | Design System | The visual language — color tokens, typography, spacing, component specs (Button, Card, Badge, etc.), accessibility requirements, Tailwind config. | Draft |
| SPEC-003 | UX Design | The behavior — screen layouts, interaction flows, state machines, keyboard navigation, empty states, error states, loading states. | Draft |
| SPEC-004 | Architecture Deep Dive | The "how" — monorepo structure, Rust modules, SolidJS components, IPC contracts (commands + events), type definitions, error handling, testing strategy. | Draft |
| SPEC-005 | Data Export and Migration | Data portability — JSON/CSV/SQLite export, import with conflict resolution, backup system, schema migration strategy. | Draft |

### Architecture Decision Records

| ID | Title | Key Decision | Status |
|---|---|---|---|
| ADR-001 | Initial Architecture | Tauri v2, SolidJS, CLI wrapper, SQLite, xterm.js, TailwindCSS, tree-sitter | Accepted |
| ADR-002 | Monorepo Structure | Single repo for frontend + backend (standard Tauri layout) | Accepted |

### Guides

| ID | Title | Purpose | Status |
|---|---|---|---|
| GUIDE-001 | Coding Standards | Rust conventions, TypeScript/SolidJS patterns, git workflow, forbidden patterns, code review checklist | Active |
| GUIDE-002 | Workflow and Progress Control | Linear integration, priority system, AI agent workflow, CLAUDE.md usage, release process | Active |

### Task Breakdowns

| ID | Title | Status |
|---|---|---|
| TASKS-001 | Phase 1: Foundation | Not yet created (create before Phase 1 kickoff) |
| TASKS-002 | Phase 2: Intelligence Layer | Not yet created |
| TASKS-003 | Phase 3: Multi-Agent + Diff | Not yet created |
| TASKS-004 | Phase 4: Extensibility + Polish | Not yet created |

### Reference

| Document | Purpose | Status |
|---|---|---|
| INDEX.md | This file — entry point and document registry | Active |
| STRATEGY.md | Strategic decisions: monorepo rationale, document hierarchy, automation strategy, priority system | Active |

### Source Documents (Archived)

| Document | Purpose | Status |
|---|---|---|
| `Redesigning Claude Code Desktop App.md` | Original research: competitive analysis, Claude 4.6 capabilities, Tauri architecture, UX vision | Archived (superseded by SPEC-001) |
| `compass_artifact_wf-*.md` | Detailed product spec v2.0: feature matrix, architecture diagram, data model, UI components | Archived (superseded by SPEC-001) |

---

## 4. Reading Order for Agents

If you are an AI agent (Claude Code, Cursor, OpenCode, etc.) starting work on Chief Wiggum:

### First Session (Orientation)
1. **INDEX.md** (this file) — understand the project structure
2. **SPEC-001** — understand what we're building (full PRD)
3. **ADR-001 + ADR-002** — understand the "why" behind technology choices

### Before Implementing UI
4. **SPEC-002** — design system tokens, component specs
5. **SPEC-003** — screen layouts, interaction flows, state machines

### Before Implementing Backend
6. **SPEC-004** — module structure, IPC contracts, type definitions

### Before Any Code
7. **GUIDE-001** — coding standards, naming, patterns, forbidden practices
8. **GUIDE-002** — branch naming, commit format, PR requirements

### Before Working on Data
9. **SPEC-005** — export formats, migration strategy, backup system

### Active Task Context
10. **CLAUDE.md** (project root) — current phase, active task, specific instructions

---

## 5. Non-Negotiable Constraints

These constraints come from SPEC-001, ADR-001, and ADR-002. They cannot be changed without a new ADR.

| Constraint | Source |
|---|---|
| Desktop framework: Tauri v2 + Rust backend | ADR-001 §2.1 |
| Frontend framework: SolidJS 2.x (not React) | ADR-001 §2.2 |
| Integration: Wrap Claude Code CLI via PTY | ADR-001 §2.3 |
| Database: SQLite via rusqlite | ADR-001 §2.5 |
| Terminal: xterm.js with WebGL addon | ADR-001 §2.6 |
| Styling: TailwindCSS v4, SPEC-002 tokens only | ADR-001 §2.7, SPEC-002 |
| Structure: Single monorepo | ADR-002 |
| Performance: <80 MB idle RAM, <15 MB installer, <2s cold start | SPEC-001 §13 |
| Platforms: macOS, Windows, Linux from day one | SPEC-001 §2.3 |
| Accessibility: WCAG 2.1 AA minimum | SPEC-002 §12 |

---

## 6. How to Add New Documents

### New Specification
1. Create `docs/specs/SPEC-NNN-<topic>.md` with the next available number
2. Include: version, date, status, parent references, audience
3. Add entry to the Document Registry in this file

### New ADR
1. Create `docs/adr/ADR-NNN-<topic>.md`
2. Follow format: Status, Date, Decision, Considered Alternatives, Rationale, Consequences
3. Add to this file's ADR table and to the Decision Log in ADR-001

### New Guide
1. Create `docs/guides/GUIDE-NNN-<topic>.md`
2. Add to the Guides table in this file

### New Task Breakdown
1. Create `docs/tasks/TASKS-NNN.md` following the format in GUIDE-002 §3.2
2. Add to the Task Breakdowns table in this file
3. Create corresponding Linear issues

---

## 7. Glossary

| Term | Definition |
|---|---|
| **Chief Wiggum** | Project codename for the application |
| **ClaudeDesk** | Candidate public-facing product name (not finalized) |
| **Agent Teams** | Claude Code's multi-agent feature (team leads + teammates) |
| **MCP** | Model Context Protocol — external context sources for Claude |
| **Compaction** | Server-side summarization of conversation context to free token space |
| **opusplan** | Workflow: Opus for planning, Sonnet for execution |
| **HUD** | Heads-Up Display — transparent overlay for Computer Use visualization |
| **PTY** | Pseudo-terminal — interface for spawning and communicating with CLI processes |
| **Worktree** | Git feature: multiple working trees from a single repository |
| **IPC** | Inter-Process Communication — Tauri's Rust↔JS bridge |
| **Bridge** | Chief Wiggum's module that spawns and manages Claude Code CLI processes |

---

## 8. Key External Links

| Resource | URL |
|---|---|
| Tauri v2 Documentation | https://v2.tauri.app/ |
| SolidJS Documentation | https://www.solidjs.com/ |
| TailwindCSS v4 | https://tailwindcss.com/ |
| xterm.js | https://xtermjs.org/ |
| tree-sitter | https://tree-sitter.github.io/ |
| Claude Code Docs | https://code.claude.com/docs/ |
| Anthropic API (4.6) | https://platform.claude.com/docs/ |
| git2-rs | https://github.com/rust-lang/git2-rs |
| rusqlite | https://github.com/rusqlite/rusqlite |
| portable-pty | https://github.com/nickelc/portable-pty |
| Lucide Icons | https://lucide.dev/ |
| Linear (project tracking) | https://linear.app/ |
