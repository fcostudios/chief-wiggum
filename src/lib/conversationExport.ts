// src/lib/conversationExport.ts
// Pure formatters for exporting conversation history.

import type { Message } from './types';

export type ExportFormat = 'md' | 'html' | 'txt';

function exportTimestamp(): string {
  return new Date().toLocaleString();
}

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function exportAsMarkdown(messages: Message[], sessionId: string): string {
  const lines: string[] = [
    `# Chief Wiggum - Session ${sessionId}`,
    `_Exported: ${exportTimestamp()}_`,
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('---', '**You:**', '', msg.content, '');
      continue;
    }
    if (msg.role === 'assistant') {
      lines.push('---', '**Claude:**', '', msg.content, '');
      continue;
    }
    if (msg.role === 'thinking') {
      const preview = msg.content.slice(0, 400);
      lines.push('<details>', '<summary>Thinking...</summary>', '', preview, '</details>', '');
      continue;
    }
    if (msg.role === 'tool_use') {
      const parsed = tryParseJson<{ tool_name?: string; tool_input?: string }>(msg.content);
      const toolName = parsed?.tool_name ?? 'Tool';
      const toolInput = parsed?.tool_input ?? msg.content;
      lines.push('```tool', `# ${toolName}`, toolInput, '```', '');
      continue;
    }
    if (msg.role === 'tool_result') {
      const parsed = tryParseJson<{ content?: string; is_error?: boolean }>(msg.content);
      const content = parsed?.content ?? msg.content;
      const prefix = parsed?.is_error ? '> [Error] ' : '> ';
      lines.push(prefix + content.split('\n').join('\n> '), '');
      continue;
    }
  }

  return lines.join('\n');
}

export function exportAsText(messages: Message[], sessionId: string): string {
  const lines: string[] = [
    `Chief Wiggum - Session ${sessionId}`,
    `Exported: ${exportTimestamp()}`,
    '='.repeat(60),
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('YOU:', msg.content, '');
      continue;
    }
    if (msg.role === 'assistant') {
      lines.push('CLAUDE:', msg.content, '');
    }
  }

  return lines.join('\n');
}

const HTML_THEME = `
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;max-width:900px;margin:40px auto;padding:0 20px}
h1{font-size:1.2rem;color:#e8825a;margin-bottom:4px}
.meta{color:#6e7681;font-size:.8rem;margin-bottom:32px}
.msg{margin:16px 0;padding:12px 16px;border-radius:8px}
.msg.user{background:#161b22;border-left:3px solid #388bfd}
.msg.assistant{background:#0d1117;border-left:3px solid #e8825a}
.role{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#6e7681;margin-bottom:6px}
.msg.user .role{color:#388bfd}
.msg.assistant .role{color:#e8825a}
pre{background:#161b22;padding:12px;border-radius:6px;overflow-x:auto;font-size:.8rem;color:#8b949e}
details{margin:4px 0;color:#6e7681;font-size:.85rem}
`.replace(/\s+/g, ' ');

export function exportAsHtml(messages: Message[], sessionId: string): string {
  const parts: string[] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<title>Chief Wiggum - Session ${escapeHtml(sessionId)}</title>`,
    `<style>${HTML_THEME}</style>`,
    '</head>',
    '<body>',
    '<h1>Chief Wiggum</h1>',
    `<div class="meta">Session ${escapeHtml(sessionId)} | Exported ${escapeHtml(exportTimestamp())}</div>`,
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      parts.push(
        '<div class="msg user">',
        '<div class="role">You</div>',
        `<p>${escapeHtml(msg.content).replaceAll('\n', '<br>')}</p>`,
        '</div>',
      );
      continue;
    }
    if (msg.role === 'assistant') {
      parts.push(
        '<div class="msg assistant">',
        '<div class="role">Claude</div>',
        `<p>${escapeHtml(msg.content).replaceAll('\n', '<br>')}</p>`,
        '</div>',
      );
      continue;
    }
    if (msg.role === 'thinking') {
      parts.push(
        `<details><summary>Thinking...</summary><pre>${escapeHtml(msg.content.slice(0, 400))}</pre></details>`,
      );
      continue;
    }
    if (msg.role === 'tool_use') {
      const parsed = tryParseJson<{ tool_name?: string; tool_input?: string }>(msg.content);
      const toolName = escapeHtml(parsed?.tool_name ?? 'Tool');
      const toolInput = escapeHtml(parsed?.tool_input ?? msg.content);
      parts.push(`<pre><b>${toolName}</b>\n${toolInput}</pre>`);
    }
  }

  parts.push('</body>', '</html>');
  return parts.join('\n');
}

export function buildExportFilename(sessionId: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortId = sessionId.slice(0, 8);
  return `session-${shortId}-${date}.${format}`;
}
