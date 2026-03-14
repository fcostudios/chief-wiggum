// src/stores/terminalStore.ts
// Terminal session state + IPC actions (CHI-334/336/338).

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalSession {
  terminal_id: string;
  shell: string;
  cwd: string;
  status: 'running' | 'exited';
  exit_code: number | null;
  title: string | null;
  created_at: string;
}

export interface ShellInfo {
  name: string;
  path: string;
  is_default: boolean;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeTerminalId: string | null;
  availableShells: ShellInfo[];
}

const [terminalState, setTerminalState] = createStore<TerminalState>({
  sessions: [],
  activeTerminalId: null,
  availableShells: [],
});

export { terminalState };

const outputHandlers = new Map<string, Set<(data: string) => void>>();

let outputUnlisten: UnlistenFn | null = null;
let exitUnlisten: UnlistenFn | null = null;
let listenersInitialized = false;

function pickNextActiveTerminal(
  sessions: TerminalSession[],
  removedId: string | null = null,
): string | null {
  const remaining = removedId
    ? sessions.filter((session) => session.terminal_id !== removedId)
    : sessions;
  return remaining[0]?.terminal_id ?? null;
}

function upsertSession(nextSession: TerminalSession): void {
  setTerminalState('sessions', (current) => {
    const index = current.findIndex((session) => session.terminal_id === nextSession.terminal_id);
    if (index === -1) {
      return [...current, nextSession];
    }
    return current.map((session, currentIndex) =>
      currentIndex === index ? { ...session, ...nextSession } : session,
    );
  });
}

/** Register a callback for output from a specific terminal. Returns cleanup fn. */
export function onTerminalOutput(terminalId: string, callback: (data: string) => void): () => void {
  const handlers = outputHandlers.get(terminalId) ?? new Set<(data: string) => void>();
  handlers.add(callback);
  outputHandlers.set(terminalId, handlers);

  return () => {
    const existing = outputHandlers.get(terminalId);
    if (!existing) return;
    existing.delete(callback);
    if (existing.size === 0) {
      outputHandlers.delete(terminalId);
    }
  };
}

/** Start Tauri event listeners and rehydrate current backend PTY sessions. */
export async function initTerminalListeners(): Promise<void> {
  if (!listenersInitialized) {
    outputUnlisten = await listen<{ terminal_id: string; data: string }>(
      'terminal:output',
      ({ payload }) => {
        const handlers = outputHandlers.get(payload.terminal_id);
        handlers?.forEach((handler) => handler(payload.data));
      },
    );

    exitUnlisten = await listen<{ terminal_id: string; exit_code: number | null }>(
      'terminal:exit',
      ({ payload }) => {
        setTerminalState(
          'sessions',
          (session) => session.terminal_id === payload.terminal_id,
          'status',
          'exited',
        );
        setTerminalState(
          'sessions',
          (session) => session.terminal_id === payload.terminal_id,
          'exit_code',
          payload.exit_code,
        );
      },
    );

    listenersInitialized = true;
  }

  const sessions = (await invoke<TerminalSession[]>('list_terminals')) ?? [];
  setTerminalState('sessions', sessions);
  setTerminalState('activeTerminalId', (current) => current ?? pickNextActiveTerminal(sessions));
}

/** Clean up all event listeners. */
export function cleanupTerminalListeners(): void {
  outputUnlisten?.();
  exitUnlisten?.();
  outputUnlisten = null;
  exitUnlisten = null;
  listenersInitialized = false;
}

/** Spawn a new terminal session and make it active. */
export async function spawnTerminal(shell?: string, cwd?: string): Promise<TerminalSession> {
  const session = await invoke<TerminalSession>('spawn_terminal', { shell, cwd });
  upsertSession(session);
  setTerminalState('activeTerminalId', session.terminal_id);
  return session;
}

/** Kill a terminal session and remove it from frontend state. */
export async function killTerminal(terminalId: string): Promise<void> {
  const nextActiveId = pickNextActiveTerminal(terminalState.sessions, terminalId);
  await invoke<void>('kill_terminal', { terminal_id: terminalId });
  outputHandlers.delete(terminalId);
  setTerminalState('sessions', (current) =>
    current.filter((session) => session.terminal_id !== terminalId),
  );
  setTerminalState('activeTerminalId', (current) =>
    current === terminalId ? nextActiveId : current,
  );
}

/** Write keyboard input to a terminal's stdin. */
export async function writeToTerminal(terminalId: string, data: string): Promise<void> {
  await invoke<void>('terminal_write', { terminal_id: terminalId, data });
}

/** Notify backend about the current xterm geometry. */
export async function resizeTerminal(
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke<void>('terminal_resize', { terminal_id: terminalId, cols, rows });
}

/** Set active terminal tab. */
export function setActiveTerminal(terminalId: string): void {
  setTerminalState('activeTerminalId', terminalId);
}

/** Update the display title of a terminal tab (CHI-337). */
export function setSessionTitle(terminalId: string, title: string | null): void {
  setTerminalState('sessions', (session) => session.terminal_id === terminalId, 'title', title);
}

/** Reorder sessions: move `fromId` to the position currently occupied by `toId` (CHI-337). */
export function reorderSessions(fromId: string, toId: string): void {
  if (fromId === toId) return;
  setTerminalState('sessions', (sessions) => {
    const from = sessions.findIndex((session) => session.terminal_id === fromId);
    const to = sessions.findIndex((session) => session.terminal_id === toId);
    if (from === -1 || to === -1) return sessions;
    const result = [...sessions];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
  });
}

/** Update the current working directory for a session (CHI-340). */
export function updateSessionCwd(terminalId: string, cwd: string): void {
  setTerminalState('sessions', (session) => session.terminal_id === terminalId, 'cwd', cwd);
}

/** Load available system shells. */
export async function loadAvailableShells(): Promise<void> {
  const shells = await invoke<ShellInfo[]>('list_shells');
  setTerminalState('availableShells', shells);
}
