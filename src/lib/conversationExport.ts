// src/lib/conversationExport.ts
// Pure formatters for exporting conversation history.

import type { Message } from './types';
import { redactSecrets } from './redaction';

export type ExportFormat = 'md' | 'html' | 'txt' | 'json';

export interface ExportOptions {
  redact?: boolean;
  includeToolCalls?: boolean;
  includeThinking?: boolean;
  includeTokenCounts?: boolean;
}

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

export function exportAsMarkdown(
  messages: Message[],
  sessionId: string,
  options: ExportOptions = {},
): string {
  const { redact = false, includeToolCalls = true, includeThinking = true } = options;
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
    if (msg.role === 'thinking' && includeThinking) {
      const preview = msg.content.slice(0, 400);
      lines.push('<details>', '<summary>Thinking...</summary>', '', preview, '</details>', '');
      continue;
    }
    if (msg.role === 'tool_use' && includeToolCalls) {
      const parsed = tryParseJson<{ tool_name?: string; tool_input?: string }>(msg.content);
      const toolName = parsed?.tool_name ?? 'Tool';
      const toolInput = parsed?.tool_input ?? msg.content;
      lines.push('```tool', `# ${toolName}`, toolInput, '```', '');
      continue;
    }
    if (msg.role === 'tool_result' && includeToolCalls) {
      const parsed = tryParseJson<{ content?: string; is_error?: boolean }>(msg.content);
      const content = parsed?.content ?? msg.content;
      const prefix = parsed?.is_error ? '> [Error] ' : '> ';
      lines.push(prefix + content.split('\n').join('\n> '), '');
      continue;
    }
  }

  const raw = lines.join('\n');
  return redact ? redactSecrets(raw).content : raw;
}

export function exportAsText(
  messages: Message[],
  sessionId: string,
  options: ExportOptions = {},
): string {
  const { redact = false } = options;
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

  const raw = lines.join('\n');
  return redact ? redactSecrets(raw).content : raw;
}

