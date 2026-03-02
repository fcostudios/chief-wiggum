# CHI-221 + CHI-223 + CHI-228: Actions Center Core UI & Contextual Hints

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Actions Center interactive layer (LaneCard, LaneLogScreen, Warehouse Detail, ActionQuickLaunch, StatusBar pill) and add a contextual onboarding hint system that teaches features in context rather than via a one-time walkthrough.

**Architecture:** CHI-221 adds `LaneCard.tsx` (conveyor animated lane) + `LaneLogScreen.tsx` (supervisor terminal) + Warehouse Detail routing into `ActionsCenter.tsx`. CHI-223 adds `ActionQuickLaunch.tsx` (2-step modal), StatusBar running pill, and ActionRow context menu item. CHI-228 adds a `hintStore` (cooldown queue, seen dedup, master toggle) + `HintTooltip.tsx` (dismissible anchored tooltip) wired to 5 priority trigger sites.

**Tech Stack:** SolidJS 1.9 (`createSignal`, `createMemo`, `onMount`, `onCleanup`, `For`, `Show`), TailwindCSS v4 tokens, lucide-solid icons, Tauri events via `@tauri-apps/api/event`.

---

## Pre-flight: what's already done

| Already done | Verified |
|---|---|
| `ActionsCenter.tsx` — overview grid | ✓ |
| `WarehouseCard.tsx` — warehouse card with conveyor strip | ✓ |
| `actionStore.ts` — `crossProjectRunning`, `outputs` ring buffer, `loadAllRunningActions`, `loadActionHistory`, `subscribeToActionStatusChanged`, `action:output` listener | ✓ |
| `tokens.css` — `conveyorSlide`, `laneStartingPulse`, `laneSlideOut` keyframes, per-status CSS vars | ✓ |
| `uiStore` — `actions_center` in `ActiveView`, `setActiveView` | ✓ |
| `keybindings.ts` — `Cmd+Shift+A` opens actions_center view | ✓ |
| i18n — `actions_center.*` block in `en.json` and `es.json` | ✓ |

**Missing (this plan):** `LaneCard.tsx`, `LaneLogScreen.tsx`, Warehouse Detail routing, `ActionQuickLaunch.tsx`, StatusBar pill, ActionRow context menu, `hintStore.ts`, `HintTooltip.tsx`, `log_screen.*` i18n strings, `actionTechnicalMode` in uiStore, `seen_hints`/`hints_enabled` in settings.

---

## PART A — CHI-221: LaneCard + Warehouse Detail + LaneLogScreen

---

### Task A1: listenToActionOutput + actionTechnicalMode

**Files:**
- Modify: `src/stores/actionStore.ts`
- Modify: `src/stores/uiStore.ts`

**Step 1: Add `listenToActionOutput` to actionStore.ts**

The `action:output` global listener already appends to `state.outputs`. `LaneLogScreen` needs a per-action subscription that fires a callback. Add after `setupActionListeners`:

```typescript
import { listen } from '@tauri-apps/api/event';

/**
 * Subscribe to action:output events for a specific action only.
 * Used by LaneLogScreen to get new lines without reading the full store.
 * Returns an unlisten function — call it in onCleanup().
 */
export function listenToActionOutput(
  actionId: string,
  callback: (line: ActionOutputLine) => void,
): () => void {
  let unlisten: (() => void) | null = null;

  listen<{ action_id: string; line: string; is_error: boolean }>(
    'action:output',
    (event) => {
      if (event.payload.action_id !== actionId) return;
      callback({
        line: event.payload.line,
        is_error: event.payload.is_error,
        timestamp: Date.now(),
      });
    },
  ).then((fn) => {
    unlisten = fn;
  });

  return () => {
    unlisten?.();
  };
}

/** Get the current output buffer for an action (for initial replay in LaneLogScreen). */
export function getActionOutput(actionId: string): ActionOutputLine[] {
  return actionState.outputs[actionId] ?? [];
}
```

> `getActionOutput` may already exist (check before adding). Only add what's missing.

**Step 2: Add `actionTechnicalMode` to uiStore.ts**

In the state shape, add the field:

```typescript
// In the state interface / initial object:
actionTechnicalMode: false,
```

Export the toggle function:

```typescript
export function toggleActionTechnicalMode() {
  setState('actionTechnicalMode', (prev: boolean) => !prev);
}
```

Export the accessor (if not auto-exposed via `uiState`):

```typescript
// uiState is the read-only reactive state proxy — actionTechnicalMode is accessed via:
// uiState.actionTechnicalMode
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "actionStore|uiStore" | head -20
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/stores/actionStore.ts src/stores/uiStore.ts
git commit -m "CHI-221: listenToActionOutput + actionTechnicalMode"
```

---

### Task A2: i18n strings for LaneLogScreen

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`

**Step 1: Add log_screen strings to en.json**

Find the `"actions_center"` block and add a `"log_screen"` sibling and `"lane"` sibling:

```json
"log_screen": {
  "wrap": "Wrap",
  "search": "Search",
  "tail": "Tail",
  "search_placeholder": "Search output…",
  "exited_ok": "── Exited with code 0 · {duration} ──",
  "exited_err": "── Exited with code {code} · {duration} ──",
  "matches": "{n} matches",
  "no_matches": "No matches"
},
"lane": {
  "elapsed": "{duration}",
  "inspect_hint": "Click to inspect logs",
  "stop_confirm": "Stop {name}?"
}
```

**Step 2: Add to es.json**

```json
"log_screen": {
  "wrap": "Ajustar",
  "search": "Buscar",
  "tail": "Seguir",
  "search_placeholder": "Buscar en salida…",
  "exited_ok": "── Salió con código 0 · {duration} ──",
  "exited_err": "── Salió con código {code} · {duration} ──",
  "matches": "{n} coincidencias",
  "no_matches": "Sin coincidencias"
},
"lane": {
  "elapsed": "{duration}",
  "inspect_hint": "Clic para inspeccionar registros",
  "stop_confirm": "¿Detener {name}?"
}
```

**Step 3: Commit**

```bash
git add src/locales/en.json src/locales/es.json
git commit -m "CHI-221: log_screen + lane i18n strings"
```

---

### Task A3: LaneCard Component

**Files:**
- Create: `src/components/actions/LaneCard.tsx`

**Step 1: Create the component**

```typescript
// src/components/actions/LaneCard.tsx
// CHI-221: Individual running action card with conveyor animation and controls.

import { Component, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Square, RotateCcw, Bot } from 'lucide-solid';
import type { CrossProjectRunningAction } from '@/lib/types';
import { stopAction, restartAction } from '@/stores/actionStore';
import { t } from '@/stores/i18nStore';
import { uiState } from '@/stores/uiStore';
import { setActiveView } from '@/stores/uiStore';
import { conversationState } from '@/stores/conversationStore';

