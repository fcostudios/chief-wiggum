import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import type { Message, ProcessStatus, Session } from '@/lib/types';

interface MockPane {
  id: string;
  sessionId: string | null;
}

const mocks = vi.hoisted(() => {
  const state = {
    sessions: [] as Session[],
    activeSessionId: null as string | null,
    messages: [] as Message[],
    permissionRequest: null as { request_id: string } | null,
    viewState: {
      layoutMode: 'single' as 'single' | 'split-horizontal' | 'split-vertical',
      panes: [{ id: 'main', sessionId: 'sess-1' as string | null }] as MockPane[],
      activePaneId: 'main',
    },
  };

  const createNewSession = vi.fn(async () => ({
    id: 'sess-new',
    title: 'New session',
    model: 'claude-sonnet-4-6',
    total_cost_cents: 0,
    cli_session_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: 'proj-1',
    pinned: false,
    status: null,
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: null,
    total_output_tokens: null,
  }));
  const setActiveSession = vi.fn((sessionId: string) => {
    state.activeSessionId = sessionId;
  });
  const getSessionStatus = vi.fn<(sessionId: string) => ProcessStatus>(() => 'not_started');
  const stopSessionCli = vi.fn(async () => undefined);
  const switchSession = vi.fn(async () => undefined);
  const setActiveView = vi.fn();
  const getActiveProject = vi.fn(() => ({ id: 'proj-1', default_model: 'claude-sonnet-4-6' }));
  const splitView = vi.fn(() => {
    state.viewState.layoutMode = 'split-horizontal';
    state.viewState.panes = [
      { id: 'main', sessionId: state.activeSessionId },
      { id: 'pane-2', sessionId: null },
    ];
  });
  const setPaneSession = vi.fn();
  const focusPane = vi.fn();

  return {
    state,
    createNewSession,
    setActiveSession,
    getSessionStatus,
    stopSessionCli,
    switchSession,
    setActiveView,
    getActiveProject,
    splitView,
    setPaneSession,
    focusPane,
  };
});

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get sessions() {
      return mocks.state.sessions;
    },
    get activeSessionId() {
      return mocks.state.activeSessionId;
    },
  },
  createNewSession: mocks.createNewSession,
  setActiveSession: mocks.setActiveSession,
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get messages() {
      return mocks.state.messages;
    },
  },
  getSessionStatus: mocks.getSessionStatus,
  stopSessionCli: mocks.stopSessionCli,
  switchSession: mocks.switchSession,
}));

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get permissionRequest() {
      return mocks.state.permissionRequest;
    },
  },
  setActiveView: mocks.setActiveView,
}));

vi.mock('@/stores/projectStore', () => ({
  getActiveProject: mocks.getActiveProject,
}));

vi.mock('@/stores/viewStore', () => ({
  get viewState() {
    return mocks.state.viewState;
  },
  splitView: mocks.splitView,
  setPaneSession: mocks.setPaneSession,
  focusPane: mocks.focusPane,
}));

import AgentsView from './AgentsView';

function makeSession(id: string, title: string): Session {
  return {
    id,
    title,
    model: 'claude-sonnet-4-6',
    total_cost_cents: 450,
    cli_session_id: null,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    project_id: 'proj-1',
    pinned: false,
    status: null,
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: null,
    total_output_tokens: null,
  };
}

describe('AgentsView', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.state.sessions = [
      makeSession('sess-1', 'Session one'),
      makeSession('sess-2', 'Session two'),
    ];
    mocks.state.activeSessionId = 'sess-1';
    mocks.state.messages = [];
    mocks.state.permissionRequest = null;
    mocks.state.viewState.layoutMode = 'single';
    mocks.state.viewState.panes = [{ id: 'main', sessionId: 'sess-1' }];
    mocks.state.viewState.activePaneId = 'main';

    mocks.createNewSession.mockClear();
    mocks.setActiveSession.mockClear();
    mocks.getSessionStatus.mockReset();
    mocks.getSessionStatus.mockReturnValue('not_started');
    mocks.stopSessionCli.mockClear();
    mocks.switchSession.mockClear();
    mocks.setActiveView.mockClear();
    mocks.getActiveProject.mockClear();
    mocks.splitView.mockClear();
    mocks.setPaneSession.mockClear();
    mocks.focusPane.mockClear();
  });

  it('renders session cards and count', () => {
    const { getByText } = render(() => <AgentsView />);
    expect(getByText('Parallel Sessions')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('Session one', { selector: 'p' })).toBeTruthy();
    expect(getByText('Session two', { selector: 'p' })).toBeTruthy();
  });

  it('shows empty state when there are no sessions', () => {
    mocks.state.sessions = [];
    const { getByText } = render(() => <AgentsView />);
    expect(getByText('No sessions yet')).toBeTruthy();
  });

  it('focus action switches session and returns to conversation', async () => {
    const { getAllByRole } = render(() => <AgentsView />);
    getAllByRole('button', { name: /focus/i })[1].click();
    await Promise.resolve();
    expect(mocks.setActiveSession).toHaveBeenCalledWith('sess-2');
    expect(mocks.switchSession).toHaveBeenCalledWith('sess-2', 'sess-1');
    expect(mocks.setActiveView).toHaveBeenCalledWith('conversation');
  });

  it('stop action delegates to conversation store', async () => {
    mocks.getSessionStatus.mockImplementation((sessionId: string) =>
      sessionId === 'sess-1' ? 'running' : 'not_started',
    );
    const { getByRole } = render(() => <AgentsView />);
    getByRole('button', { name: /stop/i }).click();
    await Promise.resolve();
    expect(mocks.stopSessionCli).toHaveBeenCalledWith('sess-1');
  });

  it('split action creates split layout and assigns target session', async () => {
    const { getAllByRole } = render(() => <AgentsView />);
    getAllByRole('button', { name: /open in split/i })[1].click();
    await Promise.resolve();
    expect(mocks.splitView).toHaveBeenCalledWith('horizontal');
    expect(mocks.setPaneSession).toHaveBeenCalledWith('main', 'sess-1');
    expect(mocks.setPaneSession).toHaveBeenCalledWith('pane-2', 'sess-2');
    expect(mocks.setActiveView).toHaveBeenCalledWith('conversation');
  });

  it('new parallel session creates and splits immediately', async () => {
    const { getByRole } = render(() => <AgentsView />);
    getByRole('button', { name: /\+ new parallel session/i }).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.createNewSession).toHaveBeenCalled();
    expect(mocks.splitView).toHaveBeenCalledWith('horizontal');
    expect(mocks.setPaneSession).toHaveBeenCalledWith('main', 'sess-1');
    expect(mocks.setPaneSession).toHaveBeenCalledWith('pane-2', 'sess-new');
    expect(mocks.setActiveSession).toHaveBeenCalledWith('sess-new');
  });
});
