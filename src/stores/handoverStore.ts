import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createStore, reconcile } from 'solid-js/store';
import type { HandoverEntry } from '@/lib/types';
import { appendRemoteMessage, loadMessages } from '@/stores/conversationStore';
import { refreshSessionById, sessionState } from '@/stores/sessionStore';
import { addToast } from '@/stores/toastStore';

interface HandoverStatePayload {
  session_id: string;
  relay_url: string;
  started_at: string;
}

interface RemoteMessagePayload {
  session_id: string;
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  thinking_tokens: number | null;
  stop_reason: string | null;
  is_error: boolean;
  parent_uuid: string | null;
  timestamp: string;
}

interface ReconcilePayload {
  session_id: string;
  imported: number;
  skipped: number;
  last_uuid: string | null;
}

interface HandoverStoreState {
  active: Record<string, HandoverEntry>;
  panelSessionId: string | null;
}

const [handoverState, setHandoverState] = createStore<HandoverStoreState>({
  active: {},
  panelSessionId: null,
});

let listenersInitialized = false;
let listenerCleanup: UnlistenFn[] = [];

export { handoverState };

export function isHandedOver(sessionId: string): boolean {
  return sessionId in handoverState.active;
}

export function getHandoverEntry(sessionId: string): HandoverEntry | undefined {
  return handoverState.active[sessionId];
}

export function closeHandoverPanel(): void {
  setHandoverState('panelSessionId', null);
}

function upsertEntry(sessionId: string, payload: HandoverStatePayload): HandoverEntry {
  const existing = handoverState.active[sessionId];
  const entry: HandoverEntry = {
    sessionId,
    relayUrl: payload.relay_url,
    startedAt: payload.started_at,
    remoteMessageCount: existing?.remoteMessageCount ?? 0,
  };
  setHandoverState('active', sessionId, entry);
  return entry;
}

function removeEntry(sessionId: string): void {
  const next = {
    ...handoverState.active,
  };
  delete next[sessionId];
  setHandoverState('active', reconcile(next, { merge: false }));
  if (handoverState.panelSessionId === sessionId) {
    setHandoverState('panelSessionId', null);
  }
}

export async function startHandover(sessionId: string): Promise<HandoverEntry> {
  const payload = await invoke<HandoverStatePayload>('start_handover', {
    session_id: sessionId,
  });
  return upsertEntry(sessionId, payload);
}

export async function openHandoverPanel(sessionId: string): Promise<void> {
  try {
    await startHandover(sessionId);
    setHandoverState('panelSessionId', sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addToast(`Failed to hand over session: ${message}`, 'error', undefined, message);
    throw error;
  }
}

export async function reclaimSession(sessionId: string): Promise<void> {
  try {
    await invoke<ReconcilePayload>('stop_handover', { session_id: sessionId });
    removeEntry(sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addToast(`Failed to reclaim session: ${message}`, 'error', undefined, message);
    throw error;
  }
}

export async function initHandoverListeners(): Promise<void> {
  if (listenersInitialized) return;
  listenersInitialized = true;

  listenerCleanup.push(
    // eslint-disable-next-line solid/reactivity -- Tauri event callback reads singleton store state intentionally
    await listen<RemoteMessagePayload>('session:remote-message', ({ payload }) => {
      if (!isHandedOver(payload.session_id)) return;

      setHandoverState(
        'active',
        payload.session_id,
        'remoteMessageCount',
        (count) => (count ?? 0) + 1,
      );
      appendRemoteMessage(payload.session_id, {
        uuid: payload.uuid,
        role: payload.role,
        content: payload.content,
        timestamp: payload.timestamp,
      });
    }),
  );

  listenerCleanup.push(
    // eslint-disable-next-line solid/reactivity -- Tauri event callback reads active session snapshot intentionally
    await listen<ReconcilePayload>('session:reconciled', ({ payload }) => {
      removeEntry(payload.session_id);
      void refreshSessionById(payload.session_id);
      if (sessionState.activeSessionId === payload.session_id) {
        void loadMessages(payload.session_id);
      }
    }),
  );
}

export function cleanupHandoverListeners(): void {
  for (const cleanup of listenerCleanup) {
    cleanup();
  }
  listenerCleanup = [];
  listenersInitialized = false;
}
