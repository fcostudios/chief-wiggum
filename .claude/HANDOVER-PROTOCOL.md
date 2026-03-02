# Cowork ↔ Claude Code Handover Protocol

> Defines how Cowork (planning agent) and Claude Code (coding agent) coordinate work
> on Chief Wiggum without stepping on each other.
> **Updated:** 2026-03-01 — v4: exact lock timings, worktree rules, explicit paths

---

## Architecture

```
┌──────────────┐         ┌─────────────────────────────────┐         ┌──────────────┐
│   Cowork     │         │  Shared Files (main worktree)    │         │  Claude Code │
│  (planning,  │ ──────▶ │                                  │ ◀────── │  (coding,    │
│   Linear,    │         │  CLAUDE.md                       │         │   testing,   │
│   review)    │         │  .claude/handover.json           │         │   commits)   │
└──────────────┘         │  .claude/handover.lock           │         └──────────────┘
                         │  .claude/deltas/                 │                │
       │                 └─────────────────────────────────┘                │
       │                                                            ┌────────┴────────┐
       │              ┌──────────────────┐                          │  Git Worktree   │
       └─────────────▶│  Linear (CHI-*)  │◀─────────────────────── │  (feature work) │
                      │  source of truth  │                          └─────────────────┘
                      └──────────────────┘
```

---

## Canonical Paths

All paths are relative to the project root. Absolute path on this machine:
`/Users/fcolomas/Library/CloudStorage/OneDrive-Personal/Documentos/FcoStudios/Products/ChiefWiggum/`

| File / Dir | Absolute Path | Notes |
|---|---|---|
| Project root (main) | `.../ChiefWiggum/` | Git `main` branch — always checked out here |
| Lock file | `.../ChiefWiggum/.claude/handover.lock` | Written and deleted on main only |
| Handover state | `.../ChiefWiggum/.claude/handover.json` | Written on main only |
| Delta files | `.../ChiefWiggum/.claude/deltas/` | Written by any agent when locked |
| Agent briefing | `.../ChiefWiggum/CLAUDE.md` | Auto-read by Claude Code on session start |
| Completed history | `.../ChiefWiggum/.claude/COMPLETED.md` | Read on demand |
| Worktrees root | `.../ChiefWiggum/.worktrees/` | Feature branches live here |
| Active worktree pattern | `.../ChiefWiggum/.worktrees/chi{N}-{slug}/` | e.g. `chi230-inline-diff` |

> **Critical:** `.claude/handover.lock`, `.claude/handover.json`, and `.claude/deltas/` live in the
> **main worktree only**. Claude Code must `cd` to the main worktree path to read/write them,
> even when doing feature work in a separate worktree.

---

## Shared Files

| File | Owner | Purpose |
|------|-------|---------|
| `CLAUDE.md` | Cowork (primary) | Slim agent briefing — auto-read by Claude Code at session start |
| `.claude/COMPLETED.md` | Cowork | Full history of completed tasks — read on demand |
| `.claude/handover.json` | Both | Machine-readable task state — **requires lock to write** |
| `.claude/handover.lock` | Lock holder | Mutual exclusion — see §Lock Protocol |
| `.claude/deltas/` | Both | State changes queued when lock is held — see §Delta Protocol |
| `Linear (CHI-*)` | Cowork | Source of truth for requirements and status |

---

## §Worktree Protocol

Claude Code uses Git worktrees so that feature work is isolated from `main`. The shared
coordination files (lock, handover, deltas) are **always on main**, not in the worktree.

### Setup (Cowork does this before handing off)

```bash
# From the project root (main worktree)
git worktree add .worktrees/chi{N}-{slug} -b chi{N}-{slug}
# e.g.
git worktree add .worktrees/chi230-inline-diff -b chi230-inline-diff
```

### What Claude Code uses each location for

| Location | Used for |
|---|---|
| `.worktrees/chi{N}-{slug}/` | All feature code — editing, testing, committing |
| Project root (main) | Reading/writing lock, handover.json, deltas ONLY |

### Visibility rule

**Claude Code must update `handover.json` from the main worktree path**, not from inside
the feature worktree. This ensures Cowork (which always operates on main) immediately sees
status changes without needing to switch branches.

```bash
# CORRECT — write handover from main path
cd /Users/fcolomas/.../ChiefWiggum
# ... write .claude/handover.lock, .claude/handover.json

# WRONG — do not write handover from inside the worktree
cd /Users/fcolomas/.../ChiefWiggum/.worktrees/chi230-inline-diff
# (handover writes here are invisible to Cowork)
```

### Pruning worktrees

