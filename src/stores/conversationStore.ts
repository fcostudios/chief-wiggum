// src/stores/conversationStore.ts
// Conversation state: messages for active session, send + persist via IPC.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { Message } from '@/lib/types';
import { updateSessionTitle, getActiveSession } from '@/stores/sessionStore';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
});

/** Load messages for a session from the database. */
export async function loadMessages(sessionId: string): Promise<void> {
  setState('messages', []);
  setState('isLoading', true);
  try {
    const messages = await invoke<Message[]>('list_messages', { session_id: sessionId });
    setState('messages', messages);
  } finally {
    setState('isLoading', false);
  }
}

/** Send a user message: add to store, persist to DB, trigger mock response. */
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

  setState('messages', (prev) => [...prev, userMsg]);
  setState('isLoading', true);

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

  // Mock: simulate assistant response after 1s
  // TODO: Replace with IPC send_message command when PTY bridge is wired
  setTimeout(() => {
    const assistantId = crypto.randomUUID();
    const model = session?.model ?? 'claude-sonnet-4-6';
    const assistantMsg: Message = {
      id: assistantId,
      session_id: sessionId,
      role: 'assistant',
      content: buildMockResponse(content),
      model,
      input_tokens: 150,
      output_tokens: 200,
      thinking_tokens: 50,
      cost_cents: 3,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    setState('messages', (prev) => [...prev, assistantMsg]);
    setState('isLoading', false);

    // Persist assistant message
    invoke('save_message', {
      session_id: sessionId,
      id: assistantId,
      role: 'assistant',
      content: assistantMsg.content,
      model,
      input_tokens: 150,
      output_tokens: 200,
      cost_cents: 3,
    }).catch((err) => devWarn('Failed to persist assistant message:', err));
  }, 1000);
}

/** Clear all messages (e.g., on session change). */
export function clearMessages(): void {
  setState('messages', []);
  setState('isLoading', false);
}

/** Build a mock response demonstrating various markdown features. */
function buildMockResponse(userContent: string): string {
  return [
    `I received your message and I'll help with that.`,
    '',
    `> ${userContent.split('\n')[0]}`,
    '',
    "Here's my analysis:",
    '',
    '- First, I reviewed the relevant files',
    '- Then I identified the changes needed',
    '- The implementation follows existing patterns',
    '',
    '```typescript',
    '// Example code block',
    'function processRequest(input: string): Result {',
    '  const parsed = parseInput(input);',
    '  return validate(parsed);',
    '}',
    '```',
    '',
    "Let me know if you'd like me to proceed with the implementation.",
  ].join('\n');
}

/** Dev-only warning logger — avoids GUIDE-001 §5.2 console.log ban in prod. */
function devWarn(msg: string, err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[conversationStore] ${msg}`, err);
  }
}

export { state as conversationState };
