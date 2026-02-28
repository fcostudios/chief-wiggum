# TASKS-005: Actions Center — Assembly Line Feature Spec

**Status:** Planned (Backlog)
**Linear Epic:** CHI-218 — Actions Center
**Created:** 2026-02-28
**Author:** Cowork Session 8

---

## Overview

The Actions Center is a dedicated control plane for managing running and historical project actions across all open projects simultaneously. It complements the existing Sidebar Actions panel (discovery plane) and solves three core UX problems:

1. **Location friction:** Stopping/restarting a running action requires navigating the discovery sidebar with hundreds of items.
2. **Multi-project blindspot:** No overview of what's running across different projects.
3. **No history:** Completed action output disappears; no audit trail.

The feature uses an **assembly line spatial metaphor**: warehouses (projects) contain lanes (running actions), with CSS conveyor belt animations reflecting live process state.

---

## Design Philosophy

### Separation of concerns

| Component | Role | Where |
|-----------|------|--------|
| Sidebar Actions panel (existing) | Discovery plane — what *can* run | Left sidebar → Actions tab |
| Actions Center (new) | Control plane — what *is* running + history | Main view → Actions Center tab |

These are complementary. The discovery panel still shows all available actions per project. The Actions Center shows live state + history. Users flow naturally between them via context menu ("View in Actions Center") or the dedicated sidebar icon.

### Target users

| User type | Primary need | How we address it |
|-----------|-------------|-------------------|
| Senior developer | Low context-switch cost | One-glance active count, `Cmd+Shift+A` shortcut, technical detail mode |
| Junior developer | "What's running?" clarity | Warehouse grid with color-coded lanes; friendly empty states |
| Non-technical user | Status without CLI text | Category icon + status color alone conveys state; technical text hidden by default |
| Multi-project user | Cross-project overview | Warehouse grid on Overview page |

### CX benchmarks

- **Vercel Dashboard** → Warehouse card grid with active indicators
- **Sidekiq Web UI** → Count badges at a glance ("4 busy, 1 retry")
- **GitHub Actions** → Per-project run history with exit code + duration
- **Temporal UI** → Running vs. history tab separation
- **Factorio / Factory games** → Spatial metaphor; process monitoring as enjoyable ownership

---

## Architecture

### View hierarchy

```
Actions Center (ActionsCenter.tsx)
├── Overview mode (default)
│   ├── Header: "Actions Center" + Technical Mode toggle
│   ├── Summary bar: "N projects · M lanes active"  [aria-live="polite"]
│   ├── Warehouse grid: one WarehouseCard per project
│   └── [+ Launch Action] FAB (bottom-right)
│
└── Warehouse Detail mode (selectedWarehouse signal)
    ├── ← Back to Overview  |  Project Name
    ├── [Active Lanes] tab  |  [History] tab  |  [+ Add Lane] button
    ├── Active tab: LaneCard per running action
    │   └── (empty: "No lanes running — add one to start the assembly line")
    └── History tab: LaneHistory (lazy-loaded on first open)
```

### New frontend files

| File | Purpose |
|------|---------|
| `src/components/actions/ActionsCenter.tsx` | Top-level container; view routing between Overview and Warehouse Detail |
| `src/components/actions/WarehouseCard.tsx` | Project summary card with conveyor animation + mini lane dots |
| `src/components/actions/LaneCard.tsx` | Individual running action with conveyor strip, inline controls, elapsed timer |
| `src/components/actions/LaneLogScreen.tsx` | **Supervisor log screen** — full streaming terminal view, opened by clicking a lane body |
| `src/components/actions/LaneHistory.tsx` | Completed runs list per project; lazy-loaded |
| `src/components/actions/ActionQuickLaunch.tsx` | 2-step action picker modal (project → action → args) |

### Modified frontend files

| File | Change |
|------|--------|
| `src/stores/actionStore.ts` | Add `crossProjectRunning`, `outputs` (ring buffer), `history`, `historyLoading`, `loadAllRunningActions()`, `loadActionHistory()`, `listenToActionOutput()` |
| `src/components/layout/MainLayout.tsx` | Add "Actions Center" view tab |
| `src/components/layout/Sidebar.tsx` | Add icon-rail entry with active lane badge |
| `src/components/layout/StatusBar.tsx` | Add "N running" pill (visible when actions active) |
| `src/components/actions/ActionRow.tsx` | Add "View in Actions Center" context menu item (CHI-78 pattern) |
| `src/lib/keybindings.ts` | Add `Cmd+Shift+A` → `actions:open_center` |
| `src/locales/en.json` | New strings for all Actions Center UI copy |
| `src/locales/es.json` | Spanish translations for new strings |
| `src/styles/tokens.css` | Add `@keyframes conveyorSlide`, `@keyframes laneStartingPulse`, reduced-motion guards |