interface LaneCardProps {
  lane: CrossProjectRunningAction;
  onInspect: (actionId: string) => void;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const CATEGORY_ICONS: Record<string, string> = {
  dev: '⚙️',
  build: '🔨',
  test: '🧪',
  lint: '🎨',
  deploy: '🚀',
  custom: '✨',
};

const LaneCard: Component<LaneCardProps> = (props) => {
  const [elapsed, setElapsed] = createSignal(props.lane.elapsed_ms);
  const [exiting, setExiting] = createSignal(false);

  // Tick elapsed timer every second while running
  onMount(() => {
    const interval = setInterval(() => {
      if (props.lane.status === 'running' || props.lane.status === 'starting') {
        setElapsed((prev) => prev + 1000);
      }
    }, 1000);
    onCleanup(() => clearInterval(interval));
  });

  // Trigger slide-out animation when completed/stopped
  const laneStatusClass = () => {
    switch (props.lane.status) {
      case 'running':
        return 'lane-running';
      case 'starting':
        return 'lane-starting';
      case 'failed':
        return 'lane-failed';
      default:
        return 'lane-stopped';
    }
  };

  const borderColor = () => {
    switch (props.lane.status) {
      case 'running':
        return 'var(--color-success)';
      case 'starting':
        return 'var(--color-warning)';
      case 'failed':
        return 'var(--color-error)';
      default:
        return 'var(--color-border-secondary)';
    }
  };

  function handleAskAi() {
    const msg = `The action "${props.lane.action_name}" just completed with exit code ${props.lane.status === 'failed' ? '1' : '0'} after ${formatElapsed(elapsed())}.\nHere's the last output:\n${props.lane.last_output_line ?? '(no output)'}\n\nWhat happened and what should I do next?`;
    // Pre-fill MessageInput via event — ConversationView listens for this
    window.dispatchEvent(new CustomEvent('cw:prefill-input', { detail: { text: msg } }));
    setActiveView('conversation');
  }

  return (
    <div
      class={`group relative rounded-lg overflow-hidden cursor-pointer transition-opacity ${exiting() ? 'animate-[laneSlideOut_0.3s_ease-in_forwards]' : ''} ${laneStatusClass()}`}
      style={{
        border: `1px solid ${borderColor()}`,
        background: 'var(--color-bg-elevated)',
        'border-left-width': '3px',
      }}
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${props.lane.action_name} — view live logs`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-controls]')) return;
        props.onInspect(props.lane.action_id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onInspect(props.lane.action_id);
      }}
    >
      {/* Card header */}
      <div class="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm shrink-0" aria-hidden="true">
            {CATEGORY_ICONS[props.lane.category] ?? '✨'}
          </span>
          <span
            class="text-xs font-medium truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {props.lane.action_name}
          </span>
        </div>
        {/* Elapsed timer */}
        <span
          class="text-[10px] font-mono shrink-0 ml-2"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {formatElapsed(elapsed())}
        </span>
      </div>

      {/* Conveyor strip */}
      <div
        class={`conveyor-strip h-1.5 ${props.lane.status === 'running' ? 'active' : ''} ${laneStatusClass()}`}
        aria-hidden="true"
      />

      {/* Last output line */}
      <div class="px-3 py-1.5">
        <p
          class="text-[10px] font-mono truncate"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {props.lane.last_output_line ?? '…'}
        </p>
        <Show when={uiState.actionTechnicalMode}>
          <p
            class="text-[9px] font-mono truncate mt-0.5"
            style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
          >
            {props.lane.command}
          </p>
        </Show>
      </div>

      {/* Exit code badge (completed/failed) */}
      <Show when={props.lane.status === 'completed' || props.lane.status === 'failed'}>
        <div class="px-3 pb-2">
          <span
            class="text-[9px] font-mono px-1 py-0.5 rounded"
            style={{
              background:
                props.lane.status === 'completed'
                  ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                  : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
              color:
                props.lane.status === 'completed'
                  ? 'var(--color-success)'
                  : 'var(--color-error)',
            }}
          >
            {props.lane.status === 'completed' ? '✓ 0' : '✗ 1'}
          </span>
        </div>
      </Show>

      {/* Hover controls pill */}
      <div
        data-controls
        class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 rounded-full px-1.5 py-1 backdrop-blur"
        style={{
          background: 'color-mix(in srgb, var(--color-bg-elevated) 85%, transparent)',
          border: '1px solid var(--color-border-secondary)',
          'transition-duration': 'var(--duration-fast)',
        }}
      >
        <Show when={props.lane.status === 'running' || props.lane.status === 'starting'}>
          <button
            class="p-1 rounded hover:text-red-400 transition-colors"
            style={{ color: 'var(--color-text-tertiary)', 'transition-duration': 'var(--duration-fast)' }}
            aria-label={t('actions_center.stop')}
            title={t('actions_center.stop')}
            onClick={(e) => {
              e.stopPropagation();
              void stopAction(props.lane.action_id);
            }}
          >
            <Square size={11} />
          </button>
        </Show>
        <button
          class="p-1 rounded hover:text-yellow-400 transition-colors"
          style={{ color: 'var(--color-text-tertiary)', 'transition-duration': 'var(--duration-fast)' }}
          aria-label={t('actions_center.restart')}
          title={t('actions_center.restart')}
          onClick={(e) => {
            e.stopPropagation();
            // restartAction needs the action definition — look it up by id
            void restartAction(props.lane.action_id);
          }}
        >
          <RotateCcw size={11} />
        </button>
        <button
          class="p-1 rounded hover:text-blue-400 transition-colors"
          style={{ color: 'var(--color-text-tertiary)', 'transition-duration': 'var(--duration-fast)' }}
          aria-label={t('actions_center.ask_ai')}
          title={t('actions_center.ask_ai')}
          onClick={(e) => {
            e.stopPropagation();
            handleAskAi();
          }}
        >
          <Bot size={11} />
        </button>
      </div>

      {/* Inspect hint (hover only) */}
      <span
        class="absolute bottom-1 right-2 text-[9px] pointer-events-none opacity-0 group-hover:opacity-50 transition-opacity"
        style={{
          color: 'var(--color-text-tertiary)',
          'transition-duration': 'var(--duration-fast)',
        }}
        aria-hidden="true"
      >
        {t('actions_center.inspect_hint')}
      </span>
    </div>
  );
};

export default LaneCard;
```

> Note: `restartAction(actionId)` — check `actionStore.ts` signature. It may need the full `ActionDefinition`. If so, look up via `getActionById(lane.action_id)` from actionStore.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "LaneCard" | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/actions/LaneCard.tsx
git commit -m "CHI-221: LaneCard component with conveyor animation and controls"
```

---

### Task A4: LaneLogScreen Component

**Files:**
- Create: `src/components/actions/LaneLogScreen.tsx`

**Step 1: Create the supervisor log screen**

```typescript
// src/components/actions/LaneLogScreen.tsx
// CHI-221: Full supervisor terminal screen for a running action.
// Shows replayed output buffer + live streaming lines.

import {
  Component,
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { Search, WrapText, ArrowDown, X, Square, RotateCcw, Bot } from 'lucide-solid';
import type { ActionOutputLine, CrossProjectRunningAction } from '@/lib/types';
import {
  getActionOutput,
  listenToActionOutput,
  stopAction,
  restartAction,
} from '@/stores/actionStore';
import { t } from '@/stores/i18nStore';
import { uiState } from '@/stores/uiStore';

interface LaneLogScreenProps {
  lane: CrossProjectRunningAction;
  onBack: () => void;
}

const MAX_LINES = 2000;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const LaneLogScreen: Component<LaneLogScreenProps> = (props) => {
  const [lines, setLines] = createSignal<ActionOutputLine[]>([]);
  const [wrapMode, setWrapMode] = createSignal(false);
  const [tailMode, setTailMode] = createSignal(true);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  let scrollRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  function scrollToBottom() {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  }

  onMount(() => {
    // Replay existing buffer
    const existing = getActionOutput(props.lane.action_id);
    setLines([...existing]);
    if (tailMode()) scrollToBottom();

    // Subscribe to new lines
    const unlisten = listenToActionOutput(props.lane.action_id, (logLine) => {
      setLines((prev) => {
        const next = [...prev, logLine];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
      if (tailMode()) scrollToBottom();
    });

    onCleanup(() => unlisten());
  });

  const filteredLines = createMemo(() => {
    const q = searchQuery().toLowerCase();
    if (!q) return lines();
    return lines().filter((l) => l.line.toLowerCase().includes(q));
  });

  const matchCount = createMemo(() => filteredLines().length);

  function isRunning() {
    return props.lane.status === 'running' || props.lane.status === 'starting';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (searchOpen()) {
        setSearchOpen(false);
        setSearchQuery('');
      } else {
        props.onBack();
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      setSearchOpen(true);
      setTimeout(() => searchInputRef?.focus(), 50);
    }
  }

  return (
    <div
      class="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Breadcrumb header */}
      <div
        class="shrink-0 flex items-center gap-2 px-3 py-2"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="text-xs hover:underline"
          style={{ color: 'var(--color-text-tertiary)' }}
          onClick={props.onBack}
        >
          ← Overview
        </button>
        <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
        <span class="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {props.lane.action_name}
        </span>

        <div class="flex-1" />

        {/* Action controls */}
        <Show when={isRunning()}>
          <button
            class="p-1.5 rounded text-xs flex items-center gap-1 hover:opacity-80"
            style={{
              background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              color: 'var(--color-error)',
            }}
            onClick={() => void stopAction(props.lane.action_id)}
          >
            <Square size={11} /> {t('actions_center.stop')}
          </button>
        </Show>
        <button
          class="p-1.5 rounded text-xs flex items-center gap-1 hover:opacity-80"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
          }}
          onClick={() => void restartAction(props.lane.action_id)}
        >
          <RotateCcw size={11} /> {t('actions_center.restart')}
        </button>
        <button
          class="p-1.5 rounded text-xs flex items-center gap-1 hover:opacity-80"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
          }}
          onClick={() => {
            // Ask AI — same as LaneCard
            window.dispatchEvent(
              new CustomEvent('cw:prefill-input', {
                detail: {
                  text: `The action "${props.lane.action_name}" output:\n${lines()
                    .slice(-10)
                    .map((l) => l.line)
                    .join('\n')}\n\nWhat's happening?`,
                },
              }),
            );
          }}
        >
          <Bot size={11} /> {t('actions_center.ask_ai')}
        </button>
      </div>

      {/* Toolbar */}
      <div
        class="shrink-0 flex items-center gap-1 px-3 py-1.5"
        style={{
          background: '#161b22',
          'border-bottom': '1px solid #30363d',
        }}
      >
        <span class="text-[10px] font-mono" style={{ color: '#6e7681' }}>
          {lines().length} lines
        </span>
        <div class="flex-1" />
        <button
          class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{
            background: wrapMode() ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: wrapMode() ? '#e6edf3' : '#6e7681',
          }}
          aria-label={t('log_screen.wrap')}
          onClick={() => setWrapMode((p) => !p)}
        >
          {t('log_screen.wrap')}
        </button>
        <button
          class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{
            background: searchOpen() ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: searchOpen() ? '#e6edf3' : '#6e7681',
          }}
          aria-label={t('log_screen.search')}
          onClick={() => {
            setSearchOpen((p) => !p);
            if (!searchOpen()) setTimeout(() => searchInputRef?.focus(), 50);
          }}
        >
          <Search size={11} class="inline mr-1" />
          {t('log_screen.search')}
        </button>
        <button
          class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{
            background: tailMode() ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: tailMode() ? '#e6edf3' : '#6e7681',
          }}
          aria-label={t('log_screen.tail')}
          onClick={() => setTailMode((p) => !p)}
        >
          <ArrowDown size={11} class="inline mr-1" />
          {t('log_screen.tail')}
        </button>
      </div>

