# Cowork ↔ Claude Code Handover Protocol

> Defines how Cowork (planning agent) and Claude Code (coding agent) coordinate work
> on Chief Wiggum without stepping on each other.
> **Updated:** 2026-02-28 — added lock/delta system (v3)

---

## Architecture

```
┌──────────────┐         ┌──────────────────────┐         ┌──────────────┐
│   Cowork     │         │  Shared Files         │         │  Claude Code │
│  (planning,  │ ──────▶ │                       │ ◀────── │  (coding,    │
│   Linear,    │         │  CLAUDE.md            │         │   testing,   │
│   review)    │         │  .claude/handover.json│         │   commits)   │
└──────────────┘         │  .claude/handover.lock│         └──────────────┘
                         │  .claude/deltas/      │
       │                 └──────────────────────┘                │
       │              ┌──────────────────┐                       │
       └─────────────▶│  Linear (CHI-*)  │◀──────────────────────┘
                      │  source of truth  │
                      └──────────────────┘
```

---

## Shared Files

| File | Owner | Purpose |
|------|-------|---------|
| `CLAUDE.md` | Cowork (primary) | Slim agent briefing — read automatically by Claude Code at session start |
| `.claude/COMPLETED.md` | Cowork | Full history of completed tasks (extracted from CLAUDE.md to keep it slim) |
| `.claude/handover.json` | Both | Machine-readable task state — requires lock to write |
| `.claude/handover.lock` | Whoever holds it | Mutual exclusion file — see §Lock Protocol |
| `.claude/deltas/` | Both | Pending state changes when lock is held by another agent — see §Delta Protocol |
| `Linear (CHI-*)` | Cowork | Source of truth for task requirements and status |

---

## §Lock Protocol

### Lock file format (`.claude/handover.lock`)

```json
{
  "owner": "cowork | claude-code",
  "task_id": "CHI-230",
  "acquired_at": "2026-02-28T21:30:00Z",
  "expires_at": "2026-02-28T22:30:00Z",
  "note": "Implementing inline diff apply/reject"
}
```

**Lock TTL:** 1 hour. A lock older than its `expires_at` is considered stale and may be deleted by any agent before acquiring.

### Acquiring the lock

1. Check if `.claude/handover.lock` exists
2. If it exists and `expires_at` is in the future → **lock is held** → use delta protocol (see §Delta Protocol)
3. If it doesn't exist OR `expires_at` is in the past → write the lock file atomically, then update `handover.json`

### Releasing the lock

After finishing all `handover.json` writes:
1. **Reconcile pending deltas** — read all files in `.claude/deltas/`, merge into `handover.json`, delete delta files
2. Delete `.claude/handover.lock`

### Rules

- Never write to `handover.json` without holding the lock
- Never hold the lock longer than 1 hour
- If your session ends unexpectedly, the lock expires automatically via TTL
- The lock grants write access to `handover.json` only — CLAUDE.md and delta files don't need a lock

---

## §Delta Protocol

When you need to update task state but the lock is held by another agent, write a delta file instead.

### Delta file naming

```
.claude/deltas/YYYYMMDD-HHMMSS-{owner}-{task_id}.json
```

Example: `.claude/deltas/20260228-213045-claude-code-CHI-230.json`

### Delta file format

```json
{
  "written_at": "2026-02-28T21:30:45Z",
  "written_by": "claude-code",
  "blocked_by_lock": "cowork/CHI-226",
  "changes": [
    {
      "path": "tasks.CHI-230.status",
      "value": "done"
    },
    {
      "path": "tasks.CHI-230.completed_at",
      "value": "2026-02-28T21:30:00Z"
    },
    {
      "path": "tasks.CHI-230.files",
      "value": ["src/components/conversation/InlineDiffBlock.tsx", "src/lib/diffApplicator.ts"]
    },
    {
      "path": "tasks.CHI-230.notes",
      "value": "Inline diff apply/reject implemented. diffStates in conversationStore."
    }
  ]
}
```

**`path` syntax:** dot-notation into `handover.json`. Top-level fields (`last_updated`, `recommended_next`, etc.) or nested task fields (`tasks.CHI-230.status`).