### New backend files / changes

| File | Change |
|------|--------|
| `src-tauri/src/actions/manager.rs` | Add `project_id: String`, `project_name: String` to `ActionRuntime`; update `spawn_action()` signature |
| `src-tauri/src/db/migrations.rs` | Migration v4: `action_history` table + index |
| `src-tauri/src/db/queries.rs` | `insert_action_history()`, `get_action_history()` typed query functions |
| `src-tauri/src/actions/event_loop.rs` | Write history row on `BridgeOutput::Exited`; update `action:status_changed` payload |
| `src-tauri/src/commands/actions.rs` | Add `list_all_running_actions`, `get_action_history` IPC commands |
| `src-tauri/src/main.rs` | Register new IPC commands in `invoke_handler` |

---

## Sub-task Specs

### CHI-219: H1a — Backend (est. ~4h)

**Goal:** Persistence layer and cross-project IPC foundation.

**Step 1 — Extend `ActionRuntime`**

In `actions/manager.rs`:
```rust
struct ActionRuntime {
    bridge: Arc<ActionBridge>,
    command: String,
    working_dir: String,
    project_id: String,    // NEW
    project_name: String,  // NEW
    started_at: std::time::Instant,  // NEW (for elapsed_ms)
}
```

`spawn_action()` gains `project_id: String` and `project_name: String` params. The `start_action` IPC command passes these from the active `projectStore` context.

**Step 2 — `list_all_running_actions` IPC**

```rust
#[derive(Debug, Clone, Serialize)]
pub struct CrossProjectRunningAction {
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub action_name: String,
    pub status: ActionStatus,
    pub elapsed_ms: u64,
    pub last_output_line: Option<String>,
    pub command: String,
    pub category: ActionCategory,
    pub is_long_running: bool,
}

#[tauri::command]
pub async fn list_all_running_actions(
    action_map: State<'_, ActionBridgeMap>,
) -> AppResult<Vec<CrossProjectRunningAction>>
```

Iterates all entries in `ActionBridgeMap`, computes `elapsed_ms` from `started_at`, reads `last_output_line` from the output ring buffer (last non-error line).

**Step 3 — DB migration v4**

```sql
CREATE TABLE IF NOT EXISTS action_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    project_name TEXT NOT NULL,
    action_name TEXT NOT NULL,
    command TEXT NOT NULL,
    category TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    exit_code INTEGER,
    duration_ms INTEGER,
    output_preview TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_action_history_project
    ON action_history (project_id, started_at DESC);
```

**Step 4 — `get_action_history` IPC**

```rust
#[tauri::command]
pub async fn get_action_history(
    project_id: String,
    limit: Option<u32>,
    db: State<'_, Database>,
) -> AppResult<Vec<ActionHistoryEntry>>
```

`limit` defaults to 50. Results ordered `started_at DESC`.

**Step 5 — History write on exit**

In `actions/event_loop.rs`, in the `BridgeOutput::Exited` handler, before emitting `action:exited`:
1. Compute `ended_at` = now (ISO-8601), `duration_ms` = now - `started_at`
2. Collect `output_preview` = last 3 non-error lines from output buffer, joined `\n`
3. Call `db.insert_action_history(...)` — must complete within 100ms
4. Emit updated `action:status_changed` event (with `project_id` + `project_name`)
5. Emit `action:exited` event

**Step 6 — Update `action:status_changed` event payload**

```rust
#[derive(Debug, Clone, Serialize)]
pub struct ActionStatusChangedPayload {
    pub action_id: String,
    pub project_id: String,    // NEW
    pub project_name: String,  // NEW
    pub status: ActionStatus,
    pub elapsed_ms: u64,       // NEW
}
```

**Tests required:**
- `list_all_running_actions` returns correct count with mock runtimes
- `get_action_history` returns results ordered by `started_at DESC`
- Migration v4 applies cleanly to a v3 database (idempotent)
- History row written within 100ms of exit event

**Acceptance criteria:**
- [ ] `CrossProjectRunningAction` struct defined in `commands/actions.rs`
- [ ] `list_all_running_actions` IPC registered in `main.rs`
- [ ] `get_action_history` IPC registered in `main.rs`
- [ ] `action_history` table created by migration v4
- [ ] History row written on every action exit (exit code 0 and non-0)
- [ ] `action:status_changed` payload includes `project_id`, `project_name`, `elapsed_ms`
- [ ] No `.unwrap()` in production paths; all errors return `AppResult`
- [ ] `#[tracing::instrument]` on all new public functions

---

### CHI-220: H1b — Overview UI + WarehouseCard (est. ~1d)

**Goal:** Overview page and the reactive store additions that power it.

**`actionStore.ts` additions:**

