import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mockIPC from '@/test/mockIPC';
import { createTestSession } from '@/test/helpers';

describe('sessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIPC.mockIpcCommand('create_session', (args) =>
      createTestSession({
        model: (args as { model?: string }).model ?? 'claude-sonnet-4-6',
      }),
    );
    mockIPC.mockIpcCommand('list_all_sessions', () => []);
    mockIPC.mockIpcCommand('update_session_project', () => undefined);
    mockIPC.mockIpcCommand('start_project_file_watcher', () => undefined);
    mockIPC.mockIpcCommand('stop_project_file_watcher', () => undefined);
    mockIPC.mockIpcCommand('read_claude_md', () => null);
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
    mockIPC.mockIpcCommand('list_all_sessions', () => [stale]);

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

  it('defaults new sessions to active project when projectId is omitted', async () => {
    let capturedProjectId: string | null | undefined;
    mockIPC.mockIpcCommand('create_session', (args) => {
      const payload = args as { model?: string; project_id?: string | null };
      capturedProjectId = payload.project_id;
      return createTestSession({
        model: payload.model ?? 'claude-sonnet-4-6',
        project_id: payload.project_id ?? null,
      });
    });

    const projectMod = await import('./projectStore');
    projectMod.setActiveProject('proj-active');

    const { createNewSession } = await import('./sessionStore');
    const session = await createNewSession('claude-sonnet-4-6');

    expect(capturedProjectId).toBe('proj-active');
    expect(session.project_id).toBe('proj-active');
  });

  it('persists an updated project id onto an existing session', async () => {
    const session = createTestSession({ id: 'session-a', project_id: null });
    mockIPC.mockIpcCommand('list_all_sessions', () => [session]);
    const mod = await import('./sessionStore');
    await mod.loadSessions();

    await mod.updateSessionProject('session-a', 'proj-a');

    expect(mod.sessionState.sessions.find((item) => item.id === 'session-a')?.project_id).toBe(
      'proj-a',
    );
  });

  it('switches the active project to match the activated session project', async () => {
    const target = createTestSession({ id: 'session-a', project_id: 'proj-a' });
    mockIPC.mockIpcCommand('list_all_sessions', () => [target]);

    const projectMod = await import('./projectStore');
    projectMod.setActiveProject('proj-b');

    const mod = await import('./sessionStore');
    await mod.loadSessions();
    mod.setActiveSession('session-a');

    expect(projectMod.projectState.activeProjectId).toBe('proj-a');
  });
});