After a task is merged and marked `done`, Claude Code removes the worktree:

```bash
git worktree remove .worktrees/chi{N}-{slug}
# or if work was abandoned:
git worktree remove --force .worktrees/chi{N}-{slug}
```

---

## §Lock Protocol — Exact Timing

### When to acquire the lock

The lock must be acquired at **two precise moments**:

**Moment 1 — Task start** (Cowork, before handing off to Claude Code)
- Immediately after deciding which task Claude Code will work on
- Before creating the worktree or updating any files
- Purpose: marks the task `in_progress` so no other agent picks it up

**Moment 2 — Task completion** (Claude Code, after all tests pass and commits are made)
- After `cargo test` / `vitest` pass and the final commit is on the feature branch
- Before writing the `done` status to `handover.json`
- Purpose: atomically records completion with files list and notes

### Lock file location and format

**Path:** `.../ChiefWiggum/.claude/handover.lock`

```json
{
  "owner": "cowork | claude-code",
  "task_id": "CHI-230",
  "worktree": ".worktrees/chi230-inline-diff",
  "acquired_at": "2026-02-28T21:30:00Z",
  "expires_at": "2026-02-28T22:30:00Z",
  "note": "Task start — marking in_progress before worktree setup"
}
```

**Lock TTL:** 1 hour from `acquired_at`. A lock past its `expires_at` is stale and any agent may delete it before acquiring.

### Step-by-step: Acquiring the lock

```
1. Read .claude/handover.lock (if it exists)
2. If lock exists AND expires_at > now:
     → Lock is held. Use §Delta Protocol instead. Stop here.
3. If lock does not exist OR expires_at <= now:
     a. Delete stale lock if present
     b. Write new lock file to .claude/handover.lock (from main worktree path)
     c. Proceed to update handover.json
```

### Step-by-step: Releasing the lock

```
1. Finish all handover.json writes
2. List .claude/deltas/ — skip .gitkeep
3. If delta files exist:
     a. Sort by written_at ascending
     b. Apply each delta's changes[] to handover.json (dot-notation paths)
     c. Update handover.json last_updated + last_updated_by
     d. Delete each delta file
4. Delete .claude/handover.lock
```

### Rules

- Never write to `handover.json` without holding the lock
- Never hold the lock longer than 1 hour (TTL handles this automatically)
- `CLAUDE.md` and delta files do NOT need a lock to write
- The `worktree` field in the lock file is informational — it tells other agents where the work is happening

---

## §Delta Protocol

When you need to record a state change but the lock is held by another agent, write a delta file.

### Delta file path

```
.../ChiefWiggum/.claude/deltas/YYYYMMDD-HHMMSS-{owner}-{task_id}.json
```

Example: `.../ChiefWiggum/.claude/deltas/20260228-213045-claude-code-CHI-230.json`

### Delta file format

```json
{
  "written_at": "2026-02-28T21:30:45Z",
  "written_by": "claude-code",
  "blocked_by_lock": "cowork/CHI-226",
  "changes": [
    { "path": "tasks.CHI-230.status",       "value": "done" },
    { "path": "tasks.CHI-230.assigned_to",  "value": "claude-code" },
    { "path": "tasks.CHI-230.completed_at", "value": "2026-02-28T21:30:00Z" },
    { "path": "tasks.CHI-230.files",        "value": ["src/components/conversation/InlineDiffBlock.tsx"] },
    { "path": "tasks.CHI-230.notes",        "value": "Implemented. completed_by=claude-code; lock_acquired_at=n/a (delta — blocked by cowork/CHI-226)" }
  ]
}
```

**`path` syntax:** dot-notation into `handover.json`, e.g. `tasks.CHI-230.status`, `recommended_next`, `last_updated`.

**Conflict rule:** If two deltas set the same path, last `written_at` wins.

---

## §CLAUDE.md Protocol

`CLAUDE.md` is auto-read by Claude Code at every session start. Keep it **under 150 lines**.

- **What stays:** Project identity, current phase, active/backlog task table, tech rules, file map, handover summary
- **What goes to `.claude/COMPLETED.md`:** All completed task history
- Claude Code reads `.claude/COMPLETED.md` only on demand

---

## Workflows

### Workflow A — Cowork Assigns Work to Claude Code

