// src/stores/actionStore.ts
// Action state management for project actions (CHI-142).
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ActionDefinition,
  ActionOutputLine,
  ActionStatus,
  RunningActionInfo,
} from '@/lib/types';

/** Maximum output lines kept per action. */
const MAX_OUTPUT_LINES = 5000;

interface ActionState {
  /** Discovered actions for the active project. */
  actions: ActionDefinition[];
  /** Per-action status. */
  statuses: Record<string, ActionStatus>;
  /** Per-action output buffer. */
  outputs: Record<string, ActionOutputLine[]>;
  /** Currently selected action ID (for output panel). */
  selectedActionId: string | null;
  /** Whether discovery is in progress. */
  isDiscovering: boolean;
}

const [state, setState] = createStore<ActionState>({
  actions: [],
  statuses: {},
  outputs: {},
  selectedActionId: null,
  isDiscovering: false,
});

let eventListeners: UnlistenFn[] = [];

/** Discover actions for a project path. */
export async function discoverActions(projectPath: string): Promise<void> {
  setState('isDiscovering', true);
  try {
    const actions = await invoke<ActionDefinition[]>('discover_actions', {
      project_path: projectPath,
    });
    setState('actions', actions);
  } catch (err) {
    console.error('[actionStore] Failed to discover actions:', err);
    setState('actions', []);
  } finally {
    setState('isDiscovering', false);
  }
}

/** Start an action. */
export async function startAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);
  setState('selectedActionId', action.id);

  try {
    await invoke('start_action', {
      action_id: action.id,
      command: action.command,
      working_dir: action.working_dir,
    });
    setState('statuses', action.id, 'running');
  } catch (err) {
    console.error('[actionStore] Failed to start action:', err);
    setState('statuses', action.id, 'failed');
  }
}

/** Stop a running action. */
export async function stopAction(actionId: string): Promise<void> {
  try {
    await invoke('stop_action', { action_id: actionId });
    setState('statuses', actionId, 'stopped');
  } catch (err) {
    console.error('[actionStore] Failed to stop action:', err);
  }
}

/** Restart an action. */
export async function restartAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);

  try {
    await invoke('restart_action', {
      action_id: action.id,
      command: action.command,
      working_dir: action.working_dir,
    });
    setState('statuses', action.id, 'running');
  } catch (err) {
    console.error('[actionStore] Failed to restart action:', err);
    setState('statuses', action.id, 'failed');
  }
}

/** Get status for an action. */
export function getActionStatus(actionId: string): ActionStatus {
  return state.statuses[actionId] ?? 'idle';
}

/** Get output lines for an action. */
export function getActionOutput(actionId: string): ActionOutputLine[] {
  return state.outputs[actionId] ?? [];
}

/** Select an action to view output. */
export function selectAction(actionId: string | null): void {
  setState('selectedActionId', actionId);
}

/** Clear output for an action. */
export function clearActionOutput(actionId: string): void {
  setState('outputs', actionId, []);
}

/** Set up Tauri event listeners for action events. */
export async function setupActionListeners(): Promise<void> {
  await cleanupActionListeners();

  eventListeners.push(
    await listen<{ action_id: string; line: string; is_error: boolean }>('action:output', (event) => {
      const { action_id, line, is_error } = event.payload;
      const entry: ActionOutputLine = {
        line,
        is_error,
        timestamp: Date.now(),
      };
      setState('outputs', action_id, (prev) => {
        const lines = prev ?? [];
        const updated = [...lines, entry];
        return updated.length > MAX_OUTPUT_LINES
          ? updated.slice(updated.length - MAX_OUTPUT_LINES)
          : updated;
      });
      setState('statuses', action_id, 'running');
    }),
  );

  eventListeners.push(
    await listen<{ action_id: string; exit_code: number | null }>('action:completed', (event) => {
      setState('statuses', event.payload.action_id, 'completed');
    }),
  );

  eventListeners.push(
    await listen<{ action_id: string; exit_code: number | null }>('action:failed', (event) => {
      setState('statuses', event.payload.action_id, 'failed');
    }),
  );
}

/** Clean up event listeners. */
export async function cleanupActionListeners(): Promise<void> {
  for (const unlisten of eventListeners) {
    unlisten();
  }
  eventListeners = [];
}

/** Sync running action statuses from backend (for reconnect). */
export async function syncRunningActions(): Promise<void> {
  try {
    const running = await invoke<RunningActionInfo[]>('list_running_actions');
    for (const info of running) {
      setState('statuses', info.action_id, info.status as ActionStatus);
    }
  } catch {
    // Backend may not support this yet.
  }
}

/** Clear project-scoped action catalog (used on project switch/reset). */
export function clearActionCatalog(): void {
  setState('actions', []);
  setState('isDiscovering', false);
  setState('selectedActionId', null);
}

export { state as actionState };
