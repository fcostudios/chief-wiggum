# Chief Wiggum — Project Strategy and Documentation Plan

**Version:** 1.0
**Date:** 2026-02-20
**Author:** Francisco Colomas
**Purpose:** Answers the strategic questions about project organization, documentation hierarchy, priority management, and automation. This is the "how we work" document.

---

## 1. Answering the Strategic Questions

### Q1: Should frontend and backend be separate projects?

**Answer: Single monorepo, but logically separated.**

Tauri v2 projects already enforce a clean physical separation: the Rust backend lives in `src-tauri/` and the SolidJS frontend lives alongside it (we'll use `src/frontend/`). They share a single `Cargo.toml` + `package.json` at the root. This is the right call for several reasons:

- **IPC contract is tightly coupled.** Every Tauri command defined in Rust has a corresponding TypeScript type on the frontend. Splitting repos would require a separate shared types package and versioning overhead that adds friction without benefit at this scale.
- **Atomic commits.** A feature like "add effort slider" touches a Rust command, a SolidJS component, and possibly the SQLite schema. These should land in one commit and one PR.
- **Agent-friendly.** A coding agent given a single repo can read the Rust command signature and the component that calls it in one context window. Cross-repo navigation is a massive context tax.
- **Industry standard.** Tauri's official recommendation is monorepo. The Codex Desktop App (Rust CLI + web frontend) also uses a monorepo.

**When to split:** Only if we later add a separate backend service (e.g., a sync server for team features). That would be a new repo.

**Repo structure:**
```
chief-wiggum/
├── src-tauri/              # Rust backend (Tauri core)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/       # IPC command handlers
│   │   ├── bridge/         # Claude Code process bridge
│   │   ├── cost/           # Cost tracking engine
│   │   ├── db/             # SQLite operations
│   │   ├── git/            # git2-rs operations
│   │   └── mcp/            # MCP server management
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # SolidJS frontend
│   ├── components/         # UI components (see Design System)
│   ├── stores/             # SolidJS reactive stores
│   ├── layouts/            # Page layouts
│   ├── lib/                # Shared utilities, IPC wrappers
│   ├── styles/             # TailwindCSS config, global styles
│   └── App.tsx
├── docs/                   # All documentation (specs, ADRs, guides)
├── .github/                # CI/CD, PR templates, issue templates
├── tests/                  # E2E tests, integration tests
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── CLAUDE.md               # Agent instructions for this project
```

### Q2: How to break the consolidated spec into sub-documents?

**Answer: A hierarchical document tree with clear dependency chains.**

SPEC-001 is the PRD (Product Requirements Document) — the "what." It should stay as the single source of truth for product scope. But implementation requires decomposing it into actionable sub-specs that a coding agent can consume one at a time without needing to read 800 lines of context.

**Document hierarchy:**

```
SPEC-001: Combined PRD (the "what")
├── SPEC-002: Design System (visual language, tokens, components)
├── SPEC-003: UX Design Specification (screens, flows, interactions)
├── SPEC-004: Architecture Deep Dive (the "how" — modules, APIs, data flow)
├── SPEC-005: Data Export and Migration (SQLite portability)
│
├── ADR-001: Initial Architecture Decisions (already exists)
├── ADR-002+: Future decisions as they arise
│
├── GUIDE-001: Agent/Developer Coding Standards
├── GUIDE-002: Workflow, Priorities, and Progress Control
│
└── TASKS-NNN: Implementation task specs (one per Linear epic)
    ├── TASKS-001: Phase 1 — Foundation
    ├── TASKS-002: Phase 2 — Intelligence Layer
    ├── TASKS-003: Phase 3 — Multi-Agent + Diff Review
    └── TASKS-004: Phase 4 — Extensibility + Polish
```

**Key principle:** Each document is self-contained enough that an agent can read it in isolation and produce working code. Cross-references use relative links, not implicit knowledge.

### Q3: Do we need a design system specification?

**Answer: Absolutely yes. It's one of the most important documents for consistency.**

Without a design system spec, every agent or developer making a component will improvise colors, spacing, typography, and component APIs. Over 16 weeks of development with potentially multiple agents working in parallel, this produces a Frankenstein UI.

The design system spec (SPEC-002) will define: color tokens, typography scale, spacing grid, component API contracts (props, variants, states), animation standards, accessibility requirements, and dark/light theme tokens. Every component a developer builds must reference SPEC-002.

### Q4: Expanded UX design specs?

**Answer: Yes — SPEC-003 will be the UX reference that the PRD and task specs point to.**

SPEC-001 describes features. SPEC-003 describes how those features look and feel — screen-by-screen layouts, interaction flows (what happens when you click X), state transitions, responsive behavior, and keyboard navigation paths. Think of it as the wireframe document that a coding agent can use to build the exact right UI without guessing.

### Q5: How to organize priorities and control progress?

**Answer: Linear epics + markdown task specs + CLAUDE.md agent instructions.**

The system works in three layers:

1. **Markdown TASKS-NNN specs** (source of truth) — One per implementation phase. Each contains a numbered list of tasks with acceptance criteria, dependencies, and estimated complexity. These live in the repo and any agent can read them.

2. **Linear epics and issues** (active tracking) — Mirror the TASKS specs into Linear. Each task becomes a Linear issue with labels for phase, priority, and component area. This gives you the kanban board, cycle tracking, and progress dashboards.

3. **CLAUDE.md** (agent autopilot) — A project-root file that any Claude Code instance reads automatically. Contains: current phase, active tasks, coding standards reference, and "do not" rules. This is the automated briefing that keeps agents aligned without human intervention.

### Q6: Coding guides for agent/developer?

**Answer: GUIDE-001 will be comprehensive — this is the highest-leverage document for automation.**

When an agent starts working, the quality of its output is directly proportional to the quality of the instructions it receives. GUIDE-001 will cover: language-specific conventions (Rust style, TypeScript style), naming conventions, file organization rules, error handling patterns, testing requirements, commit message format, PR description template, and forbidden patterns. This gets referenced in CLAUDE.md so every agent session inherits it.

### Q7: Data export/migration feature?

**Answer: Yes — added as SPEC-005 and incorporated into the Phase 2 deliverables.**

This is a smart addition. Users need confidence that their data (sessions, cost history, automations) is portable. SPEC-005 will define: export formats (JSON, CSV, SQLite dump), import/restore workflow, schema versioning and migration strategy, and backup/restore commands.

---

## 2. Priority Organization: The Three-Ring System

### Ring 1: Must-Ship (blocks everything else)
Phase 1 deliverables — bootable app, CLI bridge, basic messaging, terminal mode, session persistence, cross-platform packaging.

### Ring 2: Must-Ship (defines the product)
Phase 2 deliverables — cost tracking, context management, model routing, effort controls. These are the features that differentiate Chief Wiggum from just being "a GUI for Claude Code."

### Ring 3: Competitive Parity + Delight
Phases 3–4 — Agent orchestration dashboard, diff review, MCP management, automations. These match and then surpass Codex Desktop.

### Progress Control Cadence

| Cadence | Activity | Tool |
|---|---|---|
| Per-task | Agent reads TASKS spec + GUIDE-001, produces code, creates PR | Claude Code + CLAUDE.md |
| Per-PR | Automated: lint, type-check, test, build. Manual: review diff, check against spec. | GitHub Actions + Linear |
| Weekly | Review completed Linear issues vs plan. Update TASKS-NNN status. | Linear dashboard |
| Per-phase | Demo, performance benchmark vs targets, update SPEC-001 status. | Manual review |

---

## 3. Complete Document Inventory (Target State)

After this session, the `docs/` folder will contain:

### Specifications (`docs/specs/`)
| ID | Title | Purpose |
|---|---|---|
| SPEC-001 | Combined PRD | What we're building (product scope, features, data model, phases) |
| SPEC-002 | Design System | Visual language (tokens, components, variants, accessibility) |
| SPEC-003 | UX Design | Screen layouts, interaction flows, state machines, keyboard nav |
| SPEC-004 | Architecture Deep Dive | Module decomposition, IPC contracts, data flow, error handling |
| SPEC-005 | Data Export and Migration | SQLite portability, schema versioning, backup/restore |

### Architecture Decision Records (`docs/adr/`)
| ID | Title | Purpose |
|---|---|---|
| ADR-001 | Initial Architecture | Technology choices (Tauri, SolidJS, CLI wrapper, SQLite, etc.) |
| ADR-002+ | (future) | New decisions as they arise during implementation |

### Guides (`docs/guides/`)
| ID | Title | Purpose |
|---|---|---|
| GUIDE-001 | Agent/Developer Coding Standards | Language conventions, patterns, testing, commits, forbidden patterns |
| GUIDE-002 | Workflow and Progress Control | Linear integration, CLAUDE.md usage, PR process, cadence |

### Task Specifications (`docs/tasks/`)
| ID | Title | Purpose |
|---|---|---|
| TASKS-001 | Phase 1: Foundation | Detailed task breakdown with acceptance criteria and dependencies |
| TASKS-002 | Phase 2: Intelligence Layer | (produced before Phase 2 starts) |
| TASKS-003 | Phase 3: Multi-Agent + Diff | (produced before Phase 3 starts) |
| TASKS-004 | Phase 4: Extensibility | (produced before Phase 4 starts) |

### Reference (`docs/reference/`)
| ID | Title | Purpose |
|---|---|---|
| INDEX.md | Project Index | Entry point, document registry, onboarding guide, glossary |
| STRATEGY.md | Strategy | This document — the "how we work" answers |

---

## 4. Automation Strategy

### CLAUDE.md (Auto-Briefing)
Every Claude Code session in this repo will automatically read `CLAUDE.md` at the project root. This file will contain:
- Current phase and active tasks
- Pointers to GUIDE-001 and the active TASKS spec
- Non-negotiable constraints
- Common pitfalls and "do not" rules

### Linear ↔ Markdown Sync
- Markdown TASKS specs are the source of truth
- Linear issues are created from them (can be automated with a script)
- Status updates flow: agent completes task → PR merged → Linear issue closed → TASKS spec updated

### CI/CD Quality Gates
- Every PR runs: `cargo clippy`, `cargo test`, TypeScript type-check, ESLint, Tailwind class validation, bundle size check
- Phase milestones include: performance benchmarks vs SPEC-001 targets, accessibility audit, cross-platform build verification

---

## 5. What Gets Produced Now vs Later

### This Session (now)
- SPEC-002: Design System ✓
- SPEC-003: UX Design ✓
- SPEC-004: Architecture Deep Dive ✓
- SPEC-005: Data Export and Migration ✓
- GUIDE-001: Coding Standards ✓
- GUIDE-002: Workflow and Progress ✓
- Updated INDEX.md ✓
- ADR-002: Frontend/Backend Monorepo Decision ✓

### Before Phase 1 Kickoff
- TASKS-001: Phase 1 task breakdown
- CLAUDE.md: Agent auto-briefing file
- Linear project + epic + issues setup
- GitHub repo initialization with CI/CD

### Before Each Subsequent Phase
- TASKS-NNN for that phase
- Updated CLAUDE.md with new active tasks
- Linear issues created from TASKS spec
