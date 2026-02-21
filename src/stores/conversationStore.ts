// src/stores/conversationStore.ts
// Conversation state: messages, loading, mock responses.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import type { Message } from '@/lib/types';

interface ConversationState {
  messages: Message[];
  isLoading: boolean;
}

const [state, setState] = createStore<ConversationState>({
  messages: [],
  isLoading: false,
});

/** Add a user message and trigger a mock assistant response. */
export function sendMessage(content: string) {
  const userMsg: Message = {
    id: crypto.randomUUID(),
    session_id: 'mock-session',
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

  // Mock: simulate assistant response after 1s
  // TODO: Replace with IPC send_message command when backend is wired
  setTimeout(() => {
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      session_id: 'mock-session',
      role: 'assistant',
      content: buildMockResponse(content),
      model: 'claude-opus-4-6',
      input_tokens: 150,
      output_tokens: 200,
      thinking_tokens: 50,
      cost_cents: 3,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    setState('messages', (prev) => [...prev, assistantMsg]);
    setState('isLoading', false);
  }, 1000);
}

/** Add a message directly (used by IPC event listeners). */
export function addMessage(msg: Message) {
  setState('messages', (prev) => [...prev, msg]);
}

/** Clear all messages (e.g., on session change). */
export function clearMessages() {
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

export { state as conversationState };