```typescript
interface ActionState {
  // ... existing fields ...
  crossProjectRunning: CrossProjectRunningAction[];  // NEW
  history: Record<string, ActionHistoryEntry[]>;     // NEW (keyed by project_id)
  historyLoading: Record<string, boolean>;           // NEW
}

export async function loadAllRunningActions(): Promise<void>
// Calls list_all_running_actions IPC, sets crossProjectRunning

export function subscribeToActionStatusChanged(): UnlistenFn
// Listens to action:status_changed; updates crossProjectRunning reactively
// (replaces or inserts entry by action_id + project_id)
```

**`WarehouseCard.tsx` visual spec:**

```
┌─────────────────────────────────────────────┐
│  🏭  Project Alpha                 3 active  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ← conveyor strip
│  ●  ●  ●                                    │  ← mini lane status dots
└─────────────────────────────────────────────┘
```

Conveyor CSS:
```css
.conveyor-strip {
  background: repeating-linear-gradient(
    90deg,
    var(--color-border) 0, var(--color-border) 8px,
    transparent 8px, transparent 16px
  );
  height: 6px;
}
.conveyor-strip.active {
  animation: conveyorSlide 0.6s linear infinite;
}
@keyframes conveyorSlide {
  to { background-position-x: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .conveyor-strip.active { animation: none; }
}
```

Lane count badge: green pill (`bg-green-500 text-white`) when active > 0, gray (`bg-surface-2`) when 0.

Mini dots: 10px circles, pulsing green = running, amber = starting, red = failed.

**`ActionsCenter.tsx`:**
- Local signal: `const [selectedWarehouse, setSelectedWarehouse] = createSignal<string | null>(null)`
- `<Show when={selectedWarehouse()} fallback={<OverviewGrid />}><WarehouseDetail projectId={selectedWarehouse()!} /></Show>`
- Calls `loadAllRunningActions()` on mount; subscribes to `action:status_changed`
- Summary bar: `createMemo(() => \`${projects.length} projects · ${crossProjectRunning.length} lanes active\`)`

**Sidebar + MainLayout integration:**
- Add `'actions_center'` to `uiStore` view type union
- New view tab "⚙ Center" in MainLayout alongside Files / Actions / Diff
- New icon-rail entry in Sidebar (factory SVG icon); badge shows `crossProjectRunning.length` when > 0
- `Cmd+Shift+A` keybinding switches to `actions_center` view

**Empty states:**
- No projects: Centered static SVG robot + "Open a project to see its warehouse"
- All idle: Warehouse cards render with gray conveyor, "0 active" gray badge; no error state

**Accessibility:**
- `WarehouseCard` renders as `<button role="button" aria-label="Open {project.name} warehouse">`
- Summary bar: `<div role="status" aria-live="polite">`
- Conveyor animation element: `aria-hidden="true"`

**Acceptance criteria:**
- [ ] Overview renders one WarehouseCard per project
- [ ] Warehouse cards show correct active lane count from `crossProjectRunning`
- [ ] Conveyor animation runs when `activeLanes > 0`; static otherwise
- [ ] `prefers-reduced-motion: reduce` disables animation (test with DevTools)
- [ ] Clicking a card sets `selectedWarehouse` and renders Warehouse Detail
- [ ] Summary bar updates reactively when `action:status_changed` fires
- [ ] `Cmd+Shift+A` switches to Actions Center view
- [ ] Sidebar badge shows correct count; hidden when 0
- [ ] Empty states render correctly for no-projects and all-idle scenarios

---

### CHI-221: H1c — LaneCard + Warehouse Detail + animations (est. ~1.5d)

**Goal:** The core interactive UI for managing individual running actions.

**Warehouse Detail layout:**

```tsx
<div class="flex flex-col h-full">
  {/* Header */}
  <div class="flex items-center gap-2 p-4 border-b border-border">
    <button onClick={() => setSelectedWarehouse(null)}>← Overview</button>
    <h2>{project.name}</h2>
    <button class="ml-auto">[+ Add Lane]</button>
  </div>
  {/* Tabs */}
  <div class="flex border-b border-border">
    <tab>Active ({activeLanes.length})</tab>
    <tab>History</tab>
  </div>
  {/* Content */}
  <Show when={activeTab() === 'active'}>
    <For each={activeLanes}>{(lane) => <LaneCard lane={lane} />}</For>
    <Show when={activeLanes.length === 0}>
      <EmptyState text="No lanes running — add one to start the assembly line" />
    </Show>
  </Show>
  <Show when={activeTab() === 'history'}>
    <LaneHistory projectId={projectId} />
  </Show>
</div>
```

**`LaneCard.tsx` visual spec:**

```
┌──[color border]────────────────────────────────────────────────┐
│  🔨  npm run build                               [2m 14s]      │
│  ░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░  ← conveyor strip │
│  > Compiled 42 modules                                         │
│                                         [hover → ⏹ ↺ 🤖]      │
└────────────────────────────────────────────────────────────────┘
```

