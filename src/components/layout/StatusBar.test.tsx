import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message, Session } from '@/lib/types';

let mockYoloMode = false;
let mockDeveloperMode = false;
let mockPermissionRequest: object | null = null;
let mockStatusCostPopoverVisible = false;
let mockCliDetected = true;
let mockProcessStatus: 'not_started' | 'running' | 'starting' | 'error' = 'not_started';
let mockSessionStatuses: Record<string, string> = {};
let mockSessions: Session[] = [];
let mockActiveSessionId: string | null = null;
let mockRunningActions: Array<{ id: string; name: string; command: string }> = [];
let mockRecentActionEvents: Array<{
  action_id: string;
  name: string;
  status: string;
  exit_code: number | null;
  finished_at: string | null;
}> = [];
let mockMessages: Message[] = [];

const mockOpenExportDialog = vi.fn();
const mockSetActiveSession = vi.fn();
const mockSelectAction = vi.fn();
const mockStopAction = vi.fn();
const mockRestartAction = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  uiState: {
    get yoloMode() {
      return mockYoloMode;
    },
    get developerMode() {
      return mockDeveloperMode;
    },
    get permissionRequest() {
      return mockPermissionRequest;
    },
    get statusCostPopoverVisible() {
      return mockStatusCostPopoverVisible;
    },
  },
  toggleStatusCostPopover: () => {
    mockStatusCostPopoverVisible = !mockStatusCostPopoverVisible;
  },
  closeStatusCostPopover: () => {
    mockStatusCostPopoverVisible = false;
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
    get messages() {
      return mockMessages;
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
  setActiveSession: (id: string) => mockSetActiveSession(id),
}));

vi.mock('@/stores/diagnosticsStore', () => ({
  openExportDialog: () => mockOpenExportDialog(),
}));

vi.mock('@/stores/actionStore', () => ({
  actionState: {
    get crossProjectRunning() {
      return [];
    },
  },
  getRunningActions: () => mockRunningActions,
  getRecentActionEvents: () => mockRecentActionEvents,
  stopAction: (id: string) => mockStopAction(id),
  restartAction: (action: unknown) => mockRestartAction(action),
  selectAction: (id: string) => mockSelectAction(id),
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string, vars?: Record<string, string | number>) => {
    if (key === 'status.idle') return 'Idle';
    if (key === 'status.running_count') return `${vars?.count ?? 0} running`;
    if (key === 'status.permission_needed') return 'Permission needed';
    if (key === 'status.cli_not_found') return 'CLI not found';
    if (key === 'statusBar.tokens') return `${vars?.value ?? '\u2013'} tokens`;
    if (key === 'statusBar.costBreakdown') return 'Cost breakdown';
    if (key === 'statusBar.sessionCost') return 'Session cost';
    if (key === 'statusBar.todayCost') return 'Today';
    if (key === 'statusBar.weekCost') return 'This week';
    if (key === 'statusBar.runningAggregate') return 'Running total';
    if (key === 'statusBar.runningSessions') return 'Running sessions';
    if (key === 'statusBar.noRunningSessions') return 'No running sessions';
    if (key === 'statusBar.exportDiagnostics') return 'Export Diagnostics';
    if (key === 'statusBar.recent') return 'Recent';
    if (key === 'statusBar.running') return 'Running';
    if (key === 'statusBar.dev') return 'DEV';
    if (key === 'statusBar.yolo') return 'AUTO';
    if (key === 'common.stop') return 'Stop';
    if (key === 'common.retry') return 'Retry';
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
    created_at: '2026-02-28T12:00:00.000Z',
    updated_at: '2026-02-28T12:00:00.000Z',
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

describe('StatusBar', () => {
  beforeEach(() => {
    mockYoloMode = false;
    mockDeveloperMode = false;
    mockPermissionRequest = null;
    mockStatusCostPopoverVisible = false;
    mockCliDetected = true;
    mockProcessStatus = 'not_started';
    mockSessionStatuses = { s1: 'not_started' };
    mockSessions = [makeSession()];
    mockActiveSessionId = 's1';
    mockRunningActions = [];
    mockRecentActionEvents = [];
    mockMessages = [];
    mockOpenExportDialog.mockClear();
    mockSetActiveSession.mockClear();
    mockSelectAction.mockClear();
    mockStopAction.mockClear();
    mockRestartAction.mockClear();
  });

  it('renders 3-zone summary: status, tokens, and session cost', () => {
    render(() => <StatusBar />);
    expect(document.querySelector('footer[role="status"]')).toBeTruthy();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('3.0K tokens')).toBeInTheDocument();
    expect(screen.getByText('$1.23')).toBeInTheDocument();
  });

  it('shows CLI-not-found state in status pill', () => {
    mockCliDetected = false;
    render(() => <StatusBar />);
    expect(screen.getByText('CLI not found')).toBeInTheDocument();
  });

  it('shows AUTO prefix in left status zone when auto-approve active', () => {
    mockYoloMode = true;
    render(() => <StatusBar />);
    expect(screen.getByText(/AUTO ·/)).toBeInTheDocument();
  });

  it('opens cost breakdown popover and exports diagnostics', () => {
    mockStatusCostPopoverVisible = true;
    render(() => <StatusBar />);
    expect(screen.getByText('Session cost')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export Diagnostics' }));
    expect(mockOpenExportDialog).toHaveBeenCalled();
  });

  it('shows running count and running aggregate cost when multiple sessions are active', () => {
    mockSessions = [
      makeSession({ id: 's1', total_cost_cents: 100 }),
      makeSession({ id: 's2', total_cost_cents: 250, title: 'Second session' }),
    ];
    mockSessionStatuses = { s1: 'running', s2: 'running' };
    mockProcessStatus = 'running';
    mockActiveSessionId = 's1';
    mockStatusCostPopoverVisible = true;

    render(() => <StatusBar />);
    expect(screen.getByText('2 running')).toBeInTheDocument();
    expect(screen.getByText('Running total')).toBeInTheDocument();
    expect(screen.getAllByText('$3.50').length).toBeGreaterThan(0);
  });

  function makeTodoMsg(
    todos: Array<{ content: string; status: string; activeForm: string }>,
  ): Message {
    return {
      id: 'msg-todo',
      session_id: 's1',
      role: 'tool_use',
      content: JSON.stringify({
        tool_name: 'TodoWrite',
        tool_input: JSON.stringify({ todos }),
      }),
      model: null,
      input_tokens: null,
      output_tokens: null,
      thinking_tokens: null,
      cost_cents: null,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };
  }

  it('opens status popover with running sessions and todo progress', () => {
    mockProcessStatus = 'running';
    mockSessionStatuses = { s1: 'running' };
    mockMessages = [
      makeTodoMsg([
        { content: 'Fix bug', status: 'completed', activeForm: 'Fixing' },
        { content: 'Run tests', status: 'in_progress', activeForm: 'Running' },
      ]),
    ];

    render(() => <StatusBar />);
    fireEvent.click(screen.getByRole('button', { name: '1 running' }));
    expect(screen.getByText('Running sessions')).toBeInTheDocument();
    expect(screen.getByText('✓ 1/2')).toBeInTheDocument();
  });
});