```
TIME T+0  Cowork picks task from recommended_next or Linear
TIME T+0  Cowork checks .claude/handover.lock
            → If locked: write delta for in_progress update; skip to T+4
            → If free: acquire lock (write .claude/handover.lock)
TIME T+1  Cowork writes handover.json:
            tasks.CHI-N.status       = "in_progress"
            tasks.CHI-N.assigned_to  = "claude-code"
            tasks.CHI-N.started_at   = <now ISO-8601>
            last_updated             = <now>
            last_updated_by          = "cowork"
TIME T+2  Cowork releases lock (reconcile deltas → delete lock)
TIME T+3  Cowork creates worktree on main:
            git worktree add .worktrees/chi{N}-{slug} -b chi{N}-{slug}
            (from .../ChiefWiggum/ — main worktree path)
TIME T+4  Cowork updates CLAUDE.md → Active Task section with CHI-N and spec refs
TIME T+5  Cowork updates Linear issue → "In Progress"
TIME T+6  User opens Claude Code in the worktree directory:
            cd .../ChiefWiggum/.worktrees/chi{N}-{slug}
            claude  (or: claude --worktree)
          Claude Code auto-reads CLAUDE.md from project root
          Claude Code reads .claude/handover.json for full context
```

### Workflow B — Claude Code Implements and Completes Work

```
TIME T+0  Claude Code reads CLAUDE.md (auto) and .claude/handover.json
          Claude Code confirms task status = "in_progress" and assigned_to = "claude-code"
          Claude Code confirms no other agent holds the lock

TIME T+1  Claude Code creates/edits files inside the worktree:
            .../ChiefWiggum/.worktrees/chi{N}-{slug}/src/...
            .../ChiefWiggum/.worktrees/chi{N}-{slug}/src-tauri/...
          (All feature code goes here — NOT in main worktree)

TIME T+2  Claude Code runs tests from inside the worktree:
            cd .../ChiefWiggum/.worktrees/chi{N}-{slug}
            cargo test && cargo clippy && cargo fmt --check
            npx vitest run && npx tsc --noEmit

TIME T+3  Claude Code commits on the feature branch (inside worktree):
            git add <files>
            git commit -m "CHI-N: description"

TIME T+4  Claude Code switches to main worktree to update coordination files:
            cd .../ChiefWiggum/   ← MAIN WORKTREE, not the feature worktree

TIME T+5  Claude Code acquires lock:
            Check .claude/handover.lock
            → If locked: write delta to .claude/deltas/ and stop
            → If free: write .claude/handover.lock with owner=claude-code

TIME T+6  Claude Code writes handover.json (from main worktree):
            tasks.CHI-N.status       = "done"
            tasks.CHI-N.assigned_to  = "claude-code"
            tasks.CHI-N.completed_at = <now ISO-8601>
            tasks.CHI-N.files        = [list of files changed]
            tasks.CHI-N.notes        = "<summary>. completed_by=claude-code; lock_acquired_at=<T+5 timestamp>"
            recommended_next         = [updated list]
            last_updated             = <now>
            last_updated_by          = "claude-code"

TIME T+7  Claude Code releases lock (reconcile deltas → delete .claude/handover.lock)

TIME T+8  Claude Code pushes feature branch:
            cd .../ChiefWiggum/.worktrees/chi{N}-{slug}
            git push origin chi{N}-{slug}

TIME T+9  Claude Code removes worktree (after merge) or leaves for PR review:
            cd .../ChiefWiggum/
            git worktree remove .worktrees/chi{N}-{slug}
```

### Workflow C — Claude Code Is Blocked

```
TIME T+0  Claude Code hits a blocker (missing dep, unclear spec, failing test)
TIME T+1  Claude Code switches to main worktree:
            cd .../ChiefWiggum/
TIME T+2  Claude Code acquires lock (or writes delta if locked)
TIME T+3  Claude Code writes handover.json:
            tasks.CHI-N.status = "blocked"
            tasks.CHI-N.notes  = "Blocked: <reason>. completed_by=n/a; lock_acquired_at=<timestamp>"
            warnings           = [...existing, "CHI-N blocked: <reason>"]
TIME T+4  Claude Code releases lock
TIME T+5  Cowork reads handover.json on next session, resolves block, reassigns
```

### Workflow D — Simultaneous Agents

```
Agent A acquires lock → updates handover.json → holds lock
Agent B needs to write → sees lock → writes to .claude/deltas/ instead → continues other work
Agent A finishes → reconciles deltas → releases lock
Both agents now have consistent state in handover.json
```

---

## handover.json Schema

