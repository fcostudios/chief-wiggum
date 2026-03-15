// src/components/terminal/TerminalTabs.tsx
// Tab bar for multi-terminal sessions — rename, drag reorder, overflow scroll (CHI-337).

import type { Component } from 'solid-js';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-solid';
import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import type { TerminalSession } from '@/stores/terminalStore';

interface Props {
  sessions: TerminalSession[];
  activeId: string | null;
  onSelect: (terminalId: string) => void;
  onClose: (terminalId: string) => void;
  onNew: () => void;
  onRename: (terminalId: string, newTitle: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}

const TerminalTabs: Component<Props> = (props) => {
  let scrollRef: HTMLDivElement | undefined;
  const [canScrollLeft, setCanScrollLeft] = createSignal(false);
  const [canScrollRight, setCanScrollRight] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingValue, setEditingValue] = createSignal('');
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dragOverId, setDragOverId] = createSignal<string | null>(null);

  function updateScrollState(): void {
    if (!scrollRef) return;
    setCanScrollLeft(scrollRef.scrollLeft > 0);
    setCanScrollRight(scrollRef.scrollLeft + scrollRef.clientWidth < scrollRef.scrollWidth - 1);
  }

  onMount(() => {
    if (!scrollRef) return;
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(scrollRef);
    scrollRef.addEventListener('scroll', updateScrollState, { passive: true });
    onCleanup(() => {
      resizeObserver?.disconnect();
      scrollRef?.removeEventListener('scroll', updateScrollState);
    });
    updateScrollState();
  });

  createEffect(() => {
    const activeId = props.activeId;
    if (!activeId || !scrollRef) return;
    const tabEl = scrollRef.querySelector(
      `[data-terminal-id="${CSS.escape(activeId)}"]`,
    ) as HTMLElement | null;
    tabEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  function startRename(session: TerminalSession): void {
    const label = session.title ?? session.shell.split('/').pop() ?? 'Terminal';
    setEditingValue(label);
    setEditingId(session.terminal_id);
  }

  function commitRename(terminalId: string): void {
    const value = editingValue().trim();
    if (value) props.onRename(terminalId, value);
    setEditingId(null);
  }

  function cancelRename(): void {
    setEditingId(null);
  }

  function selectRelative(currentId: string, offset: number): void {
    const ids = props.sessions.map((session) => session.terminal_id);
    const idx = ids.indexOf(currentId);
    if (idx === -1) return;
    props.onSelect(ids[(idx + offset + ids.length) % ids.length]);
  }

  return (
    <div
      role="tablist"
      aria-label="Terminal sessions"
      class="flex shrink-0 items-center"
      style={{
        'min-height': '32px',
        background: 'var(--color-bg-primary)',
        'border-bottom': '1px solid var(--color-border-secondary)',
      }}
    >
      <Show when={canScrollLeft()}>
        <button
          type="button"
          class="flex shrink-0 items-center px-1 py-1 transition-opacity hover:opacity-80"
          style={{ color: 'var(--color-text-tertiary)' }}
          aria-label="Scroll tabs left"
          onClick={() => scrollRef?.scrollBy({ left: -100, behavior: 'smooth' })}
        >
          <ChevronLeft size={12} />
        </button>
      </Show>

      <div
        ref={scrollRef}
        class="flex flex-1 items-center"
        style={{ 'overflow-x': 'hidden' }}
      >
        <For each={props.sessions}>
          {(session) => {
            const label = () => session.title ?? session.shell.split('/').pop() ?? 'Terminal';
            const isActive = () => props.activeId === session.terminal_id;
            const isEditing = () => editingId() === session.terminal_id;
            const isDragOver = () => dragOverId() === session.terminal_id;

            return (
              <button
                id={`terminal-tab-${session.terminal_id}`}
                type="button"
                role="tab"
                aria-selected={isActive()}
                aria-label={`${label()}, ${session.status === 'running' ? 'running' : 'exited'}`}
                data-terminal-id={session.terminal_id}
                draggable={!isEditing()}
                class="flex shrink-0 items-center gap-1 px-3 py-1 text-xs transition-colors"
                style={{
                  color: isActive() ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  background: isActive() ? 'var(--color-bg-elevated)' : 'transparent',
                  'border-right': isDragOver()
                    ? '2px solid var(--color-accent)'
                    : '1px solid var(--color-border-secondary)',
                  'border-bottom': isActive()
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                }}
                onClick={() => {
                  if (!isEditing()) props.onSelect(session.terminal_id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    selectRelative(session.terminal_id, 1);
                  }
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    selectRelative(session.terminal_id, -1);
                  }
                }}
                onDragStart={() => setDraggingId(session.terminal_id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverId(session.terminal_id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = draggingId();
                  if (from && from !== session.terminal_id) {
                    props.onReorder(from, session.terminal_id);
                  }
                  setDragOverId(null);
                }}
                title={`${label()} — ${session.cwd}`}
              >
                <Show
                  when={isEditing()}
                  fallback={
                    <span
                      aria-label={`Rename terminal ${session.terminal_id}`}
                      onDblClick={(event) => {
                        event.stopPropagation();
                        startRename(session);
                      }}
                    >
                      {label()}
                    </span>
                  }
                >
                  <input
                    data-rename-input
                    class="w-20 rounded border bg-transparent px-0.5 text-xs outline-none"
                    style={{
                      'border-color': 'var(--color-accent)',
                      color: 'var(--color-text-primary)',
                    }}
                    value={editingValue()}
                    onInput={(event) => setEditingValue(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') commitRename(session.terminal_id);
                      if (event.key === 'Escape') cancelRename();
                    }}
                    onBlur={() => commitRename(session.terminal_id)}
                    ref={(element) => {
                      if (element) {
                        setTimeout(() => {
                          element.focus();
                          element.select();
                        }, 0);
                      }
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </Show>

                <Show when={session.status === 'exited'}>
                  <span style={{ color: 'var(--color-text-tertiary)', 'font-size': '10px' }}>
                    [exited]
                  </span>
                </Show>

                <span
                  role="button"
                  tabindex={0}
                  class="ml-1 rounded p-0.5 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  aria-label={`Close terminal session: ${label()}`}
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
      </div>

      <Show when={canScrollRight()}>
        <button
          type="button"
          class="flex shrink-0 items-center px-1 py-1 transition-opacity hover:opacity-80"
          style={{ color: 'var(--color-text-tertiary)' }}
          aria-label="Scroll tabs right"
          onClick={() => scrollRef?.scrollBy({ left: 100, behavior: 'smooth' })}
        >
          <ChevronRight size={12} />
        </button>
      </Show>

      <button
        type="button"
        class="flex shrink-0 items-center px-2 py-1 transition-opacity hover:opacity-80"
        style={{ color: 'var(--color-text-tertiary)' }}
        aria-label="Open new terminal session"
        title="New terminal (Cmd+Shift+T)"
        onClick={() => props.onNew()}
      >
        <Plus size={12} />
      </button>
    </div>
  );
};

export default TerminalTabs;
