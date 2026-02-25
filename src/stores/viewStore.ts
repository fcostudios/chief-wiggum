// src/stores/viewStore.ts
// Split pane layout state for CHI-110.
// Maintains pane layout + focused pane + pane->session assignment.

import { createStore } from 'solid-js/store';

export type LayoutMode = 'single' | 'split-horizontal' | 'split-vertical';

export interface Pane {
  id: string;
  sessionId: string | null;
}

interface ViewState {
  layoutMode: LayoutMode;
  panes: Pane[];
  activePaneId: string;
}

const MAIN_PANE_ID = 'main';

const [state, setState] = createStore<ViewState>({
  layoutMode: 'single',
  panes: [{ id: MAIN_PANE_ID, sessionId: null }],
  activePaneId: MAIN_PANE_ID,
});

export { state as viewState };

function nextPaneId(): string {
  return `pane-${Date.now()}`;
}

/** Split into two panes. No-op if already split. */
export function splitView(direction: 'horizontal' | 'vertical' = 'horizontal'): void {
  if (state.layoutMode !== 'single') return;
  setState('layoutMode', direction === 'horizontal' ? 'split-horizontal' : 'split-vertical');
  setState('panes', (prev) => [...prev, { id: nextPaneId(), sessionId: null }]);
}

/** Return to single-pane layout, preserving the first pane assignment. */
export function unsplit(): void {
  const first = state.panes[0] ?? { id: MAIN_PANE_ID, sessionId: null };
  setState('layoutMode', 'single');
  setState('panes', [{ id: first.id, sessionId: first.sessionId }]);
  setState('activePaneId', first.id);
}

/** Close a pane by ID. If one remains, layout returns to single mode. */
export function closePane(paneId: string): void {
  if (state.panes.length <= 1) return;

  const remaining = state.panes.filter((p) => p.id !== paneId);
  if (remaining.length === state.panes.length) return;

  setState('panes', remaining);
  if (remaining.length <= 1) {
    setState('layoutMode', 'single');
  }
  if (state.activePaneId === paneId) {
    setState('activePaneId', remaining[0]?.id ?? MAIN_PANE_ID);
  }
}

/** Focus a pane (used by click interactions + keyboard shortcuts). */
export function focusPane(paneId: string): void {
  if (!state.panes.some((p) => p.id === paneId)) return;
  setState('activePaneId', paneId);
}

/** Assign a session to a pane. */
export function setPaneSession(paneId: string, sessionId: string | null): void {
  setState('panes', (pane) => pane.id === paneId, 'sessionId', sessionId);
}

/** Ensure the first pane tracks a session (used during upgrade from pre-split sessions). */
export function ensureMainPaneSession(sessionId: string | null): void {
  if (!sessionId) return;
  const mainPane = state.panes[0];
  if (!mainPane) {
    setState('panes', [{ id: MAIN_PANE_ID, sessionId }]);
    setState('activePaneId', MAIN_PANE_ID);
    return;
  }
  if (!mainPane.sessionId) {
    setPaneSession(mainPane.id, sessionId);
  }
}

/** Bind the globally active session selection to the currently focused pane. */
export function bindActiveSessionToFocusedPane(sessionId: string | null): void {
  if (!sessionId) return;
  const paneId = state.activePaneId || state.panes[0]?.id || MAIN_PANE_ID;
  if (!state.panes.some((p) => p.id === paneId)) {
    setState('activePaneId', state.panes[0]?.id ?? MAIN_PANE_ID);
  }
  setPaneSession(paneId, sessionId);
  ensureMainPaneSession(sessionId);
}

/** Active pane session ID, if any. */
export function getActivePaneSessionId(): string | null {
  const pane = state.panes.find((p) => p.id === state.activePaneId);
  return pane?.sessionId ?? null;
}
