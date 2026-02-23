// src/components/actions/ActionOutputPanel.tsx
// Streaming output display for a selected action (CHI-143).

import type { Component } from 'solid-js';
import { For, Show, createEffect } from 'solid-js';
import { Copy, Trash2, ArrowDown } from 'lucide-solid';
import {
  actionState,
  getActionOutput,
  getActionStatus,
  clearActionOutput,
} from '@/stores/actionStore';

/** Strip common ANSI escape codes for clean display. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

const ActionOutputPanel: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  let shouldAutoScroll = true;

  const actionId = () => actionState.selectedActionId;
  const output = () => (actionId() ? getActionOutput(actionId()!) : []);
  const status = () => (actionId() ? getActionStatus(actionId()!) : 'idle');

  createEffect(() => {
    void output().length;
    if (shouldAutoScroll && scrollRef) {
      requestAnimationFrame(() => {
        if (scrollRef) {
          scrollRef.scrollTop = scrollRef.scrollHeight;
        }
      });
    }
  });

  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }

  function handleCopy() {
    const text = output()
      .map((line) => stripAnsi(line.line))
      .join('\n');
    void navigator.clipboard.writeText(text);
  }

  function handleClear() {
    const id = actionId();
    if (id) clearActionOutput(id);
  }

  function scrollToBottom() {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
      shouldAutoScroll = true;
    }
  }

  return (
    <div class="flex flex-col h-full">
      <div
        class="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="text-xs font-mono font-medium truncate max-w-[140px]"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {actionId() ?? 'No action'}
          </span>
          <Show when={status() !== 'idle'}>
            <span
              class="text-[9px] font-mono px-1 py-0.5 rounded"
              style={{
                background:
                  status() === 'running'
                    ? 'rgba(63, 185, 80, 0.15)'
                    : 'var(--color-bg-elevated)',
                color:
                  status() === 'running'
                    ? 'var(--color-success)'
                    : status() === 'failed'
                      ? 'var(--color-error)'
                      : 'var(--color-text-tertiary)',
              }}
            >
              {status()}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <ArrowDown size={11} />
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleCopy}
            aria-label="Copy output"
            title="Copy"
          >
            <Copy size={11} />
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-error transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleClear}
            aria-label="Clear output"
            title="Clear"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto overflow-x-auto"
        style={{
          background: 'var(--color-bg-inset)',
          'font-family': 'var(--font-mono)',
          'font-size': '11px',
          'line-height': '1.5',
        }}
        onScroll={handleScroll}
      >
        <Show
          when={output().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Run an action to see output
              </p>
            </div>
          }
        >
          <div class="p-2">
            <For each={output()}>
              {(line) => (
                <div
                  class="whitespace-pre-wrap break-all"
                  style={{
                    color: line.is_error ? 'var(--color-error)' : 'var(--color-text-secondary)',
                  }}
                >
                  {stripAnsi(line.line)}
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionOutputPanel;
