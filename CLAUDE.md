# Chief Wiggum — Agent Briefing

> **Read this first.** Auto-loaded by Claude Code at session start. Keep under 150 lines.
> Full completed task history → `.claude/COMPLETED.md`
> Updated: 2026-03-03

---

## What Is This Project?

**Chief Wiggum** is a cross-platform desktop app (Tauri v2 + Rust + SolidJS) that wraps Claude Code CLI in a polished GUI — visual multi-agent orchestration, real-time cost tracking, intelligent context management.

- **GitHub:** `github.com/fcostudios/chief-wiggum`
- **Linear workspace:** `linear.app/chief-wiggum` · Team: **CHI**
- **Current phase:** Phase 3 (ongoing) — Phase 1 & 2 complete

---

## Active / Backlog Tasks

All in **Backlog** state. No task is currently `in_progress`. Check `.claude/handover.json` for latest.

### 🎯 CX/UX Excellence Epic (CHI-231) — PRIMARY FOCUS

| Tier | Tasks | Priority | Spec |
|------|-------|----------|------|
| T1 Foundation | CHI-232 Contrast, CHI-233 Zones, CHI-234 Tabs, CHI-235 Messages, CHI-236 Borders, CHI-253 YOLO→Auto-approve | Urgent/High | SPEC-006 §3-4 |
| T2 Information | CHI-237 Progress, CHI-238 Cost, CHI-239 Details, CHI-240 Input, CHI-241 Tooltips, CHI-254 Help Menu, CHI-255 CTA Audit, CHI-256 Unsent Protection | High/Medium | SPEC-006 §4 |
| T3 Emotional | CHI-242 Empty States, CHI-243 Micro-Animations | Medium | SPEC-006 §4 |
| T4 Workflow | CHI-244 File Preview, CHI-245 Undo, CHI-246 Errors, CHI-247 Pause, CHI-257 Cmd Palette, CHI-258 Session Pin, CHI-259 Templates, CHI-260 Error Log | High-Low | SPEC-006 §4-5 |
| T5 Future | CHI-248 Dashboard, CHI-249 Density, CHI-250 Walkthrough, CHI-251 Bookmarks, CHI-252 Notifications | Low | SPEC-006 §4 |

**Start with Tier 1** (all independent, can parallelize). See each issue for deps and file lists.

### Other Backlog

| Task | Priority | Spec |
|------|----------|------|
| CHI-202: E3 Voice Input/Output | Medium | Conversation Utility (deprioritized) |

**Suggested start order:** CHI-232 → CHI-233 → CHI-234 → CHI-235 → CHI-236 (Tier 1, parallel-safe)

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
