// src/stores/conversationStore.ts
// Conversation state: messages for active session, real CLI streaming.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Message, PermissionRequest } from '@/lib/types';
import { updateSessionTitle, getActiveSession } from '@/stores/sessionStore';
import { getActiveProject } from '@/stores/projectStore';
import { showPermissionDialog } from '@/stores/uiStore';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  isStreaming: boolean;
  error: string | null;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
  streamingContent: '',
  isStreaming: false,
  error: null,
});

/** Active event listener cleanup functions. */
let unlistenChunk: UnlistenFn | null = null;
let unlistenComplete: UnlistenFn | null = null;
let unlistenExited: UnlistenFn | null = null;
let unlistenPermission: UnlistenFn | null = null;

/** Load messages for a session from the database. */
export async function loadMessages(sessionId: string): Promise<void> {
  setState('messages', []);
  setState('isLoading', true);
  setState('error', null);
  try {
    const messages = await invoke<Message[]>('list_messages', { session_id: sessionId });
    setState('messages', messages);
  } finally {
    setState('isLoading', false);
  }
}

/** Set up Tauri event listeners for streaming. Call once on session activation. */
export async function setupEventListeners(sessionId: string): Promise<void> {
  // Clean up previous listeners
  await cleanupEventListeners();

  unlistenChunk = await listen<{
    session_id: string;
    content: string;
    token_count: number | null;
  }>('message:chunk', (event) => {
    if (event.payload.session_id !== sessionId) return;
    setState('streamingContent', (prev) => prev + event.payload.content);
    setState('isStreaming', true);
  });

  unlistenComplete = await listen<{
    session_id: string;
    role: string;
    content: string;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    thinking_tokens: number | null;
    cost_cents: number | null;
    // eslint-disable-next-line solid/reactivity -- event callback, snapshot read is intentional
  }>('message:complete', (event) => {
    if (event.payload.session_id !== sessionId) return;

    const p = event.payload;
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: (p.role as Message['role']) || 'assistant',
      content: p.content || state.streamingContent,
      model: p.model,
      input_tokens: p.input_tokens,
      output_tokens: p.output_tokens,
      thinking_tokens: p.thinking_tokens,
      cost_cents: p.cost_cents,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    setState('messages', (prev) => [...prev, assistantMsg]);
    setState('streamingContent', '');
    setState('isStreaming', false);
    setState('isLoading', false);

    // Persist assistant message to DB
    invoke('save_message', {
      session_id: sessionId,
      id: assistantMsg.id,
      role: assistantMsg.role,
      content: assistantMsg.content,
      model: assistantMsg.model,
      input_tokens: assistantMsg.input_tokens,
      output_tokens: assistantMsg.output_tokens,
      cost_cents: assistantMsg.cost_cents,
    }).catch((err) => devWarn('Failed to persist assistant message:', err));
  });

  unlistenExited = await listen<{
    session_id: string;
    exit_code: number | null;
  }>('cli:exited', (event) => {
    if (event.payload.session_id !== sessionId) return;
    setState('isLoading', false);
    setState('isStreaming', false);
    if (event.payload.exit_code !== 0 && event.payload.exit_code !== null) {
      setState('error', `CLI exited with code ${event.payload.exit_code}`);
    }
  });

  unlistenPermission = await listen<{
    session_id: string;
    request_id: string;
    tool: string;
    command: string;
    file_path: string | null;
    risk_level: string;
  }>('permission:request', (event) => {
    if (event.payload.session_id !== sessionId) return;
    const req: PermissionRequest = {
      request_id: event.payload.request_id,
      tool: event.payload.tool,
      command: event.payload.command,
      file_path: event.payload.file_path,
      risk_level: event.payload.risk_level as PermissionRequest['risk_level'],
    };
    showPermissionDialog(req);
  });
}

/** Clean up event listeners. */
export async function cleanupEventListeners(): Promise<void> {
  if (unlistenChunk) {
    unlistenChunk();
    unlistenChunk = null;
  }
  if (unlistenComplete) {
    unlistenComplete();
    unlistenComplete = null;
  }
  if (unlistenExited) {
    unlistenExited();
    unlistenExited = null;
  }
  if (unlistenPermission) {
    unlistenPermission();
    unlistenPermission = null;
  }
}

/** Send a user message: persist to DB, start CLI if needed, send via PTY. */
export async function sendMessage(content: string, sessionId: string): Promise<void> {
  const msgId = crypto.randomUUID();
  const userMsg: Message = {
    id: msgId,
    session_id: sessionId,
    role: 'user',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };

  // Add to local store immediately (optimistic)
  setState('messages', (prev) => [...prev, userMsg]);
  setState('isLoading', true);
  setState('error', null);

  // Persist user message to database
  invoke('save_message', {
    session_id: sessionId,
    id: msgId,
    role: 'user',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) => devWarn('Failed to persist user message:', err));

  // Auto-title session from first message
  const session = getActiveSession();
  if (session && !session.title) {
    const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
    updateSessionTitle(sessionId, title).catch((err) =>
      devWarn('Failed to update session title:', err),
    );
  }

  // Ensure CLI is started for this session
  const project = getActiveProject();
  const projectPath = project?.path ?? '.';
  const model = session?.model ?? 'claude-sonnet-4-6';

  try {
    await invoke('start_session_cli', {
      session_id: sessionId,
      project_path: projectPath,
      model,
    });

    // Set up event listeners if not already
    await setupEventListeners(sessionId);

    // Send the message to the CLI
    await invoke('send_to_cli', {
      session_id: sessionId,
      message: content,
    });
  } catch (err) {
    setState('isLoading', false);
    setState('error', `Failed to send message: ${err}`);
    devWarn('Failed to send message:', err);
  }
}

/** Clear all messages (e.g., on session change). */
export function clearMessages(): void {
  setState('messages', []);
  setState('isLoading', false);
  setState('streamingContent', '');
  setState('isStreaming', false);
  setState('error', null);
}

/** Dev-only warning logger. */
function devWarn(msg: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[conversationStore] ${msg}`, err);
  }
}

export { state as conversationState };
