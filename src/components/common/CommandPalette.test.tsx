import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import CommandPalette from './CommandPalette';
import type { RecentCommand } from '@/stores/recentCommandStore';

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
  files: {
    fileState: {
      selectedPath: null as string | null,
      previewContent: null as { relative_path: string } | null,
      editingFilePath: null as string | null,
    },
    openEditorTakeover: vi.fn(() => Promise.resolve()),
    createFileInProject: vi.fn(() => Promise.resolve()),
    createDirectoryInProject: vi.fn(() => Promise.resolve()),
    deleteFileInProject: vi.fn(() => Promise.resolve()),
    renameFileInProject: vi.fn(() => Promise.resolve()),
    duplicateFileInProject: vi.fn(() => Promise.resolve()),
  },
  toast: {
    addToast: vi.fn(),
  },
  recent: {
    getRecentCommands: vi.fn<() => RecentCommand[]>(() => []),
    recordCommand: vi.fn(),
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
vi.mock('@/stores/fileStore', () => ({
  fileState: mocks.files.fileState,
  openEditorTakeover: mocks.files.openEditorTakeover,
  createFileInProject: mocks.files.createFileInProject,
  createDirectoryInProject: mocks.files.createDirectoryInProject,
  deleteFileInProject: mocks.files.deleteFileInProject,
  renameFileInProject: mocks.files.renameFileInProject,
  duplicateFileInProject: mocks.files.duplicateFileInProject,
}));
vi.mock('@/stores/toastStore', () => ({
  addToast: mocks.toast.addToast,
}));
vi.mock('@/stores/recentCommandStore', () => ({
  getRecentCommands: mocks.recent.getRecentCommands,
  recordCommand: mocks.recent.recordCommand,
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.projectState.activeProjectId = null;
    mocks.actions.actionState.actions = [];
    mocks.files.fileState.selectedPath = null;
    mocks.files.fileState.previewContent = null;
    mocks.files.fileState.editingFilePath = null;
    mocks.recent.getRecentCommands.mockReturnValue([]);
  });

  it('renders search input', () => {
    render(() => <CommandPalette />);
    expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
  });

  it('displays expected category headers', () => {
    render(() => <CommandPalette />);
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Panels')).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
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

  it('shows recent section when recent commands exist', () => {
    mocks.recent.getRecentCommands.mockReturnValue([
      { id: 'view-terminal', label: 'Go to Terminal', timestamp: Date.now() },
    ]);

    render(() => <CommandPalette />);
    expect(screen.getByText('Recent')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Go to Terminal')[0]!);
    expect(mocks.ui.setActiveView).toHaveBeenCalledWith('terminal');
    expect(mocks.recent.recordCommand).toHaveBeenCalled();
  });

  it('enters file path input mode from Create File command', async () => {
    mocks.project.projectState.activeProjectId = 'proj-1';
    render(() => <CommandPalette />);

    fireEvent.click(screen.getByText('Create File'));

    expect(screen.getByPlaceholderText('path/to/new-file.ts')).toBeInTheDocument();
  });

  it('shows no file selected toast for rename without selection', () => {
    mocks.project.projectState.activeProjectId = 'proj-1';
    render(() => <CommandPalette />);

    fireEvent.click(screen.getByText('Rename File'));

    expect(mocks.toast.addToast).toHaveBeenCalledWith(
      'No file selected — select a file in the explorer first',
      'info',
    );
  });
});
