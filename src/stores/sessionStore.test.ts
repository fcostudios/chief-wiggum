import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import { createTestSession } from '@/test/helpers';

describe('sessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIpcCommand('create_session', (args) =>
      createTestSession({
        model: (args as { model?: string }).model ?? 'claude-sonnet-4-6',
      }),
    );
    mockIpcCommand('list_all_sessions', () => []);
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('exports sessionState with sessions array', async () => {
    const { sessionState } = await import('./sessionStore');
    expect(Array.isArray(sessionState.sessions)).toBe(true);
  });

  it('exports activeSessionId as null initially', async () => {
    const { sessionState } = await import('./sessionStore');
    expect(sessionState.activeSessionId).toBeNull();
  });

  it('uses configurable resume inactivity minutes from settings', async () => {
    vi.setSystemTime(new Date('2026-03-01T00:10:00.000Z'));
    const stale = createTestSession({
      id: 'resume-session',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    });
    mockIpcCommand('list_all_sessions', () => [stale]);

    const settingsMod = await import('./settingsStore');
    const { loadSessions, shouldShowResumeCard, getResumeThresholdMs } =
      await import('./sessionStore');

    settingsMod.updateSetting('sessions', 'resume_inactivity_minutes', 15);
    await loadSessions();
    expect(getResumeThresholdMs()).toBe(15 * 60 * 1000);
    expect(shouldShowResumeCard(stale.id, 2)).toBe(false);

    settingsMod.updateSetting('sessions', 'resume_inactivity_minutes', 5);
    expect(getResumeThresholdMs()).toBe(5 * 60 * 1000);
    expect(shouldShowResumeCard(stale.id, 2)).toBe(true);
  });
});
