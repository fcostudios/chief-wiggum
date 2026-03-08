import { describe, expect, it } from 'vitest';
import {
  buildExportFilename,
  exportAsHtml,
  exportAsJson,
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
    expect(output).toMatch(/&lt;script&gt;|\\u003Cscript\\u003E/);
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

describe('exportAsHtml — interactive viewer', () => {
  const msgs = [
    message('user', 'Hello there'),
    message('assistant', 'Hi, how can I help?'),
    message('thinking', 'Let me think about this carefully'),
    message('tool_use', JSON.stringify({ tool_name: 'Read', tool_input: '{"path":"file.ts"}' })),
    message('tool_result', JSON.stringify({ content: 'file content', is_error: false })),
  ];

  it('is a self-contained HTML file (no external script/link src)', () => {
    const html = exportAsHtml(msgs, 'test-session');
    expect(html).not.toMatch(/src=\"http/);
    expect(html).not.toMatch(/href=\"http/);
    expect(html).not.toMatch(/<link[^>]+rel=\"stylesheet\"[^>]+href/);
  });

  it('includes session metadata header', () => {
    const html = exportAsHtml(msgs, 'test-session-id');
    expect(html).toContain('test-ses');
  });

  it('includes theme toggle button', () => {
    const html = exportAsHtml(msgs, 's1');
    expect(html.toLowerCase()).toMatch(/theme|dark|light/);
  });

  it('renders thinking blocks as collapsed details', () => {
    const html = exportAsHtml(msgs, 's1');
    expect(html).toContain('Let me think about this carefully');
    expect(html).toMatch(/<details/);
  });

  it('renders tool calls as collapsible blocks', () => {
    const html = exportAsHtml(msgs, 's1');
    expect(html).toContain('Read');
  });

  it('includes keyboard navigation script', () => {
    const html = exportAsHtml(msgs, 's1');
    expect(html).toContain('ArrowLeft');
    expect(html).toContain('ArrowRight');
  });

  it('includes copy-to-clipboard buttons', () => {
    const html = exportAsHtml(msgs, 's1');
    expect(html.toLowerCase()).toMatch(/copy|clipboard/);
  });

  it('includes message count in metadata', () => {
    const html = exportAsHtml(msgs, 's1');
    expect(html).toMatch(/\d+\s*(?:turn|message|msg)/i);
  });

  it('output under 50KB for viewer chrome alone (empty messages)', () => {
    const html = exportAsHtml([], 's1');
    const bytes = new TextEncoder().encode(html).length;
    expect(bytes).toBeLessThan(50 * 1024);
  });

  it('escapes user content to prevent XSS', () => {
    const xssMsg = message('user', '<script>alert(\"xss\")</script>');
    const html = exportAsHtml([xssMsg], 's1');
    expect(html).not.toContain('<script>alert(\"xss\")</script>');
  });

  it('includes dark/light theme CSS variables', () => {
    const html = exportAsHtml([], 's1');
    expect(html).toMatch(/prefers-color-scheme|--color-bg|data-theme/);
  });
});

describe('buildExportFilename', () => {
  it('uses session short id and extension', () => {
    const name = buildExportFilename('abc12345-xyz', 'md');
    expect(name).toMatch(/^session-abc12345-\d{4}-\d{2}-\d{2}\.md$/);
  });
});

describe('exportAsJson', () => {
  const msgs = [
    message('user', 'Hello'),
    { ...message('assistant', 'Hi there'), input_tokens: 10, output_tokens: 5, cost_cents: 2 },
    message('thinking', 'I thought hard'),
    message('tool_use', JSON.stringify({ tool_name: 'Read', tool_input: '{"path":"f.ts"}' })),
  ];
  const session = {
    id: 'session-123',
    title: 'Test Session',
    model: 'claude-sonnet-4-6',
  };

  it('produces valid JSON', () => {
    const output = exportAsJson(msgs, session);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('has correct top-level structure', () => {
    const obj = JSON.parse(exportAsJson(msgs, session)) as Record<string, unknown>;
    expect(obj.version).toBe('1.0');
    expect(typeof obj.exported_at).toBe('string');
    expect(obj.session).toBeTruthy();
    expect(Array.isArray(obj.messages)).toBe(true);
  });

  it('session metadata is correct', () => {
    const obj = JSON.parse(exportAsJson(msgs, session)) as Record<string, unknown>;
    const sessionMeta = obj.session as Record<string, unknown>;
    expect(sessionMeta.id).toBe('session-123');
    expect(sessionMeta.title).toBe('Test Session');
    expect(sessionMeta.model).toBe('claude-sonnet-4-6');
    expect(typeof sessionMeta.total_messages).toBe('number');
  });

  it('includes all messages with correct fields', () => {
    const obj = JSON.parse(exportAsJson(msgs, session)) as { messages: Record<string, unknown>[] };
    expect(obj.messages.length).toBe(msgs.length);
    const first = obj.messages[0];
    expect(first.role).toBe('user');
    expect(first.content).toBe('Hello');
    expect(typeof first.id).toBe('string');
    expect(typeof first.timestamp).toBe('string');
  });

  it('includes token/cost data when present', () => {
    const obj = JSON.parse(exportAsJson(msgs, session)) as { messages: Record<string, unknown>[] };
    const assistant = obj.messages.find((m) => m.role === 'assistant') as Record<string, unknown>;
    const tokens = assistant.tokens as Record<string, unknown>;
    expect(tokens.input).toBe(10);
    expect(tokens.output).toBe(5);
    expect(assistant.cost_cents).toBe(2);
  });

  it('redacts secrets when redact=true', () => {
    const secretMsg = message('user', 'Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
    const output = exportAsJson([secretMsg], session, { redact: true });
    expect(output).not.toContain('sk-ant-api03');
  });

  it('roundtrip preserves all message content', () => {
    const output = exportAsJson(msgs, session);
    const obj = JSON.parse(output) as { messages: { content: string }[] };
    expect(obj.messages[0].content).toBe('Hello');
    expect(obj.messages[1].content).toBe('Hi there');
  });
});
