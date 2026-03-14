// src/components/terminal/TerminalTabs.tsx
// Tab bar for multi-terminal sessions (CHI-336).

import type { Component } from 'solid-js';
import { For } from 'solid-js';
import { Plus, X } from 'lucide-solid';
import type { TerminalSession } from '@/stores/terminalStore';

interface Props {
  sessions: TerminalSession[];
  activeId: string | null;
  onSelect: (terminalId: string) => void;
  onClose: (terminalId: string) => void;
  onNew: () => void;
}

const TerminalTabs: Component<Props> = (props) => {
  const focusableIds = () => props.sessions.map((session) => session.terminal_id);

  function selectRelative(currentId: string, offset: number): void {
    const ids = focusableIds();
    const currentIndex = ids.indexOf(currentId);
    if (currentIndex === -1 || ids.length === 0) return;
    const nextIndex = (currentIndex + offset + ids.length) % ids.length;
    props.onSelect(ids[nextIndex]);
  }

  return (
    <div
      role="tablist"
      aria-label="Terminal tabs"
      class="flex shrink-0 items-center overflow-x-auto"
      style={{
        'min-height': '32px',
        background: 'var(--color-bg-primary)',
        'border-bottom': '1px solid var(--color-border-secondary)',
      }}
    >
      <For each={props.sessions}>
        {(session) => {
          const label = session.title ?? session.shell.split('/').pop() ?? 'Terminal';
          const isActive = () => props.activeId === session.terminal_id;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive()}
              class="flex shrink-0 items-center gap-1 px-3 py-1 text-xs transition-colors"
              style={{
                color: isActive() ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                background: isActive() ? 'var(--color-bg-elevated)' : 'transparent',
                'border-right': '1px solid var(--color-border-secondary)',
                'border-bottom': isActive()
                  ? '2px solid var(--color-accent)'
                  : '2px solid transparent',
              }}
              onClick={() => props.onSelect(session.terminal_id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  selectRelative(session.terminal_id, 1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  selectRelative(session.terminal_id, -1);
                }
              }}
              title={`${label} — ${session.cwd}`}
            >
              <span>{label}</span>
              {session.status === 'exited' && (
                <span style={{ color: 'var(--color-text-tertiary)' }}>[exited]</span>
              )}
              <span
                role="button"
                tabindex={0}
                class="ml-1 rounded p-0.5 transition-opacity hover:opacity-80"
                style={{ color: 'var(--color-text-tertiary)' }}
                aria-label={`Close terminal ${session.terminal_id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onClose(session.terminal_id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onClose(session.terminal_id);
                  }
                }}
              >
                <X size={10} />
              </span>
            </button>
          );
        }}
      </For>
      <button
        type="button"
        class="flex shrink-0 items-center px-2 py-1 transition-opacity hover:opacity-80"
        style={{ color: 'var(--color-text-tertiary)' }}
        aria-label="New terminal"
        title="New terminal"
        onClick={() => props.onNew()}
      >
        <Plus size={12} />
      </button>
    </div>
  );
};

export default TerminalTabs;
