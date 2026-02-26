import { describe, expect, it } from 'vitest';
import type { Message } from '@/lib/types';
import { searchMessages } from './messageSearch';

function makeMsg(id: string, content: string, role: Message['role'] = 'assistant'): Message {
  return {
    id,
    session_id: 's1',
    role,
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('searchMessages', () => {
  const messages: Message[] = [
    makeMsg('1', 'Hello world', 'user'),
    makeMsg('2', 'Hello! How can I help?', 'assistant'),
    makeMsg('3', 'Search for files', 'user'),
    makeMsg('4', 'I found 3 files matching your query', 'assistant'),
    makeMsg('5', 'Show me the code', 'user'),
  ];

  it('returns empty array for empty query', () => {
    expect(searchMessages('', messages)).toEqual([]);
  });

  it('finds all messages containing query case-insensitively by default', () => {
    const results = searchMessages('hello', messages);
    expect(results).toHaveLength(2);
    expect(results[0].messageIndex).toBe(0);
    expect(results[1].messageIndex).toBe(1);
  });

  it('returns match positions within content', () => {
    const results = searchMessages('hello', messages);
    expect(results[0].ranges).toEqual([{ start: 0, end: 5 }]);
  });

  it('finds multiple occurrences in a single message', () => {
    const results = searchMessages('the', [makeMsg('1', 'the quick brown fox jumps over the lazy dog')]);
    expect(results[0].ranges).toHaveLength(2);
    expect(results[0].ranges[0]).toEqual({ start: 0, end: 3 });
    expect(results[0].ranges[1]).toEqual({ start: 31, end: 34 });
  });

  it('supports case-sensitive mode', () => {
    const strictMessages = [
      makeMsg('1', 'Hello world', 'user'),
      makeMsg('2', 'hello world', 'assistant'),
    ];
    const results = searchMessages('Hello', strictMessages, { caseSensitive: true });
    expect(results).toHaveLength(1);
    expect(results[0].messageId).toBe('1');
  });

  it('returns no results for non-matching query', () => {
    expect(searchMessages('nonexistent', messages)).toEqual([]);
  });

  it('escapes regex special characters in query', () => {
    const results = searchMessages('file.test', [makeMsg('1', 'file.test.ts (5 lines)')]);
    expect(results).toHaveLength(1);
  });

  it('skips tool and permission message roles', () => {
    const mixed = [
      makeMsg('1', 'hello world', 'assistant'),
      makeMsg('2', 'hello from tool', 'tool_result'),
      makeMsg('3', 'hello from permission', 'permission'),
      makeMsg('4', 'hello from thinker', 'thinking'),
    ];
    const results = searchMessages('hello', mixed);
    expect(results.map((m) => m.messageId)).toEqual(['1', '4']);
  });
});
