import type { Component } from 'solid-js';
import { For, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X } from 'lucide-solid';
import { closeKeyboardHelp } from '@/stores/uiStore';
import { createFocusTrap } from '@/lib/focusTrap';

interface Shortcut {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  category: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: 'Cmd+1/2/3/4', description: 'Switch view tabs' },
      { keys: 'Cmd+B', description: 'Toggle sidebar' },
      { keys: 'Cmd+Shift+B', description: 'Toggle details panel' },
      { keys: 'Cmd+\\', description: 'Split / unsplit conversation view' },
      { keys: 'Cmd+W', description: 'Close focused split pane (split mode)' },
    ],
  },
  {
    category: 'Commands',
    shortcuts: [
      { keys: 'Cmd+K', description: 'Command palette' },
      { keys: 'Cmd+Shift+P', description: 'Session quick-switcher' },
      { keys: 'Cmd+Shift+R', description: 'Action runner palette' },
      { keys: 'Cmd+/', description: 'Keyboard shortcuts help' },
      { keys: 'Cmd+,', description: 'Open settings' },
    ],
  },
  {
    category: 'Conversation',
    shortcuts: [
      { keys: 'Enter', description: 'Send message' },
      { keys: 'Shift+Enter', description: 'Insert newline' },
      { keys: 'Cmd+Shift+T', description: 'Context breakdown modal' },
      { keys: 'Cmd+M', description: 'Cycle model' },
    ],
  },
  {
    category: 'Runtime & Diagnostics',
    shortcuts: [
      { keys: 'Cmd+`', description: 'Toggle terminal view' },
      { keys: 'Cmd+Shift+Y', description: 'Toggle YOLO mode' },
      { keys: 'Cmd+Shift+F12', description: 'Toggle Developer mode' },
      { keys: 'Cmd+Shift+D', description: 'Copy debug info' },
      { keys: 'Cmd+Shift+.', description: 'Stop all running actions' },
    ],
  },
];

const KeyboardHelp: Component = () => {
  let dialogRef: HTMLDivElement | undefined;
  let cleanupTrap: (() => void) | undefined;

  onMount(() => {
    if (dialogRef) {
      cleanupTrap = createFocusTrap(dialogRef);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeKeyboardHelp();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown, true);
      cleanupTrap?.();
    });
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[65] animate-fade-in"
        style={{ background: 'rgba(0, 0, 0, 0.6)', 'backdrop-filter': 'blur(4px)' }}
        onClick={closeKeyboardHelp}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        class="fixed z-[66] top-1/2 left-1/2 w-[min(560px,92vw)] max-h-[75vh] -translate-x-1/2 -translate-y-1/2 rounded-lg overflow-hidden animate-fade-in"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-lg)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          class="flex items-center justify-between px-4 py-3"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <div>
            <h2 class="text-sm font-semibold text-text-primary tracking-wide">Keyboard Shortcuts</h2>
            <p class="text-[11px] text-text-tertiary mt-0.5">
              Power-user shortcuts available in the current UI
            </p>
          </div>
          <button
            class="p-1 rounded hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={closeKeyboardHelp}
            aria-label="Close keyboard shortcuts"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div class="overflow-y-auto p-4 space-y-4" style={{ 'max-height': 'calc(75vh - 62px)' }}>
          <For each={SHORTCUTS}>
            {(group) => (
              <section>
                <h3 class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em] mb-2">
                  {group.category}
                </h3>
                <div class="space-y-1.5">
                  <For each={group.shortcuts}>
                    {(shortcut) => (
                      <div class="flex items-center justify-between gap-3 py-1">
                        <span class="text-xs text-text-secondary">{shortcut.description}</span>
                        <kbd
                          class="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            background: 'var(--color-bg-inset)',
                            border: '1px solid var(--color-border-secondary)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {shortcut.keys}
                        </kbd>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </div>
    </Portal>
  );
};

export default KeyboardHelp;

