# Feature Testing Matrix

**Last Updated:** 2026-02-25
**Protocol:** See `docs/guides/GUIDE-003-development-protocol.md`

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ N | Covered — N tests |
| ⚠️ N | Partial — N tests but below target |
| ❌ 0 | Gap — zero tests |
| — | Not applicable for this layer |
| 🔒 | Security-critical (95% target) |

## Coverage Targets & Thresholds

CI enforces a minimum combined (Rust + Frontend) line coverage threshold.
The threshold ramps up as test tracks are completed:

| Date | Threshold | Rationale |
|------|-----------|-----------|
| 2026-02-25 (initial) | **60%** | Baseline after Track A/B (CHI-147–152) |
| After Track C (CHI-153–157) | **70%** | Frontend store + component + utility tests |
| After Track D (CHI-158–162) | **75%** | E2E tests don't directly increase line coverage but validate integration |
| After Track E (CHI-163) + gaps filled | **85%** | Target steady-state coverage gate |
| Stretch goal | **90%** | Once all gaps in TESTING-MATRIX are filled |

**How to update the threshold:** Edit the `60` argument in `.github/workflows/ci.yml` → `coverage-gate` job → `Run coverage gate` step.

**Security-critical modules** (`bridge/permission.rs`, `commands/bridge.rs` permission handlers) target **95%** line coverage individually, tracked in the matrix below.

## Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| COVERED | Tests exist at all required layers |
| PARTIAL | Some layers tested, gaps remain |
| GAP | Critical test coverage missing |
| PLANNED | Tests planned, not yet written |

---

## Phase 1: Foundation

### Epic CHI-5: Core Scaffolding

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 8 | Scaffold Tauri v2 | ✅ 3 | — | — | ✅ 1 | COVERED |
| 9 | SolidJS + TailwindCSS | — | ❌ 0 | — | ✅ 1 | PARTIAL |
| 10 | CI/CD Pipeline | — | — | — | — | N/A |
| 11 | SQLite Database | ✅ 21 | — | ✅ 5 | — | COVERED |
| 12 | CLAUDE.md | — | — | — | — | N/A |

### Epic CHI-6: CLI Bridge

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 13 | PTY Process Spawning | ✅ 5 | — | — | — | PARTIAL |
| 14 | Stream Parser | ✅ 31 | — | — | — | COVERED |
| 15 | Versioned Adapter | ✅ 7 | — | — | — | COVERED |
| 16 | Permission Interception 🔒 | ✅ 8 | — | — | — | PARTIAL |

### Epic CHI-7: Basic UI

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 17 | Layout Shell | — | ❌ 0 | — | ✅ 5 | PARTIAL |
| 18 | Conversation View | — | ❌ 0 | — | ✅ 3 | PARTIAL |
| 19 | Message Input | — | ❌ 0 | — | ✅ 2 | PARTIAL |
| 20 | Model Selector | — | ❌ 0 | — | ✅ 1 | PARTIAL |
| 21 | Terminal Mode | — | ❌ 0 | — | ✅ 1 | PARTIAL |
| 22 | Session Persistence | ✅ 7 | ❌ 0 | — | ✅ 2 | PARTIAL |
| 23 | Permission Dialog 🔒 | — | ❌ 0 | — | ✅ 2 | PARTIAL |
| 24 | Cross-Platform Packaging | — | — | — | — | N/A |
| 26 | YOLO Mode 🔒 | — | ❌ 0 | — | ✅ 1 | PARTIAL |

---

## Phase 2: Make It Real

### Epic CHI-35: Project & Folder Management

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 40 | Folder Picker | ✅ 2 | ❌ 0 | — | — | PARTIAL |
| 41 | Project Sidebar | — | ❌ 0 | — | — | GAP |
| 42 | CLAUDE.md Detection | ✅ 3 | — | — | — | PARTIAL |
| 43 | Session-Project Binding | ✅ 2 | ❌ 0 | — | — | PARTIAL |

### Epic CHI-36: CLI Connection & Streaming

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 44 | SessionBridgeMap | ❌ 0 | — | — | — | GAP |
| 45 | IPC Commands for CLI | ❌ 0 | — | — | — | GAP |
| 46 | Streaming Event Loop | ❌ 0 | — | — | — | GAP |
| 47 | Replace Mock with CLI | — | ❌ 0 | — | ⚠️ 1 | GAP |
| 48 | CLI Detection | ✅ 3 | ❌ 0 | — | — | PARTIAL |
| 49 | Streaming Rendering | — | ❌ 0 | — | — | GAP |

