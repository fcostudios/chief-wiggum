import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const eventMock = vi.hoisted(() => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: eventMock.listen,
}));

import { invoke } from '@tauri-apps/api/core';

describe('terminalStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('spawnTerminal calls spawn_terminal IPC and returns session', async () => {
    const mockSession = {
      terminal_id: 'abc-123',
      shell: '/bin/zsh',
      cwd: '/home/user',
      status: 'running' as const,
      exit_code: null,
      title: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockSession);

    const { spawnTerminal } = await import('./terminalStore');
    const session = await spawnTerminal();

    expect(invoke).toHaveBeenCalledWith('spawn_terminal', { shell: undefined, cwd: undefined });
    expect(session.terminal_id).toBe('abc-123');
  });

  it('killTerminal calls kill_terminal IPC', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { killTerminal } = await import('./terminalStore');
    await killTerminal('abc-123');
    expect(invoke).toHaveBeenCalledWith('kill_terminal', { terminal_id: 'abc-123' });
  });

  it('initTerminalListeners subscribes once and rehydrates current sessions', async () => {
    const mockSessions = [
      {
        terminal_id: 'rehydrated',
        shell: '/bin/zsh',
        cwd: '/workspace',
        status: 'running',
        exit_code: null,
        title: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    vi.mocked(invoke).mockResolvedValue(mockSessions);

    const { initTerminalListeners, terminalState } = await import('./terminalStore');
    await initTerminalListeners();
    await initTerminalListeners();

    expect(eventMock.listen).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('list_terminals');
    expect(terminalState.sessions).toHaveLength(1);
    expect(terminalState.activeTerminalId).toBe('rehydrated');
  });
});
