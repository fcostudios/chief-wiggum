# Chief Wiggum — Agent Briefing

> **Read this first.** Auto-loaded by Claude Code at session start. Keep under 150 lines.
> Full completed task history → `.claude/COMPLETED.md`
> Updated: 2026-02-28

---

## What Is This Project?

**Chief Wiggum** is a cross-platform desktop app (Tauri v2 + Rust + SolidJS) that wraps Claude Code CLI in a polished GUI — visual multi-agent orchestration, real-time cost tracking, intelligent context management.

- **GitHub:** `github.com/fcostudios/chief-wiggum`
- **Linear workspace:** `linear.app/chief-wiggum` · Team: **CHI**
- **Current phase:** Phase 3 (ongoing) — Phase 1 & 2 complete

---

## Active / Backlog Tasks

All in **Backlog** state. No task is currently `in_progress`. Check `.claude/handover.json` for latest.

| Task | Priority | Depends on | Spec |
|------|----------|-----------|------|
| CHI-226: Session Resume Persistence | High | — | TASKS-006 §5 |
| CHI-227: Agents Tab Scaffolding v2 | Medium | — | TASKS-006 §6 |
| CHI-230: Inline Diff Accept/Reject | High | **none** (CHI-217 done ✓) | TASKS-006 §9 |
| CHI-229: Info Hierarchy Redesign (TitleBar/StatusBar) | Medium | — | TASKS-006 §8 |
| CHI-225: Session History & Artifact Index | High | — | TASKS-006 §4 |
| CHI-228: Contextual Onboarding Hints | Medium | CHI-220 | TASKS-006 §7 |
| CHI-218..223: Actions Center v2 | High/Med | CHI-138 ✓ | TASKS-005 |

**Also in backlog (Conversation Experience project):** CHI-216 (gitignore toggle), CHI-179 (file attachments), CHI-180 (polish), CHI-198 (utility: search/export/voice), CHI-199 (QA coverage). See Linear for full list.

**Suggested start order:** CHI-226 → CHI-227 → CHI-230 → CHI-229 → CHI-225

---

## Non-Negotiable Rules

- **Framework:** Tauri v2 + Rust. No Electron. No wry alternatives.
- **Frontend:** SolidJS 2.x. Not React.
- **Styling:** TailwindCSS v4 with SPEC-002 tokens only. No hardcoded colors.
- **Rust:** All functions return `Result`. No `.unwrap()` in production code. No `println!` (use `tracing`).
- **Error handling:** `thiserror` enums, typed variants per GUIDE-001 §2.4.
- **Async:** `tokio` runtime. PTY I/O on dedicated OS threads, mpsc to async (GUIDE-001 §2.5).
- **Testing:** All new business logic must have unit tests.
- **Accessibility:** WCAG 2.1 AA minimum (SPEC-002 §12).
- **No:** `unwrap()`, `expect()`, `panic!()`, `println!()` in production code.

---

## Key File Locations

```
src-tauri/src/
├── bridge/       # CLI Bridge — manager.rs, event_loop.rs, permission.rs
├── commands/     # IPC handlers — session, cli, project, bridge, slash, files
├── db/           # SQLite — connection.rs, migrations.rs, queries.rs
├── files/        # File scanner + watcher (CHI-115)
├── logging/      # 3-layer tracing (CHI-94)
├── slash/        # Slash command discovery (CHI-106)
└── settings/     # Settings backend (CHI-122)

src/
├── components/
│   ├── layout/       # MainLayout, TitleBar, Sidebar, StatusBar, DetailsPanel
│   ├── conversation/ # ConversationView, MessageBubble, MessageInput, ToolUseBlock, ThinkingBlock
│   ├── explorer/     # FileTree, FileTreeNode, FilePreview
│   ├── common/       # ModelSelector, CommandPalette, ToastContainer
│   └── permissions/  # PermissionDialog, YoloWarningDialog
├── stores/           # uiStore, sessionStore, conversationStore, fileStore, contextStore, etc.
└── lib/              # types.ts, keybindings.ts, typewriterBuffer.ts, logger.ts
```

---

## Document Map

| When | Read |
|------|------|
| First time | `docs/reference/INDEX.md` → `SPEC-001` → `ADR-001/002` |
| Backend work | `SPEC-004` (architecture) → `GUIDE-001` (coding standards) |
| Frontend work | `SPEC-002` (design system) → `SPEC-003` (UX) → `GUIDE-001` |
| Any task | Spec sections referenced in the Linear issue description |
| DB changes | `SPEC-005` (data/migration) — current: v4=action_history, v5=artifacts |
| Completed history | `.claude/COMPLETED.md` |

---

## Handover Protocol (Summary)

Full protocol: `.claude/HANDOVER-PROTOCOL.md`

**Before writing `handover.json`:** Check for `.claude/handover.lock`. If locked → write a delta file to `.claude/deltas/` instead. See protocol for format.

**After finishing:** Release lock + reconcile any delta files in `.claude/deltas/`.

**When you start:** Read `.claude/handover.json` → check `recommended_next` and any `warnings`.

---

## Linear Integration

- Branch: `chi-{number}-{slug}` e.g. `chi-230-inline-diff`
- Commit: `CHI-N: description`
- PR: reference the issue ID
- Cowork handles Linear status updates — just update `handover.json`
