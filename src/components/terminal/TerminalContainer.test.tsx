import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';

const terminalStoreMock = vi.hoisted(() => ({
  sessions: [] as Array<{
    terminal_id: string;
    shell: string;
    cwd: string;
    status: 'running' | 'exited';
    exit_code: number | null;
    title: string | null;
    created_at: string;
  }>,
  spawnTerminal: vi.fn().mockResolvedValue({
    terminal_id: 'auto-id',
    shell: '/bin/zsh',
    cwd: '/home',
    status: 'running',
    exit_code: null,
    title: null,
    created_at: '2026-01-01T00:00:00Z',
  }),
}));

vi.mock('@/stores/terminalStore', () => ({
  terminalState: {
    get sessions() {
      return terminalStoreMock.sessions;
    },
    activeTerminalId: null,
  },
  spawnTerminal: terminalStoreMock.spawnTerminal,
  killTerminal: vi.fn().mockResolvedValue(undefined),
  setActiveTerminal: vi.fn(),
  initTerminalListeners: vi.fn().mockResolvedValue(undefined),
  loadAvailableShells: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));
vi.mock('@/stores/uiStore', () => ({
  uiState: { activeView: 'terminal' },
}));

vi.mock('./TerminalTabs', () => ({ default: () => <div data-testid="tabs" /> }));
vi.mock('./TerminalPane', () => ({ default: () => <div data-testid="pane" /> }));

import TerminalContainer from './TerminalContainer';

describe('TerminalContainer', () => {
  beforeEach(() => {
    terminalStoreMock.sessions.length = 0;
    vi.clearAllMocks();
  });

  it('shows empty state when no sessions', () => {
    const { getByText } = render(() => <TerminalContainer />);
    expect(getByText('No terminal sessions open')).toBeTruthy();
  });

  it('auto-spawns a terminal when view is terminal and no sessions exist', async () => {
    render(() => <TerminalContainer />);
    await vi.waitFor(() => {
      expect(terminalStoreMock.spawnTerminal).toHaveBeenCalledOnce();
    });
  });
});
