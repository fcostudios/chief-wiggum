// src/components/conversation/ResponseOutline.tsx
// Floating mini-TOC shown on hover when a response has 3+ headings.

import { createSignal, For, Show, type Component } from 'solid-js';
import { AlignLeft } from 'lucide-solid';

export interface OutlineHeading {
  id: string;
  text: string;
  depth: number;
}

interface ResponseOutlineProps {
  headings: OutlineHeading[];
  containerRef: HTMLElement;
}

export const ResponseOutline: Component<ResponseOutlineProps> = (props) => {
  const [visible, setVisible] = createSignal(false);

  const scrollTo = (id: string) => {
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(id)
        : id.replace(/[^a-zA-Z0-9_-]/g, '');
    const target = props.containerRef.querySelector(`#${escaped}`) as HTMLElement | null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      class="absolute top-2 right-2 z-10"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        class="w-6 h-6 rounded flex items-center justify-center transition-opacity opacity-40 hover:opacity-100"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-secondary)',
          color: 'var(--color-text-tertiary)',
        }}
        aria-label="Show table of contents"
        title="Table of contents"
      >
        <AlignLeft size={12} />
      </button>

      <Show when={visible()}>
        <nav
          class="absolute right-0 top-7 w-52 rounded-lg p-1.5 space-y-0.5"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            'box-shadow': '0 4px 16px rgba(0,0,0,0.3)',
          }}
          aria-label="Table of contents"
        >
          <For each={props.headings}>
            {(heading) => (
              <button
                class="block w-full text-left rounded px-2 py-1 text-[11px] truncate transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{
                  'padding-left': `${(heading.depth - 1) * 10 + 8}px`,
                  color:
                    heading.depth === 1
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                }}
                onClick={() => scrollTo(heading.id)}
              >
                {heading.text}
              </button>
            )}
          </For>
        </nav>
      </Show>
    </div>
  );
};
