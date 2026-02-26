import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Session } from '@/lib/types';

let mockYoloMode = false;
let mockDeveloperMode = false;
let mockCliDetected = true;
let mockProcessStatus: 'not_started' | 'running' | 'starting' | 'error' = 'not_started';
let mockSessionStatuses: Record<string, string> = {};
let mockSessions: Session[] = [];
let mockActiveSessionId: string | null = null;
let mockRunningActions: Array<{ id: string }> = [];
let mockRecentActionEvents: Array<{
  action_id: string;
  name: string;
  status: string;
  finished_at: string | null;
}> = [];

const mockOpenExportDialog = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get yoloMode() {
      return mockYoloMode;
    },
    get developerMode() {
      return mockDeveloperMode;
    },
  },
}));

vi.mock('@/stores/cliStore', () => ({
  cliState: {
    get isDetected() {
      return mockCliDetected;
    },
  },
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: {
    get processStatus() {
      return mockProcessStatus;
    },
    get sessionStatuses() {
      return mockSessionStatuses;
    },
  },
}));

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get sessions() {
      return mockSessions;
    },
    get activeSessionId() {
      return mockActiveSessionId;
    },
  },
}));

vi.mock('@/stores/diagnosticsStore', () => ({
  openExportDialog: () => mockOpenExportDialog(),
}));

vi.mock('@/stores/actionStore', () => ({
  getRunningActions: () => mockRunningActions,
  getRecentActionEvents: () => mockRecentActionEvents,
  stopAction: vi.fn(),
  restartAction: vi.fn(),
  selectAction: vi.fn(),
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string, vars?: Record<string, number>) => {
    if (key === 'statusBar.exportDiagnostics') return 'Export Diagnostics';
    if (key === 'statusBar.cliNotFound') return 'CLI not found';
    if (key === 'statusBar.dev') return 'DEV';
    if (key === 'statusBar.yolo') return 'YOLO';
    if (key === 'statusBar.nActive' && vars?.n != null) return `${vars.n} active`;
    return key;
  },
}));

import StatusBar from './StatusBar';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    project_id: null,
    title: 'Session',
    model: 'claude-sonnet-4-6',
    status: null,
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: 2000,
    total_output_tokens: 1000,
    total_cost_cents: 123,
    created_at: null,
    updated_at: null,
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

describe('StatusBar', () => {
  beforeEach(() => {
    mockYoloMode = false;
    mockDeveloperMode = false;
    mockCliDetected = true;
    mockProcessStatus = 'not_started';
    mockSessionStatuses = { s1: 'not_started' };
    mockSessions = [makeSession()];
    mockActiveSessionId = 's1';
    mockRunningActions = [];
    mockRecentActionEvents = [];
    mockOpenExportDialog.mockClear();
  });

  it('renders status footer with token and cost displays', () => {
    render(() => <StatusBar />);
    expect(document.querySelector('footer[role="status"]')).toBeTruthy();
    expect(screen.getByText('$1.23')).toBeInTheDocument();
    expect(screen.getByText(/2\.0K \/ 1\.0K/)).toBeInTheDocument();
  });

  it('clicking export button opens diagnostics dialog', () => {
    render(() => <StatusBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Export Diagnostics' }));
    expect(mockOpenExportDialog).toHaveBeenCalled();
  });

  it('shows CLI-not-found status when CLI is unavailable', () => {
    mockCliDetected = false;
    render(() => <StatusBar />);
    expect(screen.getByText('CLI not found')).toBeInTheDocument();
  });

  it('shows DEV badge when developer mode is enabled', () => {
    mockDeveloperMode = true;
    render(() => <StatusBar />);
    expect(screen.getByText('DEV')).toBeInTheDocument();
  });

  it('shows YOLO badge and aggregate running cost for multiple running sessions', () => {
    mockYoloMode = true;
    mockDeveloperMode = true;
    mockSessions = [
      makeSession({ id: 's1', total_cost_cents: 100 }),
      makeSession({ id: 's2', total_cost_cents: 250 }),
    ];
    mockActiveSessionId = 's1';
    mockSessionStatuses = { s1: 'running', s2: 'running' };

    render(() => <StatusBar />);
    expect(screen.getByText('YOLO')).toBeInTheDocument();
    expect(screen.queryByText('DEV')).toBeNull();
    expect(screen.getByText(/∑ \$3\.50/)).toBeInTheDocument();
  });
});
