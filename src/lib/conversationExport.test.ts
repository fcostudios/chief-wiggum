import { describe, expect, it } from 'vitest';
import {
  buildExportFilename,
  exportAsHtml,
  exportAsMarkdown,
  exportAsText,
} from './conversationExport';
import type { Message } from './types';

function message(role: Message['role'], content: string): Message {
  return {
    id: 'm1',
    session_id: 's1',
    role,
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: '2026-03-01T00:00:00Z',
  };
}

describe('exportAsMarkdown', () => {
  it('includes user and assistant content', () => {
    const output = exportAsMarkdown([message('user', 'Hello'), message('assistant', 'Hi')], 'abc');
    expect(output).toContain('**You:**');
    expect(output).toContain('Hello');
    expect(output).toContain('**Claude:**');
    expect(output).toContain('Hi');
  });

  it('wraps thinking in a details block', () => {
    const output = exportAsMarkdown([message('thinking', 'Reasoning text')], 'abc');
    expect(output).toContain('<details>');
    expect(output).toContain('Reasoning text');
  });

  it('ignores unknown roles without crashing', () => {
    const output = exportAsMarkdown([message('permission', 'secret')], 'abc');
    expect(output).not.toContain('secret');
  });
});

describe('exportAsText', () => {
  it('includes only user and assistant messages', () => {
    const output = exportAsText(
      [message('user', 'Question'), message('assistant', 'Answer'), message('thinking', 'skip')],
      'abc',
    );
    expect(output).toContain('YOU:');
    expect(output).toContain('Question');
    expect(output).toContain('CLAUDE:');
    expect(output).toContain('Answer');
    expect(output).not.toContain('skip');
  });
});

describe('exportAsHtml', () => {
  it('returns an html document', () => {
    const output = exportAsHtml([], 'abc');
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('</html>');
  });

  it('escapes user-provided html', () => {
    const output = exportAsHtml([message('user', '<script>alert(1)</script>')], 'abc');
    expect(output).not.toContain('<script>alert(1)</script>');
    expect(output).toContain('&lt;script&gt;');
  });
});

describe('buildExportFilename', () => {
  it('uses session short id and extension', () => {
    const name = buildExportFilename('abc12345-xyz', 'md');
    expect(name).toMatch(/^session-abc12345-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
