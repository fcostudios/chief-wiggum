# Cowork ↔ Claude Code Handover Protocol

> This document defines how Cowork (desktop agent) and Claude Code (terminal agent) coordinate work on Chief Wiggum without stepping on each other.

---

## Architecture

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│   Cowork     │         │  Shared Files    │         │  Claude Code │
│  (planning,  │ ──────▶ │                  │ ◀────── │  (coding,    │
│   Linear,    │         │  CLAUDE.md       │         │   testing,   │
│   review)    │         │  handover.json   │         │   commits)   │
└──────────────┘         └──────────────────┘         └──────────────┘
       │                                                      │
       │              ┌──────────────────┐                    │
       └─────────────▶│  Linear (CHI-*)  │◀───────────────────┘
                      │  (source of truth │
                      │   for status)     │
                      └──────────────────┘
```

---

## Shared Files

### 1. `CLAUDE.md` (project root)
- **Who writes:** Cowork (primary), Claude Code (minor updates only)
- **Who reads:** Claude Code (reads automatically at session start)
- **Purpose:** Human-readable briefing — current phase, what's done, what's next, rules
- **Update frequency:** When work is assigned or completed

### 2. `.claude/handover.json` (this directory)
- **Who writes:** Both Cowork and Claude Code
- **Who reads:** Both
- **Purpose:** Machine-readable status — task states, files modified, notes, warnings
- **Update frequency:** After every task state change
- **Format:** JSON — see schema below

### 3. Linear Issues (CHI-*)
- **Who writes:** Cowork (creates issues, updates status, adds comments)
- **Who reads:** Both (Claude Code reads issue descriptions for acceptance criteria)
- **Purpose:** Source of truth for task status and requirements
- **Note:** Claude Code references Linear issue IDs in commits but doesn't need to update Linear directly

---

## handover.json Schema

```json
{
  "last_updated": "ISO-8601 timestamp",
  "last_updated_by": "cowork | claude-code",
  "phase": {
    "name": "Phase 1: Foundation",
    "linear_project_id": "uuid",
    "linear_project_url": "https://..."
  },
  "epics": {
    "CHI-N": {
      "title": "string",
      "status": "todo | in_progress | done",
      "linear_id": "uuid"
    }
  },
  "tasks": {
    "CHI-N": {
      "title": "string",
      "epic": "CHI-N (parent epic)",
      "status": "todo | in_progress | done | blocked",
      "priority": "P0 | P1 | P2 | P3",
      "dependencies": ["CHI-N", ...],
      "linear_id": "uuid",
      "assigned_to": "cowork | claude-code | null",
      "started_at": "ISO-8601 | null",
      "completed_at": "ISO-8601 | null",
      "files": ["path/to/file", ...],
      "notes": "Free text — what was done, issues encountered, etc."
    }
  },
  "recommended_next": ["CHI-N", ...],
  "warnings": ["string", ...],
  "environment": {
    "rust_installed": true,
    "node_installed": false,
    "notes": "string"
  }
}
```

### Schema v2 (Nested Epics — Current Practice)

The example above is the original/legacy shape. The current `handover.json` in this repo
uses a **hybrid schema** with nested epic sections for active planning work.

#### Canonical status locations (current)

- Top-level summary fields remain canonical:
  - `last_updated`, `last_updated_by`
  - `recommended_next`
  - `critical_path`
  - `warnings`
  - `notes`
  - `environment`
- Active work is often tracked under nested epic blocks (not only top-level `tasks`), for example:
  - `settings_i18n_epic.CHI-120.tasks.CHI-124`
  - `context_intelligence_epic.CHI-121.tasks.CHI-125`
  - `ux_hardening_epic.CHI-129.tasks.CHI-135`
  - `project_actions_epic.CHI-138.tasks.CHI-139`
- Top-level `epics` / `tasks` may still exist for older work and should be treated as
  **legacy-compatible**, not the only source of task state.

#### Phase semantics

- `phase.name` may continue to reference the primary Linear project anchor (for example
  `"Phase 2: Make It Real"`) even while `notes` / `critical_path` describe Phase 3 execution.
- When in doubt, use `notes`, nested epic sections, and `recommended_next` as the current
  execution picture.

#### session_work_log shape

- `session_work_log` is currently a **keyed object/map** (`Record<string, WorkLogEntry>`),
  not an array. Tools should not assume array indexing.

#### Claude Code update checklist (Schema v2)

When completing a task, update both:

1. The task entry in its actual location (nested epic section if present)
2. Top-level summary fields (`last_updated`, `last_updated_by`, `notes`, `critical_path`, `recommended_next`) when execution state changes

---

## Workflows

### Cowork Assigns Work to Claude Code

1. Cowork picks next task from `recommended_next` or Linear
2. Cowork updates `CLAUDE.md` → "Active Task" section with task details and spec references
3. Cowork updates `handover.json` → task status to `"in_progress"` (in the task's actual location; often a nested epic section), `assigned_to: "claude-code"` where applicable
4. Cowork updates Linear issue → "In Progress" status
5. User opens Claude Code in the project directory
6. Claude Code reads `CLAUDE.md` automatically, sees the assigned task
7. Claude Code reads `handover.json` for detailed context
8. Claude Code implements, tests, commits

### Claude Code Completes Work

1. Claude Code runs `cargo check` and `cargo test` to verify
2. Claude Code commits with `CHI-N: description` format
3. Claude Code updates `handover.json`:
   - Task status → `"done"`
   - `completed_at` → current timestamp
   - `files` → list of files created/modified
   - `notes` → summary of what was done
   - Update the task in its actual location (nested epic section if present), not only top-level `tasks`
4. Claude Code updates `recommended_next` based on the dependency graph
5. Next time Cowork opens, it reads `handover.json` and:
   - Updates Linear issues to "Done"
   - Plans and assigns next tasks
   - Updates `CLAUDE.md` with new active task

### Claude Code Is Blocked

1. Claude Code updates `handover.json`:
   - Task status → `"blocked"`
   - `notes` → clear description of what's blocking
2. Claude Code adds to `warnings` array
3. Cowork reads `handover.json`, resolves the block, reassigns

### Cowork Reviews Claude Code's Work

1. Cowork reads `handover.json` → check what was completed
2. Cowork reviews the files listed
3. Cowork runs verification (if available)
4. Cowork updates Linear → "Done" with implementation notes
5. Cowork updates `CLAUDE.md` → moves completed items to "What's Done"

---

## Rules

1. **Never overwrite the other's in-progress work.** Check `handover.json` before starting.
2. **Always update `handover.json` after changing task status.** This is the coordination mechanism.
   - In Schema v2, this includes nested epic task entries plus top-level summary fields when they change.
3. **`CLAUDE.md` is the human-readable briefing.** Keep it concise and up-to-date.
4. **`handover.json` is the machine-readable state.** Keep it structured and complete.
5. **Linear is the source of truth for requirements.** Both tools defer to Linear issue descriptions.
6. **Dependencies are mandatory.** Don't start a task if its dependencies aren't `"done"`.
7. **CHI-8 warning:** The Tauri scaffold task MUST preserve existing `src-tauri/src/bridge/` code.

---

## Reading the Docs

All project documentation lives in `docs/`. The reading order is:

| When | Read |
|------|------|
| First time ever | `docs/reference/INDEX.md` → `SPEC-001` → `ADR-001` + `ADR-002` |
| Before backend work | `SPEC-004` (architecture) → `GUIDE-001` (coding standards) |
| Before frontend work | `SPEC-002` (design system) → `SPEC-003` (UX) → `GUIDE-001` |
| Before any task | The relevant spec sections listed in the Linear issue description |
| Before database work | `SPEC-005` (data export/migration) |
| For workflow rules | `GUIDE-002` (workflow, priorities, progress control) |
