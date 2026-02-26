# Feature Testing Matrix

**Last Updated:** 2026-02-26
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

**How to update the threshold:** Edit the threshold argument in `.github/workflows/ci.yml` → `coverage-gate` job → `Run coverage gate` step.

**Security-critical modules** (`bridge/permission.rs`, `commands/bridge.rs` permission handlers) target **95%** line coverage individually, tracked in the matrix below.

**Current CI threshold:** 75% (bumped from 60% after Track F/G/H completion)

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
| 9 | SolidJS + TailwindCSS | — | ✅ 5 | — | ✅ 1 | COVERED |
| 10 | CI/CD Pipeline | — | — | — | — | N/A |
| 11 | SQLite Database | ✅ 21 | — | ✅ 5 | — | COVERED |
| 12 | CLAUDE.md | — | — | — | — | N/A |

### Epic CHI-6: CLI Bridge

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 13 | PTY Process Spawning | ✅ 5 | — | — | — | PARTIAL |
| 14 | Stream Parser | ✅ 31 | — | — | — | COVERED |
| 15 | Versioned Adapter | ✅ 7 | — | — | — | COVERED |
| 16 | Permission Interception 🔒 | ✅ 15 | — | — | ✅ 8 | COVERED |

### Epic CHI-7: Basic UI

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 17 | Layout Shell | — | ✅ 5 | — | ✅ 5 | COVERED |
| 18 | Conversation View | — | ✅ 11 | — | ✅ 3 | COVERED |
| 19 | Message Input | — | ✅ 13 | — | ✅ 4 | COVERED |
| 20 | Model Selector | — | ⚠️ 2 | — | ✅ 1 | PARTIAL |
| 21 | Terminal Mode | — | — | — | ✅ 1 | PARTIAL |
| 22 | Session Persistence | ✅ 7 | ✅ 2 | — | ✅ 6 | COVERED |
| 23 | Permission Dialog 🔒 | — | ⚠️ 2 | — | ✅ 5 | PARTIAL |
| 24 | Cross-Platform Packaging | — | — | — | — | N/A |
| 26 | YOLO Mode 🔒 | — | ✅ 5 | — | ✅ 4 | COVERED |

---

## Phase 2: Make It Real

### Epic CHI-35: Project & Folder Management

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 40 | Folder Picker | ✅ 2 | ✅ 10 | — | — | PARTIAL |
| 41 | Project Sidebar | — | ✅ 10 | — | — | PARTIAL |
| 42 | CLAUDE.md Detection | ✅ 3 | — | — | — | PARTIAL |
| 43 | Session-Project Binding | ✅ 2 | ✅ 10 | — | — | PARTIAL |

### Epic CHI-36: CLI Connection & Streaming

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 44 | SessionBridgeMap | ✅ 7 | — | — | — | PARTIAL |
| 45 | IPC Commands for CLI | ✅ 12 | — | — | — | PARTIAL |
| 46 | Streaming Event Loop | ✅ 12 | — | — | — | PARTIAL |
| 47 | Replace Mock with CLI | — | ✅ 11 | — | ✅ 2 | PARTIAL |
| 48 | CLI Detection | ✅ 3 | ✅ 2 | — | — | PARTIAL |
| 49 | Streaming Rendering | — | ✅ 11 | — | ✅ 2 | PARTIAL |

### Epic CHI-37: Permission Flow Live 🔒

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 50 | Permission IPC 🔒 | ✅ 12 | ✅ 5 | — | ✅ 5 | COVERED |
| 51 | Permission Pipeline 🔒 | ✅ 7 | ✅ 5 | — | ✅ 5 | COVERED |
| 52 | YOLO Mode IPC 🔒 | ✅ 7 | ✅ 5 | — | ✅ 4 | COVERED |

### Epic CHI-38: Live Cost Tracking

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 53 | Cost Accumulator | ✅ 4 | — | — | — | PARTIAL |
| 54 | StatusBar Cost Display | — | ✅ 5 | — | ✅ 2 | PARTIAL |
| 55 | Per-message Cost | — | ✅ 11 | — | — | PARTIAL |

### Epic CHI-39: Session Lifecycle

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 56 | Process Status | ✅ 17 | ✅ 2 | — | ✅ 4 | COVERED |
| 57 | Session Switching | ✅ 17 | ✅ 2 | — | ✅ 4 | COVERED |
| 58 | Graceful Shutdown | ✅ 17 | — | — | ✅ 4 | PARTIAL |
| 59 | Crash Recovery | ✅ 17 | ✅ 11 | — | — | PARTIAL |
| 60 | App Shutdown Cleanup | ✅ 17 | — | — | — | PARTIAL |