```json
{
  "last_updated": "ISO-8601",
  "last_updated_by": "cowork | claude-code",
  "phase": {
    "name": "Phase N: Name",
    "linear_project_id": "uuid",
    "linear_project_url": "https://linear.app/..."
  },
  "tasks": {
    "CHI-N": {
      "title": "string",
      "epic": "CHI-N | null",
      "status": "backlog | todo | in_progress | done | blocked",
      "priority": "High | Medium | Low | P0 | P1 | P2",
      "dependencies": ["CHI-N"],
      "linear_id": "uuid | null",
      "assigned_to": "cowork | claude-code | null",
      "started_at": "ISO-8601 | null",
      "completed_at": "ISO-8601 | null",
      "worktree": ".worktrees/chi{N}-{slug} | null",
      "files": ["path/relative/to/project/root"],
      "notes": "Summary. completed_by=<agent>; lock_acquired_at=<ISO-8601>"
    }
  },
  "recommended_next": ["CHI-N"],
  "critical_path": "text",
  "warnings": ["string"],
  "notes": "Current execution context",
  "environment": {
    "rust_installed": true,
    "node_installed": true,
    "notes": "string"
  }
}
```

> **New field:** `tasks.CHI-N.worktree` — set to the worktree path when status is `in_progress`,
> null otherwise. Lets Cowork and other agents know where the code lives.

---

## Rules

1. **Acquire the lock at task start AND task completion** — two distinct lock acquisitions per task lifecycle.
2. **Always operate on main for coordination files.** Lock, handover.json, and deltas are read/written from `.../ChiefWiggum/` (main worktree), never from inside `.worktrees/`.
3. **Feature code lives in the worktree.** All edits to `src/`, `src-tauri/`, and tests happen inside `.../ChiefWiggum/.worktrees/chi{N}-{slug}/`.
4. **Never hold the lock longer than 1 hour.** TTL handles abandoned locks automatically.
5. **Always release the lock.** Reconcile deltas before deleting the lock file.
6. **Record lock evidence in notes.** Completed task notes must include `completed_by=<agent>; lock_acquired_at=<ISO-8601>`.
7. **Keep assigned_to on completion.** Set `assigned_to` to the completing agent (`claude-code` or `cowork`) — do not null it.
8. **Record the worktree in use.** Set `tasks.CHI-N.worktree` when marking `in_progress`, clear to `null` on `done`.
9. **Dependencies are mandatory.** Do not start a task unless all entries in `dependencies[]` are `done`.
10. **Linear is source of truth for requirements.** Where CLAUDE.md/TASKS docs and Linear diverge, Linear wins.
11. **`CLAUDE.md` stays under 150 lines.** Completed history lives in `.claude/COMPLETED.md`.

---

## Quick Reference — Exact Commands

### Check lock status
```bash
cat .../ChiefWiggum/.claude/handover.lock 2>/dev/null || echo "NO LOCK"
```

### Acquire lock (Cowork — task start)
```bash
cd .../ChiefWiggum
cat > .claude/handover.lock << 'EOF'
{
  "owner": "cowork",
  "task_id": "CHI-N",
  "worktree": ".worktrees/chi{N}-{slug}",
  "acquired_at": "2026-03-01T10:00:00Z",
  "expires_at": "2026-03-01T11:00:00Z",
  "note": "Task start — marking in_progress"
}
EOF
```

### Acquire lock (Claude Code — task completion)
```bash
cd .../ChiefWiggum       # ← switch to main worktree first
cat > .claude/handover.lock << 'EOF'
{
  "owner": "claude-code",
  "task_id": "CHI-N",
  "worktree": ".worktrees/chi{N}-{slug}",
  "acquired_at": "<ISO-8601 now>",
  "expires_at": "<ISO-8601 now+1h>",
  "note": "Task completion — writing done status"
}
EOF
```

### Release lock
```bash
cd .../ChiefWiggum
# 1. Apply any delta files (see §Delta Protocol)
ls .claude/deltas/ | grep -v .gitkeep
# 2. Delete lock
rm .claude/handover.lock
```

### Create worktree (Cowork)
```bash
cd .../ChiefWiggum
git worktree add .worktrees/chi{N}-{slug} -b chi{N}-{slug}
```

### Remove worktree (after merge)
```bash
cd .../ChiefWiggum
git worktree remove .worktrees/chi{N}-{slug}
git branch -d chi{N}-{slug}
```

---

## Reading the Docs

| When | Read |
|------|------|
| First time ever | `docs/reference/INDEX.md` → `SPEC-001` → `ADR-001` + `ADR-002` |
| Before backend work | `SPEC-004` (architecture) → `GUIDE-001` (coding standards) |
| Before frontend work | `SPEC-002` (design system) → `SPEC-003` (UX) → `GUIDE-001` |
| Before any task | The relevant spec sections in the Linear issue description |
| Before database work | `SPEC-005` (data export/migration) |
| Completed task history | `.claude/COMPLETED.md` |
