# GUIDE-002: Workflow, Priorities, and Progress Control

**Version:** 1.0
**Date:** 2026-02-20
**Status:** Active
**Audience:** Francisco (project lead), all developers, AI coding agents

---

## 1. Purpose

This guide defines how work flows from specification to shipped code, how priorities are managed, how progress is tracked, and how AI agents integrate into the workflow. It bridges the gap between the "what" (specs) and the "how" (daily execution).

---

## 2. Tool Chain

| Tool | Role | Source of Truth? |
|---|---|---|
| **Markdown docs** (this repo) | Specifications, ADRs, guides, task breakdowns | Yes — for requirements and architecture |
| **Linear** | Sprint tracking, issue management, progress dashboards | Yes — for current status and assignment |
| **GitHub** | Code hosting, PRs, CI/CD, code review | Yes — for code |
| **CLAUDE.md** | Agent auto-briefing (read automatically by Claude Code) | No — derived from specs and Linear |

---

## 3. Work Flow: Spec → Linear → Code → PR → Ship

### 3.1 The Pipeline

```
Specification (docs/specs/)
    │
    ▼
Task Breakdown (docs/tasks/TASKS-NNN.md)
    │
    ▼
Linear Issues (created from task breakdown)
    │
    ▼
Branch + Implementation (by developer or AI agent)
    │
    ▼
Pull Request (against main branch)
    │
    ▼
CI Checks (automated: lint, type-check, test, build)
    │
    ▼
Code Review (human or AI review against specs + GUIDE-001)
    │
    ▼
Merge to main
    │
    ▼
Linear Issue → Done, TASKS spec updated
```

### 3.2 Task Breakdown Format

Each `TASKS-NNN.md` file follows this structure:

```markdown
# TASKS-001: Phase 1 — Foundation

## Task 1.1: Scaffold Tauri v2 project
**Linear Issue:** CW-1
**Priority:** P0 (blocks everything)
**Estimated Effort:** 1 day
**Dependencies:** None
**Spec References:** SPEC-004 Section 2 (repo structure), ADR-001, ADR-002

### Acceptance Criteria
- [ ] `cargo tauri dev` launches an empty window on macOS, Windows, Linux
- [ ] SolidJS renders "Hello Chief Wiggum" in the webview
- [ ] TailwindCSS v4 is configured with SPEC-002 tokens
- [ ] `cargo tauri build` produces installers for all three platforms
- [ ] CI pipeline runs lint + type-check + build on all platforms

### Implementation Notes
Start with `cargo create-tauri-app` and customize per SPEC-004 Section 2.
Ensure `tauri.conf.json` sets minimum window size to 1024x640 per SPEC-003.
```

### 3.3 Linear Integration

**Linear workspace structure:**

```
Team: Chief Wiggum
├── Project: Phase 1 — Foundation
│   ├── Epic: Core Scaffolding
│   │   ├── CW-1: Scaffold Tauri v2 project
│   │   ├── CW-2: Configure SolidJS + TailwindCSS
│   │   └── ...
│   ├── Epic: CLI Bridge
│   │   ├── CW-10: Implement PTY process spawning
│   │   └── ...
│   └── Epic: Basic UI
│       ├── CW-20: Implement main layout shell
│       └── ...
├── Project: Phase 2 — Intelligence Layer
│   └── (created when Phase 1 nears completion)
└── ...
```

**Labels:**
- `P0` (blocks everything), `P1` (high), `P2` (medium), `P3` (nice-to-have)
- `frontend`, `backend`, `docs`, `ci`, `design`
- `bug`, `feature`, `refactor`, `tech-debt`

**Cycles:** 2-week cycles aligned with phase milestones.

---

## 4. Priority System

### 4.1 Priority Definitions

| Priority | Definition | Response Time | Example |
|---|---|---|---|
| **P0** | Blocks the current phase. Nothing else can progress. | Start immediately | Tauri scaffolding, CLI bridge |
| **P1** | Critical for the current phase. Must ship in this cycle. | Start within 1 day | Session persistence, message UI |
| **P2** | Important but not blocking. Can slip to next cycle. | Start within 3 days | Settings panel, keyboard shortcuts |
| **P3** | Nice-to-have. Ship if time allows. | Backlog | Custom themes, export CSV |

### 4.2 Priority Rules

