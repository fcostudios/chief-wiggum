import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { Project, Session } from '@/lib/types';

let mockSessions: Session[] = [];
let mockActiveSessionId: string | null = 's1';
let mockProjects: Project[] = [];
let mockActiveProjectId: string | null = null;
let mockSidebarState: 'expanded' | 'collapsed' | 'hidden' = 'expanded';
let mockFileVisible = false;
let mockActions: Array<{ id: string }> = [];

const mockLoadSessions = vi.fn(() => Promise.resolve());
const mockLoadProjects = vi.fn(() => Promise.resolve());
const mockCreateNewSession = vi.fn(() => Promise.resolve());
const mockSetActiveSession = vi.fn();
const mockDeleteSession = vi.fn(() => Promise.resolve());
const mockToggleSessionPinned = vi.fn(() => Promise.resolve());
const mockUpdateSessionTitle = vi.fn(() => Promise.resolve());
const mockDuplicateSession = vi.fn(async (id: string) => ({
  ...mockSessions[0],
  id: `${id}-copy`,
}));
const mockSessionHasMessages = vi.fn(async () => false);
const mockLoadMessages = vi.fn(() => Promise.resolve());
const mockClearMessages = vi.fn();
const mockSwitchSession = vi.fn(() => Promise.resolve());
const mockStopSessionCli = vi.fn(() => Promise.resolve());
const mockClearSessionUnread = vi.fn();
const mockPickAndCreateProject = vi.fn(() => Promise.resolve());
const mockSetActiveProject = vi.fn();
const mockToggleFilesVisible = vi.fn();
const mockDiscoverActions = vi.fn(() => Promise.resolve());

const tMap: Record<string, string> = {
  'sidebar.projects': 'Projects',
  'sidebar.openProject': 'Open a project folder',
  'sidebar.sessions': 'Sessions',
  'sidebar.filterSessions': 'Filter sessions...',
  'sidebar.noSessions': 'No sessions yet',
  'sidebar.createToStart': 'Create one to get started',
  'sidebar.noMatching': 'No matching sessions',
  'sidebar.tryDifferent': 'Try a different search',
  'sidebar.newSession': 'New Session',
  'sidebar.pinned': 'Pinned',
  'sidebar.recent': 'Recent',
  'sidebar.older': 'Older',
  'sidebar.rename': 'Rename',
  'sidebar.pin': 'Pin',
  'sidebar.unpin': 'Unpin',
  'sidebar.duplicate': 'Duplicate',
  'common.delete': 'Delete',
};

function t(key: string): string {
  return tMap[key] ?? key;
}

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get sessions() {
      return mockSessions;
    },
    get activeSessionId() {
      return mockActiveSessionId;
    },
  },
  loadSessions: () => mockLoadSessions(),
  createNewSession: (...args: unknown[]) =>
    (mockCreateNewSession as unknown as (...inner: unknown[]) => unknown)(...args),
  setActiveSession: (...args: unknown[]) =>
    (mockSetActiveSession as unknown as (...inner: unknown[]) => unknown)(...args),
  deleteSession: (...args: unknown[]) =>
    (mockDeleteSession as unknown as (...inner: unknown[]) => unknown)(...args),
  toggleSessionPinned: (...args: unknown[]) =>
    (mockToggleSessionPinned as unknown as (...inner: unknown[]) => unknown)(...args),
  updateSessionTitle: (...args: unknown[]) =>
    (mockUpdateSessionTitle as unknown as (...inner: unknown[]) => unknown)(...args),
  duplicateSession: (...args: unknown[]) =>
    (mockDuplicateSession as unknown as (...inner: unknown[]) => unknown)(...args),
  sessionHasMessages: (...args: unknown[]) =>
    (mockSessionHasMessages as unknown as (...inner: unknown[]) => unknown)(...args),
}));

