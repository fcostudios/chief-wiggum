// src/stores/conversationStore.ts
// Conversation state: messages for active session, real CLI streaming.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createTypewriterBuffer } from '@/lib/typewriterBuffer';
import type {
  Message,
  PermissionRequest,
  ProcessStatus,
  ActiveBridgeInfo,
  BufferedEvent,
  CliLocation,
} from '@/lib/types';
import {
  updateSessionTitle,
  updateSessionCliId,
  getActiveSession,
  refreshActiveSession,
} from '@/stores/sessionStore';
import { getActiveProject } from '@/stores/projectStore';
import { showPermissionDialog } from '@/stores/uiStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/conversation');

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
  thinkingContent: string;
  isStreaming: boolean;
  error: string | null;
  processStatus: ProcessStatus;
  sessionStatuses: Record<string, ProcessStatus>;
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
  sessionStatuses: {},
  lastUserMessage: null,
});

/** Typewriter buffer for smooth streaming rendering (CHI-73). */
const typewriter = createTypewriterBuffer();

/** Per-session event listener cleanup functions. */
const sessionListeners = new Map<string, UnlistenFn[]>();

/** Get status for a specific session. */
export function getSessionStatus(sessionId: string): ProcessStatus {
  return state.sessionStatuses[sessionId] ?? 'not_started';
}

/** Update status for a specific session, also update global if it's the active session. */
export function setSessionStatus(sessionId: string, status: ProcessStatus): void {
  setState('sessionStatuses', sessionId, status);
  // Keep global processStatus in sync for backward compat (StatusBar, TitleBar)
  const activeId = getActiveSession()?.id;
  if (sessionId === activeId) {
    setState('processStatus', status);
  }
}

/** Map backend bridge liveness status to UI execution status (SDK bridges stay alive when idle). */
function bridgeToUiStatus(bridge: ActiveBridgeInfo): ProcessStatus {
  if (bridge.process_status === 'running') {
    // In SDK mode, "running" often means the persistent bridge is alive, not that a turn is active.
    return bridge.has_buffered_events ? 'running' : 'not_started';
  }
  if (bridge.process_status === 'starting') {
    return bridge.has_buffered_events ? 'starting' : 'not_started';
  }
  return bridge.process_status as ProcessStatus;
}