- Only P0 and P1 issues are assigned in a cycle. P2/P3 are backlog.
- A new P0 can preempt an in-progress P1 (but not another P0 without Francisco's approval).
- Bugs in shipped features are automatically P1 (P0 if they cause crashes).
- Tech debt is P2 unless it's causing bugs (then P1) or blocking features (then P0).

### 4.3 Phase Gate Criteria

A phase is not complete until all P0 and P1 issues are Done.

| Phase | Gate Criteria |
|---|---|
| Phase 1 | App boots, wraps Claude Code, basic messaging works, cross-platform builds pass, performance targets met (<80MB idle) |
| Phase 2 | Cost tracker is accurate, context meter works, effort slider is functional, session persistence works across restarts |
| Phase 3 | Agent dashboard renders Agent Teams, diff review handles multi-agent diffs, worktree manager works |
| Phase 4 | MCP panel manages servers, automations run on schedule, all P1 bugs fixed, accessibility audit passes |

---

## 5. AI Agent Workflow

### 5.1 CLAUDE.md (Auto-Briefing)

The project root contains a `CLAUDE.md` file that Claude Code reads automatically at session start. This file is regenerated/updated at the start of each cycle.

**Template:**

```markdown
# Chief Wiggum — Agent Instructions

## Current Phase
Phase 1: Foundation (Weeks 1–4)

## Active Task
Working on: CW-42 — Implement agent spawn dialog
Spec: docs/specs/SPEC-003-ux-design.md Section 3.2
Design tokens: docs/specs/SPEC-002-design-system.md

## Coding Standards
Read: docs/guides/GUIDE-001-coding-standards.md

## Architecture
Read: docs/specs/SPEC-004-architecture.md

## Non-Negotiable Rules
- Framework: Tauri v2 + Rust backend. No Electron.
- Frontend: SolidJS 2.x. No React.
- Styling: TailwindCSS v4 with SPEC-002 tokens only. No hardcoded colors.
- All Rust functions return Result. No .unwrap() in production code.
- All UI components must be accessible (GUIDE-001 Section 3.6).
- Commit messages follow GUIDE-001 Section 4.2 format.

## File Locations
- Rust commands: src-tauri/src/commands/
- SolidJS components: src/components/
- Stores: src/stores/
- IPC types: src/lib/types.ts
- Design tokens: src/styles/tokens.css

## Do Not
- Do not add dependencies without checking if an existing one covers the use case.
- Do not modify the database schema without updating docs/specs/SPEC-005-data-export.md.
- Do not introduce new design tokens without adding them to SPEC-002 first.
- Do not skip tests for new business logic functions.
```

### 5.2 Agent Task Assignment

When assigning a task to an AI agent:

1. **Set the Linear issue to "In Progress"** and assign it to the agent (or note it's agent-assigned).
2. **Update CLAUDE.md** with the active task, spec references, and any context the agent needs.
3. **Agent reads CLAUDE.md** automatically, then reads the referenced specs.
4. **Agent implements**, creates a branch (per GUIDE-001 naming), commits, and opens a PR.
5. **CI runs**. If it passes, a human reviews the PR against specs.
6. **If CI fails**: agent fixes and pushes again.
7. **On merge**: update Linear issue to "Done", update TASKS spec.

### 5.3 Agent Quality Guardrails

To prevent AI agents from going off-track:

- **CLAUDE.md always references specific spec sections** — agents don't improvise architecture.
- **CI enforces lint, type-check, and tests** — broken code doesn't merge.
- **PR description template** requires spec references — reviewers verify against the spec.
- **Forbidden patterns** (GUIDE-001 Section 5) are checked by linters where possible.

---

## 6. Progress Tracking

### 6.1 Linear Dashboards

Create these views in Linear:

**Phase Progress**: Filter by current phase project. Group by epic. Shows completion percentage per epic.

**Cycle Board**: Current 2-week cycle. Kanban columns: Backlog | Todo | In Progress | In Review | Done.

**Burndown**: Auto-generated by Linear per cycle.

### 6.2 Weekly Review (Francisco)

Every Friday, review:
1. **Linear cycle board** — what shipped, what slipped, what's blocked?
2. **Performance benchmarks** — run the benchmark suite, compare against SPEC-001 Section 13 targets.
3. **Cost tracking** — review CI/API costs if applicable.
4. **Spec updates** — any specs need revision based on implementation learnings?
5. **Next week priorities** — assign P0/P1 for the next week.

### 6.3 Phase Retrospective

At the end of each phase:
1. **Demo** the phase deliverables against the gate criteria.
2. **Document learnings** in a new ADR if architectural changes were made.
3. **Update SPEC-001** if scope changed.
4. **Create TASKS spec** for the next phase.
5. **Update CLAUDE.md** with the new phase context.

---

## 7. Release Process

### 7.1 Versioning

Semantic versioning: `MAJOR.MINOR.PATCH`

- **Phase 1 complete**: `0.1.0` (alpha)
- **Phase 2 complete**: `0.2.0`
- **Phase 3 complete**: `0.3.0`
- **Phase 4 complete**: `0.4.0`
- **First public release**: `1.0.0`
- **Bug fixes within a phase**: `0.X.1`, `0.X.2`, etc.

### 7.2 Release Checklist

- [ ] All P0/P1 issues for the phase are Done
- [ ] CI passes on all platforms (macOS, Windows, Linux)
- [ ] Performance benchmarks meet targets
- [ ] No known P0 bugs
- [ ] CHANGELOG.md updated
- [ ] Tauri updater config points to new version
- [ ] GitHub Release created with binaries for all platforms

---

## 8. Communication

### 8.1 Between Human and Agents

- **CLAUDE.md** is the primary channel — update it before assigning work.
- **Linear issue descriptions** provide task-specific context.
- **PR comments** are used for review feedback that agents must address.

### 8.2 Between Agents

If multiple agents work in parallel:
- Each agent works on a separate Linear issue on a separate branch.
- Agents do not coordinate directly — Francisco coordinates via task assignment.
- Merge conflicts are resolved by the second agent to merge (or by Francisco).

### 8.3 Decision Escalation

If an agent encounters an architectural question not covered by specs:
1. Agent documents the question and options in the PR description.
2. Francisco reviews and decides.
3. Decision is captured in a new ADR.
4. Specs are updated if needed.
