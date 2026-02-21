# TASKS-001: Phase 1 — Foundation

**Version:** 1.1
**Date:** 2026-02-20
**Status:** Active — In Progress
**Linear Project:** [Phase 1 — Foundation](https://linear.app/chief-wiggum/project/phase-1-foundation-ba6f471a516b)
**Workspace:** Chief Wiggum (`linear.app/chief-wiggum`)
**Team:** Chief Wiggum (CHI)
**Goal:** Bootable Tauri v2 app wrapping Claude Code with basic GUI messaging, terminal mode, and session persistence (Weeks 1–4)

---

## Summary

| Metric | Count |
|---|---|
| Total issues | 20 |
| Epics | 3 |
| Tasks | 17 |
| P0 (Urgent) | 14 |
| P1 (High) | 6 |
| **Done** | **6** (CHI-6, CHI-12, CHI-13, CHI-14, CHI-15, CHI-16) |
| **Remaining** | **14** |
| Estimated effort | ~28 dev-days (~21 remaining) |

---

## Epic 1: Core Scaffolding — [CHI-5](https://linear.app/chief-wiggum/issue/CHI-5/epic-core-scaffolding)

Foundation infrastructure: project setup, toolchain, database, CI/CD.

| ID | Title | Priority | Effort | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-8](https://linear.app/chief-wiggum/issue/CHI-8/scaffold-tauri-v2-project-with-rust-backend) | Scaffold Tauri v2 project with Rust backend | P0 | 1d | — | Todo |
| [CHI-9](https://linear.app/chief-wiggum/issue/CHI-9/configure-solidjs-2x-tailwindcss-v4-frontend) | Configure SolidJS 2.x + TailwindCSS v4 frontend | P0 | 1d | CHI-8 | Todo |
| [CHI-10](https://linear.app/chief-wiggum/issue/CHI-10/set-up-cicd-pipeline-lint-type-check-test-build) | Set up CI/CD pipeline (lint, type-check, test, build) | P0 | 1d | CHI-8, CHI-9 | Todo |
| [CHI-11](https://linear.app/chief-wiggum/issue/CHI-11/implement-sqlite-database-layer-with-migration-system) | Implement SQLite database layer with migration system | P0 | 2d | CHI-8 | Todo |
| [CHI-12](https://linear.app/chief-wiggum/issue/CHI-12/create-claudemd-agent-auto-briefing-file) | Create CLAUDE.md agent auto-briefing file | P1 | 0.5d | — | **Done** ✓ |

**Critical path:** CHI-8 → CHI-9 → CHI-10 (parallel: CHI-8 → CHI-11)

**⚠️ CHI-8 Note:** `src-tauri/` already contains bridge code from CHI-6. Scaffold must preserve existing `src-tauri/src/bridge/`, `Cargo.toml`, `lib.rs`. Also run `cargo check` + `cargo test` as first verification step.

---

## Epic 2: CLI Bridge — [CHI-6](https://linear.app/chief-wiggum/issue/CHI-6/epic-cli-bridge) — **DONE** ✓

Claude Code process management: PTY, parsing, permissions.

| ID | Title | Priority | Effort | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-13](https://linear.app/chief-wiggum/issue/CHI-13/implement-pty-process-spawning-for-claude-code-cli) | Implement PTY process spawning for Claude Code CLI | P0 | 2d | CHI-8 | **Done** ✓ |
| [CHI-14](https://linear.app/chief-wiggum/issue/CHI-14/build-structured-output-parser-for-cli-responses) | Build structured output parser for CLI responses | P0 | 2d | CHI-13 | **Done** ✓ |
| [CHI-15](https://linear.app/chief-wiggum/issue/CHI-15/create-versioned-adapter-interface-for-cli-format-changes) | Create versioned adapter interface for CLI format changes | P1 | 1d | CHI-14 | **Done** ✓ |
| [CHI-16](https://linear.app/chief-wiggum/issue/CHI-16/implement-permission-request-interception-from-cli) | Implement permission request interception from CLI | P0 | 2d | CHI-13, CHI-14 | **Done** ✓ |

**Implementation:** `src-tauri/src/bridge/` — process.rs, parser.rs, adapter.rs, permission.rs (33 unit tests total)

---

## Epic 3: Basic UI — [CHI-7](https://linear.app/chief-wiggum/issue/CHI-7/epic-basic-ui)

Core user interface: layout, conversations, terminal, sessions, packaging.

| ID | Title | Priority | Effort | Dependencies | Status |
|---|---|---|---|---|---|
| [CHI-17](https://linear.app/chief-wiggum/issue/CHI-17/build-main-layout-shell-5-zone-structure) | Build main layout shell (5-zone structure) | P0 | 2d | CHI-9 | Todo |
| [CHI-18](https://linear.app/chief-wiggum/issue/CHI-18/implement-conversation-view-with-markdowncode-rendering) | Implement conversation view with markdown/code rendering | P0 | 3d | CHI-17, CHI-14 | Todo |
| [CHI-19](https://linear.app/chief-wiggum/issue/CHI-19/build-message-input-component-with-send-controls) | Build message input component with send controls | P0 | 1.5d | CHI-17 | Todo |
| [CHI-20](https://linear.app/chief-wiggum/issue/CHI-20/implement-model-selector-opussonnethaiku) | Implement model selector (Opus/Sonnet/Haiku) | P1 | 1d | CHI-17, CHI-13 | Todo |
| [CHI-21](https://linear.app/chief-wiggum/issue/CHI-21/integrate-terminal-mode-with-xtermjs-webgl) | Integrate Terminal Mode with xterm.js + WebGL | P0 | 2d | CHI-17, CHI-13 | Todo |
| [CHI-22](https://linear.app/chief-wiggum/issue/CHI-22/implement-session-persistence-and-sidebar-navigation) | Implement session persistence and sidebar navigation | P0 | 2d | CHI-11, CHI-17, CHI-18 | Todo |
| [CHI-23](https://linear.app/chief-wiggum/issue/CHI-23/build-permission-dialog-ui-component) | Build permission dialog UI component | P0 | 1.5d | CHI-16, CHI-17 | Todo |
| [CHI-24](https://linear.app/chief-wiggum/issue/CHI-24/configure-cross-platform-packaging-dmg-msi-appimage) | Configure cross-platform packaging (.dmg, .msi, .AppImage) | P1 | 1.5d | CHI-10 | Todo |

**Critical path:** CHI-9 → CHI-17 → CHI-18 → CHI-22 (longest chain)

---

## Dependency Graph

```
CHI-8 (Tauri scaffold)                           ← NEXT: blocks everything
├── CHI-9 (SolidJS + Tailwind)
│   ├── CHI-10 (CI/CD) ──→ CHI-24 (Packaging)
│   └── CHI-17 (Layout shell)
│       ├── CHI-18 (Conversation view) ──→ CHI-22 (Session persistence)
│       ├── CHI-19 (Message input)
│       ├── CHI-20 (Model selector)
│       ├── CHI-21 (Terminal mode)
│       └── CHI-23 (Permission dialog UI)
├── CHI-11 (SQLite + migrations) ──→ CHI-22 (Session persistence)
└── CHI-13 (PTY spawning)              ✓ DONE
    ├── CHI-14 (Output parser)         ✓ DONE
    │   ├── CHI-15 (Versioned adapter) ✓ DONE
    │   ├── CHI-16 (Permission)        ✓ DONE ──→ CHI-23 (Permission dialog UI)
    │   └── CHI-18 (Conversation view)
    ├── CHI-20 (Model selector)
    └── CHI-21 (Terminal mode)

CHI-12 (CLAUDE.md)                     ✓ DONE
```

---

## Updated Execution Order

### ~~Week 1~~ Done
- ~~**CHI-12** — CLAUDE.md~~ ✓
- ~~**CHI-13** — PTY process spawning~~ ✓
- ~~**CHI-14** — Output parser~~ ✓
- ~~**CHI-15** — Versioned adapter~~ ✓
- ~~**CHI-16** — Permission interception~~ ✓

### Next: Core Scaffolding (unblocks everything else)
1. **CHI-8** — Tauri v2 scaffold (⚠️ preserve existing bridge code)
2. **CHI-9** — SolidJS + TailwindCSS (after CHI-8)
3. **CHI-11** — SQLite database (parallel with CHI-9, after CHI-8)
4. **CHI-10** — CI/CD pipeline (after CHI-8 + CHI-9)

### Then: UI Layer
5. **CHI-17** — Main layout shell (after CHI-9)
6. **CHI-19** — Message input (after CHI-17)
7. **CHI-18** — Conversation view (after CHI-17 + CHI-14 ✓)
8. **CHI-21** — Terminal mode (after CHI-17 + CHI-13 ✓)
9. **CHI-20** — Model selector (after CHI-17 + CHI-13 ✓)

### Finally: Integration
10. **CHI-22** — Session persistence (after CHI-11 + CHI-17 + CHI-18)
11. **CHI-23** — Permission dialog UI (after CHI-16 ✓ + CHI-17)
12. **CHI-24** — Cross-platform packaging (after CHI-10)

---

## Phase 1 Gate Criteria

Per GUIDE-002 §4.1, Phase 1 is complete when:

- [ ] App launches on macOS, Windows, Linux
- [ ] User can send a message and receive a streaming response via GUI
- [ ] User can switch to terminal mode and use Claude Code directly
- [ ] Sessions persist across app restarts
- [ ] Permission dialogs intercept and require user approval
- [ ] Model selector switches between Opus/Sonnet/Haiku
- [ ] CI/CD produces installers for all 3 platforms
- [ ] All acceptance criteria on CHI-8 through CHI-24 are met
- [ ] Cold startup < 2 seconds, idle RAM < 80 MB
- [ ] Zero `cargo clippy` warnings, zero TypeScript strict errors

---

## Linear Workspace Reference

| Resource | URL |
|---|---|
| Workspace | https://linear.app/chief-wiggum |
| Project | https://linear.app/chief-wiggum/project/phase-1-foundation-ba6f471a516b |
| Team | Chief Wiggum (CHI) |
| User | f_lomas@hotmail.com (admin) |