Left border colors:
- `starting`: `border-amber-500` + `animation: laneStartingPulse 1s ease-in-out infinite`
- `running`: `border-green-500`
- `failed`: `border-red-500`
- `stopped`: `border-border` (gray)

Conveyor strip colors (8px height):
- `running`: `green-500/30` + `green-500/10` alternating, `conveyorSlide` at 0.4s
- `starting`: amber variant, 0.8s
- `failed`: `red-500/20` + `red-500/10`, no animation
- `stopped`: `border/50` + transparent, no animation

Category icons: ⚙️ Dev · 🔨 Build · 🧪 Test · 🎨 Lint · 🚀 Deploy · ✨ Custom

Elapsed timer:
```typescript
// setInterval in onMount, clearInterval in onCleanup
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
```

Exit code badge (on completion):
- Exit 0: `<span class="badge-green">✓ 0</span>`
- Exit non-0: `<span class="badge-red">✗ {code}</span>`

Inline controls (hover/focus reveal):
```tsx
<div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-surface/80 backdrop-blur rounded-full px-2 py-1">
  <IconButton icon="stop" label="Stop" onClick={() => stopAction(lane.action_id)} />
  <IconButton icon="restart" label="Restart" onClick={() => restartAction(lane)} />
  <IconButton icon="ai" label="Ask AI" onClick={() => askAiAboutAction(lane)} />
</div>
```

Completed card behavior: stays visible 10s after exit, opacity fades to 50%, then `slide-out-down` animation removes it.

Technical mode (when `uiStore.actionTechnicalMode`): additionally shows `command` in `font-mono text-xs text-muted`.

**`askAiAboutAction`:**
Switches to conversation view and pre-fills MessageInput with:
```
The action "{name}" just completed with exit code {code} after {duration}.
Here's the output:
{output_preview}

What happened and what should I do next?
```

### 6\. `LaneLogScreen.tsx` — Supervisor log screen (click-through view)

**Trigger:** Clicking anywhere on the LaneCard *body* (not the inline control buttons) opens the supervisor screen. The card is a split interaction target — the body is a "drill-in" button, the control pill is an action overlay.

**Mental model:** The user is a factory supervisor walking up to a machine to inspect what it's doing. The "computer screen" on the machine shows the live scrolling log. They can watch it, search it, and decide to stop/restart/ask AI — without leaving the Actions Center.

#### Where it renders

The `LaneLogScreen` is shown **inside the Warehouse Detail main area**, replacing the lane list (or alongside it in split mode if space permits). It does NOT open a new modal — it's an in-place panel transition (slide-in from right within the Warehouse Detail frame). Navigation breadcrumb updates to: `← Overview / Project Alpha / npm run build`.

```
← Overview  /  Project Alpha  /  🔨 npm run build      [⏹ Stop] [↺ Restart] [🤖 Ask AI]
──────────────────────────────────────────────────────────────────────────────────────────
┌─ SUPERVISOR SCREEN ────────────────────────────────────────── [Wrap] [Search] [↓ Tail] ┐
│ [2m 14s]  Running — npm run build                                                       │
│ ░░▓▓░░▓▓░░▓▓░░▓▓░░▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ← conveyor strip (live)   │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  > webpack 5.91.0                                                                       │
│  > Starting compilation...                                                              │
│  > asset main.js 2.4 MiB                                                               │
│  > asset vendors~main.js 1.1 MiB                                                       │
│  > modules by path ./src/ 847 KiB                                                       │
│    ./src/index.tsx 3.2 KiB [built]                                                     │
│    ./src/App.tsx 8.7 KiB [built]                                                       │
│    + 286 modules                                                                        │
│  > webpack compiled successfully in 4233 ms                                             │
│  ▌  (cursor blinks while running — disappears on exit)                                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Implementation

**`actionStore.ts` — output ring buffer:**

The store must maintain a per-action line buffer (ring buffer, max 2000 lines) built from `action:output` events. Lines older than the buffer capacity are dropped. This is the source of truth for the log view.

```typescript
interface ActionState {
  // ... existing ...
  outputs: Record<string, ActionLogLine[]>;  // ring buffer per action_id
}

interface ActionLogLine {
  line: string;
  is_error: boolean;
  ts: number;  // performance.now() at receipt — for relative timestamps in technical mode
}

