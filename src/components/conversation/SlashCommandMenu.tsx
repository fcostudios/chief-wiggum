// src/components/conversation/SlashCommandMenu.tsx
// Inline autocomplete dropdown for slash commands.
// Appears above MessageInput when user types `/` at start of input.
// Per CHI-107: categorized, fuzzy-searchable, keyboard-navigable.

import type { Component } from 'solid-js';
import { Show, For, createMemo, createEffect } from 'solid-js';
import type { SlashCommand } from '@/lib/types';

interface SlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashCommand[];
  highlightedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

/** Group commands by category for sectioned display. */
function groupByCategory(commands: SlashCommand[]): { label: string; commands: SlashCommand[] }[] {
  const groups: { label: string; category: string; commands: SlashCommand[] }[] = [
    { label: 'Built-in', category: 'Builtin', commands: [] },
    { label: 'SDK / MCP', category: 'Sdk', commands: [] },
    { label: 'Project', category: 'Project', commands: [] },
    { label: 'User', category: 'User', commands: [] },
  ];

  for (const cmd of commands) {
    const group = groups.find((g) => g.category === cmd.category);
    if (group) group.commands.push(cmd);
  }

  return groups.filter((g) => g.commands.length > 0);
}

const SlashCommandMenu: Component<SlashCommandMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  const groups = createMemo(() => groupByCategory(props.commands));

  // Scroll highlighted item into view
  createEffect(() => {
    if (!menuRef || !props.isOpen) return;
    const highlighted = menuRef.querySelector('[data-highlighted="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  });

  // Build a flat index so we can match highlightedIndex to items across groups
  const flatIndex = (groupIdx: number, itemIdx: number): number => {
    let offset = 0;
    const g = groups();
    for (let i = 0; i < groupIdx; i++) {
      offset += g[i].commands.length;
    }
    return offset + itemIdx;
  };

  return (
    <Show when={props.isOpen && props.commands.length > 0}>
      <div
        ref={menuRef}
        class="absolute bottom-full left-0 right-0 mb-1 max-h-[300px] overflow-y-auto rounded-lg z-50"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': '0 -4px 16px rgba(0, 0, 0, 0.3)',
        }}
        role="listbox"
        aria-label="Slash commands"
      >
        <For each={groups()}>
          {(group, groupIdx) => (
            <div>
              {/* Section header */}
              <div
                class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  color: 'var(--color-text-tertiary)',
                  background: 'var(--color-bg-secondary)',
                  'border-bottom': '1px solid var(--color-border-secondary)',
                }}
              >
                {group.label}
              </div>

              {/* Command items */}
              <For each={group.commands}>
                {(cmd, itemIdx) => {
                  const isHighlighted = () =>
                    flatIndex(groupIdx(), itemIdx()) === props.highlightedIndex;

                  return (
                    <button
                      class="w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors"
                      style={{
                        background: isHighlighted() ? 'var(--color-accent-muted)' : 'transparent',
                        'border-left': isHighlighted()
                          ? '2px solid var(--color-accent)'
                          : '2px solid transparent',
                      }}
                      data-highlighted={isHighlighted()}
                      role="option"
                      aria-selected={isHighlighted()}
                      onClick={() => props.onSelect(cmd)}
                    >
                      <span
                        class="text-xs font-mono font-medium shrink-0"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        /{cmd.name}
                      </span>
                      <Show when={cmd.args_hint}>
                        <span class="text-[11px] text-text-tertiary/50 font-mono">
                          {cmd.args_hint}
                        </span>
                      </Show>
                      <span class="text-[11px] text-text-tertiary truncate">{cmd.description}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          )}
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
            <kbd class="font-mono">↵</kbd> select
          </span>
          <span>
            <kbd class="font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </Show>
  );
};

export default SlashCommandMenu;
