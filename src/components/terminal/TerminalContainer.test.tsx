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
  activeTerminalId: null as string | null,
  setActiveTerminal: vi.fn((terminalId: string) => {
    terminalStoreMock.activeTerminalId = terminalId;
  }),
  killTerminal: vi.fn().mockResolvedValue(undefined),
}));

const eventMock = vi.hoisted(() => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('@/stores/terminalStore', () => ({
  terminalState: {
    get sessions() {
      return terminalStoreMock.sessions;
    },
    get activeTerminalId() {
      return terminalStoreMock.activeTerminalId;
    },
  },
  spawnTerminal: terminalStoreMock.spawnTerminal,
  killTerminal: terminalStoreMock.killTerminal,
  setActiveTerminal: terminalStoreMock.setActiveTerminal,
  initTerminalListeners: vi.fn().mockResolvedValue(undefined),
  loadAvailableShells: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: eventMock.listen,
}));

vi.mock('@/stores/settingsStore', () => ({
  settingsState: {
    settings: {
      terminal: {
        default_shell: '/bin/bash',
      },
    },
  },
}));

vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));
vi.mock('@/stores/uiStore', () => ({
  uiState: { activeView: 'terminal' },
}));
vi.mock('@/stores/projectStore', () => ({
  getActiveProject: () => ({ path: '/workspace/project' }),
}));

vi.mock('./TerminalTabs', () => ({ default: () => <div data-testid="tabs" /> }));
vi.mock('./TerminalPane', () => ({ default: () => <div data-testid="pane" /> }));

import TerminalContainer from './TerminalContainer';

describe('TerminalContainer', () => {
  beforeEach(() => {
    terminalStoreMock.sessions.length = 0;
    terminalStoreMock.activeTerminalId = null;
    vi.clearAllMocks();
  });

  it('shows empty state when no sessions', () => {
    const { getByText } = render(() => <TerminalContainer />);
    expect(getByText('No terminal sessions open')).toBeTruthy();
  });

  it('auto-spawns a terminal when view is terminal and no sessions exist', async () => {
    render(() => <TerminalContainer />);
    await vi.waitFor(() => {
      expect(terminalStoreMock.spawnTerminal).toHaveBeenCalledWith(
        '/bin/bash',
        '/workspace/project',
      );
    });
  });

  it('handles terminal-specific keyboard shortcuts in capture phase', async () => {
    terminalStoreMock.sessions.push(
      {
        terminal_id: 'a',
        shell: '/bin/zsh',
        cwd: '/',
        status: 'running',
        exit_code: null,
        title: null,
        created_at: '',
      },
      {
        terminal_id: 'b',
        shell: '/bin/zsh',
        cwd: '/',
        status: 'running',
        exit_code: null,
        title: null,
        created_at: '',
      },
    );
    terminalStoreMock.activeTerminalId = 'a';

    render(() => <TerminalContainer />);

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        shiftKey: true,
        code: 'KeyT',
      }),
    );

    await vi.waitFor(() => {
      expect(terminalStoreMock.spawnTerminal).toHaveBeenCalled();
    });

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        shiftKey: true,
        code: 'BracketRight',
      }),
    );
    expect(terminalStoreMock.setActiveTerminal).toHaveBeenCalledWith('b');

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        shiftKey: true,
        code: 'KeyW',
      }),
    );

    await vi.waitFor(() => {
      expect(terminalStoreMock.killTerminal).toHaveBeenCalledWith('b');
    });
  });

  it('renders tabpanel linkage and aria-live status region', () => {
    terminalStoreMock.sessions.push({
      terminal_id: 'panel-test',
      shell: '/bin/zsh',
      cwd: '/',
      status: 'running',
      exit_code: null,
      title: null,
      created_at: '',
    });
    terminalStoreMock.activeTerminalId = 'panel-test';

    const { container } = render(() => <TerminalContainer />);
    const panel = container.querySelector('[role="tabpanel"]');
    const live = container.querySelector('[aria-live="polite"]');

    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-labelledby', 'terminal-tab-panel-test');
    expect(live).not.toBeNull();
  });
});