---

## Phase 3: Agent SDK Integration

### Epic CHI-105: Slash Commands

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 106 | Command Discovery | ✅ 8 | ✅ 13 | — | — | PARTIAL |
| 107 | SlashCommandMenu UI | — | ✅ 13 | — | — | PARTIAL |
| 108 | SDK Command Discovery | ✅ 4 | — | — | — | PARTIAL |

### Epic CHI-109: Parallel Sessions v2

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 110 | Split Pane Layout | — | ✅ 5 | — | ✅ 3 | PARTIAL |
| 111 | Concurrent Session Limits | ✅ 3 | — | — | ✅ 2 | PARTIAL |
| 112 | Aggregate Cost Tracking | — | ✅ 5 | — | — | PARTIAL |
| 113 | Session Activity Notifications | — | ✅ 5 | — | ✅ 2 | PARTIAL |

### Epic CHI-114: File Explorer & @-Mention

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 115 | Backend File Scanner | ✅ 26 | — | — | — | COVERED |
| 116 | File Tree Sidebar | — | ✅ 14 | — | ✅ 4 | COVERED |
| 117 | @-Mention Autocomplete | — | ✅ 15 | — | ✅ 2 | COVERED |
| 118 | File Content Preview | — | ✅ 14 | — | ✅ 3 | COVERED |
| 119 | Code Range Selection | — | ✅ 15 | — | ✅ 1 | COVERED |

### Epic CHI-120: Settings & i18n

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 122 | Settings Backend | ✅ 6 | ✅ 8 | — | ✅ 4 | COVERED |
| 124 | Settings UI | — | ✅ 8 | — | ✅ 4 | COVERED |
| 126 | i18n Infrastructure | — | ✅ 8 | — | ✅ 1 | COVERED |
| 128 | Spanish Locale | — | ✅ 8 | — | ✅ 1 | COVERED |
| 130 | Theme System | — | ✅ 8 | — | ✅ 2 | COVERED |

### Epic CHI-121: Context Intelligence

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 123 | File Explorer Quick Wins | — | ✅ 14 | — | ✅ 4 | COVERED |
| 125 | Context Quality Scoring | ✅ 4 | ✅ 15 | — | ✅ 1 | COVERED |
| 127 | Smart File Suggestions | ✅ 5 | ✅ 15 | — | — | COVERED |

### Epic CHI-129: UX Hardening

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 132 | Conversation Virtualization | — | ✅ 11 | — | ✅ 2 | PARTIAL |
| 133 | FilePreview Editable Ranges | — | ✅ 14 | — | ✅ 3 | COVERED |
| 135 | Missing Error States | — | ✅ 5 | — | — | PARTIAL |
| 136 | Accessibility Pass | — | — | — | — | N/A |
| 137 | Message Edit/Regenerate | ✅ 3 | ✅ 11 | — | — | PARTIAL |

### Epic CHI-138: Project Actions

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 139 | Action Discovery | ✅ 12 | ✅ 13 | — | ✅ 4 | COVERED |
| 140 | Action Process Manager | ✅ 4 | — | — | ✅ 2 | PARTIAL |
| 141 | Log-to-Agent Pipeline | ✅ 4 | ✅ 13 | — | — | PARTIAL |
| 142 | Actions Sidebar | — | ✅ 13 | — | ✅ 4 | COVERED |
| 143 | Action Output View | — | ✅ 6 | — | ✅ 4 | COVERED |
| 144 | StatusBar/Palette Actions | — | ✅ 7 | — | ✅ 2 | COVERED |
| 145 | Custom Action Config | ✅ 3 | ✅ 13 | — | ✅ 1 | COVERED |

### Epic CHI-146: Test Coverage to 90%+ (Code Quality Gate)

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 147 | Frontend Test Infrastructure | — | ✅ 12 | — | — | COVERED |
| 148 | Event Loop Tests | ✅ 12 | — | — | — | COVERED |
| 149 | Bridge IPC Command Tests | ✅ 12 | — | — | — | COVERED |
| 150 | Actions System Tests | ✅ 4 | — | — | — | COVERED |
| 151 | Remaining IPC Command Tests | ✅ 17 | — | — | — | COVERED |
| 152 | Permission Security Tests 🔒 | ✅ 7 | — | — | — | PARTIAL |
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
| 163 | CI Coverage Gates & Reporting | — | — | — | — | N/A |

