import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import type { ActionDefinition } from '@/lib/types';

type ActionStoreModule = typeof import('./actionStore');

function makeAction(overrides?: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: 'package_json:test',
    name: 'test',
    command: 'npm test',
    working_dir: '/project',
    source: 'package_json',
    category: 'test',
    description: 'Run tests',
    is_long_running: false,
    ...overrides,
  };
}

describe('actionStore', () => {
  let mod: ActionStoreModule;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mockIpcCommand('discover_actions', () => [makeAction()]);
    mockIpcCommand('start_action', () => undefined);
    mockIpcCommand('stop_action', () => undefined);
    mockIpcCommand('restart_action', () => undefined);
    mockIpcCommand('list_running_actions', () => []);
    mockIpcCommand('save_custom_action', () => undefined);
    mockIpcCommand('delete_custom_action', () => undefined);
    mockIpcCommand('read_custom_actions', () => []);
    mod = await import('./actionStore');
    mod.clearActionCatalog();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('starts with empty actions', () => {
    expect(mod.actionState.actions).toEqual([]);
    expect(mod.actionState.isDiscovering).toBe(false);
  });

  it('discoverActions fetches from backend', async () => {
    await mod.discoverActions('/project');
    expect(mod.actionState.actions).toHaveLength(1);
    expect(mod.actionState.isDiscovering).toBe(false);
  });

  it('discoverActions handles IPC error', async () => {
    mockIpcCommand('discover_actions', () => {
      throw new Error('scan failed');
    });
    await mod.discoverActions('/project');
    expect(mod.actionState.actions).toEqual([]);
    expect(mod.actionState.isDiscovering).toBe(false);
  });

  it('startAction sets status to running on success', async () => {
    await mod.discoverActions('/project');
    const action = mod.actionState.actions[0];
    await mod.startAction(action);
    expect(mod.getActionStatus(action.id)).toBe('running');
    expect(mod.actionState.selectedActionId).toBe(action.id);
  });

  it('startAction sets status to failed on IPC error', async () => {
    mockIpcCommand('start_action', () => {
      throw new Error('spawn failed');
    });
    await mod.discoverActions('/project');
    const action = mod.actionState.actions[0];
    await mod.startAction(action);
    expect(mod.getActionStatus(action.id)).toBe('failed');
  });

  it('stopAction sets status to stopped', async () => {
    await mod.discoverActions('/project');
    const action = mod.actionState.actions[0];
    await mod.startAction(action);
    await mod.stopAction(action.id);
    expect(mod.getActionStatus(action.id)).toBe('stopped');
  });

  it('getActionStatus returns idle for unknown action', () => {
    expect(mod.getActionStatus('missing')).toBe('idle');
  });

  it('getActionById finds action by ID', async () => {
    await mod.discoverActions('/project');
    const found = mod.getActionById('package_json:test');
    expect(found?.name).toBe('test');
  });

  it('getRunningActionIds returns only running/starting', async () => {
    await mod.discoverActions('/project');
    await mod.startAction(mod.actionState.actions[0]);
    expect(mod.getRunningActionIds()).toContain('package_json:test');
  });

  it('selectAction updates selectedActionId', () => {
    mod.selectAction('some-action');
    expect(mod.actionState.selectedActionId).toBe('some-action');
  });

  it('clearActionOutput removes output for action', () => {
    mod.clearActionOutput('test');
    expect(mod.getActionOutput('test')).toEqual([]);
  });

  it('clearActionCatalog resets action catalog and selection', async () => {
    await mod.discoverActions('/project');
    mod.selectAction('package_json:test');
    mod.clearActionCatalog();
    expect(mod.actionState.actions).toEqual([]);
    expect(mod.actionState.selectedActionId).toBeNull();
    expect(mod.actionState.recentEvents).toEqual([]);
  });

  it('runActionWithArgs substitutes placeholders in command', async () => {
    const startSpy = vi.fn();
    mockIpcCommand('start_action', (args) => {
      startSpy(args);
      return undefined;
    });

    const action = makeAction({ command: 'npm test -- {{suite}}' });
    await mod.runActionWithArgs(action, { suite: 'unit' });

    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action_id: action.id,
        command: 'npm test -- unit',
      }),
    );
  });
});

describe('loadAllRunningActions', () => {
  let mod: ActionStoreModule;

  beforeEach(async () => {
    vi.resetModules();
    mockIpcCommand('list_all_running_actions', () => [
      {
        action_id: 'pkg:build',
        project_id: 'proj-1',
        project_name: 'My Project',
        action_name: 'build',
        status: 'running',
        elapsed_ms: 5000,
        command: 'npm run build',
      },
    ]);
    mod = await import('./actionStore');
  });

  it('sets crossProjectRunning from IPC result', async () => {
    await mod.loadAllRunningActions();
    expect(mod.actionState.crossProjectRunning).toHaveLength(1);
    expect(mod.actionState.crossProjectRunning[0].project_name).toBe('My Project');
  });
});
