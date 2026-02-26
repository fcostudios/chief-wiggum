import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIpcMocks, mockIpcCommand } from '@/test/mockIPC';
import type { Message, Session } from '@/lib/types';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    project_id: 'proj-1',
    title: 'Test',
    model: 'claude-sonnet-4-6',
    status: 'active',
    parent_session_id: null,
    context_tokens: null,
    total_input_tokens: null,
    total_output_tokens: null,
    total_cost_cents: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cli_session_id: null,
    pinned: false,
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'm1',
    session_id: 's1',
    role: 'user',
    content: 'hello',
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

describe('Integration: session -> conversation', () => {
  beforeEach(() => {
    clearIpcMocks();
    vi.resetModules();
  });

  it('createNewSession populates sessionStore active session', async () => {
    mockIpcCommand('create_session', () => makeSession());

    const sessionMod = await import('@/stores/sessionStore');
    const session = await sessionMod.createNewSession('claude-sonnet-4-6', 'proj-1');

    expect(session.id).toBe('s1');
    expect(sessionMod.sessionState.activeSessionId).toBe('s1');
    expect(sessionMod.sessionState.sessions[0]?.id).toBe('s1');
  });

  it('loadMessages fetches messages for a session via IPC', async () => {
    mockIpcCommand('list_messages', () => [makeMessage()]);

    const convMod = await import('@/stores/conversationStore');
    await convMod.loadMessages('s1');

    expect(convMod.conversationState.messages).toHaveLength(1);
    expect(convMod.conversationState.messages[0]?.content).toBe('hello');
  });

  it('clearMessages resets loaded conversation state', async () => {
    mockIpcCommand('list_messages', () => [
      makeMessage(),
      makeMessage({ id: 'm2', content: 'world' }),
    ]);

    const convMod = await import('@/stores/conversationStore');
    await convMod.loadMessages('s1');
    convMod.clearMessages();

    expect(convMod.conversationState.messages).toEqual([]);
    expect(convMod.conversationState.isLoading).toBe(false);
    expect(convMod.conversationState.processStatus).toBe('not_started');
  });
});
