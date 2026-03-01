import { describe, expect, it } from 'vitest';
import { extractResumeData } from './resumeDetector';
import type { Message } from './types';

function makeMsg(role: Message['role'], content: string, id = Math.random().toString()): Message {
  return {
    id,
    session_id: 'sess-1',
    role,
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

describe('extractResumeData', () => {
  it('returns null when there are no assistant messages', () => {
    const result = extractResumeData([makeMsg('user', 'hello')]);
    expect(result).toBeNull();
  });

  it('extracts last assistant message preview (max 100 chars)', () => {
    const long = 'A'.repeat(150);
    const result = extractResumeData([makeMsg('user', 'hi'), makeMsg('assistant', long)]);
    expect(result?.lastMessagePreview).toHaveLength(100);
    expect(result?.lastMessageFull).toBe(long);
  });

  it('extracts files touched from tool_use write_file blocks', () => {
    const toolUse = JSON.stringify({
      tool_name: 'Write',
      tool_use_id: 'tu1',
      tool_input: JSON.stringify({ file_path: 'src/auth/service.ts' }),
    });
    const result = extractResumeData([makeMsg('tool_use', toolUse), makeMsg('assistant', 'done')]);
    expect(result?.filesTouched).toContain('src/auth/service.ts');
  });

  it('de-duplicates file paths', () => {
    const toolUse = JSON.stringify({
      tool_name: 'Write',
      tool_use_id: 'tu1',
      tool_input: JSON.stringify({ file_path: 'src/auth/service.ts' }),
    });
    const result = extractResumeData([
      makeMsg('tool_use', toolUse),
      makeMsg('tool_use', toolUse),
      makeMsg('assistant', 'done'),
    ]);
    expect(result?.filesTouched.filter((f) => f === 'src/auth/service.ts').length).toBe(1);
  });

  it('extracts open todos from last TodoWrite', () => {
    const toolUse = JSON.stringify({
      tool_name: 'TodoWrite',
      tool_use_id: 'tu2',
      tool_input: JSON.stringify({
        todos: [
          { id: '1', content: 'Write tests', status: 'in_progress' },
          { id: '2', content: 'Update docs', status: 'completed' },
        ],
      }),
    });
    const result = extractResumeData([makeMsg('tool_use', toolUse), makeMsg('assistant', 'done')]);
    expect(result?.openTodos).toEqual(['Write tests']);
  });
});