/** Known recoverable CLI resume failure: persisted cli_session_id no longer exists. */
function isStaleCliResumeError(message: string | null | undefined): boolean {
  return (message ?? '').includes('No conversation found with session ID');
}

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
  // Clean up listeners for THIS session only (if any exist)
  await cleanupSessionListeners(sessionId);

  const listeners: UnlistenFn[] = [];

  listeners.push(
    await listen<{
      session_id: string;
      content: string;
      token_count: number | null;
    }>('message:chunk', (event) => {
      if (event.payload.session_id !== sessionId) return;
      // Always update per-session status
      setSessionStatus(sessionId, 'running');
      // Only update UI state if this is the active session

      const activeId = getActiveSession()?.id;
      if (sessionId === activeId) {
        setState('streamingContent', (prev) => prev + event.payload.content);
        typewriter.push(event.payload.content);
        setState('isStreaming', true);
      }
    }),
  );

  listeners.push(
    await listen<{
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

      const activeId = getActiveSession()?.id;
      const isActive = sessionId === activeId;

      if (isActive) {
        // Flush any remaining typewriter buffer so rendered() matches streamingContent
        typewriter.flush();
      }

      // Persist thinking content as a separate message (before the assistant message)
      const thinkingText = isActive ? state.thinkingContent : '';
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
        }).catch((err) =>
          log.error(
            'Failed to persist thinking: ' + (err instanceof Error ? err.message : String(err)),
          ),
        );
      }

      const finalContent = isActive ? p.content || state.streamingContent : p.content || '';

      // Handle error results from the CLI (e.g., stale --resume session, auth failures).
      // Don't create an assistant message -- surface the error to the user.
      if (p.is_error) {
        const staleResume = isStaleCliResumeError(finalContent);
        setSessionStatus(sessionId, 'error');
        if (isActive) {
          setState('streamingContent', '');
          setState('thinkingContent', '');
          setState('isStreaming', false);
          setState('isLoading', false);
          typewriter.reset();
          setState(
            'error',
            staleResume
              ? 'Saved Claude conversation context expired. Retry to continue with a fresh CLI session.'
              : finalContent || 'CLI returned an error -- check logs for details',
          );
        }
        // Clear stale CLI session ID so next attempt doesn't use --resume with a dead ID.
        updateSessionCliId(sessionId, '').catch((err) =>
          log.error(
            'Failed to clear stale cli_session_id: ' +
              (err instanceof Error ? err.message : String(err)),
          ),
        );
        // In SDK mode an invalid `--resume` can leave a persistent bridge alive but unusable for
        // this turn. Remove it so Retry starts a fresh SDK bridge cleanly.
        if (staleResume) {
          stopSessionCli(sessionId).catch((err) =>
            log.warn(
              'Failed to stop stale CLI bridge after resume error: ' +
                (err instanceof Error ? err.message : String(err)),
            ),
          );
        }
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

      if (isActive) {
        setState('messages', (prev) => [...prev, assistantMsg]);
        setState('streamingContent', '');
        setState('thinkingContent', '');
        setState('isStreaming', false);
        setState('isLoading', false);
        typewriter.reset();
      }

      // CHI-101 SDK sessions are persistent; mark the turn as complete in the UI even though
      // the underlying bridge process remains alive for follow-up messages.
      setSessionStatus(sessionId, 'exited');

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
        // Log at error level always -- silent save failures cause missing messages on restore
        log.error(
          'Failed to persist assistant message: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      });

      // Refresh session cost totals after persisting (CHI-53)
      refreshActiveSession().catch((err) =>
        log.error(
          'Failed to refresh session cost: ' + (err instanceof Error ? err.message : String(err)),
        ),
      );
    }),
  );

  listeners.push(
    await listen<{
      session_id: string;
      exit_code: number | null;
      // eslint-disable-next-line solid/reactivity -- event callback, snapshot read is intentional
    }>('cli:exited', (event) => {
      if (event.payload.session_id !== sessionId) return;

      setSessionStatus(sessionId, 'exited');

      const activeId = getActiveSession()?.id;
      const isActive = sessionId === activeId;

      if (isActive) {
        // Flush any remaining typewriter buffer before checking accumulated content
        typewriter.flush();

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
          typewriter.reset();

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
            log.error(
              'Failed to persist fallback assistant message: ' +
                (err instanceof Error ? err.message : String(err)),
            ),
          );
        }

        setState('isLoading', false);
        setState('isStreaming', false);
      }

      if (event.payload.exit_code !== 0 && event.payload.exit_code !== null && isActive) {
        setState('error', `CLI exited with code ${event.payload.exit_code}`);
      }
    }),
  );

  listeners.push(
    await listen<{
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
    }),
  );

  listeners.push(
    await listen<{
      session_id: string;
      cli_session_id: string;
      model: string;
    }>('cli:init', (event) => {
      if (event.payload.session_id !== sessionId) return;
      // `cli:init` means the bridge is alive; in SDK mode it remains alive between turns.
      // Avoid marking the UI as "Running" based solely on bridge liveness.
      updateSessionCliId(sessionId, event.payload.cli_session_id).catch((err) =>
        log.warn(
          'Failed to update CLI session ID: ' + (err instanceof Error ? err.message : String(err)),
        ),
      );
    }),
  );

  listeners.push(
    await listen<{
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

      const activeId = getActiveSession()?.id;
      if (sessionId === activeId) {
        setState('messages', (prev) => [...prev, msg]);
      }
      invoke('save_message', {
        session_id: sessionId,
        id: msgId,
        role: 'tool_use',
        content,
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }).catch((err) =>
        log.error(
          'Failed to persist tool_use: ' + (err instanceof Error ? err.message : String(err)),
        ),
      );
    }),
  );

  listeners.push(
    await listen<{
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

      const activeId = getActiveSession()?.id;
      if (sessionId === activeId) {
        setState('messages', (prev) => [...prev, msg]);
      }
      invoke('save_message', {
        session_id: sessionId,
        id: msgId,
        role: 'tool_result',
        content,
        model: null,
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      }).catch((err) =>
        log.error(
          'Failed to persist tool_result: ' + (err instanceof Error ? err.message : String(err)),
        ),
      );
    }),
  );

  listeners.push(
    await listen<{
      session_id: string;
      content: string;
      is_streaming: boolean;
    }>('message:thinking', (event) => {
      if (event.payload.session_id !== sessionId) return;

      const activeId = getActiveSession()?.id;
      if (sessionId === activeId) {
        setState('thinkingContent', (prev) => prev + event.payload.content);
      }
    }),
  );

  sessionListeners.set(sessionId, listeners);
}