export function exportAsHtml(
  messages: Message[],
  sessionId: string,
  options: ExportOptions = {},
): string {
  const { redact = false, includeToolCalls = true, includeThinking = true } = options;
  interface Turn {
    index: number;
    userContent: string;
    assistantParts: { type: string; content: string; isError?: boolean }[];
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    costCents: number | null;
  }

  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        index: turns.length,
        userContent: msg.content,
        assistantParts: [],
        inputTokens: null,
        outputTokens: null,
        thinkingTokens: null,
        costCents: null,
      };
      continue;
    }

    if (!currentTurn) {
      currentTurn = {
        index: 0,
        userContent: '',
        assistantParts: [],
        inputTokens: null,
        outputTokens: null,
        thinkingTokens: null,
        costCents: null,
      };
    }

    if (msg.role === 'assistant') {
      currentTurn.assistantParts.push({ type: 'assistant', content: msg.content });
      if (msg.input_tokens != null) {
        currentTurn.inputTokens = (currentTurn.inputTokens ?? 0) + msg.input_tokens;
      }
      if (msg.output_tokens != null) {
        currentTurn.outputTokens = (currentTurn.outputTokens ?? 0) + msg.output_tokens;
      }
      if (msg.thinking_tokens != null) {
        currentTurn.thinkingTokens = (currentTurn.thinkingTokens ?? 0) + msg.thinking_tokens;
      }
      if (msg.cost_cents != null) {
        currentTurn.costCents = (currentTurn.costCents ?? 0) + msg.cost_cents;
      }
    } else if (msg.role === 'thinking' && includeThinking) {
      currentTurn.assistantParts.push({ type: 'thinking', content: msg.content });
    } else if (msg.role === 'tool_use' && includeToolCalls) {
      const parsed = tryParseJson<{ tool_name?: string; tool_input?: string }>(msg.content);
      const name = parsed?.tool_name ?? 'Tool';
      const input = parsed?.tool_input ?? msg.content;
      currentTurn.assistantParts.push({ type: 'tool_use', content: `${name}\n${input}` });
    } else if (msg.role === 'tool_result' && includeToolCalls) {
      const parsed = tryParseJson<{ content?: string; is_error?: boolean }>(msg.content);
      currentTurn.assistantParts.push({
        type: 'tool_result',
        content: parsed?.content ?? msg.content,
        isError: parsed?.is_error ?? false,
      });
    }
  }

  if (currentTurn) turns.push(currentTurn);

  const turnsJson = JSON.stringify(turns);
  const totalTurns = turns.length;
  const exportedAt = new Date().toISOString();
  const maybeRedact = (value: string) => (redact ? redactSecrets(value).content : value);
  const serializedTurns = maybeRedact(turnsJson)
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E')
    .replaceAll('&', '\\u0026');

  const css = `
    :root{--color-bg:#0d1117;--color-bg-2:#161b22;--color-bg-3:#21262d;--color-fg:#c9d1d9;--color-fg-2:#8b949e;--color-fg-3:#6e7681;--color-accent:#e8825a;--color-blue:#388bfd;--color-red:#f85149;--color-border:#30363d}
    [data-theme=light]{--color-bg:#ffffff;--color-bg-2:#f6f8fa;--color-bg-3:#eaeef2;--color-fg:#24292f;--color-fg-2:#57606a;--color-fg-3:#8c959f;--color-accent:#d1622b;--color-blue:#0969da;--color-red:#cf222e;--color-border:#d0d7de}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--color-bg);color:var(--color-fg);min-height:100vh}
    #app{max-width:860px;margin:0 auto;padding:24px 16px}
    header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--color-border)}
    .meta{font-size:.75rem;color:var(--color-fg-3);margin-top:4px}
    h1{font-size:1.1rem;font-weight:600;color:var(--color-accent)}
    .controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    button{cursor:pointer;border:1px solid var(--color-border);border-radius:6px;padding:4px 10px;font-size:.75rem;background:var(--color-bg-2);color:var(--color-fg)}
    #turn-nav{display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--color-fg-2);margin-bottom:12px}
    #search-bar{display:none;margin-bottom:16px}
    #search-bar.open{display:flex;gap:8px}
    #search-input{flex:1;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:6px;padding:6px 10px;color:var(--color-fg);font-size:.85rem}
    .turn{margin-bottom:24px;display:none}
    .turn.visible{display:block}
    .turn.search-match{outline:2px solid var(--color-accent);outline-offset:2px;border-radius:8px}
    .msg{margin:10px 0;border-radius:8px;overflow:hidden}
    .msg-header{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
    .msg-user .msg-header{background:var(--color-bg-2);color:var(--color-blue)}
    .msg-assistant .msg-header{background:var(--color-bg-2);color:var(--color-accent)}
    .msg-body{padding:12px 14px;font-size:.9rem;line-height:1.6;white-space:pre-wrap;word-break:break-word}
    .msg-user .msg-body{background:var(--color-bg-2)}
    .msg-assistant .msg-body{background:var(--color-bg)}
    .copy-btn{background:transparent;border:none;cursor:pointer;font-size:.65rem;color:var(--color-fg-3);padding:2px 6px}
    details{margin:6px 0;border:1px solid var(--color-border);border-radius:6px;overflow:hidden}
    details summary{padding:6px 12px;cursor:pointer;font-size:.75rem;color:var(--color-fg-2)}
    details .detail-body{padding:10px 12px;font-size:.78rem;white-space:pre-wrap;word-break:break-word;background:var(--color-bg-2);color:var(--color-fg-2)}
    .tool-error .detail-body{color:var(--color-red)}
    .token-meta{font-size:.68rem;color:var(--color-fg-3);padding:4px 12px 8px;display:none}
    .token-meta.show{display:block}
    .progress{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px}
    .pip{width:12px;height:12px;border-radius:2px;background:var(--color-border);cursor:pointer}
    .pip.active{background:var(--color-accent)}
    @media(prefers-color-scheme:light){:root:not([data-theme=dark]){--color-bg:#ffffff;--color-bg-2:#f6f8fa;--color-bg-3:#eaeef2;--color-fg:#24292f;--color-fg-2:#57606a;--color-fg-3:#8c959f;--color-accent:#d1622b;--color-blue:#0969da;--color-red:#cf222e;--color-border:#d0d7de}}
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  const js = `
    const TURNS = ${serializedTurns};
    let current = 0;
    let searchResults = [];
    let searchIndex = 0;
    let showTokens = false;
    function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function renderPart(part){
      if(part.type==='assistant'){ return '<div class="msg msg-assistant"><div class="msg-header"><span>Claude</span><button class="copy-btn" onclick="copyText(this)" data-text="'+escHtml(part.content)+'">Copy</button></div><div class="msg-body">'+escHtml(part.content)+'</div></div>'; }
      if(part.type==='thinking'){ return '<details class="thinking"><summary>Thinking</summary><div class="detail-body">'+escHtml(part.content)+'</div></details>'; }
      if(part.type==='tool_use'){ const lines = part.content.split('\\n'); const toolName = escHtml(lines[0] || 'Tool'); const toolBody = escHtml(lines.slice(1).join('\\n')); return '<details class="tool-use"><summary>Tool '+toolName+'</summary><div class="detail-body">'+toolBody+'</div></details>'; }
      if(part.type==='tool_result'){ const cls = part.isError ? 'tool-error' : 'tool-result'; return '<details class="'+cls+'"><summary>Result</summary><div class="detail-body">'+escHtml(part.content)+'</div></details>'; }
      return '';
    }
    function renderTurn(t){
      const tokenLine = (t.inputTokens != null) ? 'in:' + t.inputTokens + ' out:' + t.outputTokens + (t.thinkingTokens ? ' think:' + t.thinkingTokens : '') + (t.costCents != null ? ' $' + (t.costCents/100).toFixed(4) : '') : '';
      return '<div class="turn" id="turn-'+t.index+'"><div class="msg msg-user"><div class="msg-header"><span>You</span><button class="copy-btn" onclick="copyText(this)" data-text="'+escHtml(t.userContent)+'">Copy</button></div><div class="msg-body">'+escHtml(t.userContent || '')+'</div></div>'+t.assistantParts.map(renderPart).join('')+'<div class="token-meta" id="meta-'+t.index+'">'+tokenLine+'</div></div>';
    }
    function showTurn(n){
      const total = TURNS.length;
      if(total === 0) return;
      current = Math.max(0, Math.min(n, total - 1));
      document.querySelectorAll('.turn').forEach(function(el){ el.classList.remove('visible'); });
      const el = document.getElementById('turn-' + current);
      if(el) el.classList.add('visible');
      document.getElementById('turn-counter').textContent = (current + 1) + ' / ' + total;
      document.querySelectorAll('.pip').forEach(function(p, i){ p.classList.toggle('active', i === current); });
      if(showTokens){
        document.querySelectorAll('.token-meta').forEach(function(el){ el.classList.remove('show'); });
        const meta = document.getElementById('meta-' + current);
        if(meta) meta.classList.add('show');
      }
    }
    function toggleTheme(){ const root = document.documentElement; const cur = root.getAttribute('data-theme'); root.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark'); document.getElementById('theme-btn').textContent = root.getAttribute('data-theme') === 'dark' ? 'Light Theme' : 'Dark Theme'; }
    function toggleTokens(){ showTokens = !showTokens; document.querySelectorAll('.token-meta').forEach(function(el){ el.classList.remove('show'); }); if(showTokens){ const meta = document.getElementById('meta-' + current); if(meta) meta.classList.add('show'); } document.getElementById('tokens-btn').textContent = showTokens ? 'Hide Stats' : 'Show Stats'; }
    function toggleSearch(){ const bar = document.getElementById('search-bar'); bar.classList.toggle('open'); if(bar.classList.contains('open')) document.getElementById('search-input').focus(); }
    function doSearch(){ const q = document.getElementById('search-input').value.toLowerCase(); searchResults = []; document.querySelectorAll('.turn').forEach(function(el){ el.classList.remove('search-match'); }); if(!q) return; TURNS.forEach(function(t,i){ const text = (t.userContent + ' ' + t.assistantParts.map(function(p){ return p.content; }).join(' ')).toLowerCase(); if(text.includes(q)) searchResults.push(i); }); searchIndex = 0; if(searchResults.length > 0){ showTurn(searchResults[0]); document.getElementById('turn-' + searchResults[0]).classList.add('search-match'); } document.getElementById('search-count').textContent = searchResults.length ? searchResults.length + ' found' : 'No results'; }
    function nextSearchResult(){ if(!searchResults.length) return; searchIndex = (searchIndex + 1) % searchResults.length; showTurn(searchResults[searchIndex]); document.getElementById('turn-' + searchResults[searchIndex]).classList.add('search-match'); }
    function expandAll(){ document.querySelectorAll('details').forEach(function(d){ d.open = true; }); }
    function copyText(btn){ navigator.clipboard.writeText(btn.dataset.text || '').then(function(){ const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function(){ btn.textContent = orig; }, 1500); }); }
    document.addEventListener('keydown', function(e){ if(e.target.tagName === 'INPUT') return; if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){ e.preventDefault(); showTurn(current + 1); } if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){ e.preventDefault(); showTurn(current - 1); } if((e.ctrlKey || e.metaKey) && e.key === 'f'){ e.preventDefault(); toggleSearch(); } });
    window.addEventListener('DOMContentLoaded', function(){ const container = document.getElementById('turns-container'); const progress = document.getElementById('progress'); TURNS.forEach(function(t,i){ container.insertAdjacentHTML('beforeend', renderTurn(t)); const pip = document.createElement('div'); pip.className = 'pip'; pip.setAttribute('title', 'Turn ' + (i + 1)); pip.onclick = function(){ showTurn(i); }; progress.appendChild(pip); }); showTurn(0); });
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chief Wiggum — Session ${escapeHtml(sessionId.slice(0, 8))}</title>
<style>${css}</style>
</head>
<body>
<div id="app">
<header>
  <div>
    <h1>Chief Wiggum</h1>
    <div class="meta">Session ${escapeHtml(sessionId.slice(0, 8))} &middot; ${escapeHtml(exportedAt)} &middot; ${totalTurns} turn${totalTurns !== 1 ? 's' : ''}</div>
  </div>
  <div class="controls">
    <button id="theme-btn" onclick="toggleTheme()">Dark Theme</button>
    <button id="tokens-btn" onclick="toggleTokens()">Show Stats</button>
    <button onclick="toggleSearch()">Search</button>
    <button onclick="expandAll()">Expand All</button>
  </div>
