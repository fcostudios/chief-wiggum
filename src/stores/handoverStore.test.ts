import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock('@/stores/conversationStore', () => ({
  appendRemoteMessage: vi.fn(),
  loadMessages: vi.fn(),
}));

vi.mock('@/stores/sessionStore', () => ({
  refreshSessionById: vi.fn(),
  sessionState: { activeSessionId: null },
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('handoverStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('startHandover sets session as handed over with relay URL', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      session_id: 'session-1',
      relay_url: 'https://claude.ai/code/test123',
      started_at: '2026-03-20T00:00:00Z',
    });

    const { startHandover, isHandedOver, getHandoverEntry } = await import('./handoverStore');
    await startHandover('session-1');

    expect(isHandedOver('session-1')).toBe(true);
    expect(getHandoverEntry('session-1')?.relayUrl).toBe('https://claude.ai/code/test123');
  });

  it('reclaimSession removes the handover entry', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        session_id: 'session-2',
        relay_url: 'https://claude.ai/code/test456',
        started_at: '2026-03-20T00:00:00Z',
      })
      .mockResolvedValueOnce({
        session_id: 'session-2',
        imported: 1,
        skipped: 0,
        last_uuid: 'uuid-1',
      });

    const { startHandover, reclaimSession, isHandedOver } = await import('./handoverStore');
    await startHandover('session-2');
    expect(isHandedOver('session-2')).toBe(true);

    await reclaimSession('session-2');
    expect(isHandedOver('session-2')).toBe(false);
  });

  it('initHandoverListeners wires session:remote-message to appendRemoteMessage', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const { appendRemoteMessage } = await import('@/stores/conversationStore');
    const { invoke } = await import('@tauri-apps/api/core');

    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, callback) => {
      if (eventName === 'session:remote-message') {
        capturedCallback = callback as typeof capturedCallback;
      }
      return () => {};
    });

    vi.mocked(invoke).mockResolvedValueOnce({
      session_id: 'session-3',
      relay_url: 'https://claude.ai/code/test789',
      started_at: '2026-03-21T00:00:00Z',
    });

    const { startHandover, initHandoverListeners, cleanupHandoverListeners } =
      await import('./handoverStore');
    await startHandover('session-3');
    await initHandoverListeners();

    expect(capturedCallback).not.toBeNull();

    capturedCallback!({
      payload: {
        session_id: 'session-3',
        uuid: 'msg-uuid-1',
        role: 'assistant',
        content: 'Hello from remote',
        model: 'claude-opus-4-6',
        input_tokens: 10,
        output_tokens: 20,
        thinking_tokens: null,
        stop_reason: 'end_turn',
        is_error: false,
        parent_uuid: null,
        timestamp: '2026-03-21T00:00:01Z',
      },
    });

    expect(appendRemoteMessage).toHaveBeenCalledWith('session-3', {
      uuid: 'msg-uuid-1',
      role: 'assistant',
      content: 'Hello from remote',
      timestamp: '2026-03-21T00:00:01Z',
    });

    cleanupHandoverListeners();
  });

  it('initHandoverListeners ignores events for sessions not handed over', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const { appendRemoteMessage } = await import('@/stores/conversationStore');

    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, callback) => {
      if (eventName === 'session:remote-message') {
        capturedCallback = callback as typeof capturedCallback;
      }
      return () => {};
    });

    const { initHandoverListeners, cleanupHandoverListeners } = await import('./handoverStore');
    await initHandoverListeners();

    capturedCallback!({
      payload: {
        session_id: 'not-handed-over',
        uuid: 'msg-uuid-2',
        role: 'user',
        content: 'ignored',
        model: null,
        input_tokens: null,
        output_tokens: null,
        thinking_tokens: null,
        stop_reason: null,
        is_error: false,
        parent_uuid: null,
        timestamp: '2026-03-21T00:00:01Z',
      },
    });

    expect(appendRemoteMessage).not.toHaveBeenCalled();

    cleanupHandoverListeners();
  });

  it('initHandoverListeners re-hydrates state from backend on reload', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const { sessionState } = await import('@/stores/sessionStore');

    Object.assign(sessionState, { activeSessionId: 'session-hmr' });
    vi.mocked(invoke).mockResolvedValueOnce({
      session_id: 'session-hmr',
      cli_session_id: 'cli-session-x',
      relay_url: 'https://claude.ai/code/hmr-test',
      started_at: '2026-03-21T00:00:00Z',
    });

    const { initHandoverListeners, isHandedOver, cleanupHandoverListeners } =
      await import('./handoverStore');
    await initHandoverListeners();

    expect(isHandedOver('session-hmr')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('get_handover_state', {
      session_id: 'session-hmr',
    });

    cleanupHandoverListeners();
  });
});