// Max lines kept in memory per action
const OUTPUT_RING_SIZE = 2000;
```

`action:output` listener appends to `outputs[action_id]`, truncating to `OUTPUT_RING_SIZE`.

**`LaneLogScreen.tsx` props:**

```typescript
interface LaneLogScreenProps {
  lane: CrossProjectRunningAction;
  onBack: () => void;  // returns to lane list
}
```

**Terminal area (the "computer screen"):**

- Background: `bg-[#0d1117]` (near-black, distinct from app surface) to visually signal "this is a machine screen"
- Font: `font-mono text-xs leading-relaxed` — same as existing `TerminalPane`
- Text: `text-[#e6edf3]` (GitHub Dark default — readable but clearly terminal-y)
- Scrollable container: `overflow-y-auto` with `ref` for scroll management
- Height: fills available height in the Warehouse Detail panel; at minimum 300px

**Streaming behaviour:**

```typescript
// In onMount:
// 1. Replay existing outputs[lane.action_id] buffer from store
// 2. Subscribe to action:output events and append new lines in real time
// 3. Auto-scroll to bottom when tail mode is enabled (default: true)

onMount(() => {
  // Replay buffer
  const existing = actionStore.outputs[lane.action_id] ?? [];
  setLines([...existing]);

  // Subscribe to new output
  const unlisten = listenToActionOutput(lane.action_id, (logLine) => {
    setLines(prev => {
      const next = [...prev, logLine];
      return next.slice(-OUTPUT_RING_SIZE);
    });
    if (tailMode()) scrollToBottom();
  });

  onCleanup(() => unlisten());
});
```

**Toolbar (top-right of screen area):**

Three compact toggle buttons:
- **Wrap** — toggles `whitespace-pre-wrap` vs `whitespace-pre` (default: off, so long lines scroll horizontally like a real terminal)
- **Search** — reveals an inline search bar (same pattern as CHI-200 in-session search: `Cmd+F` within the screen or button click)
- **↓ Tail** — when on (default), screen auto-scrolls to bottom on new output; when off, user can scroll freely without being snapped back

**Search bar (when revealed):**

- Appears as an overlay bar at the top of the terminal area (same `Cmd+F` floating overlay pattern as CHI-200)
- Input: "Search output…" placeholder
- `↑ ↓` buttons to navigate matches
- Matches highlighted with `bg-yellow-400/40 text-yellow-100` inline (scan lines, not jump-to)
- Escape or clicking ✕ hides search bar

**Line rendering:**

```tsx
<For each={filteredLines()}>
  {(entry) => (
    <div
      class={`px-3 py-0.5 ${entry.is_error ? 'text-red-400' : 'text-[#e6edf3]'} ${
        isMatch(entry) ? 'bg-yellow-400/20' : ''
      }`}
    >
      <Show when={technicalMode()}>
        <span class="text-[#6e7681] text-[10px] mr-2 select-none">
          {formatRelativeMs(entry.ts)}
        </span>
      </Show>
      {entry.line}
    </div>
  )}
</For>
```

Error lines (`is_error: true`) in `text-red-400` — same as how stderr looks in a real terminal.

**Live cursor:** A blinking `▌` character appended after the last line while `status === 'running'`:

```tsx
<Show when={lane.status === 'running' && !searchQuery()}>
  <div class="px-3 py-0.5 text-[#e6edf3]">
    <span class="animate-pulse">▌</span>
  </div>
</Show>
```

**On exit (action completes/fails):**

- Cursor disappears
- A separator line appears: `── Exited with code 0 ── 2m 14s ──` (green for 0, red for non-0)
- The full log remains visible (user can scroll/search)
- Controls in header: Stop and Restart buttons remain (Restart is useful after exit); Ask AI shows even after exit

**Navigation:**

- **Back arrow / breadcrumb click** → `onBack()` returns to the lane list view (the LaneCard re-appears in the list)
- **Escape** → same as back (but only when search bar is not open — Escape first closes search if open)
- Breadcrumb updates in ActionsCenter: `← Overview / {project.name} / {action.name}`

**Click target separation on LaneCard:**

The LaneCard body needs a clear affordance that it's clickable (drill-in), while the hover-controls pill is a separate action surface. Update LaneCard:

```tsx
<div
  class="group relative ... cursor-pointer"
  role="button"
  aria-label={`Inspect ${lane.action_name} — view live logs`}
  onClick={(e) => {
    // Don't trigger drill-in if clicking inside the controls pill
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    props.onInspect(lane.action_id);
  }}
  onKeyDown={(e) => e.key === 'Enter' && props.onInspect(lane.action_id)}
  tabIndex={0}
>
  {/* ... card body ... */}
  <div data-controls class="...inline controls pill...">
    {/* Stop / Restart / Ask AI */}
  </div>
</div>
```

A subtle "inspect" hint appears on hover in the bottom-right of the card body:
```tsx
<span class="absolute bottom-1 right-2 opacity-0 group-hover:opacity-60 transition-opacity text-[10px] text-muted pointer-events-none">
  Click to inspect logs
</span>
```

(Hidden by default; shown only on hover; `pointer-events-none` so it doesn't interfere with click target.)

**Keyboard navigation:**

- `Enter` on a focused LaneCard → opens LaneLogScreen
- `Escape` within LaneLogScreen → back to lane list (if search closed)
- `Cmd+F` within LaneLogScreen → open search bar
- `Cmd+Shift+A` → still works globally (opens Actions Center or Quick Launch)

**`actionStore.ts` addition — `listenToActionOutput`:**

```typescript
export function listenToActionOutput(
  actionId: string,
  callback: (line: ActionLogLine) => void,
): () => void {
  const unlisten = listen<ActionOutputPayload>('action:output', (event) => {
    if (event.payload.action_id !== actionId) return;
    callback({
      line: event.payload.line,
      is_error: event.payload.is_error,
      ts: performance.now(),
    });
  });
  return () => { unlisten.then(fn => fn()); };
}
```

**Accessibility:**

- LaneLogScreen container: `role="log" aria-live="off" aria-label="Live action output for {action.name}"`
- `aria-live="off"` — we don't want screen readers announcing every output line (too noisy)
- Search results count: `role="status"` `aria-live="polite"` (e.g. "3 matches")
- Toolbar buttons: `aria-label` for Wrap/Search/Tail
- Reduced motion: blinking cursor uses `animate-pulse` which respects `prefers-reduced-motion` in Tailwind

**Acceptance criteria (additions to CHI-221):**

- [ ] Clicking the LaneCard body (not controls) opens LaneLogScreen in-place within Warehouse Detail
- [ ] LaneLogScreen replays the full in-memory output buffer on open (no missed lines)
- [ ] New `action:output` lines stream in and append in real time while running
- [ ] Error lines render in `text-red-400`; normal lines in terminal default color
- [ ] Terminal background is visually distinct from app surface (near-black)
- [ ] Blinking cursor (`▌`) visible while running; disappears on exit
- [ ] Exit separator line (with exit code + duration) appears on action completion
- [ ] Tail mode on by default; turning it off lets user scroll freely without snap
- [ ] Search bar (via toolbar button or `Cmd+F`) highlights matching lines inline
- [ ] Wrap toggle changes line wrapping behavior
- [ ] Breadcrumb shows `← Overview / {project} / {action}` and is navigable
- [ ] Escape returns to lane list (when search is closed)
- [ ] `prefers-reduced-motion` disables blinking cursor animation
- [ ] `role="log"` and `aria-live="off"` set on terminal container
- [ ] Click target separation: body click → inspect; controls pill click → action (no drill-in)
- [ ] "Click to inspect logs" hint visible on hover, invisible otherwise

---

**Acceptance criteria:**
- [ ] LaneCard renders correct color + animation for all 4 statuses
- [ ] `prefers-reduced-motion` disables all animations
- [ ] Hover reveals inline controls; focus via keyboard also reveals them (Tab + Escape)
- [ ] Elapsed timer increments every 1 second while running; shows final duration on stop
- [ ] Exit code badge appears ≤ 200ms after `action:status_changed` fires
- [ ] Technical mode toggle shows/hides command text
- [ ] Completed cards fade and slide out after 10s
- [ ] Stop, Restart, Ask AI all invoke correct store actions
- [ ] Empty state shown when no active lanes

---

### CHI-222: H1d — History tab + LaneHistory (est. ~0.5d)

**Goal:** Per-warehouse completed run history.

**`LaneHistory.tsx`:**

Calls `get_action_history(projectId, 50)` on first render (lazy — only when History tab activated).

Each row:
```
🔨  npm run build        ✓ 0   2m 14s   Today 14:32   [View Output]
🧪  npm test             ✗ 1   45s      Today 11:07   [View Output]
```

Fields: category icon · action name · exit code badge · duration · relative timestamp · View Output button.

Relative timestamps:
- Same day: "Today HH:MM"
- Yesterday: "Yesterday HH:MM"
- This week: "Mon HH:MM" (day abbreviation)
- Older: "Feb 26"

"View Output" → opens `ActionOutputPanel` in DetailsPanel with `output_preview` content + note "Full output not persisted — showing last 3 lines."

Load more: button at bottom loads next 50 entries.

Auto-refresh: when `action:exited` fires for this project while History tab is visible, call `loadActionHistory(projectId)` to prepend new entry at top.

**`actionStore.ts` additions:**
```typescript
export async function loadActionHistory(projectId: string, limit = 50): Promise<void>
export async function loadMoreActionHistory(projectId: string): Promise<void>
```

**Acceptance criteria:**
- [ ] History list renders ordered by `started_at DESC`
- [ ] Exit code badge correctly green/red
- [ ] Duration and timestamps display correctly for all relative cases
- [ ] Load more retrieves next page
- [ ] View Output opens panel with `output_preview`
- [ ] New completion prepends to list while History tab is open
- [ ] Loading spinner shown during IPC call
- [ ] Empty state: "No history yet — run an action to see it here"

---

### CHI-223: H1e — ActionQuickLaunch + Cmd+Shift+A + StatusBar badge (est. ~1d)

**Goal:** Complete the control loop — launch actions from Actions Center, global shortcut, StatusBar.

**`ActionQuickLaunch.tsx` — 2-step modal:**

Step 1 (project selector, shown when launched from Overview):
- Grid of small warehouse cards (same visual, smaller)
- Skip when `preselectedProjectId` prop provided (launched from Warehouse Detail)

Step 2 (action picker):
- Autofocused search input
- Category filter chips: [All] [⚙️ Dev] [🔨 Build] [🧪 Test] [🎨 Lint] [🚀 Deploy] [✨ Custom]
- Scrollable list: category icon + name + description + source badge (npm/cargo/make/custom)
- Keyboard: Arrow↑↓ navigate, Enter select, Escape dismiss, Tab to category chips

Step 3 (argument prompting — if `action.args` is non-empty):
- Reuses existing `ActionArgPrompt.tsx` from CHI-145

On launch:
- Toast: "🚀 Launching {action.name}…"
- Modal closes
- New LaneCard slides into Warehouse Detail (if it's visible)

Modal built as `fixed inset-0 bg-black/50 flex items-center justify-center z-50`. Focus trap per WCAG 2.1 AA (CHI-79 pattern). Escape → close.

**`Cmd+Shift+A` handler:**
```typescript
// keybindings.ts
{ key: 'a', meta: true, shift: true, action: 'actions:open_center' }

// Handler in App.tsx
case 'actions:open_center':
  if (uiStore.activeView === 'actions_center') {
    // Already here — focus the Launch button
    document.getElementById('launch-action-fab')?.focus();
  } else {
    setActiveView('actions_center');
    setShowQuickLaunch(true);  // Open modal immediately
  }
```

**StatusBar "N running" pill:**
```tsx
<Show when={actionStore.crossProjectRunning.length > 0}>
  <button
    class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs"
    onClick={() => setActiveView('actions_center')}
    aria-label={`${actionStore.crossProjectRunning.length} actions running — open Actions Center`}
  >
    ⚙ {actionStore.crossProjectRunning.length} running
  </button>
</Show>
```

**"View in Actions Center" context menu item:**

In `ActionRow.tsx`, in the existing context menu (CHI-78 pattern):
```tsx
<Show when={actionStore.statuses[action.id]?.status === 'running'}>
  <ContextMenuItem
    label="View in Actions Center"
    onClick={() => {
      setActiveView('actions_center');
      setSelectedWarehouse(action.projectId);
    }}
  />
</Show>
```

**Acceptance criteria:**
- [ ] Modal opens from: FAB, Add Lane, Cmd+Shift+A
- [ ] Step 1 shown globally; skipped from Warehouse Detail
- [ ] Search + category filter work correctly
- [ ] Arrow/Enter/Escape keyboard navigation works
- [ ] Actions with args trigger `ActionArgPrompt`
- [ ] Toast fires on launch
- [ ] `Cmd+Shift+A` opens Center + modal; second press focuses FAB
- [ ] StatusBar pill visible only when active count > 0
- [ ] StatusBar pill click opens Actions Center
- [ ] "View in Actions Center" appears on running actions in Sidebar context menu

---

## Animation Reference

All animations defined in `src/styles/tokens.css`:

```css
/* Conveyor belt movement */
@keyframes conveyorSlide {
  to { background-position-x: 16px; }
}

/* Starting state pulsing left border */
@keyframes laneStartingPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Completed lane slide-out */
@keyframes laneSlideOut {
  from { opacity: 0.5; transform: translateY(0); max-height: 200px; }
  to { opacity: 0; transform: translateY(8px); max-height: 0; }
}

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  .conveyor-animated { animation: none !important; }
  .lane-starting-pulse { animation: none !important; }
  .lane-slide-out { animation: none !important; transition: none !important; }
}
```

CSS conveyor pattern:
```css
.conveyor-strip {
  background: repeating-linear-gradient(
    90deg,
    var(--conveyor-stripe-a) 0 8px,
    var(--conveyor-stripe-b) 8px 16px
  );
}

/* Per-status stripe colors (set on the parent LaneCard element) */
.lane-running  { --conveyor-stripe-a: color-mix(in srgb, var(--color-green-500) 30%, transparent);
                 --conveyor-stripe-b: color-mix(in srgb, var(--color-green-500) 10%, transparent); }
.lane-starting { --conveyor-stripe-a: color-mix(in srgb, var(--color-amber-500) 30%, transparent);
                 --conveyor-stripe-b: color-mix(in srgb, var(--color-amber-500) 10%, transparent); }
.lane-failed   { --conveyor-stripe-a: color-mix(in srgb, var(--color-red-500) 20%, transparent);
                 --conveyor-stripe-b: color-mix(in srgb, var(--color-red-500) 10%, transparent); }
.lane-stopped  { --conveyor-stripe-a: color-mix(in srgb, var(--color-border) 50%, transparent);
                 --conveyor-stripe-b: transparent; }
```

---

## i18n Strings

All new UI copy must be added to `src/locales/en.json` and `src/locales/es.json`.

| Key | English | Spanish |
|-----|---------|---------|
| `actions_center.title` | "Actions Center" | "Centro de Acciones" |
| `actions_center.summary` | "{n} projects · {m} lanes active" | "{n} proyectos · {m} líneas activas" |
| `actions_center.launch_action` | "Launch Action" | "Iniciar Acción" |
| `actions_center.all_quiet` | "All quiet on the factory floor" | "Todo tranquilo en la fábrica" |
| `actions_center.open_project` | "Open a project to see its warehouse" | "Abre un proyecto para ver su almacén" |
| `warehouse.add_lane` | "Add Lane" | "Añadir Línea" |
| `warehouse.no_lanes` | "No lanes running — add one to start the assembly line" | "Sin líneas activas — añade una para arrancar la cadena de montaje" |
| `lane.stop` | "Stop" | "Detener" |
| `lane.restart` | "Restart" | "Reiniciar" |
| `lane.ask_ai` | "Ask AI" | "Preguntar a IA" |
| `lane.elapsed` | "{duration}" | "{duration}" |
| `history.no_history` | "No history yet — run an action to see it here" | "Sin historial aún — ejecuta una acción para verlo aquí" |
| `history.load_more` | "Load more" | "Cargar más" |
| `history.view_output` | "View Output" | "Ver Salida" |
| `history.output_preview_note` | "Full output not persisted — showing last 3 lines" | "Salida completa no guardada — mostrando las últimas 3 líneas" |
| `lane.inspect_hint` | "Click to inspect logs" | "Clic para inspeccionar registros" |
| `log_screen.wrap` | "Wrap" | "Ajustar" |
| `log_screen.search` | "Search" | "Buscar" |
| `log_screen.tail` | "Tail" | "Seguir" |
| `log_screen.search_placeholder` | "Search output…" | "Buscar en salida…" |
| `log_screen.exited` | "── Exited with code {code} · {duration} ──" | "── Salió con código {code} · {duration} ──" |

---

## Dependency Map

```
CHI-219 (backend) ──────────────────────────────→ CHI-220 (overview UI)
                                                         │
                                                         ↓
                                                   CHI-221 (lane UI)
                                                         │
                                              ┌──────────┴──────────┐
                                              ↓                     ↓
                                        CHI-222 (history)    CHI-223 (launch + shortcuts)
```

Critical path: CHI-219 → CHI-220 → CHI-221 → CHI-223 (≈ 3.5d)
History tab (CHI-222) can be deferred without blocking the rest.

---

## Acceptance Criteria (Epic-level)

1. Overview page shows all projects as warehouse cards with accurate active lane counts
2. Clicking a warehouse navigates to Warehouse Detail for that project
3. LaneCards show animated conveyor while running; static when stopped/failed
4. Stop/Restart/Ask AI work inline from lane cards — no navigation required
5. **Clicking the lane body** opens the supervisor log screen (`LaneLogScreen`) within the Warehouse Detail frame
6. Supervisor screen replays the full in-memory output buffer and streams new lines live in real time
7. Error lines appear in red; normal lines in terminal default; blinking cursor while running
8. Exit separator line (exit code + duration) appears on completion; full log remains scrollable/searchable
9. History tab shows last 50 completed runs with exit code, duration, relative timestamp
10. "Add Lane" / "Launch Action" open action picker pre-filtered to the project
11. Summary bar accurately reflects total projects and total active lanes across all projects
12. Technical mode toggle switches between friendly view and detail view
13. Empty state renders correctly when no actions are running
14. `Cmd+Shift+A` shortcut opens/focuses Actions Center
15. Toast notifications for action completions preserved (CHI-113 behavior)
16. `action_history` table persists across restarts (DB migration v4)
17. All animations respect `prefers-reduced-motion` (WCAG 2.1 AA)
18. Non-technical users understand status from icon + color alone (no command text required)
19. All new UI strings present in `en.json` and `es.json`

---

## Out of Scope

- Full output archival (history shows only last 3 lines — future CHI-22x)
- Cross-device sync (Actions Center is local-only)
- Actions Center on mobile (desktop app only)
- Drag-to-reorder lanes (future enhancement)
- Scheduling / cron-triggered actions (future)
