// src/components/conversation/MarkdownContent.tsx
// Renders markdown string to HTML with syntax-highlighted code blocks.
// Uses marked + highlight.js. Code blocks get copy buttons via DOM post-processing.
// Styles in src/styles/tokens.css under .markdown-content.

import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { render as solidRender } from 'solid-js/web';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { Copy, FileCode, Terminal } from 'lucide-solid';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';
import {
  RENDERER_ATTR,
  RENDERER_CODE_ATTR,
  RENDERER_LANG_ATTR,
  findRenderer,
} from '@/lib/rendererRegistry';
import { addToast } from '@/stores/toastStore';
import { setActiveView } from '@/stores/uiStore';

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
  },
});

interface MarkdownContentProps {
  content: string;
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
      containerRef!.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return; // already has button

        const codeEl = pre.querySelector('code');
        const code = codeEl?.textContent || '';
        const langMatch = codeEl?.className.match(/language-([A-Za-z0-9_+-]+)/);
        const lang = langMatch ? langMatch[1] : '';

        const copyIcon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        const checkIcon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        const btn = document.createElement('button');
        btn.className = 'copy-btn press-feedback';
        btn.innerHTML = copyIcon;
        btn.addEventListener('click', () => {
          const code = pre.querySelector('code')?.textContent || '';
          navigator.clipboard.writeText(code);
          btn.innerHTML = checkIcon;
          btn.style.color = 'var(--color-success)';
          setTimeout(() => {
            btn.innerHTML = copyIcon;
            btn.style.color = '';
          }, 2000);
        });
        pre.appendChild(btn);
        pre.tabIndex = 0;
        pre.setAttribute('aria-label', 'Code block');

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

      containerRef!.querySelectorAll<HTMLElement>(`[${RENDERER_ATTR}]`).forEach((placeholder) => {
        const encodedCode = placeholder.getAttribute(RENDERER_CODE_ATTR) || '';
        const lang = placeholder.getAttribute(RENDERER_LANG_ATTR) || '';
        const code = decodeRendererCode(encodedCode);
        const entry = findRenderer(lang, code);
        if (!entry) return;

        const RendererComponent = entry.component;
        const dispose = solidRender(() => <RendererComponent code={code} lang={lang} />, placeholder);
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
