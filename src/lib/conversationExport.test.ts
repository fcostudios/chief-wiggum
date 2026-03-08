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

  it('renders tool_use payload as fenced tool block', () => {
    const output = exportAsMarkdown(
      [
        message(
          'tool_use',
          JSON.stringify({
            tool_name: 'Write',
            tool_input: '{"path":"src/app.ts","content":"hello"}',
          }),
        ),
      ],
      'abc',
    );
    expect(output).toContain('```tool');
    expect(output).toContain('# Write');
    expect(output).toContain('"path":"src/app.ts"');
    expect(output).toContain('```');
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

  it('excludes tool_use and tool_result content from text export', () => {
    const output = exportAsText(
      [
        message('user', 'Question'),
        message(
          'tool_use',
          JSON.stringify({ tool_name: 'Bash', tool_input: '{"command":"echo hi"}' }),
        ),
        message('tool_result', JSON.stringify({ content: 'tool output', is_error: false })),
        message('assistant', 'Answer'),
      ],
      'abc',
    );
    expect(output).toContain('Question');
    expect(output).toContain('Answer');
    expect(output).not.toContain('tool output');
    expect(output).not.toContain('Bash');
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

describe('export redaction', () => {
  const secretMsg = message(
    'assistant',
    'Your key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890 goodbye',
  );

  it('exportAsMarkdown redacts secrets when redact=true', () => {
    const output = exportAsMarkdown([secretMsg], 'abc', { redact: true });
    expect(output).not.toContain('sk-ant-api03');
    expect(output).toContain('[ANTHROPIC_KEY REDACTED]');
  });

  it('exportAsMarkdown does NOT redact when redact=false', () => {
    const output = exportAsMarkdown([secretMsg], 'abc', { redact: false });
    expect(output).toContain('sk-ant-api03');
  });

  it('exportAsMarkdown does NOT redact by default', () => {
    const output = exportAsMarkdown([secretMsg], 'abc');
    expect(output).toContain('sk-ant-api03');
  });

  it('exportAsText redacts secrets when redact=true', () => {
    const output = exportAsText([secretMsg], 'abc', { redact: true });
    expect(output).not.toContain('sk-ant-api03');
  });

  it('exportAsHtml redacts secrets when redact=true', () => {
    const output = exportAsHtml([secretMsg], 'abc', { redact: true });
    expect(output).not.toContain('sk-ant-api03');
  });
});

describe('buildExportFilename', () => {
  it('uses session short id and extension', () => {
    const name = buildExportFilename('abc12345-xyz', 'md');
    expect(name).toMatch(/^session-abc12345-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
