// src/stores/sessionStore.ts
// Session state: session list, active session, CRUD operations.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Session } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { settingsState } from '@/stores/settingsStore';
import { addToast } from '@/stores/toastStore';
import { bindActiveSessionToFocusedPane, ensureMainPaneSession } from '@/stores/viewStore';

const log = createLogger('ui/session');

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
  /** Resume card dismiss state (in-memory, per inactivity gap). */
  dismissedResumeSessions: Set<string>;
  /** Last meaningful activity timestamp per session. */
  sessionLastActiveAt: Record<string, number>;
}

const [state, setState] = createStore<SessionState>({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  dismissedResumeSessions: new Set(),
  sessionLastActiveAt: {},
});

const DEFAULT_RESUME_THRESHOLD_MINUTES = 5;
const MIN_RESUME_THRESHOLD_MINUTES = 1;

function getResumeThresholdMinutes(): number {
  const raw = settingsState.settings.sessions.resume_inactivity_minutes;
  if (!Number.isFinite(raw)) return DEFAULT_RESUME_THRESHOLD_MINUTES;
  return Math.max(MIN_RESUME_THRESHOLD_MINUTES, Math.floor(raw));
}

export function getResumeThresholdMs(): number {
  return getResumeThresholdMinutes() * 60 * 1000;
}

function sessionTimestampMs(session: Session | undefined): number | null {
  if (!session) return null;
  const raw = session.updated_at ?? session.created_at;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Load all sessions from the database. Called on app start. */
export async function loadSessions(): Promise<void> {
  setState('isLoading', true);
  try {
    const sessions = await invoke<Session[]>('list_all_sessions');
    setState('sessions', sessions);
    setState('sessionLastActiveAt', (prev) => {
      const next = { ...prev };
      for (const session of sessions) {
        const ts = sessionTimestampMs(session);
        if (ts != null && next[session.id] == null) {
          next[session.id] = ts;
        }
      }
      return next;
    });
    ensureMainPaneSession(sessions[0]?.id ?? null);
  } finally {
    setState('isLoading', false);
  }
}

/** Create a new session and make it active. */
export async function createNewSession(model: string, projectId?: string): Promise<Session> {
  const session = await invoke<Session>('create_session', {
    model,
    project_id: projectId ?? null,
  });
  setState('sessions', (prev) => [session, ...prev]);
  setState('activeSessionId', session.id);
  setState('sessionLastActiveAt', session.id, Date.now());
  bindActiveSessionToFocusedPane(session.id);
  return session;
}

/** Switch to an existing session. Does NOT load messages — caller must do that. */
export function setActiveSession(sessionId: string): void {
  setState('activeSessionId', sessionId);
  bindActiveSessionToFocusedPane(sessionId);
}

/** Delete a session and switch to the next one. */
export async function deleteSession(sessionId: string): Promise<void> {
  await invoke('delete_session', { session_id: sessionId });
  setState('sessions', (prev) => prev.filter((s) => s.id !== sessionId));
  setState('sessionLastActiveAt', (prev) => {
    const next = { ...prev };
    delete next[sessionId];
    return next;
  });
  setState('dismissedResumeSessions', (prev) => {
    const next = new Set(prev);
    next.delete(sessionId);
    return next;
  });
  if (state.activeSessionId === sessionId) {
    setState('activeSessionId', state.sessions[0]?.id ?? null);
  }
}

/** Update session title (e.g., auto-title from first message). */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await invoke('update_session_title', { session_id: sessionId, title });
  setState('sessions', (s) => s.id === sessionId, 'title', title);
}

/** Get the active session object. */
export function getActiveSession(): Session | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}

/** Update the CLI session ID for a session (from cli:init event). */
export async function updateSessionCliId(sessionId: string, cliSessionId: string): Promise<void> {
  await invoke('update_session_cli_id', { session_id: sessionId, cli_session_id: cliSessionId });
  setState('sessions', (s) => s.id === sessionId, 'cli_session_id', cliSessionId);
}