      {/* Search bar */}
      <Show when={searchOpen()}>
        <div
          class="shrink-0 flex items-center gap-2 px-3 py-1.5"
          style={{ background: '#1c2128', 'border-bottom': '1px solid #30363d' }}
        >
          <Search size={12} style={{ color: '#6e7681' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('log_screen.search_placeholder')}
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="flex-1 bg-transparent text-xs font-mono outline-none"
            style={{ color: '#e6edf3' }}
          />
          <Show when={searchQuery()}>
            <span class="text-[10px] font-mono" style={{ color: '#6e7681' }} role="status" aria-live="polite">
              {matchCount()} {matchCount() === 1 ? 'match' : 'matches'}
            </span>
          </Show>
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            style={{ color: '#6e7681' }}
            aria-label="Close search"
          >
            <X size={12} />
          </button>
        </div>
      </Show>

      {/* Terminal area */}
      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto overflow-x-auto min-h-[300px]"
        role="log"
        aria-live="off"
        aria-label={`Live action output for ${props.lane.action_name}`}
        style={{ background: '#0d1117' }}
      >
        <For each={filteredLines()}>
          {(entry) => {
            const isMatch = () =>
              searchQuery() && entry.line.toLowerCase().includes(searchQuery().toLowerCase());
            return (
              <div
                class={`px-3 py-0.5 text-xs font-mono leading-relaxed ${
                  wrapMode() ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                }`}
                style={{
                  color: entry.is_error ? '#f85149' : '#e6edf3',
                  background: isMatch() ? 'rgba(255, 213, 0, 0.15)' : 'transparent',
                }}
              >
                <Show when={uiState.actionTechnicalMode}>
                  <span class="text-[10px] mr-2 select-none" style={{ color: '#6e7681' }}>
                    {`+${Math.round(entry.timestamp - (lines()[0]?.timestamp ?? entry.timestamp))}ms`}
                  </span>
                </Show>
                {entry.line}
              </div>
            );
          }}
        </For>

        {/* Live cursor while running */}
        <Show when={isRunning() && !searchQuery()}>
          <div class="px-3 py-0.5 text-xs font-mono" style={{ color: '#e6edf3' }}>
            <span class="animate-pulse">▌</span>
          </div>
        </Show>

        {/* Exit separator on completion */}
        <Show when={!isRunning() && lines().length > 0}>
          <div
            class="px-3 py-2 text-[10px] font-mono text-center"
            style={{
              color: props.lane.status === 'completed' ? '#3fb950' : '#f85149',
              'border-top': `1px solid ${props.lane.status === 'completed' ? '#3fb95030' : '#f8514930'}`,
            }}
          >
            {props.lane.status === 'completed'
              ? t('log_screen.exited_ok').replace('{duration}', formatElapsed(props.lane.elapsed_ms))
              : t('log_screen.exited_err')
                  .replace('{code}', '1')
                  .replace('{duration}', formatElapsed(props.lane.elapsed_ms))}
          </div>
        </Show>
      </div>
    </div>
  );
};

