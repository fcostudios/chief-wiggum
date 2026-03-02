// src/stores/actionStore.ts
// Action state management for project actions (CHI-142).
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ActionDefinition,
  ActionHistoryEntry,
  ActionOutputLine,
  ActionRecentEvent,
  ActionStatus,
  CrossProjectRunningAction,
  CustomActionDraft,
  RunningActionInfo,
} from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { addToast } from '@/stores/toastStore';
import { getActiveProject } from '@/stores/projectStore';

const log = createLogger('ui/actions');

/** Maximum output lines kept per action. */
const MAX_OUTPUT_LINES = 5000;
const MAX_RECENT_EVENTS = 10;

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
  /** Recent completed/failed actions for status bar / command palette UX. */
  recentEvents: ActionRecentEvent[];
  /** Cross-project running actions for Actions Center (CHI-220). */
  crossProjectRunning: CrossProjectRunningAction[];
  /** Persisted action history per project. */
  history: Record<string, ActionHistoryEntry[]>;
  /** Loading state for per-project history requests. */
  historyLoading: Record<string, boolean>;
}

const [state, setState] = createStore<ActionState>({
  actions: [],
  statuses: {},
  outputs: {},
  selectedActionId: null,
  isDiscovering: false,
  recentEvents: [],
  crossProjectRunning: [],
  history: {},
  historyLoading: {},
});

let eventListeners: UnlistenFn[] = [];
const lastNotifiedStatus = new Map<string, ActionStatus>();
const actionRunStartedAt = new Map<string, number>();

/** Discover actions for a project path. */
export async function discoverActions(projectPath: string): Promise<void> {
  setState('isDiscovering', true);
  try {
    const actions = await invoke<ActionDefinition[]>('discover_actions', {
      project_path: projectPath,
    });
    setState('actions', actions);
  } catch (err) {
    log.error('Failed to discover actions: ' + (err instanceof Error ? err.message : String(err)));
    setState('actions', []);
  } finally {
    setState('isDiscovering', false);
  }
}

/** Read custom actions from `.claude/actions.json` only. */
export async function readCustomActions(projectPath: string): Promise<ActionDefinition[]> {
  return invoke<ActionDefinition[]>('read_custom_actions', {
    project_path: projectPath,
  });
}

/** Start an action. */
export async function startAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);
  setState('selectedActionId', action.id);

  try {
    const activeProject = getActiveProject();
    await invoke('start_action', {
      action_id: action.id,
      command: action.command,
      working_dir: action.working_dir,
      action_name: action.name,
      project_id: activeProject?.id ?? 'unknown',
      project_name: activeProject?.name ?? 'Unknown Project',
      category: action.category,
      is_long_running: action.is_long_running,
    });
    setState('statuses', action.id, 'running');
    actionRunStartedAt.set(action.id, Date.now());
    notifyActionStarted(action.id);
  } catch (err) {
    log.error('Failed to start action: ' + (err instanceof Error ? err.message : String(err)));
    setState('statuses', action.id, 'failed');
    notifyActionFailed(action.id, null);
  }
}

