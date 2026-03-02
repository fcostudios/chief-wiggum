// src/components/conversation/FileMentionMenu.tsx
// Inline autocomplete dropdown for @-file and @symbol mentions.

import type { Component } from 'solid-js';
import { Show, For, createEffect } from 'solid-js';
import { File, Code, Box, Hash } from 'lucide-solid';
import type { FileSearchResult, SymbolSearchResult } from '@/lib/types';

interface FileMentionMenuProps {
  isOpen: boolean;
  results: FileSearchResult[];
  symbolResults?: SymbolSearchResult[];
  highlightedIndex: number;
  bundleHints?: Record<string, string>;
  mode?: 'file' | 'symbol';
  onSelect: (result: FileSearchResult) => void;
  onSelectSymbol?: (result: SymbolSearchResult) => void;
  onClose: () => void;
}

function SymbolKindIcon(props: { kind: string }) {
  return (
    <Show
      when={props.kind === 'class'}
      fallback={
        <Show
          when={props.kind === 'variable'}
          fallback={<Code size={12} style={{ color: 'var(--color-text-tertiary)' }} />}
        >
          <Hash size={12} style={{ color: 'var(--color-text-tertiary)' }} />
        </Show>
      }
    >
      <Box size={12} style={{ color: 'var(--color-text-tertiary)' }} />
    </Show>
  );
}

const FileMentionMenu: Component<FileMentionMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!menuRef || !props.isOpen) return;
    const highlighted = menuRef.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });

  const isSymbolMode = () => props.mode === 'symbol';
  const activeResults = () => (isSymbolMode() ? (props.symbolResults ?? []) : props.results);
  const hasResults = () => activeResults().length > 0;

  return (
    <Show when={props.isOpen && hasResults()}>
      <div
        ref={menuRef}
        class="absolute bottom-full left-0 right-0 mb-1 max-h-[250px] overflow-y-auto rounded-lg z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': '0 -4px 16px rgba(0, 0, 0, 0.3)',
        }}
        role="listbox"
        aria-label={isSymbolMode() ? 'Symbol mentions' : 'File mentions'}
      >
        <div
          class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-secondary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          {isSymbolMode() ? 'Symbols' : 'Files'}
        </div>

        <Show when={isSymbolMode()}>
          <For each={props.symbolResults ?? []}>
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
                  onClick={() => props.onSelectSymbol?.(result)}
                >
                  <SymbolKindIcon kind={result.kind} />
                  <span
                    class="text-xs font-mono font-medium truncate"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {result.name}
                  </span>
                  <span
                    class="text-[10px] truncate flex-1 text-right font-mono"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {result.file_path}:{result.line_number}
                  </span>
                </button>
              );
            }}
          </For>
        </Show>

        <Show when={!isSymbolMode()}>
          <For each={props.results}>
            {(result, idx) => {
              const isHighlighted = () => idx() === props.highlightedIndex;
              return (
                <div>
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
                    <File
                      size={12}
                      class="shrink-0"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    />
                    <span
                      class="text-xs font-mono font-medium truncate"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {result.name}
                    </span>
                    <span
                      class="text-[10px] truncate flex-1 text-right font-mono"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {result.relative_path}
                    </span>
                  </button>
                  <Show when={props.bundleHints?.[result.relative_path]}>
                    {(hint) => (
                      <div
                        class="px-3 pb-1 text-[10px] font-mono"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        Bundle: {hint()}
                      </div>
                    )}
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>

        <div
          class="px-3 py-1.5 text-[10px] flex items-center gap-3"
          style={{
            color: 'var(--color-text-tertiary)',
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
