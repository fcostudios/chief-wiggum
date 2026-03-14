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

beforeEach(async () => {
  vi.resetAllMocks();
  eventMock.listen.mockResolvedValue(() => {});
  vi.resetModules();
  const { cleanupTerminalListeners, killTerminal, terminalState } = await import('./terminalStore');
  cleanupTerminalListeners();
  vi.mocked(invoke).mockResolvedValue(undefined);
  for (const session of [...terminalState.sessions]) {
    await killTerminal(session.terminal_id);
  }
});

describe('terminalStore', () => {
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

describe('setSessionTitle', () => {
  it('updates title for matching session', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      terminal_id: 'a',
      shell: '/bin/zsh',
      cwd: '/',
      status: 'running',
      exit_code: null,
      title: null,
      created_at: '',
    });

    const { spawnTerminal, setSessionTitle, terminalState } = await import('./terminalStore');
    await spawnTerminal();
    setSessionTitle('a', 'My Tab');
    expect(terminalState.sessions.find((s) => s.terminal_id === 'a')?.title).toBe('My Tab');
  });
});

describe('reorderSessions', () => {
  it('moves session from position to another', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        terminal_id: 'first',
        shell: '/bin/zsh',
        cwd: '/',
        status: 'running',
        exit_code: null,
        title: null,
        created_at: '',
      })
      .mockResolvedValueOnce({
        terminal_id: 'second',
        shell: '/bin/zsh',
        cwd: '/',
        status: 'running',
        exit_code: null,
        title: null,
        created_at: '',
      });

    const { spawnTerminal, reorderSessions, terminalState } = await import('./terminalStore');
    await spawnTerminal();
    await spawnTerminal();
    reorderSessions('second', 'first');
    expect(terminalState.sessions[0].terminal_id).toBe('second');
    expect(terminalState.sessions[1].terminal_id).toBe('first');
  });
});

describe('updateSessionCwd', () => {
  it('updates cwd for matching session', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      terminal_id: 'cwd-test',
      shell: '/bin/zsh',
      cwd: '/old',
      status: 'running',
      exit_code: null,
      title: null,
      created_at: '',
    });
    const { spawnTerminal, updateSessionCwd, terminalState } = await import('./terminalStore');
    await spawnTerminal();
    updateSessionCwd('cwd-test', '/new/path');
    expect(terminalState.sessions.find((s) => s.terminal_id === 'cwd-test')?.cwd).toBe(
      '/new/path',
    );
  });
});
