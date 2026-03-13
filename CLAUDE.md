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
| CHI-231: CX/UX Excellence (T1-T4 + T4.7) | ✅ Done | T5 Future tasks remain in backlog. CHI-259 (Saved Prompt Templates) also done. |
| CHI-286: Security Hardening | ✅ Done | SQLCipher, permissions, CSP, backup/redaction (CHI-288-291) |
| CHI-296: Session Data Completeness | ✅ Done | Migration v6, pipeline fixes, frontend wiring (CHI-297-300) |
| CHI-307: Export Quality Upgrade | ✅ Done | Secret redaction, interactive HTML, JSON export (CHI-308-310) |
| CHI-301: JSONL Session Import | ✅ Done | Parser, discovery, import engine, UI, consistency checker (CHI-302-306) |
| CHI-287: Performance Tuning | ✅ Done | Query/event/render optimization + memory/build tuning (CHI-292-295) |
| CHI-276: Binary File Preview | ✅ Done | Image, SVG, PDF, Audio previews (BP-1 through BP-4) |
| CHI-269: File & Folder Creation | ✅ Done | Full file management (CHI-272 context menu remains) |
| CHI-277: AskUserQuestion Dialog | ✅ Done | Interactive agent questions (CHI-284, CHI-285) |

### In Progress

| Epic | Status | Notes |
|------|--------|-------|
| CHI-311: Git Integration | 🔄 In Progress | 13/19 subtasks done (CHI-312–325). Remaining: discard, stash, merge, AI msg, ctx menu, shortcuts. |

### Remaining Backlog (Next Focus)

#### CHI-311: Git Integration (Phase 4 — 6 remaining of 19)

✅ Done: CHI-312 through CHI-325 (GIT-1 through GIT-14 — scaffold, branches, status, store, panel, diff, staging, commit, remote ops, log, ahead/behind)

| Task | Priority | Spec |
|------|----------|------|
| CHI-321: GIT-10 Discard changes with soft undo | Medium | SPEC-006 §5.5 |
| CHI-326: GIT-15 Stash operations | Medium | SPEC-006 §4.25, §5.5 |
| CHI-327: GIT-16 Merge conflict detection + banner | Medium | SPEC-006 §4.29 |
| CHI-328: GIT-17 AI commit message generation | Medium | SPEC-006 §4.28 |
| CHI-329: GIT-18 Context menu git actions on file tree | Low | SPEC-006 §4.25 |
| CHI-330: GIT-19 Keyboard shortcuts for Git operations | Low | SPEC-006 §4.27 |

#### CHI-331: Terminal Integration (Phase 4 — 12 subtasks)

| Task | Priority | Spec |
|------|----------|------|
| CHI-332: TERM-1 Terminal backend module scaffold + PTY session lifecycle | High | SPEC-006 §4.30, SPEC-004 §2 |
| CHI-333: TERM-2 Terminal output streaming via Tauri events | High | SPEC-004 §4.2, §4.3 |
| CHI-334: TERM-3 terminalStore.ts + wire TerminalPane to backend | High | SPEC-004 §3.2, SPEC-006 §4.30 |
| CHI-335: TERM-4 Shell detection + selection | Medium | SPEC-006 §4.30, §4.33 |
| CHI-336: TERM-5 Multi-tab UI (TerminalTabs.tsx) | High | SPEC-006 §4.30, §4.31 |
| CHI-337: TERM-6 Tab rename + reorder + overflow | Medium | SPEC-006 §4.31 |
| CHI-338: TERM-7 Empty state + auto-spawn on view switch | Medium | SPEC-006 §4.7, §4.30 |
| CHI-339: TERM-8 Clickable file paths (addon-web-links) | Medium | SPEC-006 §4.32 |
| CHI-340: TERM-9 CWD tracking + status bar display | Medium | SPEC-006 §4.30, §4.32 |
| CHI-341: TERM-10 Terminal settings UI | Low | SPEC-006 §4.33 |
| CHI-342: TERM-11 Terminal keyboard shortcuts | Low | SPEC-006 §4.31 |
| CHI-343: TERM-12 Terminal accessibility | Medium | SPEC-006 §6.5 |

#### Other Backlog

| Task | Priority | Spec |
|------|----------|------|
| CHI-264: EQ-2 Enable Input During Streaming | High | SPEC-006 §4.21 |
| CHI-265: EQ-3 Message Queue Store + Auto-Send | High | SPEC-006 §4.21 |
| CHI-266: EQ-4 Queue Panel UI Component | High | SPEC-006 §4.21 |
| CHI-267: EQ-5 Steer Flow — Interrupt + Redirect | High | SPEC-006 §4.21 |
| CHI-268: EQ-6 Interrupted Message Marker | Medium | SPEC-006 §4.21 |
| CHI-248: T5.1 Session Efficiency Dashboard | Low | SPEC-006 §4 |
| CHI-249: T5.2 Adaptive UI Density Modes | Low | SPEC-006 §4 |
| CHI-250: T5.3 Interactive Onboarding Walkthrough | Low | SPEC-006 §4 |
| CHI-251: T5.4 Conversation Bookmarks | Low | SPEC-006 §4 |
| CHI-252: T5.5 Smart Agent Notifications | Low | SPEC-006 §4 |
| CHI-202: E3 Voice Input/Output | Low | Conversation Utility |

**Suggested next (Terminal):** CHI-332 → CHI-333 → CHI-334 → CHI-335 → CHI-336 → CHI-338
**Suggested next (Git):** CHI-321 → CHI-326 → CHI-327 → CHI-328 → CHI-329 → CHI-330

### Epic Closure

All Phase 3 epics (CHI-286, CHI-287, CHI-296, CHI-301, CHI-307) are **closed in Linear**.
See `.claude/handover.json` `epic_closure_protocol` for the process used.

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
├── commands/     # IPC handlers — session, cli, project, bridge, slash, files, git, terminal
├── db/           # SQLite — connection.rs, migrations.rs, queries.rs
├── files/        # File scanner + watcher (CHI-115)
├── git/          # Git operations via git2-rs (Phase 4 — CHI-311) [planned]
├── terminal/     # General-purpose terminal PTY backend (Phase 4 — CHI-331) [planned]
├── logging/      # 3-layer tracing (CHI-94)
├── slash/        # Slash command discovery (CHI-106)
└── settings/     # Settings backend (CHI-122)

src/
├── components/
│   ├── layout/       # MainLayout, TitleBar, Sidebar, StatusBar, DetailsPanel
│   ├── conversation/ # ConversationView, MessageBubble, MessageInput, ToolUseBlock, ThinkingBlock
│   ├── explorer/     # FileTree, FileTreeNode, FilePreview
│   ├── common/       # ModelSelector, CommandPalette, ToastContainer
│   ├── permissions/  # PermissionDialog, YoloWarningDialog
│   ├── git/          # GitPanel, BranchSelector, CommitBox, GitDiffView [planned]
│   └── terminal/     # TerminalPane, TerminalTabs [existing UI, backend wiring planned]
├── stores/           # uiStore, sessionStore, conversationStore, fileStore, contextStore, gitStore, terminalStore, etc.
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
