// src/components/common/HintTooltip.tsx
// CHI-228: Dismissible contextual hint tooltip.

import type { Component } from 'solid-js';
import { Show, createSignal } from 'solid-js';
import { X } from 'lucide-solid';

interface HintTooltipProps {
  /** Unique hint ID for analytics/dedup compatibility. */
  id: string;
  /** Hint text shown in the tooltip body. */
  text: string;
  /** Optional shortcut badge (for example "Cmd+/"). */
  shortcut?: string;
  /** Called when user dismisses the hint. */
  onDismiss: () => void;
}

export const HintTooltip: Component<HintTooltipProps> = (props) => {
  const [visible, setVisible] = createSignal(true);

  function dismiss(): void {
    setVisible(false);
    props.onDismiss();
  }

  return (
    <Show when={visible()}>
      <div
        class="rounded-lg px-3 py-2.5 shadow-lg max-w-[240px] animate-fade-in relative"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-secondary)',
          color: 'var(--color-text-primary)',
          'font-size': '11px',
          'line-height': '1.5',
        }}
        role="tooltip"
        aria-live="polite"
        data-hint-id={props.id}
      >
        <div
          class="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: '-5px',
            width: '10px',
            height: '5px',
            background: 'var(--color-bg-elevated)',
            'clip-path': 'polygon(0 0, 100% 0, 50% 100%)',
          }}
          aria-hidden="true"
        />

        <div class="flex items-start gap-2">
          <p class="flex-1">{props.text}</p>
          <button
            class="shrink-0 mt-0.5 rounded p-0.5 hover:opacity-70 transition-opacity"
            style={{ color: 'var(--color-text-secondary)' }}
            onClick={dismiss}
            aria-label="Dismiss hint"
          >
            <X size={11} />
          </button>
        </div>

        <Show when={props.shortcut}>
          <kbd
            class="mt-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-mono"
            style={{
              background: 'var(--color-bg-inset)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-secondary)',
            }}
          >
            {props.shortcut}
          </kbd>
        </Show>
      </div>
    </Show>
  );
};
