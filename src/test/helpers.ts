import type { Message, Session } from '@/lib/types';

let idCounter = 0;

export function createTestSession(overrides?: Partial<Session>): Session {
  idCounter += 1;
  const now = new Date().toISOString();
  return {
    id: `test-session-${idCounter}`,
    project_id: null,
    title: `Test Session ${idCounter}`,
    model: 'claude-sonnet-4-6',
    status: null,
    parent_session_id: null,
    context_tokens: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_cents: 0,
    created_at: now,
    updated_at: now,
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

export function createTestMessage(overrides?: Partial<Message>): Message {
  idCounter += 1;
  return {
    id: `test-msg-${idCounter}`,
    session_id: 'test-session-1',
    role: 'user',
    content: `Test message ${idCounter}`,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function resetTestIdCounter(): void {
  idCounter = 0;
}
