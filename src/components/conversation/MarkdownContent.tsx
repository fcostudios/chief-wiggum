// src/components/conversation/MarkdownContent.tsx
// Renders markdown string to HTML with syntax-highlighted code blocks.
// Uses marked + highlight.js. Code blocks get copy buttons via DOM post-processing.
// Styles in src/styles/tokens.css under .markdown-content.

import type { Component } from 'solid-js';
import { createEffect, onCleanup } from 'solid-js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

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

interface MarkdownContentProps {
  content: string;
}

const MarkdownContent: Component<MarkdownContentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  const html = () => marked.parse(props.content) as string;

  // Post-process: add copy buttons to code blocks
  createEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _html = html(); // track reactive dependency
    if (!containerRef) return;

    // Use requestAnimationFrame to ensure DOM is updated
    const rafId = requestAnimationFrame(() => {
      containerRef!.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return; // already has button

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
          const code = pre.querySelector('code')?.textContent || '';
          navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        });
        pre.appendChild(btn);
      });
    });

    onCleanup(() => cancelAnimationFrame(rafId));
  });

  // eslint-disable-next-line solid/no-innerhtml -- intentional: renders trusted markdown from marked
  return <div ref={containerRef} class="markdown-content" innerHTML={html()} />;
};

export default MarkdownContent;