/** Clean up event listeners for a specific session. */
export async function cleanupSessionListeners(sessionId: string): Promise<void> {
  const listeners = sessionListeners.get(sessionId);
  if (listeners) {
    for (const unlisten of listeners) unlisten();
    sessionListeners.delete(sessionId);
  }
}

/** Clean up ALL event listeners (app shutdown). */
export async function cleanupAllListeners(): Promise<void> {
  for (const [sid] of sessionListeners) {
    await cleanupSessionListeners(sid);
  }
}

/** Backward compat alias -- used by older call sites. */
export const cleanupEventListeners = cleanupAllListeners;

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
  }).catch((err) =>
    log.warn(
      'Failed to persist user message: ' + (err instanceof Error ? err.message : String(err)),
    ),
  );

  // Auto-title session from first message
  const session = getActiveSession();
  if (session && !session.title) {
    const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
    updateSessionTitle(sessionId, title).catch((err) =>
      log.warn(
        'Failed to update session title: ' + (err instanceof Error ? err.message : String(err)),
      ),
    );
  }

  await dispatchMessageToCli(content, sessionId);
}

/** Send an already-persisted user message to the CLI without creating a duplicate DB/UI entry. */
async function resendExistingUserMessage(content: string, sessionId: string): Promise<void> {
  setState('streamingContent', '');
  setState('thinkingContent', '');
  setState('isStreaming', false);
  setState('isLoading', true);
  setState('error', null);
  setState('lastUserMessage', content);
  typewriter.reset();
  await dispatchMessageToCli(content, sessionId);
}

