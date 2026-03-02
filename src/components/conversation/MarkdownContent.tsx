// src/components/conversation/MarkdownContent.tsx
// Renders markdown string to HTML with syntax-highlighted code blocks.
// Uses marked + highlight.js. Code blocks get copy buttons via DOM post-processing.
// Styles in src/styles/tokens.css under .markdown-content.

import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { render as solidRender } from 'solid-js/web';
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { Copy, FileCode, Terminal } from 'lucide-solid';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';
import MathRenderer from '@/components/conversation/renderers/MathRenderer';
import ImageRenderer from '@/components/conversation/renderers/ImageRenderer';
import {
  RENDERER_ATTR,
  RENDERER_CODE_ATTR,
  RENDERER_LANG_ATTR,
  findRenderer,
} from '@/lib/rendererRegistry';
import InlineDiffBlock from './InlineDiffBlock';
import { isDiffBlock } from '@/lib/diffApplicator';
import { addToast } from '@/stores/toastStore';
import { setActiveView } from '@/stores/uiStore';
import { maybeShowHint } from '@/stores/hintStore';

// Side-effect import registers math renderers.
void MathRenderer;
void ImageRenderer;

// Configure marked with highlight.js integration
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const LINES_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="4" y2="6.01"/><line x1="4" y1="12" x2="4" y2="12.01"/><line x1="4" y1="18" x2="4" y2="18.01"/><line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/></svg>';
const WRAP_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="13 16 11 18 13 20"/><line x1="3" y1="18" x2="7" y2="18"/></svg>';

