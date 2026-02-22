// src/stores/sessionStore.ts
// Session state: session list, active session, CRUD operations.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Session } from '@/lib/types';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
}

const [state, setState] = createStore<SessionState>({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
});

/** Load all sessions from the database. Called on app start. */
export async function loadSessions(): Promise<void> {
  setState('isLoading', true);
  try {
    const sessions = await invoke<Session[]>('list_all_sessions');
    setState('sessions', sessions);
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
  return session;
}

/** Switch to an existing session. Does NOT load messages — caller must do that. */
export function setActiveSession(sessionId: string): void {
  setState('activeSessionId', sessionId);
}

/** Delete a session and switch to the next one. */
export async function deleteSession(sessionId: string): Promise<void> {
  await invoke('delete_session', { session_id: sessionId });
  setState('sessions', (prev) => prev.filter((s) => s.id !== sessionId));
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
export async function updateSessionCliId(
  sessionId: string,
  cliSessionId: string,
): Promise<void> {
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
  try {
    const session = await invoke<Session>('get_session_cost', { session_id: id });
    setState('sessions', (s) => s.id === id, session);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[sessionStore] Failed to refresh session:', err);
  }
}

export { state as sessionState };
