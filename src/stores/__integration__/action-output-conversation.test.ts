import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIpcMocks, mockIpcCommand } from '@/test/mockIPC';
import type { ActionDefinition } from '@/lib/types';

function makeAction(overrides?: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: 'package_json:test',
    name: 'test',
    command: 'npm test -- {{suite}}',
    working_dir: '/repo',
    source: 'package_json',
    category: 'test',
    description: 'Run tests',
    is_long_running: false,
    ...overrides,
  };
}

describe('Integration: action -> output -> conversation', () => {
  beforeEach(() => {
    clearIpcMocks();
    vi.resetModules();
  });

  it('discoverActions loads actions via IPC', async () => {
    mockIpcCommand('discover_actions', () => [makeAction()]);

    const mod = await import('@/stores/actionStore');
    mod.clearActionCatalog();
    await mod.discoverActions('/repo');

    expect(mod.actionState.actions).toHaveLength(1);
    expect(mod.actionState.actions[0]?.name).toBe('test');
  });

  it('getRunningActions is empty before any action is started', async () => {
    mockIpcCommand('discover_actions', () => [makeAction()]);

    const mod = await import('@/stores/actionStore');
    await mod.discoverActions('/repo');

    expect(mod.getRunningActions()).toEqual([]);
    expect(mod.getActionOutput('package_json:test')).toEqual([]);
  });

  it('runActionWithArgs resolves placeholders and tracks running action', async () => {
    mockIpcCommand('discover_actions', () => [makeAction()]);
    const startSpy = vi.fn(() => undefined);
    mockIpcCommand('start_action', startSpy);

    const mod = await import('@/stores/actionStore');
    const action = makeAction();
    await mod.discoverActions('/repo');
    await mod.runActionWithArgs(action, { suite: 'unit' });

    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action_id: action.id, command: 'npm test -- unit' }),
    );
    expect(mod.getRunningActions().map((a) => a.id)).toContain(action.id);
    expect(mod.actionState.selectedActionId).toBe(action.id);
  });
});
