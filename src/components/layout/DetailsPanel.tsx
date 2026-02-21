// src/components/layout/DetailsPanel.tsx
// Right details panel (280px) per SPEC-003 §2 Z4.
// Sections: Context Meter (placeholder), Cost Breakdown (placeholder).
// Each section is a collapsible accordion.

import type { Component, JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';

interface SectionProps {
  title: string;
  children: JSX.Element;
  defaultOpen?: boolean;
}

const CollapsibleSection: Component<SectionProps> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);

  return (
    <section style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
      <button
        class="flex items-center gap-2 w-full px-3 py-2.5 text-left transition-colors"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open()}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Show
          when={open()}
          fallback={<ChevronRight size={11} style={{ color: 'var(--color-text-tertiary)' }} />}
        >
          <ChevronDown size={11} style={{ color: 'var(--color-text-tertiary)' }} />
        </Show>
        <span
          class="font-semibold uppercase"
          style={{
            'font-size': '10px',
            color: 'var(--color-text-tertiary)',
            'letter-spacing': '0.1em',
          }}
        >
          {props.title}
        </span>
      </button>
      <Show when={open()}>
        <div class="px-3 pb-3 animate-fade-in" style={{ 'animation-duration': '150ms' }}>
          {props.children}
        </div>
      </Show>
    </section>
  );
};

const DetailsPanel: Component = () => {
  return (
    <aside class="flex flex-col h-full overflow-y-auto" aria-label="Details panel">
      <CollapsibleSection title="Context">
        <div
          class="flex items-center justify-between font-mono"
          style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
        >
          <span>Tokens</span>
          <span>&ndash; / &ndash;</span>
        </div>
        <div
          class="mt-2.5 h-1.5 rounded-full overflow-hidden"
          style={{ background: 'var(--color-bg-inset)' }}
        >
          <div
            class="h-full w-0 rounded-full transition-all"
            style={{
              background: 'var(--color-success)',
              'transition-duration': 'var(--duration-slow)',
              'box-shadow': '0 0 4px rgba(63, 185, 80, 0.3)',
            }}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Cost">
        <div
          class="flex items-center justify-between font-mono"
          style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
        >
          <span>Session total</span>
          <span>$0.00</span>
        </div>
      </CollapsibleSection>
    </aside>
  );
};

export default DetailsPanel;
