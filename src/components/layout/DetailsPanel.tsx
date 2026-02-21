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
    <section class="border-b border-border-secondary">
      <button
        class="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider hover:bg-bg-elevated transition-colors"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open()}
      >
        <Show when={open()} fallback={<ChevronRight size={12} />}>
          <ChevronDown size={12} />
        </Show>
        {props.title}
      </button>
      <Show when={open()}>
        <div class="px-3 pb-3">{props.children}</div>
      </Show>
    </section>
  );
};

const DetailsPanel: Component = () => {
  return (
    <aside class="flex flex-col h-full overflow-y-auto" aria-label="Details panel">
      <CollapsibleSection title="Context">
        {/* Placeholder — ContextMeter goes here (CHI-22) */}
        <div class="flex items-center justify-between text-xs text-text-tertiary">
          <span>Tokens</span>
          <span class="font-mono">&ndash; / &ndash;</span>
        </div>
        <div class="mt-2 h-2 bg-bg-inset rounded-full overflow-hidden">
          <div class="h-full w-0 bg-success rounded-full" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Cost">
        {/* Placeholder — CostTracker details go here */}
        <div class="flex items-center justify-between text-xs text-text-tertiary">
          <span>Session total</span>
          <span class="font-mono">$0.00</span>
        </div>
      </CollapsibleSection>
    </aside>
  );
};

export default DetailsPanel;