vi.mock('@/stores/conversationStore', () => ({
  loadMessages: (...args: unknown[]) =>
    (mockLoadMessages as unknown as (...inner: unknown[]) => unknown)(...args),
  clearMessages: () => mockClearMessages(),
  switchSession: (...args: unknown[]) =>
    (mockSwitchSession as unknown as (...inner: unknown[]) => unknown)(...args),
  stopSessionCli: (...args: unknown[]) =>
    (mockStopSessionCli as unknown as (...inner: unknown[]) => unknown)(...args),
  getSessionStatus: () => 'not_started',
  isSessionUnread: () => false,
  clearSessionUnread: (...args: unknown[]) =>
    (mockClearSessionUnread as unknown as (...inner: unknown[]) => unknown)(...args),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get projects() {
      return mockProjects;
    },
    get activeProjectId() {
      return mockActiveProjectId;
    },
  },
  loadProjects: () => mockLoadProjects(),
  pickAndCreateProject: () => mockPickAndCreateProject(),
  setActiveProject: (...args: unknown[]) =>
    (mockSetActiveProject as unknown as (...inner: unknown[]) => unknown)(...args),
  getActiveProject: () => mockProjects.find((p) => p.id === mockActiveProjectId) ?? null,
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get isVisible() {
      return mockFileVisible;
    },
  },
  toggleFilesVisible: () => mockToggleFilesVisible(),
}));

vi.mock('@/stores/actionStore', () => ({
  actionState: {
    get actions() {
      return mockActions;
    },
  },
  discoverActions: (...args: unknown[]) =>
    (mockDiscoverActions as unknown as (...inner: unknown[]) => unknown)(...args),
}));

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get sidebarState() {
      return mockSidebarState;
    },
  },
}));

vi.mock('@/stores/i18nStore', () => ({ t }));
vi.mock('@/components/explorer/FileTree', () => ({
  default: () => <div data-testid="file-tree" />,
}));
vi.mock('@/components/actions/ActionsPanel', () => ({
  default: () => <div data-testid="actions-panel" />,
}));

import Sidebar from './Sidebar';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    project_id: null,
    title: 'Test Session',
    model: 'claude-sonnet-4-6',
    status: null,
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cost_cents: 125,
    created_at: '2026-02-26T12:00:00.000Z',
    updated_at: new Date().toISOString(),
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Demo Project',
    path: '/tmp/demo',
    default_model: 'claude-opus-4-6',
    default_effort: null,
    created_at: null,
    last_opened_at: null,
    ...overrides,
  };
}

describe('Sidebar', () => {
  beforeEach(() => {
    mockSessions = [makeSession()];
    mockActiveSessionId = 's1';
    mockProjects = [];
    mockActiveProjectId = null;
    mockSidebarState = 'expanded';
    mockFileVisible = false;
    mockActions = [];

    vi.clearAllMocks();
  });

  it('renders sidebar nav and loads sessions/projects on mount', async () => {
    render(() => <Sidebar />);
    expect(screen.getByLabelText('Sidebar')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockLoadSessions).toHaveBeenCalled();
      expect(mockLoadProjects).toHaveBeenCalled();
    });
  });

  it('shows project fallback action when no projects exist', () => {
    render(() => <Sidebar />);
    expect(screen.getAllByText('Open a project folder').length).toBeGreaterThan(0);
  });

  it('renders recent projects list and active project selection', () => {
    mockProjects = [makeProject()];
    mockActiveProjectId = 'p1';
    render(() => <Sidebar />);
    expect(screen.getByText('Demo Project')).toBeInTheDocument();
  });

  it('renders sessions area with filter input and session title', () => {
    render(() => <Sidebar />);
    expect(screen.getByPlaceholderText('Filter sessions...')).toBeInTheDocument();
    expect(screen.getByText('Test Session')).toBeInTheDocument();
    expect(screen.getByLabelText('New Session')).toBeInTheDocument();
  });

  it('new session button uses active project defaults', () => {
    mockProjects = [makeProject()];
    mockActiveProjectId = 'p1';
    render(() => <Sidebar />);

    fireEvent.click(screen.getByLabelText('New Session'));
    expect(mockClearMessages).toHaveBeenCalled();
    expect(mockCreateNewSession).toHaveBeenCalledWith('claude-opus-4-6', 'p1');
  });

  it('session actions menu reveals rename/duplicate/delete actions', async () => {
    render(() => <Sidebar />);

    fireEvent.click(screen.getByLabelText('Session actions'));
    expect(await screen.findByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });
});