/** Change the model for the active session. */
export async function changeSessionModel(model: string): Promise<void> {
  const sessionId = state.activeSessionId;
  if (!sessionId) return;
  await invoke('update_session_model', { session_id: sessionId, model });
  setState('sessions', (s) => s.id === sessionId, 'model', model);
}

/** Cycle through models: Sonnet → Opus → Haiku → Sonnet. */
export function cycleModel(): void {
  const session = getActiveSession();
  if (!session) return;
  const cycle: Record<string, string> = {
    'claude-sonnet-4-6': 'claude-opus-4-6',
    'claude-opus-4-6': 'claude-haiku-4-5',
    'claude-haiku-4-5': 'claude-sonnet-4-6',
  };
  const next = cycle[session.model] ?? 'claude-sonnet-4-6';
  changeSessionModel(next);
}

/** Refresh active session data from DB (picks up accumulated cost/tokens — CHI-53). */
export async function refreshActiveSession(): Promise<void> {
  const id = state.activeSessionId;
  if (!id) return;
  await refreshSessionById(id);
}

/** Refresh a specific session's accumulated cost/token totals from DB. */
export async function refreshSessionById(sessionId: string): Promise<void> {
  try {
    const session = await invoke<Session>('get_session_cost', { session_id: sessionId });
    setState('sessions', (s) => s.id === sessionId, session);
  } catch (err) {
    log.warn('Failed to refresh session: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Toggle the pinned state of a session. */
export async function toggleSessionPinned(sessionId: string): Promise<void> {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const newPinned = !session.pinned;
  await invoke('toggle_session_pinned', { session_id: sessionId, pinned: newPinned });
  setState('sessions', (s) => s.id === sessionId, 'pinned', newPinned);
}

/** Duplicate a session's metadata (project/model/title) into a new session. */
export async function duplicateSession(sessionId: string): Promise<Session> {
  const session = await invoke<Session>('duplicate_session', { session_id: sessionId });
  setState('sessions', (prev) => [session, ...prev]);
  return session;
}

/** Fork a session from a specific message into a new session and refresh the list. */
export async function forkSession(
  sessionId: string,
  upToMessageId: string,
): Promise<string | null> {
  try {
    const session = await invoke<Session>('fork_session', {
      session_id: sessionId,
      up_to_message_id: upToMessageId,
    });
    await loadSessions();
    addToast('Session forked', 'success');
    return session.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addToast(`Fork failed: ${message}`, 'error');
    return null;
  }
}

/** Check whether a session contains any messages (used for delete confirmation). */
export async function sessionHasMessages(sessionId: string): Promise<boolean> {
  return invoke<boolean>('session_has_messages', { session_id: sessionId });
}

/** Mark a session as having user-visible activity now (send/receive/tool events). */
export function touchSessionActivity(sessionId: string): void {
  setState('sessionLastActiveAt', sessionId, Date.now());
  clearDismissed(sessionId);
}

/** Resolve last activity timestamp for resume card logic. */
export function getSessionLastActiveAt(sessionId: string): number | null {
  const direct = state.sessionLastActiveAt[sessionId];
  if (direct != null) return direct;
  const fromSession = sessionTimestampMs(state.sessions.find((s) => s.id === sessionId));
  return fromSession;
}

/** Return true when a session should show the resume card after inactivity. */
export function shouldShowResumeCard(sessionId: string, messageCount: number): boolean {
  if (messageCount === 0) return false;
  if (state.dismissedResumeSessions.has(sessionId)) return false;
  const lastActive = getSessionLastActiveAt(sessionId);
  if (lastActive == null) return false;
  return Date.now() - lastActive > getResumeThresholdMs();
}

/** Dismiss resume card for current inactivity gap. */
export function dismissResume(sessionId: string): void {
  setState('dismissedResumeSessions', (prev) => new Set([...prev, sessionId]));
}

/** Clear dismissed state once a new activity gap starts. */
export function clearDismissed(sessionId: string): void {
  setState('dismissedResumeSessions', (prev) => {
    if (!prev.has(sessionId)) return prev;
    const next = new Set(prev);
    next.delete(sessionId);
    return next;
  });
}

export { state as sessionState };
