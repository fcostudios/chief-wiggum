import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

let mockActiveView: 'conversation' | 'agents' | 'diff' | 'terminal' | 'actions_center' =
  'conversation';
let mockSidebarState: 'expanded' | 'collapsed' | 'hidden' = 'expanded';
let mockSidebarWidth = 240;
let mockDetailsPanelVisible = true;
let mockDetailsPanelWidth = 280;
let mockPermissionRequest: unknown = null;
let mockYoloDialogVisible = false;
let mockCommandPaletteVisible = false;
let mockSessionSwitcherVisible = false;
let mockKeyboardHelpVisible = false;
let mockSettingsVisible = false;
let mockContextBreakdownVisible = false;
let mockCommandPaletteMode: 'commands' | 'sessions' = 'commands';
let mockViewBadges: Record<string, number> = {
  conversation: 0,
  agents: 0,
  diff: 0,
  terminal: 0,
  actions_center: 0,
};
let mockLayoutMode: 'single' | 'split' = 'single';
let mockActivePaneId = 'main';
let mockCliDetected = true;
let mockSessionId: string | null = 'session-1';
let mockIsLoading = false;
let mockEditorTakeoverActive = false;

const mockSetActiveView = vi.fn();
const mockSetSidebarWidth = vi.fn((width: number) => {
  mockSidebarWidth = width;
});
const mockSetDetailsPanelWidth = vi.fn((width: number) => {
  mockDetailsPanelWidth = width;
});
const mockDismissPermissionDialog = vi.fn();
const mockCloseSessionSwitcher = vi.fn();
const mockCreateNewSession = vi.fn(() => Promise.resolve({ id: 'session-new' }));
const mockSendMessage = vi.fn();
const mockRecordPermissionOutcome = vi.fn();
const mockEnsureMainPaneSession = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@/lib/keybindings', () => ({ handleGlobalKeyDown: vi.fn() }));

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get sidebarState() {
      return mockSidebarState;
    },
    get detailsPanelVisible() {
      return mockDetailsPanelVisible;
    },
    get sidebarWidth() {
      return mockSidebarWidth;
    },
    get detailsPanelWidth() {
      return mockDetailsPanelWidth;
    },
    get activeView() {
      return mockActiveView;
    },
    get permissionRequest() {
      return mockPermissionRequest;
    },
    get yoloDialogVisible() {
      return mockYoloDialogVisible;
    },
    get commandPaletteVisible() {
      return mockCommandPaletteVisible;
    },
    get sessionSwitcherVisible() {
      return mockSessionSwitcherVisible;
    },
    get keyboardHelpVisible() {
      return mockKeyboardHelpVisible;
    },
    get settingsVisible() {
      return mockSettingsVisible;
    },
    get contextBreakdownVisible() {
      return mockContextBreakdownVisible;
    },
    get commandPaletteMode() {
      return mockCommandPaletteMode;
    },
    get viewBadges() {
      return mockViewBadges;
    },
  },
  setActiveView: (...args: unknown[]) =>
    (mockSetActiveView as unknown as (...inner: unknown[]) => unknown)(...args),
  setSidebarWidth: (...args: unknown[]) =>
    (mockSetSidebarWidth as unknown as (...inner: unknown[]) => unknown)(...args),
  setDetailsPanelWidth: (...args: unknown[]) =>
    (mockSetDetailsPanelWidth as unknown as (...inner: unknown[]) => unknown)(...args),
  dismissPermissionDialog: () => mockDismissPermissionDialog(),
  closeSessionSwitcher: () => mockCloseSessionSwitcher(),
}));

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get activeSessionId() {
      return mockSessionId;
    },
  },
  createNewSession: (...args: unknown[]) =>
    (mockCreateNewSession as unknown as (...inner: unknown[]) => unknown)(...args),
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get isLoading() {
      return mockIsLoading;
    },
  },
  sendMessage: (...args: unknown[]) =>
    (mockSendMessage as unknown as (...inner: unknown[]) => unknown)(...args),
  recordPermissionOutcome: (...args: unknown[]) =>
    (mockRecordPermissionOutcome as unknown as (...inner: unknown[]) => unknown)(...args),
}));

vi.mock('@/stores/cliStore', () => ({
  cliState: {
    get isDetected() {
      return mockCliDetected;
    },
  },
}));

vi.mock('@/stores/viewStore', () => ({
  viewState: {
    get layoutMode() {
      return mockLayoutMode;
    },
    get activePaneId() {
      return mockActivePaneId;
    },
  },
  ensureMainPaneSession: (...args: unknown[]) =>
    (mockEnsureMainPaneSession as unknown as (...inner: unknown[]) => unknown)(...args),
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get editorTakeoverActive() {
      return mockEditorTakeoverActive;
    },
  },
}));