### Epic CHI-37: Permission Flow Live 🔒

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 50 | Permission IPC 🔒 | ❌ 0 | ❌ 0 | ❌ 0 | — | GAP |
| 51 | Permission Pipeline 🔒 | ❌ 0 | ❌ 0 | ❌ 0 | — | GAP |
| 52 | YOLO Mode IPC 🔒 | ❌ 0 | ❌ 0 | — | — | GAP |

### Epic CHI-38: Live Cost Tracking

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 53 | Cost Accumulator | ✅ 4 | — | — | — | PARTIAL |
| 54 | StatusBar Cost Display | — | ❌ 0 | — | ⚠️ 1 | GAP |
| 55 | Per-message Cost | — | ❌ 0 | — | — | GAP |

### Epic CHI-39: Session Lifecycle

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 56 | Process Status | ❌ 0 | ❌ 0 | — | — | GAP |
| 57 | Session Switching | ❌ 0 | ❌ 0 | — | ✅ 1 | GAP |
| 58 | Graceful Shutdown | ❌ 0 | — | — | — | GAP |
| 59 | Crash Recovery | ❌ 0 | ❌ 0 | — | — | GAP |
| 60 | App Shutdown Cleanup | ❌ 0 | — | — | — | GAP |

---

## Phase 3: Agent SDK Integration

### Epic CHI-105: Slash Commands

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 106 | Command Discovery | ✅ 8 | — | — | — | PARTIAL |
| 107 | SlashCommandMenu UI | — | ❌ 0 | — | — | GAP |
| 108 | SDK Command Discovery | ✅ 4 | — | — | — | PARTIAL |

### Epic CHI-109: Parallel Sessions v2

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 110 | Split Pane Layout | — | ❌ 0 | — | — | GAP |
| 111 | Concurrent Session Limits | ✅ 3 | — | — | — | PARTIAL |
| 112 | Aggregate Cost Tracking | — | ❌ 0 | — | — | GAP |
| 113 | Session Activity Notifications | — | ❌ 0 | — | — | GAP |

### Epic CHI-114: File Explorer & @-Mention

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 115 | Backend File Scanner | ✅ 26 | — | — | — | COVERED |
| 116 | File Tree Sidebar | — | ❌ 0 | — | — | GAP |
| 117 | @-Mention Autocomplete | — | ❌ 0 | — | — | GAP |
| 118 | File Content Preview | — | ❌ 0 | — | — | GAP |
| 119 | Code Range Selection | — | ❌ 0 | — | — | GAP |

### Epic CHI-120: Settings & i18n

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 122 | Settings Backend | ✅ 6 | — | — | — | PARTIAL |
| 124 | Settings UI | — | ❌ 0 | — | — | GAP |
| 126 | i18n Infrastructure | — | ❌ 0 | — | — | GAP |
| 128 | Spanish Locale | — | ❌ 0 | — | — | GAP |
| 130 | Theme System | — | ❌ 0 | — | — | GAP |

### Epic CHI-121: Context Intelligence

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 123 | File Explorer Quick Wins | — | ❌ 0 | — | — | GAP |
| 125 | Context Quality Scoring | ✅ 4 | ❌ 0 | — | — | PARTIAL |
| 127 | Smart File Suggestions | ✅ 5 | ❌ 0 | — | — | PARTIAL |

### Epic CHI-129: UX Hardening

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 132 | Conversation Virtualization | — | ❌ 0 | — | — | GAP |
| 133 | FilePreview Editable Ranges | — | ❌ 0 | — | — | GAP |
| 135 | Missing Error States | — | ❌ 0 | — | — | GAP |
| 136 | Accessibility Pass | — | ❌ 0 | — | — | GAP |
| 137 | Message Edit/Regenerate | ✅ 3 | ❌ 0 | — | — | PARTIAL |

### Epic CHI-138: Project Actions

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 139 | Action Discovery | ✅ 12 | — | — | — | PARTIAL |
| 140 | Action Process Manager | ❌ 0 | — | — | — | GAP |
| 141 | Log-to-Agent Pipeline | ❌ 0 | ❌ 0 | — | — | GAP |
| 142 | Actions Sidebar | — | ❌ 0 | — | — | GAP |
| 143 | Action Output View | — | ❌ 0 | — | — | GAP |
| 144 | StatusBar/Palette Actions | — | ❌ 0 | — | — | GAP |
| 145 | Custom Action Config | ✅ 3 | ❌ 0 | — | — | PARTIAL |

