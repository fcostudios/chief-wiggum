import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand, mockListen } from '@/test/mockIPC';
import { createTestMessage, createTestSession } from '@/test/helpers';
import type { ActiveBridgeInfo, BufferedEvent, Project } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  session: {
    activeSession: {
      id: 'test-session-1',
      title: 'Test Session 1',
      model: 'claude-sonnet-4-6',
      project_id: null,
      status: null,
      parent_session_id: null,
      context_tokens: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_cents: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cli_session_id: null,
      pinned: false,
    } as ReturnType<typeof createTestSession>,
    sessions: [] as ReturnType<typeof createTestSession>[],
    updateSessionTitle: vi.fn(() => Promise.resolve()),
    updateSessionCliId: vi.fn(() => Promise.resolve()),
    updateSessionProject: vi.fn(() => Promise.resolve()),
    refreshSessionById: vi.fn(() => Promise.resolve()),
    touchSessionActivity: vi.fn(),
  },
  project: {
    activeProject: undefined as { id: string; path: string } | undefined,
    activeProjectId: null as string | null,
    projects: [] as Project[],
    setActiveProject: vi.fn(),
  },
  ui: {
    showPermissionDialog: vi.fn(),
  },
  toast: {
    addToast: vi.fn(),
  },
}));

vi.mock('@/stores/sessionStore', () => ({
  updateSessionTitle: mocks.session.updateSessionTitle,
  updateSessionCliId: mocks.session.updateSessionCliId,
  updateSessionProject: mocks.session.updateSessionProject,
  getActiveSession: () => mocks.session.activeSession,
  sessionState: {
    get sessions() {
      return mocks.session.sessions;
    },
    get activeSessionId() {
      return mocks.session.activeSession.id;
    },
  },
  refreshSessionById: mocks.session.refreshSessionById,
  touchSessionActivity: mocks.session.touchSessionActivity,
}));

vi.mock('@/stores/projectStore', () => ({
  getActiveProject: () => mocks.project.activeProject,
  setActiveProject: mocks.project.setActiveProject,
  projectState: {
    get activeProjectId() {
      return mocks.project.activeProjectId;
    },
    get projects() {
      return mocks.project.projects;
    },
  },
}));

vi.mock('@/stores/uiStore', () => ({
  showPermissionDialog: mocks.ui.showPermissionDialog,
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: mocks.toast.addToast,
}));

type ConversationStoreModule = typeof import('./conversationStore');

