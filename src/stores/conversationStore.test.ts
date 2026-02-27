import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand, mockListen } from '@/test/mockIPC';
import { createTestMessage } from '@/test/helpers';

const mocks = vi.hoisted(() => ({
  session: {
    activeSession: {
      id: 'test-session-1',
      title: '',
      model: 'claude-sonnet-4-6',
      cli_session_id: null,
    },
    updateSessionTitle: vi.fn(() => Promise.resolve()),
    updateSessionCliId: vi.fn(() => Promise.resolve()),
    refreshSessionById: vi.fn(() => Promise.resolve()),
  },
  project: {
    activeProject: undefined as { id: string; path: string } | undefined,
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
  getActiveSession: () => mocks.session.activeSession,
  refreshSessionById: mocks.session.refreshSessionById,
}));

vi.mock('@/stores/projectStore', () => ({
  getActiveProject: () => mocks.project.activeProject,
  projectState: { activeProjectId: null },
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

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.project.activeProject = undefined;
    mocks.session.activeSession = {
      id: 'test-session-1',
      title: '',
      model: 'claude-sonnet-4-6',
      cli_session_id: null,
    };

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
});
