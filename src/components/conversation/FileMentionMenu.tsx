// src/components/conversation/FileMentionMenu.tsx
// Inline autocomplete dropdown for @-file mentions.
// Appears above MessageInput when user types `@` in input.
// Mirrors SlashCommandMenu UX: keyboard nav, accent highlights.

import type { Component } from 'solid-js';
import { Show, For, createEffect } from 'solid-js';
import { File } from 'lucide-solid';
import type { FileSearchResult } from '@/lib/types';

interface FileMentionMenuProps {
  isOpen: boolean;
  results: FileSearchResult[];
  highlightedIndex: number;
  onSelect: (result: FileSearchResult) => void;
  onClose: () => void;
}

const FileMentionMenu: Component<FileMentionMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  // Scroll highlighted item into view
  createEffect(() => {
    if (!menuRef || !props.isOpen) return;
    const highlighted = menuRef.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });

  return (
    <Show when={props.isOpen && props.results.length > 0}>
      <div
        ref={menuRef}
        class="absolute bottom-full left-0 right-0 mb-1 max-h-[250px] overflow-y-auto rounded-lg z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': '0 -4px 16px rgba(0, 0, 0, 0.3)',
        }}
        role="listbox"
        aria-label="File mentions"
      >
        {/* Header */}
        <div
          class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-secondary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          Files
        </div>

        {/* Results */}
        <For each={props.results}>
          {(result, idx) => {
            const isHighlighted = () => idx() === props.highlightedIndex;

            return (
              <button
                class="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors"
                style={{
                  background: isHighlighted() ? 'var(--color-accent-muted)' : 'transparent',
                  'border-left': isHighlighted()
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                }}
                data-highlighted={isHighlighted()}
                role="option"
                aria-selected={isHighlighted()}
                onClick={() => props.onSelect(result)}
              >
                <File size={12} class="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                <span
                  class="text-xs font-mono font-medium truncate"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {result.name}
                </span>
                <span class="text-[10px] text-text-tertiary/50 truncate flex-1 text-right font-mono">
                  {result.relative_path}
                </span>
              </button>
            );
          }}
        </For>

        {/* Footer hint */}
        <div
          class="px-3 py-1.5 text-[10px] text-text-tertiary/40 flex items-center gap-3"
          style={{
            'border-top': '1px solid var(--color-border-secondary)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          <span>
            <kbd class="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd class="font-mono">↵</kbd> attach
          </span>
          <span>
            <kbd class="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </Show>
  );
};

export default FileMentionMenu;