### Epic CHI-164: Quality Coverage Enhancement (90%+ Line Coverage)

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 165 | E2E Slash Command Menu | — | — | — | ✅ 8 | COVERED |
| 166 | E2E Sidebar Session Actions | — | — | — | ✅ 8 | COVERED |
| 167 | E2E Settings Modal Interactions | — | — | — | ✅ 8 | COVERED |
| 168 | E2E Diff Review Pane | — | — | — | ✅ 6 | COVERED |
| 169 | E2E Diagnostics Export Dialog | — | — | — | ✅ 6 | COVERED |
| 170 | Component Tests: Conversation Rendering | — | ✅ 22 | — | — | COVERED |
| 171 | Component Tests: Slash & Context UI | — | ✅ 26 | — | — | COVERED |
| 172 | Component Tests: Layout Shell | — | ✅ 25 | — | — | COVERED |
| 173 | Component Tests: Settings & Onboarding | — | ✅ 20 | — | — | COVERED |
| 174 | Component Tests: Explorer & Actions | — | ✅ 22 | — | — | COVERED |
| 175 | Cross-Store Integration Tests | — | — | ✅ 18 | — | COVERED |
| 176 | CI Coverage Threshold Ramp | — | — | — | — | N/A |

### Epic CHI-93: Structured Log Collector

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 94 | 3-Layer Tracing | ✅ 8 | — | — | — | PARTIAL |
| 95 | Log Redaction Engine | ✅ 13 | — | — | — | COVERED |
| 96 | Diagnostic Bundle Export | ✅ 5 | ✅ 6 | — | — | PARTIAL |
| 97 | Frontend Log Forwarding | — | ✅ 5 | — | — | PARTIAL |
| 98 | Export Diagnostic UI | — | ✅ 6 | — | — | PARTIAL |
| 99 | DB Query Tracing | ✅ 4 | — | — | — | PARTIAL |
| 100 | GitHub Issue Templates | — | — | — | — | N/A |

### UX Polish Epics

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 67 | Native Window Controls | — | — | — | — | N/A |
| 72 | Typing Indicator | — | ✅ 11 | — | — | PARTIAL |
| 73 | Typewriter Buffer | — | ✅ 8 | — | — | COVERED |
| 74 | Toast System | — | ✅ 3 | — | — | PARTIAL |
| 76 | Command Palette | — | ✅ 7 | — | ✅ 1 | COVERED |
| 77 | Session Quick-Switcher | — | ✅ 7 | — | — | PARTIAL |
| 78 | Context Menus | — | — | — | — | GAP |
| 79 | Keyboard Help | — | ✅ 16 | — | ✅ 4 | COVERED |
| 80 | Empty State | — | ✅ 5 | — | ✅ 3 | COVERED |
| 84 | Sidebar Icon-Rail | — | ✅ 5 | — | ✅ 3 | COVERED |
| 87 | View Tab Icons | — | ✅ 16 | — | — | PARTIAL |
| 88 | Sidebar Search | — | ✅ 5 | — | ✅ 3 | PARTIAL |
| 89 | ToolUseBlock | — | ✅ 11 | — | — | PARTIAL |
| 90 | ThinkingBlock | — | ✅ 11 | — | — | PARTIAL |
| 91 | Permission Records | — | ✅ 11 | — | — | PARTIAL |

---

## Coverage Summary

| Category | Total Features | COVERED | PARTIAL | GAP | PLANNED | N/A |
|----------|---------------|---------|---------|-----|---------|-----|
| Phase 1 | 18 | 10 | 4 | 0 | 0 | 4 |
| Phase 2 | 21 | 7 | 14 | 0 | 0 | 0 |
| Phase 3 (CHI-146 & earlier) | 62 | 33 | 22 | 1 | 0 | 6 |
| Phase 3 (CHI-164 epic) | 12 | 11 | 0 | 0 | 0 | 1 |
| **Total** | **113** | **61 (54%)** | **40 (35%)** | **1 (1%)** | **0 (0%)** | **11 (10%)** |

**Previous (pre-CHI-146):** 18 COVERED (18%), 35 PARTIAL (35%), 40 GAP (40%), 8 N/A (8%)
**Post-CHI-146:** 50 COVERED (50%), 40 PARTIAL (40%), 1 GAP (1%), 10 N/A (10%)
**Current (after CHI-164 completion):** 61 COVERED (54%), 40 PARTIAL (35%), 1 GAP (1%), 0 PLANNED (0%), 11 N/A (10%)

**Remaining GAP:** CHI-78 (Context Menus) — pure UI feature, no store/backend logic, low priority.

**Target:** CI threshold is now 75% (via CHI-176). Next ramp target is 85% after additional gap closure and combined coverage growth.