/** Shared CLI dispatch for a user turn (used by send, edit-resend, regenerate). */
async function dispatchMessageToCli(content: string, sessionId: string): Promise<void> {
  // Spawn CLI process with `-p "prompt"` for each message.
  // Follow-up messages use `--continue` to resume the conversation.
  const session = getActiveSession();
  const project = getActiveProject();
  const projectPath = project?.path ?? '.';
  const model = session?.model ?? 'claude-sonnet-4-6';
  // Only mark as follow-up if there are prior assistant messages (successful responses).
  // Failed CLI attempts leave user-only messages which shouldn't trigger --continue.
  const isFollowUp = state.messages.some((m) => m.role === 'assistant');
  const sdkSupported = await checkSdkSupport();

  try {
    // Set up event listeners FIRST to avoid missing fast CLI responses.
    // The old bridge's cli:exited may fire during setup -- we re-assert loading after.
    await setupEventListeners(sessionId);
    setState('isLoading', true);
    setState('error', null);

    if (sdkSupported) {
      const hasActiveBridge = await checkHasActiveBridge(sessionId);

      if (!hasActiveBridge) {
        await invoke('start_session_cli', {
          session_id: sessionId,
          project_path: projectPath,
          model,
          cli_session_id: session?.cli_session_id || null,
        });
      }

      await invoke('send_to_cli', {
        session_id: sessionId,
        project_path: projectPath,
        model,
        message: content,
        is_follow_up: hasActiveBridge,
        cli_session_id: session?.cli_session_id || null,
      });
    } else {
      // Legacy fallback (-p mode): spawn per message
      await invoke('send_to_cli', {
        session_id: sessionId,
        project_path: projectPath,
        model,
        message: content,
        is_follow_up: isFollowUp,
        cli_session_id: session?.cli_session_id || null,
      });
    }
    setSessionStatus(sessionId, 'running');
  } catch (err) {
    setState('isLoading', false);
    const errStr = String(err);
    // Friendly message for session limit (CHI-111)
    if (errStr.includes('Resource limit')) {
      setState('error', 'Maximum concurrent sessions reached. Stop another session first.');
    } else {
      setState('error', `Failed to send message: ${errStr}`);
    }
    setSessionStatus(sessionId, 'error');
    log.warn('Failed to send message: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Edit a user message, truncate the conversation tail, and resend from the edited prompt. */
export async function editMessage(
  messageId: string,
  newContent: string,
  sessionId: string,
): Promise<void> {
  const trimmed = newContent.trim();
  if (!trimmed) return;

  const original = state.messages.find((m) => m.id === messageId && m.session_id === sessionId);
  if (!original || original.role !== 'user') return;
  if (trimmed === original.content) return;

  try {
    await invoke('update_message_content', { message_id: messageId, new_content: trimmed });
    await invoke<number>('delete_messages_after', {
      session_id: sessionId,
      after_message_id: messageId,
    });
    await loadMessages(sessionId);
    await resendExistingUserMessage(trimmed, sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState('error', `Failed to edit message: ${message}`);
    log.error('Failed to edit message: ' + message);
  }
}

/** Regenerate an assistant response by deleting the tail after the preceding user message. */
export async function regenerateResponse(
  assistantMessageId: string,
  sessionId: string,
): Promise<void> {
  const msgIndex = state.messages.findIndex(
    (m) => m.id === assistantMessageId && m.session_id === sessionId,
  );
  if (msgIndex < 0 || state.messages[msgIndex]?.role !== 'assistant') return;

  let userMessage: Message | null = null;
  for (let i = msgIndex - 1; i >= 0; i--) {
    const candidate = state.messages[i];
    if (candidate.session_id !== sessionId) continue;
    if (candidate.role === 'user') {
      userMessage = candidate;
      break;
    }
  }
  if (!userMessage) return;

  try {
    await invoke<number>('delete_messages_after', {
      session_id: sessionId,
      after_message_id: userMessage.id,
    });
    await loadMessages(sessionId);
    await resendExistingUserMessage(userMessage.content, sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState('error', `Failed to regenerate response: ${message}`);
    log.error('Failed to regenerate response: ' + message);
  }
}

/** Check if a session has an active CLI bridge in the backend. */
async function checkHasActiveBridge(sessionId: string): Promise<boolean> {
  try {
    const bridges = await invoke<ActiveBridgeInfo[]>('list_active_bridges');
    return bridges.some(
      (b) =>
        b.session_id === sessionId &&
        (b.process_status === 'running' || b.process_status === 'starting'),
    );
  } catch {
    return false;
  }
}

/** Check if the backend CLI supports the Agent SDK protocol. */
async function checkSdkSupport(): Promise<boolean> {
  try {
    const cliInfo = await invoke<CliLocation>('get_cli_info');
    return cliInfo.supports_sdk ?? false;
  } catch {
    return false;
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
  // Don't clear sessionStatuses -- other sessions may still be running
  setState('lastUserMessage', null);
  typewriter.reset();
}

/** Switch to a different session: preserve old CLI, load new messages. */
export async function switchSession(
  newSessionId: string,
  _oldSessionId: string | null,
): Promise<void> {
  // DO NOT stop the old CLI process -- it continues running in background

  // Clear UI-only state (streaming content, thinking, etc.)
  setState('streamingContent', '');
  setState('thinkingContent', '');
  setState('isStreaming', false);
  setState('isLoading', false);
  setState('error', null);
  setState('lastUserMessage', null);
  typewriter.reset();

  // Sync global processStatus from the new session's per-session status
  const newStatus = getSessionStatus(newSessionId);
  setState('processStatus', newStatus);

  // Load persisted messages for the new session
  await loadMessages(newSessionId);

  // Set up event listeners for the new session
  await setupEventListeners(newSessionId);

  // If new session has an active bridge, drain buffered events
  const isRunning = newStatus === 'running' || newStatus === 'starting';
  if (isRunning) {
    setState('isLoading', true);
    try {
      const buffered = await invoke<BufferedEvent[]>('drain_session_buffer', {
        session_id: newSessionId,
      });
      for (const event of buffered) {
        replayBufferedEvent(event, newSessionId);
      }
    } catch {
      // May not have buffer support or buffer may be empty
    }
  }
}

/** Stop the CLI process for a session (if running). */
export async function stopSessionCli(sessionId: string): Promise<void> {
  try {
    await invoke('stop_session_cli', { session_id: sessionId });
  } catch {
    // Process may not be running -- that's fine
  }
}

/** Interrupt the current CLI execution via the SDK control protocol. */
export async function interruptSession(sessionId: string): Promise<void> {
  try {
    await invoke('interrupt_session', { session_id: sessionId });
  } catch (err) {
    log.warn('Failed to interrupt session: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Change the model mid-session via the SDK control protocol. */
export async function setSessionModel(sessionId: string, model: string): Promise<void> {
  try {
    await invoke('set_session_model', { session_id: sessionId, model });
  } catch (err) {
    log.warn('Failed to set session model: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Retry the last failed message. */
export async function retryLastMessage(sessionId: string): Promise<void> {
  const lastMsg = state.lastUserMessage;
  if (!lastMsg) return;

  // Clear the error state
  setState('error', null);
  setSessionStatus(sessionId, 'not_started');

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

/** Record a permission outcome as an inline message. */
export function recordPermissionOutcome(
  sessionId: string,
  tool: string,
  command: string,
  outcome: 'allowed' | 'denied' | 'yolo',
  riskLevel: string,
): void {
  const msgId = crypto.randomUUID();
  const content = JSON.stringify({ tool, command, outcome, risk_level: riskLevel });
  const msg: Message = {
    id: msgId,
    session_id: sessionId,
    role: 'permission',
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
    role: 'permission',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) =>
    log.error(
      'Failed to persist permission record: ' + (err instanceof Error ? err.message : String(err)),
    ),
  );
}

/** Reconnect to active CLI bridges after frontend reload (HMR resilience). */
export async function reconnectAfterReload(activeSessionId: string | null): Promise<void> {
  let activeBridges: ActiveBridgeInfo[];
  try {
    activeBridges = await invoke<ActiveBridgeInfo[]>('list_active_bridges');
  } catch {
    return; // Backend may not support this yet
  }

  if (activeBridges.length === 0) return;

  // Update per-session statuses for all active bridges
  for (const bridge of activeBridges) {
    setSessionStatus(bridge.session_id, bridgeToUiStatus(bridge));
  }

  // For the active session, set up listeners and replay buffer
  if (activeSessionId) {
    const activeBridge = activeBridges.find((b) => b.session_id === activeSessionId);
    if (activeBridge) {
      // Set up listeners FIRST (catches live events during drain)
      await setupEventListeners(activeSessionId);

      // Drain and replay buffered events
      if (activeBridge.has_buffered_events) {
        try {
          const buffered = await invoke<BufferedEvent[]>('drain_session_buffer', {
            session_id: activeSessionId,
          });
          for (const event of buffered) {
            replayBufferedEvent(event, activeSessionId);
          }
        } catch (err) {
          log.error(
            'Failed to drain buffer: ' + (err instanceof Error ? err.message : String(err)),
          );
        }
      }

      // Restore UI streaming state only when buffered events suggest work was in progress.
      if (activeBridge.has_buffered_events) {
        setState('isLoading', true);
      }
    }
  }
}

/** Replay a single buffered event (same logic as event listeners, minus re-emission). */
function replayBufferedEvent(event: BufferedEvent, sessionId: string): void {
  switch (event.type) {
    case 'Chunk':
      setState('streamingContent', (prev) => prev + (event.content ?? ''));
      typewriter.push(event.content ?? '');
      setState('isStreaming', true);
      break;

    case 'MessageComplete': {
      typewriter.flush();
      const finalContent = event.content || state.streamingContent;
      if (event.is_error) {
        setState('streamingContent', '');
        setState('thinkingContent', '');
        setState('isStreaming', false);
        setState('isLoading', false);
        typewriter.reset();
        setState('error', finalContent || 'CLI returned an error');
        setSessionStatus(sessionId, 'error');
        return;
      }
      // Check if this message was already persisted (loaded from DB)
      const isDuplicate = state.messages.some(
        (m) => m.role === 'assistant' && m.content === finalContent,
      );
      if (!isDuplicate) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          role: (event.role as Message['role']) || 'assistant',
          content: finalContent,
          model: event.model ?? null,
          input_tokens: event.input_tokens ?? null,
          output_tokens: event.output_tokens ?? null,
          thinking_tokens: event.thinking_tokens ?? null,
          cost_cents: event.cost_cents ?? null,
          is_compacted: false,
          created_at: new Date().toISOString(),
        };
        setState('messages', (prev) => [...prev, assistantMsg]);
        // Persist since this came from the buffer (may not have been saved)
        invoke('save_message', {
          session_id: sessionId,
          id: assistantMsg.id,
          role: assistantMsg.role,
          content: assistantMsg.content,
          model: assistantMsg.model,
          input_tokens: assistantMsg.input_tokens,
          output_tokens: assistantMsg.output_tokens,
          cost_cents: assistantMsg.cost_cents != null ? Math.round(assistantMsg.cost_cents) : null,
        }).catch((err) =>
          log.error(
            'Failed to persist replayed message: ' +
              (err instanceof Error ? err.message : String(err)),
          ),
        );
      }
      setState('streamingContent', '');
      setState('thinkingContent', '');
      setState('isStreaming', false);
      setState('isLoading', false);
      typewriter.reset();
      setSessionStatus(sessionId, 'exited');
      break;
    }

    case 'ToolUse': {
      const toolContent = JSON.stringify({
        tool_name: event.tool_name,
        tool_input: event.tool_input,
        tool_use_id: event.tool_use_id,
      });
      const isDup = state.messages.some((m) => m.role === 'tool_use' && m.content === toolContent);
      if (!isDup) {
        const msgId = crypto.randomUUID();
        const msg: Message = {
          id: msgId,
          session_id: sessionId,
          role: 'tool_use',
          content: toolContent,
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
          content: toolContent,
          model: null,
          input_tokens: null,
          output_tokens: null,
          cost_cents: null,
        }).catch((err) =>
          log.error(
            'Failed to persist replayed tool_use: ' +
              (err instanceof Error ? err.message : String(err)),
          ),
        );
      }
      break;
    }

    case 'ToolResult': {
      const resultContent = JSON.stringify({
        tool_use_id: event.tool_use_id,
        content: event.content,
        is_error: event.is_error,
      });
      const isDup = state.messages.some(
        (m) => m.role === 'tool_result' && m.content === resultContent,
      );
      if (!isDup) {
        const msgId = crypto.randomUUID();
        const msg: Message = {
          id: msgId,
          session_id: sessionId,
          role: 'tool_result',
          content: resultContent,
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
          content: resultContent,
          model: null,
          input_tokens: null,
          output_tokens: null,
          cost_cents: null,
        }).catch((err) =>
          log.error(
            'Failed to persist replayed tool_result: ' +
              (err instanceof Error ? err.message : String(err)),
          ),
        );
      }
      break;
    }

    case 'Thinking':
      setState('thinkingContent', (prev) => prev + (event.content ?? ''));
      break;

    case 'CliExited':
      setState('isLoading', false);
      setState('isStreaming', false);
      setSessionStatus(sessionId, 'exited');
      break;

    case 'CliInit':
      if (event.cli_session_id) {
        updateSessionCliId(sessionId, event.cli_session_id).catch(() => {});
      }
      break;

    case 'PermissionRequest':
      // Permission requests during reload are expired -- don't re-show
      break;
  }
}

export { state as conversationState, typewriter };