export default LaneLogScreen;
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "LaneLogScreen" | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/actions/LaneLogScreen.tsx
git commit -m "CHI-221: LaneLogScreen supervisor terminal"
```

---

### Task A5: Warehouse Detail integration in ActionsCenter.tsx

**Files:**
- Modify: `src/components/actions/ActionsCenter.tsx`

Currently `ActionsCenter.tsx` only shows the overview grid. When a warehouse is selected, it should show a Warehouse Detail view with LaneCards and a History tab placeholder.

**Step 1: Add imports**

```typescript
import LaneCard from './LaneCard';
import LaneLogScreen from './LaneLogScreen';
import { actionState, loadActionHistory } from '@/stores/actionStore';
import type { CrossProjectRunningAction } from '@/lib/types';
import { uiState, toggleActionTechnicalMode } from '@/stores/uiStore';
import { ChevronLeft, Settings } from 'lucide-solid';
```

**Step 2: Add signals and derived values**

Inside `ActionsCenter`, after `selectedWarehouseId`:

```typescript
const [activeTab, setActiveTab] = createSignal<'active' | 'history'>('active');
const [selectedLaneId, setSelectedLaneId] = createSignal<string | null>(null);

const selectedProject = () =>
  projects().find((p) => p.id === selectedWarehouseId());

const activeLanesForSelected = () =>
  selectedWarehouseId()
    ? actionState.crossProjectRunning.filter((l) => l.project_id === selectedWarehouseId())
    : [];

const historyForSelected = () =>
  selectedWarehouseId() ? (actionState.history[selectedWarehouseId()!] ?? []) : [];

const selectedLane = (): CrossProjectRunningAction | undefined =>
  activeLanesForSelected().find((l) => l.action_id === selectedLaneId());
