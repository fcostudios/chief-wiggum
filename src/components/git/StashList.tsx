// src/components/git/StashList.tsx
// Collapsible stash list with pop/drop actions (CHI-326).

import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import { Archive, ChevronRight } from 'lucide-solid';
import { dropStash, gitState, loadStashes, popStash } from '@/stores/gitStore';
import { addToast } from '@/stores/toastStore';

const StashList: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false);

  function handleToggle() {
    const next = !isOpen();
    setIsOpen(next);
    if (next) {
      void loadStashes();
    }
  }

  async function handlePop(index: number) {
    try {
      await popStash(index);
      addToast('Stash applied and dropped', 'success');
    } catch (err) {
      addToast(`Stash pop failed: ${String(err)}`, 'error');
    }
  }

  async function handleDrop(index: number) {
    try {
      await dropStash(index);
      addToast('Stash dropped', 'undo', {
        label: 'Undo',
        onClick: () => addToast('Stash drop cannot be undone at this time', 'info'),
      });
    } catch (err) {
      addToast(`Drop failed: ${String(err)}`, 'error');
    }
  }

  return (
    <div style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
      <button
        class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:opacity-80"
        onClick={handleToggle}
        aria-expanded={isOpen()}
      >
        <ChevronRight
          size={10}
          style={{
            transform: isOpen() ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
        <Archive size={11} style={{ color: 'var(--color-text-tertiary)' }} />
        <span
          class="text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Stashes
        </span>
        <Show when={gitState.stashes.length > 0}>
          <span
            class="ml-auto rounded-full px-1.5 text-[9px] font-semibold"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {gitState.stashes.length}
          </span>
        </Show>
      </button>

      <Show when={isOpen()}>
        <Show
          when={gitState.stashes.length > 0}
          fallback={
            <p class="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No stashes.
            </p>
          }
        >
          <For each={gitState.stashes}>
            {(stash) => (
              <div
                class="flex items-center gap-2 px-3 py-1"
                style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
              >
                <span
                  class="min-w-0 flex-1 truncate text-xs"
                  style={{ color: 'var(--color-text-primary)' }}
                  title={stash.message}
                >
                  {stash.message}
                </span>
                <button
                  class="shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-70"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-secondary)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                  title="Apply & Drop stash"
                  onClick={() => void handlePop(stash.index)}
                >
                  Pop
                </button>
                <button
                  class="shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-70"
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border-secondary)',
                    color: 'var(--color-error)',
                    cursor: 'pointer',
                  }}
                  title="Drop stash"
                  onClick={() => void handleDrop(stash.index)}
                >
                  Drop
                </button>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
};

export default StashList;