### Reconciliation

Whoever releases the lock next reconciles all deltas:

1. List all files in `.claude/deltas/` (skip `.gitkeep`)
2. Sort by `written_at` ascending (oldest first — preserves intent order)
3. For each delta, apply each `changes[].path` = `value` into `handover.json`
4. Update `handover.json.last_updated` and `last_updated_by` to reflect the reconciler
5. Delete each delta file after applying
6. Release the lock

If two deltas conflict on the same path, **last write wins** (latest `written_at`).

---

## §CLAUDE.md Protocol

`CLAUDE.md` is auto-read by Claude Code at every session start. Keep it **under 150 lines**.

- **What stays in CLAUDE.md:** Project identity, current phase + active tasks, tech stack rules, file map, handover protocol summary, Linear integration
- **What moves to `.claude/COMPLETED.md`:** All completed task history (the full "What's Done" table)
- Claude Code agents that need to check completed history read `.claude/COMPLETED.md` on demand — not automatically

---

## Workflows

### Cowork Assigns Work to Claude Code

1. Cowork picks next task from `recommended_next` or Linear
2. Cowork **acquires the lock** (or writes a delta if locked)
3. Cowork updates `handover.json` → task status `"in_progress"`, `assigned_to: "claude-code"`
4. Cowork updates `CLAUDE.md` → Active Task section with task ID and spec refs
5. Cowork **releases the lock** (reconciling any pending deltas)
6. Cowork updates Linear → "In Progress"
7. User opens Claude Code — it auto-reads CLAUDE.md, then reads handover.json for context

### Claude Code Completes Work

1. Claude Code runs `cargo check` and `cargo test`
2. Claude Code commits with `CHI-N: description` format
3. Claude Code **acquires the lock** (or writes a delta if locked)
4. Claude Code updates `handover.json`: status → `"done"`, `completed_at`, `files`, `notes`
5. Claude Code **releases the lock** (reconciling pending deltas)
6. Cowork reads `handover.json` on next session, updates Linear, plans next tasks

### Claude Code Is Blocked

1. Claude Code acquires lock (or writes delta)
2. Updates task status → `"blocked"`, adds blocking note to `warnings`
3. Releases lock
4. Cowork resolves the block, reassigns

### Both Agents Active Simultaneously

1. First agent acquires the lock and works on `handover.json`
2. Second agent sees the lock → writes delta files for any state changes it needs to record
3. First agent finishes → releases lock + reconciles deltas
4. Both agents now have consistent state in `handover.json`

---

## handover.json Schema

```json
{
  "last_updated": "ISO-8601 timestamp",
  "last_updated_by": "cowork | claude-code",
  "phase": {
    "name": "Phase 2: Make It Real",
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
      "epic": "CHI-N",
      "status": "todo | in_progress | done | blocked | backlog",
      "priority": "P0 | P1 | P2 | High | Medium | Low",
      "dependencies": ["CHI-N"],
      "linear_id": "uuid | null",
      "assigned_to": "cowork | claude-code | null",
      "started_at": "ISO-8601 | null",
      "completed_at": "ISO-8601 | null",
      "files": ["path/to/file"],
      "notes": "What was done, issues encountered, etc."
    }
  },
  "recommended_next": ["CHI-N"],
  "critical_path": "text description",
  "warnings": ["string"],
  "notes": "Current execution context",
  "environment": {
    "rust_installed": true,
    "node_installed": true,
    "notes": "string"
  }
}
```

---

## Rules

1. **Check the lock before writing `handover.json`.** If locked → use delta files.
2. **Always release the lock.** Never leave a valid (non-expired) lock unattended.
3. **Reconcile deltas on lock release.** Never delete the lock without processing `.claude/deltas/`.
4. **`CLAUDE.md` stays under 150 lines.** Completed history lives in `.claude/COMPLETED.md`.
5. **Linear is source of truth for requirements.** Both agents defer to Linear issue descriptions.
6. **Dependencies are mandatory.** Don't start a task if its dependencies aren't `"done"`.
7. **Never overwrite another agent's in-progress work.** Check `handover.json` before starting any task.

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