</header>
<div id="search-bar" role="search">
  <input id="search-input" type="text" placeholder="Search messages…" aria-label="Search messages"
    oninput="doSearch()" onkeydown="if(event.key==='Enter')nextSearchResult()">
  <span id="search-count" aria-live="polite"></span>
</div>
<div id="turn-nav" aria-label="Turn navigation">
  <button onclick="showTurn(current - 1)" aria-label="Previous turn">&#8592;</button>
  <span id="turn-counter" aria-live="polite">1 / ${totalTurns}</span>
  <button onclick="showTurn(current + 1)" aria-label="Next turn">&#8594;</button>
</div>
<div id="progress" class="progress" role="navigation" aria-label="Turn timeline"></div>
<div id="turns-container"></div>
</div>
<script>${js}</script>
</body>
</html>`;
}

export interface ExportSessionMeta {
  id: string;
  title?: string | null;
  model?: string | null;
}

export function exportAsJson(
  messages: Message[],
  session: ExportSessionMeta,
  options: ExportOptions = {},
): string {
  const { redact = false } = options;
  const exported_at = new Date().toISOString();

  const serializedMessages = messages.map((msg) => ({
    id: msg.id,
    uuid: (msg as { uuid?: string | null }).uuid ?? null,
    parent_uuid: (msg as { parent_uuid?: string | null }).parent_uuid ?? null,
    role: msg.role,
    content: msg.content,
    model: msg.model ?? null,
    tokens: {
      input: msg.input_tokens ?? null,
      output: msg.output_tokens ?? null,
      thinking: msg.thinking_tokens ?? null,
    },
    cost_cents: msg.cost_cents ?? null,
    stop_reason: (msg as { stop_reason?: string | null }).stop_reason ?? null,
    is_error: (msg as { is_error?: boolean | null }).is_error ?? null,
    timestamp: msg.created_at ?? null,
  }));

  const payload = {
    version: '1.0',
    exported_at,
    session: {
      id: session.id,
      title: session.title ?? null,
      model: session.model ?? null,
      total_messages: messages.length,
      total_cost_cents:
        messages.reduce((sum, message) => sum + (message.cost_cents ?? 0), 0) || null,
    },
    messages: serializedMessages,
  };

  const raw = JSON.stringify(payload, null, 2);
  return redact ? redactSecrets(raw).content : raw;
}

export function buildExportFilename(sessionId: string, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortId = sessionId.slice(0, 8);
  return `session-${shortId}-${date}.${format}`;
}