```

**Step 3: Replace the current `<div class="flex-1...">` section**

Keep the existing header (`<div class="shrink-0 ...">`) unchanged. Replace the content area:

```tsx
<div class="flex-1 overflow-hidden flex flex-col">
  <Show
    when={selectedWarehouseId()}
    fallback={
      /* OVERVIEW — existing grid, keep exactly as-is */
      <div class="flex-1 overflow-y-auto p-4">
        {/* ... existing WarehouseCard grid JSX ... */}
      </div>
    }
  >
    {/* WAREHOUSE DETAIL */}
    <Show
      when={selectedLane()}
      fallback={
        /* Lane list + tabs */
        <div class="flex flex-col h-full">
          {/* Detail header */}
          <div
            class="shrink-0 flex items-center gap-2 px-4 py-2.5"
            style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
          >
            <button
              class="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-text-tertiary)' }}
              onClick={() => {
                setSelectedWarehouseId(null);
                setActiveTab('active');
                setSelectedLaneId(null);
              }}
            >
              <ChevronLeft size={13} />
              Overview
            </button>
            <span style={{ color: 'var(--color-border-secondary)' }}>/</span>
            <span class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {selectedProject()?.name}
            </span>
            <div class="flex-1" />
            <button
              class="p-1.5 rounded text-[10px] transition-colors"
              style={{
                background: uiState.actionTechnicalMode
                  ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                  : 'var(--color-bg-elevated)',
                color: uiState.actionTechnicalMode
                  ? 'var(--color-accent)'
                  : 'var(--color-text-tertiary)',
              }}
              aria-label="Toggle technical mode"
              onClick={toggleActionTechnicalMode}
              title="Technical mode — show commands and timestamps"
            >
              <Settings size={12} />
            </button>
          </div>

          {/* Tabs */}
          <div
            class="shrink-0 flex"
            style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
          >
            <button
              class="px-4 py-2 text-xs font-medium transition-colors"
              style={{
                color:
                  activeTab() === 'active'
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-tertiary)',
                'border-bottom':
                  activeTab() === 'active'
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
              }}
              onClick={() => setActiveTab('active')}
            >
              Active ({activeLanesForSelected().length})
            </button>
            <button
              class="px-4 py-2 text-xs font-medium transition-colors"
              style={{
                color:
                  activeTab() === 'history'
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-tertiary)',
                'border-bottom':
                  activeTab() === 'history'
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
              }}
              onClick={() => {
                setActiveTab('history');
                if (selectedWarehouseId() && historyForSelected().length === 0) {
                  void loadActionHistory(selectedWarehouseId()!);
                }
              }}
            >
              History
            </button>
          </div>

          {/* Content */}
          <div class="flex-1 overflow-y-auto p-4">
            <Show when={activeTab() === 'active'}>
              <Show
                when={activeLanesForSelected().length > 0}
                fallback={
                  <div class="flex h-full items-center justify-center">
                    <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t('actions_center.no_lanes')}
                    </p>
                  </div>
                }
              >
                <div class="space-y-3">
                  <For each={activeLanesForSelected()}>
                    {(lane) => (
                      <LaneCard
                        lane={lane}
                        onInspect={(id) => setSelectedLaneId(id)}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            <Show when={activeTab() === 'history'}>
              {/* LaneHistory placeholder — CHI-222 */}
              <Show
                when={historyForSelected().length > 0}
                fallback={
                  <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('actions_center.no_history')}
                  </p>
                }
              >
                <div class="space-y-2">
                  <For each={historyForSelected()}>
                    {(entry) => (
                      <div
                        class="flex items-center gap-2 rounded px-3 py-2 text-xs"
                        style={{
                          background: 'var(--color-bg-elevated)',
                          border: '1px solid var(--color-border-secondary)',
                        }}
                      >
                        <span>{CATEGORY_ICONS[entry.category] ?? '✨'}</span>
                        <span
                          class="flex-1 font-medium truncate"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {entry.action_name}
                        </span>
                        <span
                          class="font-mono text-[10px] px-1 py-0.5 rounded"
                          style={{
                            background:
                              entry.exit_code === 0
                                ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                                : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
                            color: entry.exit_code === 0 ? 'var(--color-success)' : 'var(--color-error)',
                          }}
                        >
                          {entry.exit_code === 0 ? '✓ 0' : `✗ ${entry.exit_code ?? '?'}`}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      }
    >
      {/* LANE LOG SCREEN */}
      <LaneLogScreen
        lane={selectedLane()!}
        onBack={() => setSelectedLaneId(null)}
      />
    </Show>
  </Show>
</div>
```

> The `CATEGORY_ICONS` object should be imported from `LaneCard.tsx` or duplicated locally.

**Step 4: Update `onSelect` in WarehouseCard invocations**

The existing `onSelect` callback already calls `setSelectedWarehouseId(id)`. Keep that — the `<Show when={selectedWarehouseId()}>` takes care of the rest.

**Step 5: TypeScript + lint check**

```bash
npx tsc --noEmit 2>&1 | grep "ActionsCenter" | head -20
npx eslint src/components/actions/ActionsCenter.tsx
```

Expected: no errors. Common SolidJS reactivity lint warnings — add `/* eslint-disable-next-line solid/reactivity */` inline if needed.

**Step 6: Commit**

```bash
git add src/components/actions/ActionsCenter.tsx
git commit -m "CHI-221: Warehouse Detail, LaneCard grid, LaneLogScreen routing"
```

---

### Task A6: CHI-221 Tests + Full Check

**Files:**
- Create: `src/components/actions/LaneCard.test.tsx`

**Step 1: Write LaneCard tests**

```typescript
// src/components/actions/LaneCard.test.tsx
import { render, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LaneCard from './LaneCard';
import type { CrossProjectRunningAction } from '@/lib/types';

afterEach(cleanup);

const baseLane: CrossProjectRunningAction = {
  action_id: 'a1',
  project_id: 'p1',
  project_name: 'Alpha',
  action_name: 'npm run build',
  status: 'running',
  elapsed_ms: 10000,
  last_output_line: '> Compiled 5 modules',
  command: 'npm run build',
  category: 'build',
  is_long_running: true,
};

describe('LaneCard', () => {
  it('renders action name', () => {
    const { getByText } = render(() => (
      <LaneCard lane={baseLane} onInspect={vi.fn()} />
    ));
    expect(getByText('npm run build')).toBeDefined();
  });

  it('shows elapsed time', () => {
    const { getByText } = render(() => (
      <LaneCard lane={baseLane} onInspect={vi.fn()} />
    ));
    expect(getByText('10s')).toBeDefined();
  });

  it('calls onInspect when card body clicked', async () => {
    const onInspect = vi.fn();
    const { container } = render(() => (
      <LaneCard lane={baseLane} onInspect={onInspect} />
    ));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    card.click();
    expect(onInspect).toHaveBeenCalledWith('a1');
  });

  it('does not call onInspect when controls clicked', async () => {
    const onInspect = vi.fn();
    const { container } = render(() => (
      <LaneCard lane={baseLane} onInspect={onInspect} />
    ));
    const stopBtn = container.querySelector('[data-controls] button') as HTMLElement;
    stopBtn?.click();
    expect(onInspect).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run src/components/actions/LaneCard.test.tsx
```

Expected: 4 tests pass.

**Step 3: Full lint + type check**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

Fix any issues.

**Step 4: Commit**

```bash
git add src/components/actions/LaneCard.test.tsx
git commit -m "CHI-221: LaneCard tests + final lint"
```

---

## PART B — CHI-223: ActionQuickLaunch + StatusBar + Context Menu

---

### Task B1: StatusBar "N running" pill

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`

**Step 1: Add import**

```typescript
import { actionState } from '@/stores/actionStore';
import { setActiveView } from '@/stores/uiStore';
```

**Step 2: Add the pill**

Find the right section in `StatusBar.tsx` — the left side has the mode prefix/running status. Add the actions pill after the session status section:

```tsx
<Show when={actionState.crossProjectRunning.length > 0}>
  <button
    class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
    style={{
      background: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
      color: 'var(--color-success)',
      border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
    }}
    aria-label={`${actionState.crossProjectRunning.length} actions running — open Actions Center`}
    onClick={() => setActiveView('actions_center')}
  >
    <span aria-hidden="true">⚙</span>
    {actionState.crossProjectRunning.length} running
  </button>
</Show>
```

**Step 3: Lint check**

```bash
npx eslint src/components/layout/StatusBar.tsx
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/layout/StatusBar.tsx
git commit -m "CHI-223: StatusBar N-running actions pill"
```

---

### Task B2: ActionRow "View in Actions Center" context menu item

**Files:**
- Modify: `src/components/actions/ActionRow.tsx`

**Step 1: Check current context menu pattern**

Read `ActionRow.tsx` and find where the context menu items are defined. Add after existing items:

```typescript
import { setActiveView } from '@/stores/uiStore';
import { projectState } from '@/stores/projectStore';
```

In the context menu items array/section:

```tsx
<Show when={getActionStatus(props.action.id) === 'running'}>
  <ContextMenuItem
    label="View in Actions Center"
    onClick={() => {
      setActiveView('actions_center');
      // TODO: pre-select warehouse — requires lifting selectedWarehouseId to store or URL param (CHI-223 follow-up)
    }}
  />
</Show>
```

> Note: The `ContextMenuItem` pattern may differ — look at other items in `ActionRow.tsx` to match the exact JSX pattern. If the menu uses a different API (e.g. an array of `{label, onClick}` objects), follow that pattern.

**Step 2: Commit**

```bash
git add src/components/actions/ActionRow.tsx
git commit -m "CHI-223: ActionRow 'View in Actions Center' context menu item"
```

---

### Task B3: ActionQuickLaunch Modal

**Files:**
- Create: `src/components/actions/ActionQuickLaunch.tsx`

This is a 2-step modal: step 1 = project selector (skip if single or preselected), step 2 = action picker with search + category filter + keyboard nav.

**Step 1: Create the modal**

```typescript
// src/components/actions/ActionQuickLaunch.tsx
// CHI-223: 2-step action launch modal.
// Step 1: project selector (skipped when preselectedProjectId given).
// Step 2: action picker with search + category filter.

import {
  Component,
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { X, Search } from 'lucide-solid';
import type { ActionDefinition } from '@/lib/types';
import { actionState, discoverActions, startAction } from '@/stores/actionStore';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';

interface ActionQuickLaunchProps {
  preselectedProjectId?: string;
  onClose: () => void;
}

const ALL_CATEGORIES = ['dev', 'build', 'test', 'lint', 'deploy', 'custom'] as const;
const CATEGORY_ICONS: Record<string, string> = {
  dev: '⚙️', build: '🔨', test: '🧪', lint: '🎨', deploy: '🚀', custom: '✨',
};
const SOURCE_LABELS: Record<string, string> = {
  package_json: 'npm', cargo_toml: 'cargo', makefile: 'make',
  docker_compose: 'docker', claude_actions: 'custom',
};

const ActionQuickLaunch: Component<ActionQuickLaunchProps> = (props) => {
  const [step, setStep] = createSignal<'project' | 'action'>(
    props.preselectedProjectId ? 'action' : 'project',
  );
  const [selectedProjectId, setSelectedProjectId] = createSignal<string>(
    props.preselectedProjectId ?? '',
  );
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedCategory, setSelectedCategory] = createSignal<string>('all');
  const [focusedIndex, setFocusedIndex] = createSignal(0);
  let searchInputRef: HTMLInputElement | undefined;
  let modalRef: HTMLDivElement | undefined;

  const selectedProject = () =>
    projectState.projects.find((p) => p.id === selectedProjectId());

  const filteredActions = createMemo(() => {
    const actions = actionState.actions;
    const q = searchQuery().toLowerCase();
    const cat = selectedCategory();
    return actions.filter(
      (a) =>
        (cat === 'all' || a.category === cat) &&
        (!q || a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q)),
    );
  });

  // Focus trap
  onMount(() => {
    modalRef?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  // Focus search input when entering action step
  function enterActionStep(projectId: string) {
    setSelectedProjectId(projectId);
    // Discover actions for the selected project
    const project = projectState.projects.find((p) => p.id === projectId);
    if (project) void discoverActions(project.path);
    setStep('action');
    setTimeout(() => searchInputRef?.focus(), 50);
  }

  function handleActionKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filteredActions().length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const action = filteredActions()[focusedIndex()];
      if (action) void handleLaunch(action);
    }
  }

  async function handleLaunch(action: ActionDefinition) {
    if (!selectedProject()) return;
    props.onClose();
    // Toast + start action
    await startAction(selectedProject()!.path, action, {});
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        ref={modalRef}
        class="w-[520px] max-h-[70vh] rounded-xl flex flex-col overflow-hidden outline-none"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-secondary)',
          'box-shadow': '0 24px 64px rgba(0,0,0,0.5)',
        }}
        tabIndex={-1}
        role="dialog"
        aria-label={t('actions_center.launch_action')}
        aria-modal="true"
      >
        {/* Header */}
        <div
          class="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <h2 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('actions_center.launch_action')}
          </h2>
          <button
            class="p-1 rounded hover:opacity-70"
            style={{ color: 'var(--color-text-tertiary)' }}
            onClick={props.onClose}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step 1: Project selector */}
        <Show when={step() === 'project'}>
          <div class="flex-1 overflow-y-auto p-4">
            <p class="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              Select a project
            </p>
            <div class="grid grid-cols-2 gap-2">
              <For each={projectState.projects}>
                {(project) => (
                  <button
                    class="rounded-lg p-3 text-left hover:opacity-80 transition-opacity"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-secondary)',
                    }}
                    onClick={() => enterActionStep(project.id)}
                  >
                    <div class="flex items-center gap-2">
                      <span>🏭</span>
                      <span class="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {project.name}
                      </span>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Step 2: Action picker */}
        <Show when={step() === 'action'}>
          {/* Search */}
          <div class="shrink-0 px-4 pt-3 pb-2">
            <div
              class="flex items-center gap-2 rounded px-2 py-1.5"
              style={{
                background: 'var(--color-bg-inset)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <Search size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search actions…"
                value={searchQuery()}
                onInput={(e) => { setSearchQuery(e.currentTarget.value); setFocusedIndex(0); }}
                onKeyDown={handleActionKeyDown}
                class="flex-1 bg-transparent text-xs outline-none"
                style={{ color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          {/* Category filter chips */}
          <div class="shrink-0 flex items-center gap-1.5 px-4 pb-2 flex-wrap">
            <button
              class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
              style={{
                background: selectedCategory() === 'all' ? 'var(--color-accent)' : 'var(--color-bg-inset)',
                color: selectedCategory() === 'all' ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
              }}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            <For each={ALL_CATEGORIES}>
              {(cat) => (
                <button
                  class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
                  style={{
                    background: selectedCategory() === cat ? 'var(--color-accent)' : 'var(--color-bg-inset)',
                    color: selectedCategory() === cat ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
                  }}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {CATEGORY_ICONS[cat]} {cat}
                </button>
              )}
            </For>
          </div>

          {/* Action list */}
          <div class="flex-1 overflow-y-auto px-4 pb-4">
            <Show
              when={filteredActions().length > 0}
              fallback={
                <p class="text-xs py-4 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  No actions found
                </p>
              }
            >
              <div class="space-y-1">
                <For each={filteredActions()}>
                  {(action, i) => (
                    <button
                      class="w-full rounded p-2.5 text-left transition-colors"
                      style={{
                        background: i() === focusedIndex() ? 'var(--color-bg-secondary)' : 'transparent',
                        border: i() === focusedIndex()
                          ? '1px solid var(--color-border-secondary)'
                          : '1px solid transparent',
                      }}
                      onMouseEnter={() => setFocusedIndex(i())}
                      onClick={() => void handleLaunch(action)}
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-sm">{CATEGORY_ICONS[action.category] ?? '✨'}</span>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                              {action.name}
                            </span>
                            <span
                              class="text-[9px] px-1 py-0.5 rounded shrink-0"
                              style={{
                                background: 'var(--color-bg-inset)',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {SOURCE_LABELS[action.source] ?? action.source}
                            </span>
                          </div>
                          <Show when={action.description}>
                            <p class="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                              {action.description}
                            </p>
                          </Show>
                        </div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionQuickLaunch;
```

**Step 2: Commit**

```bash
git add src/components/actions/ActionQuickLaunch.tsx
git commit -m "CHI-223: ActionQuickLaunch 2-step modal"
```

---

### Task B4: Wire ActionQuickLaunch + FAB into ActionsCenter

**Files:**
- Modify: `src/components/actions/ActionsCenter.tsx`

**Step 1: Import + signal**

```typescript
import ActionQuickLaunch from './ActionQuickLaunch';
// Inside ActionsCenter component:
const [showQuickLaunch, setShowQuickLaunch] = createSignal(false);
```

**Step 2: Add FAB button**

At the bottom of the outer `<div class="flex h-full flex-col">`, before the closing tag:

```tsx
{/* Launch Action FAB */}
<Show when={!selectedLaneId()}>
  <button
    id="launch-action-fab"
    class="absolute bottom-4 right-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
    style={{
      background: 'var(--color-accent)',
      color: 'var(--color-bg-primary)',
    }}
    onClick={() => setShowQuickLaunch(true)}
    aria-label={t('actions_center.launch_action')}
  >
    <span>+</span> {t('actions_center.launch_action')}
  </button>
</Show>

{/* Quick Launch modal */}
<Show when={showQuickLaunch()}>
  <ActionQuickLaunch
    preselectedProjectId={selectedWarehouseId() ?? undefined}
    onClose={() => setShowQuickLaunch(false)}
  />
</Show>
```

> The outer container needs `position: relative` for the FAB to position correctly. Add `class="relative"` to the outer `<div class="flex h-full flex-col">`.

**Step 3: Extend Cmd+Shift+A keybinding**

In `src/lib/keybindings.ts`, find the `Cmd+Shift+A` handler and extend it:

```typescript
// BEFORE:
// case 'actions:open_center':
//   setActiveView('actions_center');

// AFTER:
case 'actions:open_center':
  if (uiState.activeView === 'actions_center') {
    document.getElementById('launch-action-fab')?.focus();
  } else {
    setActiveView('actions_center');
    // Dispatch event to open QuickLaunch (ActionsCenter listens)
    window.dispatchEvent(new CustomEvent('cw:open-quick-launch'));
  }
```

In `ActionsCenter.tsx` `onMount`:

```typescript
const openQuickLaunchListener = () => setShowQuickLaunch(true);
window.addEventListener('cw:open-quick-launch', openQuickLaunchListener);
onCleanup(() => window.removeEventListener('cw:open-quick-launch', openQuickLaunchListener));
```

**Step 4: Lint + type check**

```bash
npx tsc --noEmit && npx eslint src/components/actions/
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/actions/ActionsCenter.tsx src/lib/keybindings.ts
git commit -m "CHI-223: FAB + QuickLaunch integration + Cmd+Shift+A extension"
```

---

## PART C — CHI-228: Contextual Onboarding Hints

---

### Task C1: Settings backend — seen_hints + hints_enabled

**Files:**
- Modify: `src-tauri/src/settings/` (check existing settings module structure)
- Modify: `src/lib/types.ts`

**Step 1: Locate the Rust settings struct**

Find the Rust `OnboardingSettings` struct (or wherever `UserSettings` is defined in `src-tauri/src/settings/`). Add two new fields:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingSettings {
    pub completed: bool,
    #[serde(default)]
    pub seen_hints: Vec<String>,   // hint IDs already shown
    #[serde(default = "default_hints_enabled")]
    pub hints_enabled: bool,       // master toggle
}

fn default_hints_enabled() -> bool { true }
```

The `#[serde(default)]` ensures old settings JSON without these fields deserializes without error.

**Step 2: Update TypeScript OnboardingSettings in types.ts**

```typescript
export interface OnboardingSettings {
  completed: boolean;
  seen_hints: string[];
  hints_enabled: boolean;
}
```

**Step 3: Run Rust checks**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error" | head -20
```

Expected: clean build.

**Step 4: Commit**

```bash
git add src-tauri/src/settings/ src/lib/types.ts
git commit -m "CHI-228: seen_hints + hints_enabled in settings schema"
```

---

### Task C2: settingsStore additions

**Files:**
- Modify: `src/stores/settingsStore.ts`

**Step 1: Add helper functions**

Find `settingsStore.ts` and add after existing exports:

```typescript
/** Check if a hint has already been shown. */
export function hasSeenHint(id: string): boolean {
  return settingsState.settings?.onboarding?.seen_hints?.includes(id) ?? false;
}

/** Check if hints are globally enabled. */
export function hintsEnabled(): boolean {
  return settingsState.settings?.onboarding?.hints_enabled ?? true;
}

/** Mark a hint as seen and persist to settings. */
export async function markHintSeen(id: string): Promise<void> {
  const current = settingsState.settings?.onboarding?.seen_hints ?? [];
  if (current.includes(id)) return;
  await updateSettings('onboarding', 'seen_hints', [...current, id]);
}
```

> `updateSettings` signature may differ — check the existing pattern in `settingsStore.ts` and adapt.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "settingsStore" | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "CHI-228: settingsStore hasSeenHint/hintsEnabled/markHintSeen"
```

---

### Task C3: HintTooltip Component

**Files:**
- Create: `src/components/common/HintTooltip.tsx`

**Step 1: Create the tooltip**

```typescript
// src/components/common/HintTooltip.tsx
// CHI-228: Dismissible contextual hint tooltip.
// Shown at most once per hint ID (tracked in settings).

import { Component, Show, createSignal } from 'solid-js';
import { X } from 'lucide-solid';

interface HintTooltipProps {
  /** Unique hint ID — used for dedup. */
  id: string;
  /** Text shown in the tooltip. */
  text: string;
  /** Optional keyboard shortcut hint (e.g. "Cmd+F"). */
  shortcut?: string;
  /** Called when the user dismisses the tooltip. */
  onDismiss: () => void;
}

export const HintTooltip: Component<HintTooltipProps> = (props) => {
  const [visible, setVisible] = createSignal(true);

  function dismiss() {
    setVisible(false);
    props.onDismiss();
  }

  return (
    <Show when={visible()}>
      <div
        class="absolute z-50 rounded-lg px-3 py-2.5 shadow-lg max-w-[240px] animate-fade-in"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-bg-primary)',
          'font-size': '11px',
          'line-height': '1.5',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        role="tooltip"
        aria-live="polite"
      >
        {/* Arrow */}
        <div
          class="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: '-5px',
            width: '10px',
            height: '5px',
            background: 'var(--color-accent)',
            'clip-path': 'polygon(0 0, 100% 0, 50% 100%)',
          }}
          aria-hidden="true"
        />

        <div class="flex items-start gap-2">
          <p class="flex-1">{props.text}</p>
          <button
            class="shrink-0 mt-0.5 rounded p-0.5 hover:opacity-70 transition-opacity"
            style={{ color: 'var(--color-bg-primary)' }}
            onClick={dismiss}
            aria-label="Dismiss hint"
          >
            <X size={11} />
          </button>
        </div>

        <Show when={props.shortcut}>
          <kbd
            class="mt-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-mono"
            style={{
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--color-bg-primary)',
            }}
          >
            {props.shortcut}
          </kbd>
        </Show>
      </div>
    </Show>
  );
};
```

**Step 2: Commit**

```bash
git add src/components/common/HintTooltip.tsx
git commit -m "CHI-228: HintTooltip dismissible tooltip component"
```

---

### Task C4: hintStore — cooldown queue + maybeShowHint

**Files:**
- Create: `src/stores/hintStore.ts`

**Step 1: Create the store**

```typescript
// src/stores/hintStore.ts
// CHI-228: Contextual hint queue with 45-second cooldown and per-hint dedup.

import { createSignal } from 'solid-js';
import { hasSeenHint, hintsEnabled, markHintSeen } from '@/stores/settingsStore';

/** All valid hint IDs — must match TASKS-006 §7 rule table. */
export type HintId =
  | 'at-mention'
  | 'slash-commands'
  | 'split-panes'
  | 'context-scoring'
  | 'message-search'
  | 'keyboard-shortcuts'
  | 'developer-mode'
  | 'artifacts'
  | 'actions-center'
  | 'session-resume';

/** A queued hint waiting to be shown. */
interface QueuedHint {
  id: HintId;
  text: string;
  shortcut?: string;
  anchorSelector: string; // CSS selector for the anchor element
}

const COOLDOWN_MS = 45_000;

const [activeHint, setActiveHint] = createSignal<QueuedHint | null>(null);
let lastShownAt = 0;

/** Read-only accessor for the currently active hint. */
export const hintState = { get activeHint() { return activeHint(); } };

/**
 * Attempt to show a hint. Silently no-ops if:
 * - Master toggle is off
 * - Hint already seen
 * - Another hint shown in the last 45 seconds
 * - Another hint is currently visible
 */
export function maybeShowHint(
  id: HintId,
  text: string,
  shortcut?: string,
  anchorSelector?: string,
): void {
  if (!hintsEnabled()) return;
  if (hasSeenHint(id)) return;
  if (activeHint() !== null) return;
  const now = Date.now();
  if (now - lastShownAt < COOLDOWN_MS) return;

  setActiveHint({ id, text, shortcut, anchorSelector: anchorSelector ?? 'body' });
  lastShownAt = now;
}

/**
 * Dismiss the active hint and mark it as seen in settings.
 */
export function dismissHint(): void {
  const hint = activeHint();
  if (!hint) return;
  setActiveHint(null);
  void markHintSeen(hint.id);
}
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "hintStore" | head -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/stores/hintStore.ts
git commit -m "CHI-228: hintStore with cooldown queue and maybeShowHint"
```

---

### Task C5: Wire Up 5 Priority Hints

Wire the 5 highest-priority hints to their trigger sites. Each requires:
1. Call `maybeShowHint()` at the trigger point
2. Render `<HintTooltip>` conditionally near the trigger element

#### Hint 1: `at-mention` — in MessageInput when `@` typed

**File:** `src/components/conversation/MessageInput.tsx`

Find where the `@` character triggers `FileMentionMenu`. Add after the condition check:

```typescript
import { maybeShowHint } from '@/stores/hintStore';

// In the keydown/input handler where @ is detected:
maybeShowHint(
  'at-mention',
  'Type @filename to attach file context to your message',
  undefined,
  '[aria-label="Message input"]',
);
```

#### Hint 2: `slash-commands` — in MessageInput when `/` typed

Same file, same handler, where `/` triggers `SlashCommandMenu`:

```typescript
maybeShowHint(
  'slash-commands',
  'Slash commands run Claude skills — type / to browse',
  undefined,
  '[aria-label="Message input"]',
);
```

#### Hint 3: `artifacts` — in MarkdownContent when first code block rendered

**File:** `src/components/conversation/MarkdownContent.tsx`

In the `createEffect` that hydrates `[data-cw-renderer]` or that processes `<pre>` code blocks, add:

```typescript
import { maybeShowHint } from '@/stores/hintStore';

// After detecting the first code block (pre element):
maybeShowHint(
  'artifacts',
  'Right-click code blocks to save as artifact or open in terminal',
);
```

#### Hint 4: `session-resume` — when resume card dismissed

**File:** `src/components/conversation/ConversationView.tsx`

Find the `onDismiss` handler for `SessionResumeCard`. After calling `dismissResume(sid)`, add:

```typescript
import { maybeShowHint } from '@/stores/hintStore';

// In onDismiss:
maybeShowHint(
  'session-resume',
  'Next time, press Cmd+Shift+R to resume the last session instantly',
  'Cmd+Shift+R',
);
```

#### Hint 5: `keyboard-shortcuts` — global idle timer

**File:** `src/App.tsx` (or wherever app-level effects live)

```typescript
import { maybeShowHint } from '@/stores/hintStore';

// In onMount, start a 5-minute timer:
const idleTimer = setTimeout(() => {
  maybeShowHint(
    'keyboard-shortcuts',
    'Press Cmd+/ to see all keyboard shortcuts',
    'Cmd+/',
  );
}, 5 * 60 * 1000);
onCleanup(() => clearTimeout(idleTimer));
```

#### Global HintTooltip renderer

Add a global hint renderer in `App.tsx` that renders the active hint near its anchor (or as a floating tooltip if anchor not found):

```tsx
import { HintTooltip } from '@/components/common/HintTooltip';
import { hintState, dismissHint } from '@/stores/hintStore';

// Somewhere in the App JSX (near the root, after all panels):
<Show when={hintState.activeHint}>
  {(hint) => (
    <div
      class="fixed z-[9999]"
      style={{ bottom: '64px', right: '16px' }}  // fallback position
    >
      <HintTooltip
        id={hint().id}
        text={hint().text}
        shortcut={hint().shortcut}
        onDismiss={dismissHint}
      />
    </div>
  )}
</Show>
```

> For a proper anchored tooltip, use `getBoundingClientRect()` on the anchor element to compute position. The fixed fallback position is acceptable for the initial implementation.

**Step 1: Apply all 5 trigger site changes**

Apply each hint trigger one at a time, checking `tsc --noEmit` after each file.

**Step 2: Run full checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

Fix any errors.

**Step 3: Commit**

```bash
git add src/ -p  # stage only hint-related changes
git commit -m "CHI-228: wire 5 priority hints (at-mention, slash, artifacts, session-resume, idle)"
```

---

### Task C6: Final Full Check

**Step 1: Run all Rust checks**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

**Step 2: Run all frontend checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

**Step 3: Manual smoke test checklist**

**CHI-221:**
- [ ] Click a warehouse card → Warehouse Detail shows with LaneCard list
- [ ] Click LaneCard body → LaneLogScreen opens in-place (not a modal)
- [ ] LaneLogScreen replays existing output buffer on open
- [ ] New output lines stream in live while running
- [ ] Tail mode on by default; turning off lets user scroll freely
- [ ] Wrap toggle changes line wrapping
- [ ] Search bar (toolbar button or Cmd+F) highlights matching lines
- [ ] Escape within LaneLogScreen (search closed) → back to lane list
- [ ] Technical mode toggle shows command text in LaneCard + timestamps in log screen
- [ ] conveyor animation runs while running; static when stopped

**CHI-223:**
- [ ] StatusBar shows "⚙ N running" pill when actions are running
- [ ] Clicking pill opens Actions Center view
- [ ] Cmd+Shift+A opens Actions Center + ActionQuickLaunch modal
- [ ] Second Cmd+Shift+A (already in Center) focuses FAB
- [ ] Modal: project selector → action picker (skip project if single)
- [ ] Arrow↑↓ navigates action list; Enter selects; Escape closes
- [ ] Category filter chips work; All shows everything

**CHI-228:**
- [ ] Type `@` in MessageInput → at-mention hint appears (first time only)
- [ ] Type `/` in MessageInput → slash-commands hint appears (first time only)
- [ ] Dismiss hint → it never appears again (after app restart)
- [ ] Hints respect master toggle (disable in Settings → should suppress all)
- [ ] 45-second cooldown: second hint doesn't appear within 45s of first

**Step 4: Commit**

```bash
git add -p
git commit -m "CHI-221/223/228: final integration checks and polish"
```

---

## Dependencies & sequencing

```
A1 (actionStore + uiStore) → A2 (i18n) → A3 (LaneCard) → A4 (LaneLogScreen) → A5 (ActionsCenter) → A6 (tests)
B1 (StatusBar pill) — independent
B2 (ActionRow menu) — independent
B3 (ActionQuickLaunch) → B4 (wire into ActionsCenter)
C1 (settings backend) → C2 (settingsStore) → C3 (HintTooltip) → C4 (hintStore) → C5 (wire hints)
```

All three parts can be executed in parallel since they touch different files with minimal overlap.