/** Stop a running action. */
export async function stopAction(actionId: string): Promise<void> {
  try {
    await invoke('stop_action', { action_id: actionId });
    setState('statuses', actionId, 'stopped');
    lastNotifiedStatus.set(actionId, 'stopped');
  } catch (err) {
    log.error('Failed to stop action: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Restart an action. */
export async function restartAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);
  setState('selectedActionId', action.id);

  try {
    const activeProject = getActiveProject();
    await invoke('restart_action', {
      action_id: action.id,
      command: action.command,
      working_dir: action.working_dir,
      action_name: action.name,
      project_id: activeProject?.id ?? 'unknown',
      project_name: activeProject?.name ?? 'Unknown Project',
      category: action.category,
      is_long_running: action.is_long_running,
    });
    setState('statuses', action.id, 'running');
    actionRunStartedAt.set(action.id, Date.now());
    notifyActionStarted(action.id);
  } catch (err) {
    log.error('Failed to restart action: ' + (err instanceof Error ? err.message : String(err)));
    setState('statuses', action.id, 'failed');
    notifyActionFailed(action.id, null);
  }
}

/** Start an action after substituting argument placeholders in its command. */
export async function runActionWithArgs(
  action: ActionDefinition,
  resolvedArgs: Record<string, string>,
): Promise<void> {
  let resolvedCommand = action.command;
  for (const [key, value] of Object.entries(resolvedArgs)) {
    const safeValue = value ?? '';
    resolvedCommand = resolvedCommand.replaceAll(`{{${key}}}`, safeValue);
  }

  await startAction({
    ...action,
    command: resolvedCommand,
  });
}

/** Get status for an action. */
export function getActionStatus(actionId: string): ActionStatus {
  return state.statuses[actionId] ?? 'idle';
}

/** Get action definition by ID. */
export function getActionById(actionId: string): ActionDefinition | undefined {
  return state.actions.find((a) => a.id === actionId);
}

/** Get IDs of actions that are currently running/starting. */
export function getRunningActionIds(): string[] {
  return Object.entries(state.statuses)
    .filter(([, status]) => status === 'running' || status === 'starting')
    .map(([actionId]) => actionId);
}

/** Get action definitions that are currently running/starting. */
export function getRunningActions(): ActionDefinition[] {
  const runningIds = new Set(getRunningActionIds());
  return state.actions.filter((a) => runningIds.has(a.id));
}

/** Recent completed/failed action events for CHI-144 UI surfaces. */
export function getRecentActionEvents(): ActionRecentEvent[] {
  return state.recentEvents;
}

/** Get output lines for an action. */
export function getActionOutput(actionId: string): ActionOutputLine[] {
  return state.outputs[actionId] ?? [];
}

/**
 * Subscribe to output lines for a specific action.
 * Returns an unlisten callback suitable for onCleanup().
 */
export function listenToActionOutput(
  actionId: string,
  callback: (line: ActionOutputLine) => void,
): () => void {
  let unlisten: UnlistenFn | null = null;
  let disposed = false;

  void listen<{ action_id: string; line: string; is_error: boolean }>('action:output', (event) => {
    const { action_id, line, is_error } = event.payload;
    if (action_id !== actionId) return;
    callback({
      line,
      is_error,
      timestamp: Date.now(),
    });
  }).then((fn) => {
    if (disposed) {
      fn();
      return;
    }
    unlisten = fn;
  });

  return () => {
    disposed = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}

/** Select an action to view output. */
export function selectAction(actionId: string | null): void {
  setState('selectedActionId', actionId);
}

/** Clear output for an action. */
export function clearActionOutput(actionId: string): void {
  setState('outputs', actionId, []);
}

/** Stop all running actions for the active project. */
export async function stopAllRunningActions(): Promise<void> {
  await Promise.allSettled(getRunningActionIds().map((actionId) => stopAction(actionId)));
}

/** Save or update a custom action in `.claude/actions.json`, then refresh discovery. */
export async function saveCustomAction(
  projectPath: string,
  draft: CustomActionDraft,
): Promise<void> {
  const action: ActionDefinition = {
    id: `claude_actions:${draft.name}`,
    name: draft.name,
    command: draft.command,
    working_dir: draft.working_dir,
    source: 'claude_actions',
    category: draft.category,
    description: draft.description,
    is_long_running: draft.is_long_running,
    before_commands: draft.before_commands,
    after_commands: draft.after_commands,
    env_vars: draft.env_vars,
    args: draft.args,
  };

  await invoke('save_custom_action', {
    project_path: projectPath,
    action,
  });
  await discoverActions(projectPath);
}

/** Delete a custom action from `.claude/actions.json`, then refresh discovery. */
export async function deleteCustomAction(projectPath: string, actionName: string): Promise<void> {
  await invoke('delete_custom_action', {
    project_path: projectPath,
    action_name: actionName,
  });
  if (state.selectedActionId === `claude_actions:${actionName}`) {
    setState('selectedActionId', null);
  }
  await discoverActions(projectPath);
}

/** Clone a discovered action into custom actions for inline editing/override. */
export async function customizeDiscoveredAction(
  projectPath: string,
  action: ActionDefinition,
): Promise<void> {
  const draft: CustomActionDraft = {
    name: action.name,
    command: action.command,
    working_dir: action.working_dir,
    category: action.category,
    description: action.description,
    is_long_running: action.is_long_running,
    before_commands: action.before_commands,
    after_commands: action.after_commands,
    env_vars: action.env_vars,
    args: action.args,
  };

  await saveCustomAction(projectPath, draft);
  addToast(`Customized action: ${action.name}`, 'success');
}

/** Set up Tauri event listeners for action events. */
export async function setupActionListeners(): Promise<void> {
  await cleanupActionListeners();

  eventListeners.push(await subscribeToActionStatusChanged());

  eventListeners.push(
    await listen<{ action_id: string; line: string; is_error: boolean }>(
      'action:output',
      (event) => {
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
        if (!actionRunStartedAt.has(action_id)) {
          actionRunStartedAt.set(action_id, Date.now());
        }
        notifyActionStarted(action_id);
      },
    ),
  );

  eventListeners.push(
    await listen<{ action_id: string; exit_code: number | null }>('action:completed', (event) => {
      const { action_id, exit_code } = event.payload;
      setState('statuses', action_id, 'completed');
      pushRecentEvent(action_id, 'completed', exit_code);
      notifyActionCompleted(action_id, exit_code);
    }),
  );

  eventListeners.push(
    await listen<{ action_id: string; exit_code: number | null }>('action:failed', (event) => {
      const { action_id, exit_code } = event.payload;
      setState('statuses', action_id, 'failed');
      pushRecentEvent(action_id, 'failed', exit_code);
      notifyActionFailed(action_id, exit_code);
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
      if ((info.status as ActionStatus) === 'running' && !actionRunStartedAt.has(info.action_id)) {
        actionRunStartedAt.set(info.action_id, Date.now());
      }
    }
    await loadAllRunningActions();
  } catch {
    // Backend may not support this yet.
  }
}

/** Load all currently running actions across projects (CHI-220). */
export async function loadAllRunningActions(): Promise<void> {
  try {
    const running = await invoke<CrossProjectRunningAction[]>('list_all_running_actions');
    setState('crossProjectRunning', running);
  } catch (err) {
    log.warn(
      'list_all_running_actions failed: ' + (err instanceof Error ? err.message : String(err)),
    );
  }
}

/** Subscribe to backend status changes and keep cross-project lanes in sync. */
export async function subscribeToActionStatusChanged(): Promise<UnlistenFn> {
  return listen<{
    action_id: string;
    project_id: string;
    project_name: string;
    status: ActionStatus;
    elapsed_ms: number;
  }>('action:status_changed', (event) => {
    const payload = event.payload;
    const incomingStatus = payload.status;
    setState('crossProjectRunning', (prev) => {
      const idx = prev.findIndex(
        (lane) => lane.action_id === payload.action_id && lane.project_id === payload.project_id,
      );
      if (
        incomingStatus === 'completed' ||
        incomingStatus === 'failed' ||
        incomingStatus === 'stopped'
      ) {
        return idx >= 0 ? [...prev.slice(0, idx), ...prev.slice(idx + 1)] : prev;
      }

      const existing = idx >= 0 ? prev[idx] : null;
      const updated: CrossProjectRunningAction = {
        action_id: payload.action_id,
        project_id: payload.project_id,
        project_name: payload.project_name,
        action_name: existing?.action_name ?? payload.action_id,
        status: incomingStatus,
        elapsed_ms: payload.elapsed_ms,
        last_output_line: existing?.last_output_line ?? null,
        command: existing?.command ?? '',
        category: existing?.category ?? 'custom',
        is_long_running: existing?.is_long_running ?? false,
      };
      if (idx >= 0) {
        return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      }
      return [...prev, updated];
    });
  });
}

/** Load persisted action history for a project (CHI-220). */
export async function loadActionHistory(projectId: string, limit = 50): Promise<void> {
  setState('historyLoading', projectId, true);
  try {
    const entries = await invoke<ActionHistoryEntry[]>('get_action_history', {
      project_id: projectId,
      limit,
    });
    setState('history', projectId, entries);
  } catch (err) {
    log.warn('get_action_history failed: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    setState('historyLoading', projectId, false);
  }
}

/** Clear project-scoped action catalog (used on project switch/reset). */
export function clearActionCatalog(): void {
  setState('actions', []);
  setState('isDiscovering', false);
  setState('selectedActionId', null);
  setState('recentEvents', []);
  lastNotifiedStatus.clear();
  actionRunStartedAt.clear();
}

export { state as actionState };

function pushRecentEvent(
  actionId: string,
  status: 'completed' | 'failed',
  exitCode: number | null,
): void {
  const action = getActionById(actionId);
  const event: ActionRecentEvent = {
    action_id: actionId,
    name: action?.name ?? actionId,
    status,
    exit_code: exitCode,
    timestamp: Date.now(),
  };
  setState('recentEvents', (prev) => [event, ...prev].slice(0, MAX_RECENT_EVENTS));
}

function notifyActionStarted(actionId: string): void {
  if (lastNotifiedStatus.get(actionId) === 'running') return;
  const action = getActionById(actionId);
  addToast(`Started action: ${action?.name ?? actionId}`, 'info', {
    label: 'View Output',
    onClick: () => selectAction(actionId),
  });
  lastNotifiedStatus.set(actionId, 'running');
}

function notifyActionCompleted(actionId: string, exitCode: number | null): void {
  if (lastNotifiedStatus.get(actionId) === 'completed') return;
  const action = getActionById(actionId);
  const startedAt = actionRunStartedAt.get(actionId);
  const durationMs = startedAt ? Math.max(0, Date.now() - startedAt) : null;
  const durationText = durationMs !== null ? ` in ${formatDuration(durationMs)}` : '';
  const exitText = exitCode !== null ? ` (exit ${exitCode})` : '';
  addToast(`Completed action: ${action?.name ?? actionId}${exitText}${durationText}`, 'success', {
    label: 'View Output',
    onClick: () => selectAction(actionId),
  });
  lastNotifiedStatus.set(actionId, 'completed');
  actionRunStartedAt.delete(actionId);
}

function notifyActionFailed(actionId: string, exitCode: number | null): void {
  if (lastNotifiedStatus.get(actionId) === 'failed') return;
  const action = getActionById(actionId);
  const exitText = exitCode !== null ? ` (exit ${exitCode})` : '';
  addToast(`Action failed: ${action?.name ?? actionId}${exitText}`, 'error', {
    label: 'View Output',
    onClick: () => selectAction(actionId),
  });
  lastNotifiedStatus.set(actionId, 'failed');
  actionRunStartedAt.delete(actionId);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
