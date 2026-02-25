import { beforeEach, describe, expect, it } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import { createTestSession } from '@/test/helpers';

describe('sessionStore', () => {
  beforeEach(() => {
    mockIpcCommand('create_session', (args) =>
      createTestSession({
        model: (args as { model?: string }).model ?? 'claude-sonnet-4-6',
      }),
    );
    mockIpcCommand('list_all_sessions', () => []);
  });

  it('exports sessionState with sessions array', async () => {
    const { sessionState } = await import('./sessionStore');
    expect(Array.isArray(sessionState.sessions)).toBe(true);
  });

  it('exports activeSessionId as null initially', async () => {
    const { sessionState } = await import('./sessionStore');
    expect(sessionState.activeSessionId).toBeNull();
  });
});
