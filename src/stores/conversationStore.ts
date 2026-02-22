// src/stores/conversationStore.ts
// Conversation state: messages for active session, real CLI streaming.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Message, PermissionRequest, ProcessStatus } from '@/lib/types';
import { updateSessionTitle, updateSessionCliId, getActiveSession } from '@/stores/sessionStore';
import { getActiveProject } from '@/stores/projectStore';
import { showPermissionDialog } from '@/stores/uiStore';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  thinkingContent: string;
  isStreaming: boolean;
  error: string | null;
  processStatus: ProcessStatus;
  lastUserMessage: string | null;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
  streamingContent: '',
  thinkingContent: '',
  isStreaming: false,
  error: null,
  processStatus: 'not_started',
  lastUserMessage: null,
});

/** Active event listener cleanup functions. */
let unlistenChunk: UnlistenFn | null = null;
let unlistenComplete: UnlistenFn | null = null;
let unlistenExited: UnlistenFn | null = null;
let unlistenPermission: UnlistenFn | null = null;
let unlistenInit: UnlistenFn | null = null;
let unlistenToolUse: UnlistenFn | null = null;
let unlistenToolResult: UnlistenFn | null = null;
let unlistenThinking: UnlistenFn | null = null;

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
    // eslint-disable-next-line solid/reactivity -- event callback, snapshot read is intentional
  }>('message:chunk', (event) => {
    if (event.payload.session_id !== sessionId) return;
    setState('streamingContent', (prev) => prev + event.payload.content);
    setState('isStreaming', true);
    if (state.processStatus !== 'running') {
      setState('processStatus', 'running');
    }
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
    is_error: boolean;
    // eslint-disable-next-line solid/reactivity -- event callback, snapshot read is intentional
  }>('message:complete', (event) => {
    if (event.payload.session_id !== sessionId) return;

    const p = event.payload;

    // Persist thinking content as a separate message (before the assistant message)
    const thinkingText = state.thinkingContent;
    if (thinkingText) {
      const thinkingId = crypto.randomUUID();
      const thinkingMsg: Message = {
        id: thinkingId,
        session_id: sessionId,
        role: 'thinking',
        content: thinkingText,
        model: null,
        input_tokens: null,
        output_tokens: null,
        thinking_tokens: null,
        cost_cents: null,
        is_compacted: false,
        created_at: new Date().toISOString(),
      };
      setState('messages', (prev) => [...prev, thinkingMsg]);
      invoke('save_message', {
        session_id: sessionId,
        id: thinkingId,
        role: 'thinking',
        content: thinkingText,
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }).catch((err) => console.error('[conversationStore] Failed to persist thinking:', err));
    }

    const finalContent = p.content || state.streamingContent;

    // Handle error results from the CLI (e.g., stale --resume session, auth failures).
    // Don't create an assistant message — surface the error to the user.
    if (p.is_error) {
      setState('streamingContent', '');
      setState('thinkingContent', '');
      setState('isStreaming', false);
      setState('isLoading', false);
      setState('error', finalContent || 'CLI returned an error — check logs for details');
      // Clear stale CLI session ID so next attempt doesn't use --resume with a dead ID
      updateSessionCliId(sessionId, '').catch((err) =>
        console.error('[conversationStore] Failed to clear stale cli_session_id:', err),
      );
      return;
    }

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: (p.role as Message['role']) || 'assistant',
      content: finalContent,
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
    setState('thinkingContent', '');
    setState('isStreaming', false);
    setState('isLoading', false);

    // Persist assistant message to DB.
    // cost_cents arrives as f64 from the backend (usd * 100.0) but the DB column
    // and save_message IPC expect i64. Round to avoid serde deserialization failure.
    invoke('save_message', {
      session_id: sessionId,
      id: assistantMsg.id,
      role: assistantMsg.role,
      content: assistantMsg.content,
      model: assistantMsg.model,
      input_tokens: assistantMsg.input_tokens,
      output_tokens: assistantMsg.output_tokens,
      cost_cents: assistantMsg.cost_cents != null ? Math.round(assistantMsg.cost_cents) : null,
    }).catch((err) => {
      // Log at error level always — silent save failures cause missing messages on restore
      console.error('[conversationStore] Failed to persist assistant message:', err);
    });
  });

  unlistenExited = await listen<{
    session_id: string;
    exit_code: number | null;
    // eslint-disable-next-line solid/reactivity -- event callback, snapshot read is intentional
  }>('cli:exited', (event) => {
    if (event.payload.session_id !== sessionId) return;

    // Safety net: if CLI exited cleanly but message:complete never fired,
    // save any accumulated streaming content as the assistant response.
    const accumulated = state.streamingContent;
    if (accumulated && state.isStreaming) {
      const msgId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: msgId,
        session_id: sessionId,
        role: 'assistant',
        content: accumulated,
        model: null,
        input_tokens: null,
        output_tokens: null,
        thinking_tokens: null,
        cost_cents: null,
        is_compacted: false,
        created_at: new Date().toISOString(),
      };
      setState('messages', (prev) => [...prev, assistantMsg]);
      setState('streamingContent', '');
      setState('thinkingContent', '');
      setState('isStreaming', false);

      invoke('save_message', {
        session_id: sessionId,
        id: msgId,
        role: 'assistant',
        content: accumulated,
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }).catch((err) =>
        console.error('[conversationStore] Failed to persist fallback assistant message:', err),
      );
    }

    setState('isLoading', false);
    setState('isStreaming', false);
    setState('processStatus', 'exited');
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

  unlistenInit = await listen<{
    session_id: string;
    cli_session_id: string;
    model: string;
  }>('cli:init', (event) => {
    if (event.payload.session_id !== sessionId) return;
    updateSessionCliId(sessionId, event.payload.cli_session_id).catch((err) =>
      devWarn('Failed to update CLI session ID:', err),
    );
  });

  unlistenToolUse = await listen<{
    session_id: string;
    tool_use_id: string;
    tool_name: string;
    tool_input: string;
  }>('tool:use', (event) => {
    if (event.payload.session_id !== sessionId) return;
    const { tool_use_id, tool_name, tool_input } = event.payload;
    const msgId = crypto.randomUUID();
    const content = JSON.stringify({ tool_name, tool_input, tool_use_id });
    const msg: Message = {
      id: msgId,
      session_id: sessionId,
      role: 'tool_use',
      content,
      model: null,
      input_tokens: null,
      output_tokens: null,
      thinking_tokens: null,
      cost_cents: null,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };
    setState('messages', (prev) => [...prev, msg]);
    invoke('save_message', {
      session_id: sessionId,
      id: msgId,
      role: 'tool_use',
      content,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cost_cents: null,
    }).catch((err) => console.error('[conversationStore] Failed to persist tool_use:', err));
  });

  unlistenToolResult = await listen<{
    session_id: string;
    tool_use_id: string;
    content: string;
    is_error: boolean;
  }>('tool:result', (event) => {
    if (event.payload.session_id !== sessionId) return;
    const { tool_use_id, content: resultContent, is_error } = event.payload;
    const msgId = crypto.randomUUID();
    const content = JSON.stringify({ tool_use_id, content: resultContent, is_error });
    const msg: Message = {
      id: msgId,
      session_id: sessionId,
      role: 'tool_result',
      content,
      model: null,
      input_tokens: null,
      output_tokens: null,
      thinking_tokens: null,
      cost_cents: null,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };
    setState('messages', (prev) => [...prev, msg]);
    invoke('save_message', {
      session_id: sessionId,
      id: msgId,
      role: 'tool_result',
      content,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cost_cents: null,
    }).catch((err) => console.error('[conversationStore] Failed to persist tool_result:', err));
  });

  unlistenThinking = await listen<{
    session_id: string;
    content: string;
    is_streaming: boolean;
  }>('message:thinking', (event) => {
    if (event.payload.session_id !== sessionId) return;
    setState('thinkingContent', (prev) => prev + event.payload.content);
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
  if (unlistenInit) {
    unlistenInit();
    unlistenInit = null;
  }
  if (unlistenToolUse) {
    unlistenToolUse();
    unlistenToolUse = null;
  }
  if (unlistenToolResult) {
    unlistenToolResult();
    unlistenToolResult = null;
  }
  if (unlistenThinking) {
    unlistenThinking();
    unlistenThinking = null;
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
  setState('lastUserMessage', content);

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

  // Spawn CLI process with `-p "prompt"` for each message.
  // Follow-up messages use `--continue` to resume the conversation.
  const project = getActiveProject();
  const projectPath = project?.path ?? '.';
  const model = session?.model ?? 'claude-sonnet-4-6';
  // Only mark as follow-up if there are prior assistant messages (successful responses).
  // Failed CLI attempts leave user-only messages which shouldn't trigger --continue.
  const isFollowUp = state.messages.some((m) => m.role === 'assistant');

  try {
    // Set up event listeners FIRST to avoid missing fast CLI responses.
    // The old bridge's cli:exited may fire during setup — we re-assert loading after.
    await setupEventListeners(sessionId);
    setState('isLoading', true);
    setState('error', null);

    // Now spawn CLI process — all events will be caught by the listeners above
    await invoke('send_to_cli', {
      session_id: sessionId,
      project_path: projectPath,
      model,
      message: content,
      is_follow_up: isFollowUp,
      cli_session_id: session?.cli_session_id || null,
    });
    setState('processStatus', 'running');
  } catch (err) {
    setState('isLoading', false);
    setState('error', `Failed to send message: ${err}`);
    setState('processStatus', 'error');
    devWarn('Failed to send message:', err);
  }
}

/** Clear all messages (e.g., on session change). */
export function clearMessages(): void {
  setState('messages', []);
  setState('isLoading', false);
  setState('streamingContent', '');
  setState('thinkingContent', '');
  setState('isStreaming', false);
  setState('error', null);
  setState('processStatus', 'not_started');
  setState('lastUserMessage', null);
}

/** Switch to a different session: stop CLI, clean up, load new messages. */
export async function switchSession(
  newSessionId: string,
  oldSessionId: string | null,
): Promise<void> {
  // Stop any running CLI process for the outgoing session
  if (oldSessionId) {
    try {
      await invoke('stop_session_cli', { session_id: oldSessionId });
    } catch {
      // Process may already be stopped — that's fine
    }
  }

  // Clean up event listeners from the previous session
  await cleanupEventListeners();

  // Reset streaming/loading state
  clearMessages();

  // Load persisted messages for the new session
  await loadMessages(newSessionId);

  // Set up event listeners for the new session (catches any in-flight CLI events)
  await setupEventListeners(newSessionId);
}

/** Stop the CLI process for a session (if running). */
export async function stopSessionCli(sessionId: string): Promise<void> {
  try {
    await invoke('stop_session_cli', { session_id: sessionId });
  } catch {
    // Process may not be running — that's fine
  }
}

/** Retry the last failed message. */
export async function retryLastMessage(sessionId: string): Promise<void> {
  const lastMsg = state.lastUserMessage;
  if (!lastMsg) return;

  // Clear the error state
  setState('error', null);
  setState('processStatus', 'not_started');

  // Remove the last user message from the display (it will be re-added by sendMessage)
  const messages = state.messages;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx !== -1) {
    setState('messages', (prev) => [...prev.slice(0, lastUserIdx)]);
  }

  await sendMessage(lastMsg, sessionId);
}

/** Dev-only warning logger. */
function devWarn(msg: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[conversationStore] ${msg}`, err);
  }
}

export { state as conversationState };