describe('conversationStore', () => {
  let mod: ConversationStoreModule;
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  function setActiveSessionId(id: string): void {
    mocks.session.activeSession = {
      ...mocks.session.activeSession,
      id,
    };
  }

  function bridge(
    overrides: Partial<ActiveBridgeInfo> & Pick<ActiveBridgeInfo, 'session_id'>,
  ): ActiveBridgeInfo {
    const { session_id, ...rest } = overrides;
    return {
      session_id,
      process_status: 'running',
      cli_session_id: null,
      model: 'claude-sonnet-4-6',
      has_buffered_events: false,
      ...rest,
    };
  }

  function chunk(
    sessionId: string,
    content: string,
    overrides?: Partial<BufferedEvent>,
  ): BufferedEvent {
    return {
      type: 'Chunk',
      session_id: sessionId,
      content,
      ...overrides,
    };
  }

  function completion(
    sessionId: string,
    content: string,
    overrides?: Partial<BufferedEvent>,
  ): BufferedEvent {
    return {
      type: 'MessageComplete',
      session_id: sessionId,
      role: 'assistant',
      content,
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      is_error: false,
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    clipboardWriteText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });
    mocks.project.activeProject = { id: 'proj-default', path: '/workspace/default' };
    mocks.project.activeProjectId = 'proj-default';
    mocks.project.projects = [
      {
        id: 'proj-default',
        name: 'Default',
        path: '/workspace/default',
        default_model: null,
        default_effort: null,
        created_at: null,
        last_opened_at: null,
      },
    ];
    mocks.session.activeSession = createTestSession({
      id: 'test-session-1',
      model: 'claude-sonnet-4-6',
      project_id: null,
      cli_session_id: null,
    });
    mocks.session.sessions = [];

    mockListen.mockClear();
    mockIpcCommand('list_messages', () => []);
    mockIpcCommand('save_message', () => undefined);
    mockIpcCommand('list_active_bridges', () => []);
    mockIpcCommand('drain_session_buffer', () => []);
    mockIpcCommand('get_cli_info', () => ({
      resolved_path: '/usr/bin/claude',
      source: 'system_path',
      version: '1.0.0',
      supports_sdk: true,
    }));
    mockIpcCommand('send_to_cli', () => undefined);
    mockIpcCommand('start_session_cli', () => undefined);
    mockIpcCommand('update_message_content', () => undefined);
    mockIpcCommand('delete_messages_after', () => 0);
    mockIpcCommand('interrupt_session', () => undefined);
    mockIpcCommand('set_session_model', () => undefined);
    mockIpcCommand('stop_session_cli', () => undefined);

    mod = await import('./conversationStore');
    mod.clearMessages();
  });

  it('exports state with correct initial shape', () => {
    expect(mod.conversationState.messages).toEqual([]);
    expect(mod.conversationState.isLoading).toBe(false);
    expect(mod.conversationState.streamingContent).toBe('');
    expect(mod.conversationState.thinkingContent).toBe('');
    expect(mod.conversationState.isStreaming).toBe(false);
    expect(mod.conversationState.error).toBeNull();
    expect(mod.conversationState.processStatus).toBeDefined();
    expect(mod.conversationState.diffStates).toEqual({});
  });

  it('getDiffState defaults to pending and setDiffState updates map', () => {
    expect(mod.getDiffState('m1:0')).toBe('pending');
    mod.setDiffState('m1:0', 'applied');
    expect(mod.getDiffState('m1:0')).toBe('applied');
    mod.setDiffState('m1:0', 'rejected');
    expect(mod.getDiffState('m1:0')).toBe('rejected');
  });

  it('getSessionStatus returns not_started for unknown session', () => {
    expect(mod.getSessionStatus('unknown-id')).toBe('not_started');
  });

  it('setSessionStatus updates per-session status and active global status', () => {
    mod.setSessionStatus('test-session-1', 'running');
    expect(mod.getSessionStatus('test-session-1')).toBe('running');
    expect(mod.conversationState.processStatus).toBe('running');
  });

  it('loadMessages fetches from backend and sets state', async () => {
    const msgs = [
      createTestMessage({ session_id: 's1', role: 'user', content: 'hello' }),
      createTestMessage({ session_id: 's1', role: 'assistant', content: 'world' }),
    ];
    mockIpcCommand('list_messages', () => msgs);

    await mod.loadMessages('s1');
    expect(mod.conversationState.messages).toHaveLength(2);
    expect(mod.conversationState.messages[0].content).toBe('hello');
    expect(mod.conversationState.isLoading).toBe(false);
  });

  it('clearMessages resets message state', async () => {
    const msgs = [createTestMessage({ content: 'test' })];
    mockIpcCommand('list_messages', () => msgs);
    await mod.loadMessages('s1');

    mod.clearMessages();
    expect(mod.conversationState.messages).toEqual([]);
    expect(mod.conversationState.streamingContent).toBe('');
    expect(mod.conversationState.error).toBeNull();
    expect(mod.conversationState.processStatus).toBe('not_started');
  });

  it('isSessionUnread defaults to false', () => {
    expect(mod.isSessionUnread('any-session')).toBe(false);
  });

  it('markSessionUnread and clearSessionUnread toggle unread flag', () => {
    mod.markSessionUnread('s1');
    expect(mod.isSessionUnread('s1')).toBe(true);
    mod.clearSessionUnread('s1');
    expect(mod.isSessionUnread('s1')).toBe(false);
  });

  it('recordPermissionOutcome appends a permission message', () => {
    mod.recordPermissionOutcome('s1', 'Read', 'cat file.txt', 'allowed', 'low');
    const permMsg = mod.conversationState.messages.find((m) => m.role === 'permission');
    expect(permMsg).toBeDefined();
    expect(permMsg?.session_id).toBe('s1');
    const payload = JSON.parse(permMsg?.content ?? '{}') as Record<string, string>;
    expect(payload.tool).toBe('Read');
    expect(payload.outcome).toBe('allowed');
    expect(payload.risk_level).toBe('low');
  });

  it('setupEventListeners registers Tauri listeners', async () => {
    await mod.setupEventListeners('s1');
    expect(mockListen).toHaveBeenCalled();
    expect(mockListen.mock.calls.length).toBeGreaterThan(5);
  });

  it('cleanupSessionListeners removes listeners for a session', async () => {
    const unlisten = vi.fn();
    mockListen.mockImplementation(async () => unlisten);
    await mod.setupEventListeners('s1');
    await mod.cleanupSessionListeners('s1');
    expect(unlisten).toHaveBeenCalled();
  });

  it('cleanupAllListeners removes listeners for all sessions', async () => {
    const unlisten = vi.fn();
    mockListen.mockImplementation(async () => unlisten);
    await mod.setupEventListeners('s1');
    await mod.setupEventListeners('s2');
    await mod.cleanupAllListeners();
    expect(unlisten).toHaveBeenCalled();
    expect(unlisten.mock.calls.length).toBeGreaterThan(1);
  });

  it('surfaces enriched diagnostics when the CLI exits abnormally', async () => {
    await mod.setupEventListeners('test-session-1');

    const cliExitedCall = mockListen.mock.calls.find(
      (call) => (call as unknown[])[0] === 'cli:exited',
    ) as unknown[] | undefined;
    const cliExited = cliExitedCall?.[1] as
      | ((event: {
          payload: {
            session_id: string;
            exit_code: number | null;
            diagnostics: {
              working_dir: string | null;
              model: string | null;
              mode: string;
              resume_mode: string;
              stdout_tail: string[];
              stderr_tail: string[];
              termination: string | null;
            };
          };
        }) => void)
      | undefined;

    expect(cliExited).toBeDefined();

    cliExited?.({
      payload: {
        session_id: 'test-session-1',
        exit_code: -1,
        diagnostics: {
          working_dir: '/workspace/a',
          model: 'claude-sonnet-4-6',
          mode: 'sdk',
          resume_mode: 'resume',
          stdout_tail: [],
          stderr_tail: ['fatal: transport closed'],
          termination: 'process exited without a numeric status',
        },
      },
    });

    expect(mod.conversationState.error).toContain('Claude Code CLI exited with code -1');
    expect(mod.conversationState.error).toContain('cwd: /workspace/a');
    expect(mod.conversationState.error).toContain('stderr: fatal: transport closed');
  });

  it('sendMessage forwards image payloads via message_images', async () => {
    const sendToCli = vi.fn((_args: Record<string, unknown>) => undefined);
    mockIpcCommand('send_to_cli', sendToCli);
    mockIpcCommand('list_active_bridges', () => []);
    mockIpcCommand('start_session_cli', () => undefined);

    await mod.sendMessage('check this screenshot', 'test-session-1', [
      {
        file_name: 'paste-1.png',
        mime_type: 'image/png',
        data_base64: 'YWJj',
        size_bytes: 3,
        width: 1,
        height: 1,
      },
    ]);

    expect(sendToCli).toHaveBeenCalledTimes(1);
    const args = sendToCli.mock.calls[0]?.[0] as
      | { message_images?: Array<{ data_base64: string }> }
      | undefined;
    expect(args).toBeDefined();
    expect(args?.message_images).toHaveLength(1);
    expect(args?.message_images?.[0]?.data_base64).toBe('YWJj');
  });

  it('dispatches using the session project instead of the active sidebar project', async () => {
    const sendToCli = vi.fn((_args: Record<string, unknown>) => undefined);
    mockIpcCommand('send_to_cli', sendToCli);
    mockIpcCommand('list_active_bridges', () => []);
    mockIpcCommand('start_session_cli', () => undefined);

    mocks.project.activeProjectId = 'proj-b';
    mocks.project.activeProject = { id: 'proj-b', path: '/workspace/b' };
    mocks.project.projects = [
      {
        id: 'proj-a',
        name: 'A',
        path: '/workspace/a',
        default_model: null,
        default_effort: null,
        created_at: null,
        last_opened_at: null,
      },
      {
        id: 'proj-b',
        name: 'B',
        path: '/workspace/b',
        default_model: null,
        default_effort: null,
        created_at: null,
        last_opened_at: null,
      },
    ];
    mocks.session.activeSession = createTestSession({
      id: 'session-a',
      project_id: 'proj-a',
      cli_session_id: 'cli-a',
    });
    mocks.session.sessions = [mocks.session.activeSession];

    await mod.sendMessage('status?', 'session-a');

    expect(sendToCli).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-a',
        project_path: '/workspace/a',
      }),
    );
  });

  it('handles /claude-session-id locally and offers a copy action', async () => {
    const sendToCli = vi.fn((_args: Record<string, unknown>) => undefined);
    mockIpcCommand('send_to_cli', sendToCli);
    mocks.session.activeSession = createTestSession({
      id: 'session-with-cli',
      cli_session_id: 'cli-session-123',
    });
    mocks.session.sessions = [mocks.session.activeSession];

    await mod.sendMessage('/claude-session-id', 'session-with-cli');

    expect(sendToCli).not.toHaveBeenCalled();
    expect(mod.conversationState.messages).toEqual([]);
    expect(mocks.toast.addToast).toHaveBeenCalledWith(
      'Claude session ID: cli-session-123',
      'success',
      expect.objectContaining({
        label: 'Copy',
        onClick: expect.any(Function),
      }),
    );

    const lastToastCall =
      mocks.toast.addToast.mock.calls[mocks.toast.addToast.mock.calls.length - 1];
    const action = lastToastCall?.[2] as { label: string; onClick: () => void } | undefined;
    expect(action?.label).toBe('Copy');
    action?.onClick();
    await Promise.resolve();
    expect(clipboardWriteText).toHaveBeenCalledWith('cli-session-123');
  });

  it('handles /claude-session-id locally when no CLI session exists yet', async () => {
    const sendToCli = vi.fn((_args: Record<string, unknown>) => undefined);
    mockIpcCommand('send_to_cli', sendToCli);
    mocks.session.activeSession = createTestSession({
      id: 'session-without-cli',
      cli_session_id: null,
    });
    mocks.session.sessions = [mocks.session.activeSession];

    await mod.sendMessage('/claude-session-id', 'session-without-cli');

    expect(sendToCli).not.toHaveBeenCalled();
    expect(mod.conversationState.messages).toEqual([]);
    expect(mocks.toast.addToast).toHaveBeenCalledWith(
      'Claude session ID is not available yet',
      'info',
    );
  });

  it('binds a projectless session to the active project before dispatch', async () => {
    const sendToCli = vi.fn((_args: Record<string, unknown>) => undefined);
    mockIpcCommand('send_to_cli', sendToCli);
    mockIpcCommand('list_active_bridges', () => []);
    mockIpcCommand('start_session_cli', () => undefined);

    mocks.project.activeProjectId = 'proj-a';
    mocks.project.activeProject = { id: 'proj-a', path: '/workspace/a' };
    mocks.project.projects = [
      {
        id: 'proj-a',
        name: 'A',
        path: '/workspace/a',
        default_model: null,
        default_effort: null,
        created_at: null,
        last_opened_at: null,
      },
    ];
    mocks.session.activeSession = createTestSession({
      id: 'session-a',
      project_id: null,
    });
    mocks.session.sessions = [mocks.session.activeSession];

    await mod.sendMessage('status?', 'session-a');

    expect(mocks.session.updateSessionProject).toHaveBeenCalledWith('session-a', 'proj-a');
    expect(sendToCli).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-a',
        project_path: '/workspace/a',
      }),
    );
  });

  it('marks non-active running sessions as recoverable after reload', async () => {
    setActiveSessionId('session-a');
    mockIpcCommand('list_active_bridges', () => [
      bridge({
        session_id: 'session-b',
        cli_session_id: 'cli-b',
        has_buffered_events: true,
      }),
    ]);

    await mod.reconnectAfterReload('session-a');

    expect(mod.conversationState.recoverableSessions['session-b']).toMatchObject({
      processStatus: 'running',
      cliSessionId: 'cli-b',
      hasBufferedEvents: true,
    });
    expect(mocks.session.activeSession.id).toBe('session-a');
  });

  it('still recovers the selected active session during reload', async () => {
    setActiveSessionId('session-a');
    const persistedMessages = [
      createTestMessage({ session_id: 'session-a', role: 'user', content: 'hello' }),
    ];
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-a', cli_session_id: 'cli-a', has_buffered_events: true }),
    ]);
    mockIpcCommand('list_messages', () => persistedMessages);
    mockIpcCommand('drain_session_buffer', () => [chunk('session-a', 'continued work')]);

    await mod.reconnectAfterReload('session-a');

    expect(mod.conversationState.messages).toEqual(expect.arrayContaining(persistedMessages));
    expect(mod.conversationState.processStatus).toBe('running');
    expect(mod.conversationState.streamingContent).toBe('continued work');
  });

  it('recovers a background-running session when the user activates it', async () => {
    setActiveSessionId('session-a');
    const persistedMessages = [
      createTestMessage({ session_id: 'session-b', role: 'user', content: 'hello' }),
    ];
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-b', cli_session_id: 'cli-b', has_buffered_events: true }),
    ]);
    mockIpcCommand('list_messages', ({ session_id }) =>
      session_id === 'session-b' ? persistedMessages : [],
    );
    mockIpcCommand('drain_session_buffer', () => [chunk('session-b', 'still running')]);

    await mod.reconnectAfterReload('session-a');
    setActiveSessionId('session-b');

    await mod.switchSession('session-b', 'session-a');

    expect(mod.conversationState.messages).toEqual(expect.arrayContaining(persistedMessages));
    expect(mod.conversationState.isLoading).toBe(true);
    expect(mod.conversationState.processStatus).toBe('running');
    expect(mod.conversationState.streamingContent).toBe('still running');
    expect(mod.conversationState.recoverableSessions['session-b']).toBeUndefined();
  });

  it('clears the recoverable marker when the bridge already exited before activation', async () => {
    setActiveSessionId('session-a');
    const persistedMessages = [
      createTestMessage({ session_id: 'session-b', role: 'assistant', content: 'done' }),
    ];
    let callCount = 0;
    mockIpcCommand('list_active_bridges', () => {
      callCount += 1;
      return callCount === 1 ? [bridge({ session_id: 'session-b', cli_session_id: 'cli-b' })] : [];
    });
    mockIpcCommand('list_messages', ({ session_id }) =>
      session_id === 'session-b' ? persistedMessages : [],
    );

    await mod.reconnectAfterReload('session-a');
    setActiveSessionId('session-b');

    await mod.switchSession('session-b', 'session-a');

    expect(mod.conversationState.messages).toEqual(expect.arrayContaining(persistedMessages));
    expect(mod.conversationState.recoverableSessions['session-b']).toBeUndefined();
    expect(mod.conversationState.processStatus).toBe('not_started');
  });

  it('does not run recovery twice while one recovery is already in flight', async () => {
    setActiveSessionId('session-a');
    const drainSpy = vi.fn(
      async () =>
        new Promise<BufferedEvent[]>((resolve) =>
          setTimeout(() => resolve([chunk('session-b', 'x')]), 10),
        ),
    );
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-b', cli_session_id: 'cli-b', has_buffered_events: true }),
    ]);
    mockIpcCommand('drain_session_buffer', drainSpy);

    const first = mod.resumeSessionView('session-b');
    const second = mod.resumeSessionView('session-b');

    await Promise.all([first, second]);

    expect(drainSpy).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a persisted assistant completion during recovery replay', async () => {
    setActiveSessionId('session-b');
    const persistedMessages = [
      createTestMessage({
        session_id: 'session-b',
        role: 'assistant',
        content: 'Final answer',
        uuid: 'assistant-uuid',
        parent_uuid: 'user-uuid',
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-6',
      }),
    ];
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-b', cli_session_id: 'cli-b', has_buffered_events: true }),
    ]);
    mockIpcCommand('list_messages', () => persistedMessages);
    mockIpcCommand('drain_session_buffer', () => [
      completion('session-b', 'Final answer', {
        uuid: 'assistant-uuid',
        parent_uuid: 'user-uuid',
      }),
    ]);

    await mod.resumeSessionView('session-b');

    expect(
      mod.conversationState.messages.filter((message) => message.content === 'Final answer'),
    ).toHaveLength(1);
  });

  it('does not duplicate tool results already represented by tool_use_id', async () => {
    setActiveSessionId('session-b');
    const persistedMessages = [
      createTestMessage({
        session_id: 'session-b',
        role: 'tool_result',
        content: JSON.stringify({
          tool_use_id: 'tool-1',
          content: 'done',
          is_error: false,
        }),
      }),
    ];
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-b', cli_session_id: 'cli-b', has_buffered_events: true }),
    ]);
    mockIpcCommand('list_messages', () => persistedMessages);
    mockIpcCommand('drain_session_buffer', () => [
      {
        type: 'ToolResult',
        session_id: 'session-b',
        tool_use_id: 'tool-1',
        content: 'done',
        is_error: false,
      },
    ]);

    await mod.resumeSessionView('session-b');

    expect(
      mod.conversationState.messages.filter((message) => message.role === 'tool_result'),
    ).toHaveLength(1);
  });

  it('restores streaming state when only chunks are buffered and no final message exists', async () => {
    setActiveSessionId('session-b');
    const persistedMessages = [
      createTestMessage({ session_id: 'session-b', role: 'user', content: 'continue' }),
    ];
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-b', cli_session_id: 'cli-b', has_buffered_events: true }),
    ]);
    mockIpcCommand('list_messages', () => persistedMessages);
    mockIpcCommand('drain_session_buffer', () => [chunk('session-b', 'partial response')]);

    await mod.resumeSessionView('session-b');

    expect(mod.conversationState.messages).toEqual(expect.arrayContaining(persistedMessages));
    expect(mod.conversationState.streamingContent).toBe('partial response');
    expect(mod.conversationState.isStreaming).toBe(true);
    expect(mod.conversationState.isLoading).toBe(true);
  });

  it('clears loading when recovery replay already contains the final completion', async () => {
    setActiveSessionId('session-b');
    mockIpcCommand('list_active_bridges', () => [
      bridge({ session_id: 'session-b', cli_session_id: 'cli-b', has_buffered_events: true }),
    ]);
    mockIpcCommand('list_messages', () => [
      createTestMessage({ session_id: 'session-b', role: 'user', content: 'continue' }),
    ]);
    mockIpcCommand('drain_session_buffer', () => [completion('session-b', 'done now')]);

    await mod.resumeSessionView('session-b');

    expect(mod.conversationState.isLoading).toBe(false);
    expect(mod.conversationState.isStreaming).toBe(false);
    expect(mod.conversationState.processStatus).toBe('exited');
  });
});

describe('interruptSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls interrupt_session IPC with correct session_id', async () => {
    let capturedArgs: Record<string, unknown> | null = null;
    mockIpcCommand('interrupt_session', (args) => {
      capturedArgs = args;
      return undefined;
    });
    const { interruptSession } = await import('./conversationStore');
    await interruptSession('session-abc');
    expect(capturedArgs).toEqual({ session_id: 'session-abc' });
  });

  it('does not throw on IPC failure', async () => {
    mockIpcCommand('interrupt_session', () => {
      throw new Error('IPC error');
    });
    const { interruptSession } = await import('./conversationStore');
    await expect(interruptSession('session-abc')).resolves.toBeUndefined();
  });
});