function tableToMarkdown(tbl: HTMLTableElement): string {
  const rows: string[][] = [];
  tbl.querySelectorAll('tr').forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll('th, td').forEach((cell) => {
      cells.push(cell.textContent?.trim() ?? '');
    });
    rows.push(cells);
  });

  if (rows.length === 0) return '';
  const header = `| ${rows[0].join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows
    .slice(1)
    .map((r) => `| ${r.join(' | ')} |`)
    .join('\n');
  return [header, separator, body].filter(Boolean).join('\n');
}

function encodeRendererCode(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeRendererCode(encoded: string): string {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return encoded;
  }
}

interface MathToken extends Tokens.Generic {
  type: 'mathBlock' | 'mathInline';
  text: string;
}

const mathBlockExtension: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    const idx = src.indexOf('$$');
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = src.match(/^\$\$([\s\S]+?)\$\$(?:\n|$)/);
    if (!match) return undefined;
    return {
      type: 'mathBlock',
      raw: match[0],
      text: match[1].trim(),
      tokens: [],
    } satisfies MathToken;
  },
  renderer(token) {
    const math = token as MathToken;
    const encoded = encodeRendererCode(math.text);
    return `<div ${RENDERER_ATTR}="math-block" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="math-block" class="cw-renderer-placeholder"></div>`;
  },
};

const mathInlineExtension: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src: string) {
    const idx = src.indexOf('$');
    return idx === -1 ? undefined : idx;
  },
  tokenizer(src: string) {
    const match = src.match(/^\$(?!\$)((?:[^$]|\\.)+?)\$/);
    if (!match) return undefined;
    return {
      type: 'mathInline',
      raw: match[0],
      text: match[1].trim(),
      tokens: [],
    } satisfies MathToken;
  },
  renderer(token) {
    const math = token as MathToken;
    const encoded = encodeRendererCode(math.text);
    return `<span ${RENDERER_ATTR}="math-inline" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="math-inline" class="cw-renderer-placeholder"></span>`;
  },
};

marked.use({
  extensions: [mathBlockExtension, mathInlineExtension],
});

marked.use({
  renderer: {
    code(token) {
      const language = token.lang || '';
      const code = token.text;
      const entry = findRenderer(language, code);
      if (!entry) return false;

      const encoded = encodeRendererCode(code);
      const rendererType = language || entry.label;

      return `<div ${RENDERER_ATTR}="${rendererType}" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="${language}" class="cw-renderer-placeholder"></div>`;
    },
    image(token: Tokens.Image) {
      const src = token.href?.trim() ?? '';
      if (!src) return false;

      const payload = JSON.stringify({
        src,
        alt: token.text ?? '',
        title: token.title ?? '',
      });
      const encoded = encodeRendererCode(payload);

      return `<span ${RENDERER_ATTR}="image" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="image" class="cw-renderer-placeholder"></span>`;
    },
  },
});

interface MarkdownContentProps {
  content: string;
  messageId?: string;
}

const MarkdownContent: Component<MarkdownContentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const rendererDisposers: Array<() => void> = [];
  const [codeMenuPos, setCodeMenuPos] = createSignal<{ x: number; y: number } | null>(null);
  const [codeMenuTarget, setCodeMenuTarget] = createSignal<{ code: string; lang: string }>({
    code: '',
    lang: '',
  });

  const html = () => marked.parse(props.content) as string;

  function isContextMenuShortcut(e: KeyboardEvent): boolean {
    return e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
  }

  function openCodeContextMenu(target: HTMLElement, payload: { code: string; lang: string }): void {
    const rect = target.getBoundingClientRect();
    setCodeMenuTarget(payload);
    setCodeMenuPos({
      x: Math.round(rect.left + Math.min(24, Math.max(rect.width - 8, 8))),
      y: Math.round(rect.top + Math.min(24, Math.max(rect.height - 8, 8))),
    });
  }

  function codeMenuItems(): ContextMenuItem[] {
    const { code, lang } = codeMenuTarget();
    return [
      {
        label: 'Copy code',
        icon: Copy,
        onClick: () => {
          navigator.clipboard.writeText(code);
          addToast('Copied to clipboard', 'success');
        },
      },
      {
        label: 'Copy as markdown',
        icon: FileCode,
        onClick: () => {
          const withTrailingNewline = code.endsWith('\n') ? code : `${code}\n`;
          const fence = lang
            ? `\`\`\`${lang}\n${withTrailingNewline}\`\`\``
            : `\`\`\`\n${withTrailingNewline}\`\`\``;
          navigator.clipboard.writeText(fence);
          addToast('Copied as markdown', 'success');
        },
      },
      {
        label: 'Open in terminal',
        icon: Terminal,
        onClick: () => {
          setActiveView('terminal');
          navigator.clipboard.writeText(code);
          addToast('Opened Terminal view and copied code', 'info');
        },
      },
    ];
  }

  // Post-process: add copy buttons + context menus to code blocks
  createEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _html = html(); // track reactive dependency
    if (!containerRef) return;

    for (const dispose of rendererDisposers) {
      dispose();
    }
    rendererDisposers.length = 0;

    // Use requestAnimationFrame to ensure DOM is updated
    const rafId = requestAnimationFrame(() => {
      const codeBlocks = containerRef!.querySelectorAll('pre');
      if (codeBlocks.length > 0) {
        maybeShowHint(
          'artifacts',
          'Right-click code blocks to save as artifact or open in terminal',
        );
      }

      codeBlocks.forEach((pre) => {
        if (pre.querySelector('.code-toolbar')) return;

        const codeEl = pre.querySelector('code');
        const code = codeEl?.textContent || '';
        const langMatch = codeEl?.className.match(/language-([A-Za-z0-9_+-]+)/);
        const lang = langMatch ? langMatch[1] : '';
        pre.style.position = 'relative';

        const toolbar = document.createElement('div');
        toolbar.className = 'code-toolbar';

        if (lang) {
          const badge = document.createElement('span');
          badge.className = 'code-lang-badge';
          badge.textContent = lang;
          toolbar.appendChild(badge);
        }

        const linesBtn = document.createElement('button');
        linesBtn.className = 'toolbar-btn lines-toggle-btn';
        linesBtn.type = 'button';
        linesBtn.title = 'Toggle line numbers';
        linesBtn.innerHTML = LINES_ICON;
        linesBtn.addEventListener('click', () => {
          const existing = pre.querySelector('.code-line-numbers');
          if (existing) {
            existing.remove();
            pre.classList.remove('has-line-numbers');
            linesBtn.classList.remove('active');
            return;
          }

          const normalized = code.replace(/\n$/, '');
          const lines = normalized.length > 0 ? normalized.split('\n') : [''];
          const gutter = document.createElement('div');
          gutter.className = 'code-line-numbers';
          lines.forEach((_, i) => {
            const num = document.createElement('span');
            num.textContent = String(i + 1);
            gutter.appendChild(num);
          });
          pre.appendChild(gutter);
          pre.classList.add('has-line-numbers');
          linesBtn.classList.add('active');
        });
        toolbar.appendChild(linesBtn);

        const wrapBtn = document.createElement('button');
        wrapBtn.className = 'toolbar-btn wrap-toggle-btn';
        wrapBtn.type = 'button';
        wrapBtn.title = 'Toggle word wrap';
        wrapBtn.innerHTML = WRAP_ICON;
        wrapBtn.addEventListener('click', () => {
          if (!codeEl) return;
          codeEl.classList.toggle('code-wrapped');
          wrapBtn.classList.toggle('active');
        });
        toolbar.appendChild(wrapBtn);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'toolbar-btn copy-btn press-feedback';
        copyBtn.type = 'button';
        copyBtn.title = 'Copy code';
        copyBtn.innerHTML = COPY_ICON;
        copyBtn.addEventListener('click', () => {
          const freshCode = pre.querySelector('code')?.textContent || '';
          navigator.clipboard.writeText(freshCode);
          copyBtn.innerHTML = CHECK_ICON;
          copyBtn.style.color = 'var(--color-success)';
          setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON;
            copyBtn.style.color = '';
          }, 2000);
        });
        toolbar.appendChild(copyBtn);

        pre.appendChild(toolbar);
        pre.tabIndex = 0;
        pre.setAttribute('aria-label', `Code block${lang ? ` (${lang})` : ''}`);

        pre.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setCodeMenuTarget({ code, lang });
          setCodeMenuPos({ x: e.clientX, y: e.clientY });
        });

        pre.addEventListener('keydown', (e: KeyboardEvent) => {
          if (!isContextMenuShortcut(e)) return;
          e.preventDefault();
          e.stopPropagation();
          openCodeContextMenu(pre as HTMLElement, { code, lang });
        });
      });

      // Detect unified diff code blocks and mount inline diff actions below each block.
      let diffBlockIdx = 0;
      containerRef!.querySelectorAll('pre').forEach((pre) => {
        const codeEl = pre.querySelector('code');
        const code = codeEl?.textContent || '';
        const langMatch = codeEl?.className.match(/language-([A-Za-z0-9_+-]+)/);
        const lang = langMatch ? langMatch[1] : '';
        if (!isDiffBlock(lang, code)) return;
        if (pre.nextElementSibling?.hasAttribute('data-cw-diff-buttons')) return;

        const diffKey = `${props.messageId ?? 'unknown'}:${diffBlockIdx}`;
        diffBlockIdx += 1;

        const buttonContainer = document.createElement('div');
        buttonContainer.setAttribute('data-cw-diff-buttons', 'true');
        pre.parentNode?.insertBefore(buttonContainer, pre.nextSibling);

        const dispose = solidRender(
          () => <InlineDiffBlock code={code} diffKey={diffKey} />,
          buttonContainer,
        );
        rendererDisposers.push(dispose);
      });

      // Wrap tables in a horizontal container and add markdown copy.
      containerRef!.querySelectorAll('table').forEach((table) => {
        if (table.parentElement?.classList.contains('table-scroll-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll-wrapper';
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);

        const btn = document.createElement('button');
        btn.className = 'copy-btn press-feedback';
        btn.type = 'button';
        btn.title = 'Copy table as markdown';
        btn.innerHTML = COPY_ICON;
        btn.addEventListener('click', () => {
          const md = tableToMarkdown(table as HTMLTableElement);
          navigator.clipboard.writeText(md);
          btn.innerHTML = CHECK_ICON;
          btn.style.color = 'var(--color-success)';
          setTimeout(() => {
            btn.innerHTML = COPY_ICON;
            btn.style.color = '';
          }, 2000);
        });
        wrapper.appendChild(btn);
      });

      containerRef!.querySelectorAll<HTMLElement>(`[${RENDERER_ATTR}]`).forEach((placeholder) => {
        const encodedCode = placeholder.getAttribute(RENDERER_CODE_ATTR) || '';
        const lang = placeholder.getAttribute(RENDERER_LANG_ATTR) || '';
        const code = decodeRendererCode(encodedCode);
        const entry = findRenderer(lang, code);
        if (!entry) return;

        const RendererComponent = entry.component;
        const dispose = solidRender(
          () => <RendererComponent code={code} lang={lang} />,
          placeholder,
        );
        rendererDisposers.push(dispose);
      });
    });

    onCleanup(() => {
      cancelAnimationFrame(rafId);
      for (const dispose of rendererDisposers) {
        dispose();
      }
      rendererDisposers.length = 0;
    });
  });

  return (
    <>
      {/* eslint-disable-next-line solid/no-innerhtml -- intentional: renders trusted markdown from marked */}
      <div ref={containerRef} class="markdown-content" innerHTML={html()} />
      <Show when={codeMenuPos()}>
        {(pos) => (
          <ContextMenu
            items={codeMenuItems()}
            x={pos().x}
            y={pos().y}
            onClose={() => setCodeMenuPos(null)}
          />
        )}
      </Show>
    </>
  );
};

export default MarkdownContent;
