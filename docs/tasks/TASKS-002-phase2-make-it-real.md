# TASKS-002: Phase 2 — Make It Real

**Version:** 1.0
**Date:** 2026-02-21
**Status:** Active — In Progress
**Linear Project:** [Phase 2 — Make It Real](https://linear.app/chief-wiggum/project/phase-2-make-it-real-951a81a3c66b)
**Workspace:** Chief Wiggum (`linear.app/chief-wiggum`)
**Team:** Chief Wiggum (CHI)
**Goal:** Wire the CLI bridge to the frontend, replace mocks with real Claude Code interaction, add project management, permissions, cost tracking, and session lifecycle management.

---

## Summary

| Metric | Count |
|---|---|
| Total issues | 47 (21 core + 26 UX polish) |
| Core epics | 5 |
| UX polish epics | 6 |
| Core tasks | 21 |
| UX polish tasks | 26 |
| **Done** | **12** (CHI-40, CHI-44–49, CHI-25, CHI-26, CHI-20, CHI-22, CHI-24) |
| **Remaining** | **35** |

---

## Core Epic 1: Project & Folder Management — [CHI-35](https://linear.app/chief-wiggum/issue/CHI-35) (P0)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-40](https://linear.app/chief-wiggum/issue/CHI-40) | Folder picker + project creation | P0 | SPEC-004 §4.4.2, SPEC-003 §4.8, SPEC-002 §10.15 | — | **Done** ✓ |
| [CHI-41](https://linear.app/chief-wiggum/issue/CHI-41) | Project sidebar section with recent projects | P1 | SPEC-003 §2.1 Z2, SPEC-002 §10.15 | CHI-40 | Todo |
| [CHI-42](https://linear.app/chief-wiggum/issue/CHI-42) | Detect and display CLAUDE.md from project folder | P2 | SPEC-004 §3.1 | CHI-40 | Todo |
| [CHI-43](https://linear.app/chief-wiggum/issue/CHI-43) | Bind sessions to projects with inherited settings | P1 | SPEC-004 §6 (Session.project_id) | CHI-40, CHI-22 | Todo |

---

## Core Epic 2: CLI Connection & Streaming — [CHI-36](https://linear.app/chief-wiggum/issue/CHI-36) (P0) — **DONE** ✓

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-44](https://linear.app/chief-wiggum/issue/CHI-44) | SessionBridgeMap — session→process manager | P0 | SPEC-004 §3.1 (bridge/manager.rs), §5.4 | — | **Done** ✓ |
| [CHI-45](https://linear.app/chief-wiggum/issue/CHI-45) | IPC commands for CLI (start/send/stop/status) | P0 | SPEC-004 §4.4.3 | CHI-44 | **Done** ✓ |
| [CHI-46](https://linear.app/chief-wiggum/issue/CHI-46) | Streaming event loop (bridge→Tauri events) | P0 | SPEC-004 §4.4.4, §5.4 | CHI-44, CHI-45 | **Done** ✓ |
| [CHI-47](https://linear.app/chief-wiggum/issue/CHI-47) | Replace mock sendMessage with real CLI streaming | P0 | SPEC-003 §4.9, SPEC-004 §4.4.3 | CHI-46 | **Done** ✓ |
| [CHI-48](https://linear.app/chief-wiggum/issue/CHI-48) | Detect Claude Code CLI on startup with error UI | P1 | SPEC-004 §4.4.1, §5.3, SPEC-003 §4.7 | — | **Done** ✓ |
| [CHI-49](https://linear.app/chief-wiggum/issue/CHI-49) | Streaming message rendering (incremental chunks) | P1 | SPEC-003 §4.9, SPEC-002 §10.16 | CHI-47 | **Done** ✓ |

---

## Core Epic 3: Permission Flow Live — [CHI-37](https://linear.app/chief-wiggum/issue/CHI-37) (P1)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-50](https://linear.app/chief-wiggum/issue/CHI-50) | Wire permission IPC commands | P0 | SPEC-004 §4.4.5, §5.2 | CHI-46 | Todo |
| [CHI-51](https://linear.app/chief-wiggum/issue/CHI-51) | Build full permission event pipeline | P0 | SPEC-003 §3.7, §5.3 | CHI-50 | Todo |
| [CHI-52](https://linear.app/chief-wiggum/issue/CHI-52) | Wire YOLO mode frontend toggle to backend IPC | P1 | SPEC-003 §4.10, SPEC-004 §5.2 | CHI-50 | Todo |

---

## Core Epic 4: Live Cost Tracking — [CHI-38](https://linear.app/chief-wiggum/issue/CHI-38) (P2)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-53](https://linear.app/chief-wiggum/issue/CHI-53) | Cost accumulator service with SQLite persistence | P1 | SPEC-004 §3.1 (cost/), §4.4.6, §5.5 | CHI-46 | Todo |
| [CHI-54](https://linear.app/chief-wiggum/issue/CHI-54) | Bind StatusBar + DetailsPanel to live cost events | P1 | SPEC-002 §10.8, SPEC-003 §4.12 | CHI-53 | Todo |
| [CHI-55](https://linear.app/chief-wiggum/issue/CHI-55) | Per-message token/cost display in MessageBubble | P2 | SPEC-003 §3.1 (Message Footer) | CHI-53 | Todo |

---

## Core Epic 5: Session Lifecycle Management — [CHI-39](https://linear.app/chief-wiggum/issue/CHI-39) (P1)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-56](https://linear.app/chief-wiggum/issue/CHI-56) | Process lifecycle state machine | P0 | SPEC-003 §5.2, SPEC-004 §5.4 | CHI-44 | Todo |
| [CHI-57](https://linear.app/chief-wiggum/issue/CHI-57) | Handle session switching (suspend/resume) | P0 | SPEC-003 §4.11 | CHI-56 | Todo |
| [CHI-58](https://linear.app/chief-wiggum/issue/CHI-58) | Graceful shutdown on session delete/close | P1 | SPEC-003 §4.11 | CHI-56 | Todo |
| [CHI-59](https://linear.app/chief-wiggum/issue/CHI-59) | Crash recovery with error UI | P1 | SPEC-004 §7.3, SPEC-003 §8 | CHI-56 | Todo |
| [CHI-60](https://linear.app/chief-wiggum/issue/CHI-60) | Shutdown all CLI processes on app quit | P0 | SPEC-003 §4.11 | CHI-44 | Todo |

---

## UX Polish Epic 1: Native Window Chrome — [CHI-61](https://linear.app/chief-wiggum/issue/CHI-61) (High)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-67](https://linear.app/chief-wiggum/issue/CHI-67) | Native window controls (macOS traffic lights + Windows) | Urgent | SPEC-003 §10.1 | — | Todo |
| [CHI-68](https://linear.app/chief-wiggum/issue/CHI-68) | Titlebar redesign with platform-aware layout | High | SPEC-003 §10.1, §2.1 Z1 | CHI-67 | Todo |
| [CHI-69](https://linear.app/chief-wiggum/issue/CHI-69) | macOS vibrancy effects on sidebar and titlebar | Low | SPEC-003 §10.1 | CHI-67 | Todo |
| [CHI-70](https://linear.app/chief-wiggum/issue/CHI-70) | Custom scrollbar styling for dark theme | Medium | SPEC-002 §10.17 | — | Todo |

---

## UX Polish Epic 2: Delightful Interactions — [CHI-62](https://linear.app/chief-wiggum/issue/CHI-62) (High)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-71](https://linear.app/chief-wiggum/issue/CHI-71) | Message enter/exit animations (slide + fade) | Medium | SPEC-003 §10.2 | — | Todo |
| [CHI-72](https://linear.app/chief-wiggum/issue/CHI-72) | Premium typing indicator (animated dots, shimmer) | High | SPEC-003 §10.2, SPEC-002 §10.16 | — | Todo |
| [CHI-73](https://linear.app/chief-wiggum/issue/CHI-73) | Smooth streaming text rendering (typewriter buffer) | High | SPEC-003 §10.2 | CHI-49 | Todo |
| [CHI-74](https://linear.app/chief-wiggum/issue/CHI-74) | Toast notification system | Medium | SPEC-002 §10.13, SPEC-003 §10.2 | — | Todo |
| [CHI-75](https://linear.app/chief-wiggum/issue/CHI-75) | Copy feedback animations + hover micro-interactions | Medium | SPEC-003 §10.2 | — | Todo |

---

## UX Polish Epic 3: Command Palette & Power User — [CHI-63](https://linear.app/chief-wiggum/issue/CHI-63) (Medium)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-76](https://linear.app/chief-wiggum/issue/CHI-76) | Command palette UI (Cmd+K, fuzzy search) | High | SPEC-002 §10.14, SPEC-003 §10.3, §3.6 | — | Todo |
| [CHI-77](https://linear.app/chief-wiggum/issue/CHI-77) | Session quick-switcher (Cmd+Shift+P) | Medium | SPEC-003 §10.3 | CHI-76 | Todo |
| [CHI-78](https://linear.app/chief-wiggum/issue/CHI-78) | Custom context menus (messages, sessions, code) | Medium | SPEC-003 §10.3 | — | Todo |
| [CHI-79](https://linear.app/chief-wiggum/issue/CHI-79) | Keyboard navigation audit + focus management | Medium | SPEC-003 §10.3, SPEC-002 §12 | — | Todo |

---

## UX Polish Epic 4: Onboarding & Empty States — [CHI-64](https://linear.app/chief-wiggum/issue/CHI-64) (Medium)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-80](https://linear.app/chief-wiggum/issue/CHI-80) | Conversation empty state redesign (sample prompts) | High | SPEC-003 §10.4, §7 | — | Todo |
| [CHI-81](https://linear.app/chief-wiggum/issue/CHI-81) | First-launch onboarding flow (3-5 steps) | Low | SPEC-003 §3.8, §10.4 | — | Todo |
| [CHI-82](https://linear.app/chief-wiggum/issue/CHI-82) | Placeholder views for Agents/Diff (informative) | Medium | SPEC-003 §10.4, §7 | — | Todo |
| [CHI-83](https://linear.app/chief-wiggum/issue/CHI-83) | "No project selected" guidance state | Medium | SPEC-003 §10.4 | CHI-40 | Todo |

---

## UX Polish Epic 5: Sidebar & Navigation Polish — [CHI-65](https://linear.app/chief-wiggum/issue/CHI-65) (Medium)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-84](https://linear.app/chief-wiggum/issue/CHI-84) | Sidebar collapsed icon-rail mode (48px) | High | SPEC-003 §10.5, SPEC-002 §5.1 (sidebar-collapsed), §11 | — | Todo |
| [CHI-85](https://linear.app/chief-wiggum/issue/CHI-85) | Session sections (Pinned, Recent, Older) | Medium | SPEC-003 §10.5 | — | Todo |
| [CHI-86](https://linear.app/chief-wiggum/issue/CHI-86) | Session rename inline + session actions menu | Medium | SPEC-003 §10.5 | — | Todo |
| [CHI-87](https://linear.app/chief-wiggum/issue/CHI-87) | View tabs with icons + count badges | Medium | SPEC-003 §10.5 | — | Todo |
| [CHI-88](https://linear.app/chief-wiggum/issue/CHI-88) | Sidebar search/filter | Low | SPEC-003 §10.5 | — | Todo |

---

## UX Polish Epic 6: Tool Use Visualization — [CHI-66](https://linear.app/chief-wiggum/issue/CHI-66) (High)

| ID | Title | Priority | Spec Ref | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-89](https://linear.app/chief-wiggum/issue/CHI-89) | ToolUseBlock component (collapsible, color-coded) | High | SPEC-002 §10.11, SPEC-003 §10.6 | CHI-49 | Todo |
| [CHI-90](https://linear.app/chief-wiggum/issue/CHI-90) | ThinkingBlock component (muted reasoning display) | Medium | SPEC-002 §10.12, SPEC-003 §10.6 | CHI-49 | Todo |
| [CHI-91](https://linear.app/chief-wiggum/issue/CHI-91) | Permission inline record (approved/denied) | Medium | SPEC-003 §10.6 | CHI-50 | Todo |
| [CHI-92](https://linear.app/chief-wiggum/issue/CHI-92) | File diff preview within conversation | Low | SPEC-003 §10.6 | CHI-89 | Todo |

---

## Dependency Graph (Core)

```
CHI-40 (Folder picker)           ✓ DONE
├── CHI-41 (Project sidebar)
├── CHI-42 (CLAUDE.md detection)
└── CHI-43 (Session→project binding)

CHI-44 (SessionBridgeMap)        ✓ DONE
├── CHI-45 (Bridge IPC)          ✓ DONE
│   └── CHI-46 (Event loop)      ✓ DONE
│       ├── CHI-47 (Real CLI)    ✓ DONE
│       │   └── CHI-49 (Streaming UI) ✓ DONE
│       ├── CHI-50 (Permission IPC)
│       │   ├── CHI-51 (Permission pipeline)
│       │   └── CHI-52 (YOLO backend)
│       └── CHI-53 (Cost accumulator)
│           ├── CHI-54 (Cost UI binding)
│           └── CHI-55 (Per-message cost)
├── CHI-56 (Process state machine)
│   ├── CHI-57 (Session switching)
│   ├── CHI-58 (Graceful shutdown)
│   └── CHI-59 (Crash recovery)
└── CHI-60 (App quit cleanup)

CHI-48 (CLI detection)           ✓ DONE
```

## Quick Wins (Can Start Immediately)

1. **CHI-67** — Native window controls (Urgent, no dependencies)
2. **CHI-70** — Custom scrollbars (pure CSS, no dependencies)
3. **CHI-80** — Conversation empty state redesign (no dependencies)
4. **CHI-74** — Toast notification system (no dependencies)
5. **CHI-71** — Message animations (no dependencies)

---

## Phase 2 Gate Criteria

Phase 2 is complete when:

- [ ] User can send a message and receive a real streaming response from Claude Code CLI
- [ ] User can select a project folder and sessions are scoped to it
- [ ] Permission requests from CLI are intercepted and shown in PermissionDialog
- [ ] YOLO mode auto-approves permissions with appropriate logging
- [ ] Cost tracking shows real token costs in StatusBar and DetailsPanel
- [ ] Session switching suspends/resumes CLI processes correctly
- [ ] App quit gracefully shuts down all CLI processes
- [ ] Crash recovery shows user-friendly error UI
- [ ] All acceptance criteria on CHI-35 through CHI-60 are met

---

## Linear Workspace Reference

| Resource | URL |
|---|---|
| Workspace | https://linear.app/chief-wiggum |
| Phase 2 Project | https://linear.app/chief-wiggum/project/phase-2-make-it-real-951a81a3c66b |
| Phase 1 Project (Done) | https://linear.app/chief-wiggum/project/phase-1-foundation-ba6f471a516b |
| Team | Chief Wiggum (CHI) |
| User | f_lomas@hotmail.com (admin) |