vi.mock('./TitleBar', () => ({ default: () => <div data-testid="titlebar">TitleBar</div> }));
vi.mock('./Sidebar', () => ({ default: () => <div data-testid="sidebar">Sidebar</div> }));
vi.mock('./StatusBar', () => ({ default: () => <div data-testid="statusbar">StatusBar</div> }));
vi.mock('./DetailsPanel', () => ({
  default: () => <div data-testid="details-panel">DetailsPanel</div>,
}));
vi.mock('@/components/conversation/ConversationView', () => ({
  default: () => <div data-testid="conversation-view">ConversationView</div>,
}));
vi.mock('@/components/conversation/MessageInput', () => ({
  default: () => <div data-testid="message-input">MessageInput</div>,
}));
vi.mock('@/components/permissions/PermissionDialog', () => ({
  default: () => <div data-testid="permission-dialog">PermissionDialog</div>,
}));
vi.mock('@/components/permissions/AutoApproveWarningDialog', () => ({
  default: () => <div data-testid="auto-approve-warning">AutoApproveWarningDialog</div>,
}));
vi.mock('@/components/terminal/TerminalPane', () => ({
  default: () => <div data-testid="terminal-pane">TerminalPane</div>,
}));
vi.mock('@/components/actions/ActionsCenter', () => ({
  default: () => <div data-testid="actions-center">ActionsCenter</div>,
}));
vi.mock('@/components/common/CommandPalette', () => ({
  default: () => <div data-testid="command-palette">CommandPalette</div>,
}));
vi.mock('@/components/common/KeyboardHelp', () => ({
  default: () => <div data-testid="keyboard-help">KeyboardHelp</div>,
}));
vi.mock('@/components/diagnostics/ExportDialog', () => ({
  default: () => <div data-testid="export-dialog">ExportDialog</div>,
}));
vi.mock('@/components/common/ToastContainer', () => ({
  default: () => <div data-testid="toast-container">ToastContainer</div>,
}));
vi.mock('@/components/diff/DiffPreviewPane', () => ({
  default: () => <div data-testid="diff-pane">DiffPreviewPane</div>,
}));
vi.mock('@/components/settings/SettingsModal', () => ({
  default: () => <div data-testid="settings-modal">SettingsModal</div>,
}));
vi.mock('@/components/conversation/ContextBreakdownModal', () => ({
  default: () => <div data-testid="context-breakdown-modal">ContextBreakdownModal</div>,
}));
vi.mock('@/components/layout/SplitPaneContainer', () => ({
  default: () => <div data-testid="split-pane-container">SplitPaneContainer</div>,
}));
vi.mock('@/components/editor/EditorTakeover', () => ({
  default: () => <div data-testid="editor-takeover">EditorTakeover</div>,
}));

import MainLayout from './MainLayout';

describe('MainLayout', () => {
  beforeEach(() => {
    mockActiveView = 'conversation';
    mockSidebarState = 'expanded';
    mockSidebarWidth = 240;
    mockDetailsPanelVisible = true;
    mockDetailsPanelWidth = 280;
    mockPermissionRequest = null;
    mockYoloDialogVisible = false;
    mockCommandPaletteVisible = false;
    mockSessionSwitcherVisible = false;
    mockKeyboardHelpVisible = false;
    mockSettingsVisible = false;
    mockContextBreakdownVisible = false;
    mockCommandPaletteMode = 'commands';
    mockViewBadges = { conversation: 0, agents: 0, diff: 0, terminal: 0, actions_center: 0 };
    mockLayoutMode = 'single';
    mockActivePaneId = 'main';
    mockCliDetected = true;
    mockSessionId = 'session-1';
    mockIsLoading = false;
    mockEditorTakeoverActive = false;
    vi.clearAllMocks();
  });

  it('renders core layout zones', () => {
    render(() => <MainLayout />);
    expect(screen.getByTestId('titlebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('details-panel')).toBeInTheDocument();
    expect(screen.getByTestId('statusbar')).toBeInTheDocument();
  });

  it('renders resizer handles for expanded sidebar and details panel', () => {
    render(() => <MainLayout />);
    expect(screen.getByLabelText('Resize sidebar')).toBeInTheDocument();
    expect(screen.getByLabelText('Resize details panel')).toBeInTheDocument();
  });

  it('renders skip-to-content link and main landmark', () => {
    render(() => <MainLayout />);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(document.querySelector('main#main-content')).toBeTruthy();
  });

  it('renders view tabs and seeds the main pane session on mount', () => {
    render(() => <MainLayout />);
    expect(screen.getByRole('button', { name: 'Conversation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diff' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(mockEnsureMainPaneSession).toHaveBeenCalledWith('session-1');
  });

  it('clicking a view tab requests a view switch', () => {
    render(() => <MainLayout />);
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }));
    expect(mockSetActiveView).toHaveBeenCalledWith('diff');
  });

  it('renders conversation/split modes and conditional overlays', () => {
    mockPermissionRequest = {
      request_id: 'r1',
      tool: 'bash',
      command: 'ls',
      file_path: null,
      risk_level: 'medium',
    };
    mockYoloDialogVisible = true;
    mockCommandPaletteVisible = true;
    mockSessionSwitcherVisible = true;
    mockKeyboardHelpVisible = true;
    mockSettingsVisible = true;
    mockContextBreakdownVisible = true;
    mockLayoutMode = 'split';

    render(() => <MainLayout />);

    expect(screen.getByTestId('split-pane-container')).toBeInTheDocument();
    expect(screen.queryByTestId('message-input')).toBeNull();
    expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('auto-approve-warning')).toBeInTheDocument();
    expect(screen.getAllByTestId('command-palette')).toHaveLength(2);
    expect(screen.getByTestId('keyboard-help')).toBeInTheDocument();
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    expect(screen.getByTestId('context-breakdown-modal')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });

  it('keeps conversation view mounted while editor takeover is active', () => {
    mockEditorTakeoverActive = true;
    render(() => <MainLayout />);

    expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
    expect(screen.getByTestId('editor-takeover')).toBeInTheDocument();
    expect(screen.queryByTestId('message-input')).toBeNull();
  });
});
