import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import CommandPalette from './CommandPalette';

const mocks = vi.hoisted(() => ({
  ui: {
    closeCommandPalette: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleDetailsPanel: vi.fn(),
    setActiveView: vi.fn(),
  },
  session: {
    sessionState: {
      sessions: [
        { id: 's1', title: 'First Session', model: 'claude-sonnet-4-6' },
        { id: 's2', title: 'Debug Session', model: 'claude-opus-4-6' },
      ],
      activeSessionId: 's1',
    },
    setActiveSession: vi.fn(),
    createNewSession: vi.fn(() => Promise.resolve()),
    cycleModel: vi.fn(),
  },
  conversation: {
    switchSession: vi.fn(() => Promise.resolve()),
  },
  project: {
    projectState: { activeProjectId: null as string | null },
  },
  actions: {
    actionState: { actions: [] as unknown[] },
    getActionStatus: vi.fn(() => 'idle'),
    selectAction: vi.fn(),
    startAction: vi.fn(() => Promise.resolve()),
    stopAction: vi.fn(() => Promise.resolve()),
    restartAction: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/stores/uiStore', () => ({
  ...mocks.ui,
}));
vi.mock('@/stores/sessionStore', () => ({
  sessionState: mocks.session.sessionState,
  setActiveSession: mocks.session.setActiveSession,
  createNewSession: mocks.session.createNewSession,
  cycleModel: mocks.session.cycleModel,
}));
vi.mock('@/stores/conversationStore', () => ({
  switchSession: mocks.conversation.switchSession,
}));
vi.mock('@/stores/projectStore', () => ({
  projectState: mocks.project.projectState,
}));
vi.mock('@/stores/actionStore', () => ({
  actionState: mocks.actions.actionState,
  getActionStatus: mocks.actions.getActionStatus,
  selectAction: mocks.actions.selectAction,
  startAction: mocks.actions.startAction,
  stopAction: mocks.actions.stopAction,
  restartAction: mocks.actions.restartAction,
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.projectState.activeProjectId = null;
    mocks.actions.actionState.actions = [];
  });

  it('renders search input', () => {
    render(() => <CommandPalette />);
    expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
  });

  it('displays expected category headers', () => {
    render(() => <CommandPalette />);
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Panels')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
  });

  it('filters commands by query', () => {
    render(() => <CommandPalette />);
    fireEvent.input(screen.getByPlaceholderText('Type a command...'), {
      target: { value: 'terminal' },
    });

    expect(screen.getByText('Go to Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Toggle Sidebar')).not.toBeInTheDocument();
  });

  it('shows session list and session placeholder in sessions mode', () => {
    render(() => <CommandPalette mode="sessions" />);
    expect(screen.getByPlaceholderText('Switch to session...')).toBeInTheDocument();
    expect(screen.getByText('First Session')).toBeInTheDocument();
    expect(screen.getByText('Debug Session')).toBeInTheDocument();
  });

  it('shows no results message for unmatched query', () => {
    render(() => <CommandPalette />);
    fireEvent.input(screen.getByPlaceholderText('Type a command...'), {
      target: { value: 'xyznonexistent' },
    });
    expect(screen.getByText('No commands found')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(() => <CommandPalette onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(() => <CommandPalette onClose={onClose} />);
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as HTMLElement, {
      target: backdrop,
      currentTarget: backdrop,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