### Epic CHI-146: Test Coverage to 90%+ (Code Quality Gate)

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 147 | Frontend Test Infrastructure | — | ✅ 12 | — | — | COVERED |
| 148 | Event Loop Tests | ✅ 12 | — | — | — | COVERED |
| 149 | Bridge IPC Command Tests | ⚠️ 12 | — | ❌ 0 | — | PARTIAL |
| 150 | Actions System Tests | ⚠️ 4 | — | ❌ 0 | — | PARTIAL |
| 151 | Remaining IPC Command Tests | ⚠️ 17 | — | ❌ 0 | — | PARTIAL |
| 152 | Permission Security Tests 🔒 | ⚠️ 7 | ❌ 0 | ❌ 0 | — | PARTIAL |
| 153 | Store Tests: session + conversation | — | ✅ 13 | — | — | COVERED |
| 154 | Store Tests: file + context + action | — | ✅ 65 | — | — | COVERED |
| 155 | Store Tests: ui + settings + i18n + toast (+ view/diagnostics/diff) | — | ✅ 50 | — | — | COVERED |
| 156 | Component Tests: critical UI | — | ✅ 29 | — | — | COVERED |
| 157 | Utility Tests: typewriter, scoring, keys, logger | — | ✅ 44 | — | — | COVERED |
| 158 | E2E: File Explorer + @-Mention | — | — | — | ✅ 10 | COVERED |
| 159 | E2E: Actions Discovery + Run | — | — | — | ✅ 9 | COVERED |
| 160 | E2E: Settings + Theme + i18n | — | — | — | ✅ 8 | COVERED |
| 161 | E2E: Permission + YOLO + Developer | — | — | — | ✅ 8 | COVERED |
| 162 | E2E: Split Panes + Sessions + Onboarding | — | — | — | ✅ 11 | COVERED |

### Epic CHI-93: Structured Log Collector

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 94 | 3-Layer Tracing | ✅ 8 | — | — | — | PARTIAL |
| 95 | Log Redaction Engine | ✅ 13 | — | — | — | COVERED |
| 96 | Diagnostic Bundle Export | ✅ 5 | — | — | — | PARTIAL |
| 97 | Frontend Log Forwarding | — | ❌ 0 | — | — | GAP |
| 98 | Export Diagnostic UI | — | ❌ 0 | — | — | GAP |
| 99 | DB Query Tracing | ✅ 4 | — | — | — | PARTIAL |
| 100 | GitHub Issue Templates | — | — | — | — | N/A |

### UX Polish Epics

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 67 | Native Window Controls | — | — | — | — | N/A |
| 72 | Typing Indicator | — | ❌ 0 | — | — | GAP |
| 73 | Typewriter Buffer | — | ❌ 0 | — | — | GAP |
| 74 | Toast System | — | ❌ 0 | — | — | GAP |
| 76 | Command Palette | — | ❌ 0 | — | ✅ 1 | PARTIAL |
| 77 | Session Quick-Switcher | — | ❌ 0 | — | — | GAP |
| 78 | Context Menus | — | ❌ 0 | — | — | GAP |
| 79 | Keyboard Help | — | ❌ 0 | — | ✅ 2 | PARTIAL |
| 80 | Empty State | — | ❌ 0 | — | ✅ 1 | PARTIAL |
| 84 | Sidebar Icon-Rail | — | ❌ 0 | — | ✅ 1 | PARTIAL |
| 87 | View Tab Icons | — | ❌ 0 | — | — | GAP |
| 88 | Sidebar Search | — | ❌ 0 | — | — | GAP |
| 89 | ToolUseBlock | — | ❌ 0 | — | — | GAP |
| 90 | ThinkingBlock | — | ❌ 0 | — | — | GAP |
| 91 | Permission Records | — | ❌ 0 | — | — | GAP |

---

## Coverage Summary

| Category | Total Features | COVERED | PARTIAL | GAP | N/A |
|----------|---------------|---------|---------|-----|-----|
| Phase 1 | 18 | 4 | 10 | 1 | 3 |
| Phase 2 | 21 | 0 | 6 | 15 | 0 |
| Phase 3 | 61 | 14 | 19 | 24 | 4 |
| **Total** | **100** | **18 (18%)** | **35 (35%)** | **40 (40%)** | **7 (7%)** |

**Target:** Move all GAP → PARTIAL within next sprint, all PARTIAL → COVERED within 2 sprints.
