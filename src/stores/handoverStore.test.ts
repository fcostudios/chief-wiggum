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
});
