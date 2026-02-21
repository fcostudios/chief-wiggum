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
export async function createNewSession(model: string): Promise<Session> {
  const session = await invoke<Session>('create_session', { model });
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

export { state as sessionState };
