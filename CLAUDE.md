# Chief Wiggum — Agent Briefing

> **Read this first.** Auto-loaded by Claude Code at session start. Keep under 150 lines.
> Full completed task history → `.claude/COMPLETED.md`
> Updated: 2026-03-08

---

## What Is This Project?

**Chief Wiggum** is a cross-platform desktop app (Tauri v2 + Rust + SolidJS) that wraps Claude Code CLI in a polished GUI — visual multi-agent orchestration, real-time cost tracking, intelligent context management.

- **GitHub:** `github.com/fcostudios/chief-wiggum`
- **Linear workspace:** `linear.app/chief-wiggum` · Team: **CHI**
- **Current phase:** Phase 3 (ongoing) — Phase 1 & 2 complete

---

## Active / Backlog Tasks

Check `.claude/handover.json` for latest status and epic closure protocol.

### Recently Completed Epics

| Epic | Status | Notes |
|------|--------|-------|
| CHI-231: CX/UX Excellence (T1-T4) | ✅ Done | T5 Future tasks remain in backlog |
| CHI-286: Security Hardening | ✅ Done | SQLCipher, permissions, CSP, backup/redaction (CHI-288-291) |
| CHI-296: Session Data Completeness | ✅ Done | Migration v6, pipeline fixes, frontend wiring (CHI-297-300) |
| CHI-307: Export Quality Upgrade | ✅ Done | Secret redaction, interactive HTML, JSON export (CHI-308-310) |
| CHI-301: JSONL Session Import | ✅ Done | Parser, discovery, import engine, UI, consistency checker (CHI-302-306) |
| CHI-287: Performance Tuning | ✅ Done | Query/event/render optimization + memory/build tuning (CHI-292-295) |

### In Progress

No active epics currently in progress.

### Remaining Backlog (Next Focus)

| Task | Priority | Spec |
|------|----------|------|
| CHI-248: T5.1 Session Efficiency Dashboard | Low | SPEC-006 §4 |
| CHI-249: T5.2 Adaptive UI Density Modes | Low | SPEC-006 §4 |
| CHI-250: T5.3 Interactive Onboarding Walkthrough | Low | SPEC-006 §4 |
| CHI-251: T5.4 Conversation Bookmarks | Low | SPEC-006 §4 |
| CHI-252: T5.5 Smart Agent Notifications | Low | SPEC-006 §4 |
| CHI-202: E3 Voice Input/Output | Low | Conversation Utility |

**Suggested next:** CHI-248 → CHI-249 → CHI-250 → CHI-251 → CHI-252

### Epic Closure — Action Required

Keep Linear epic statuses aligned with `.claude/handover.json` closure protocol.

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
| Frontend work | `SPEC-002` (design system) → `SPEC-003` (UX) → `SPEC-006` (CX/UX) → `GUIDE-001` |
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
