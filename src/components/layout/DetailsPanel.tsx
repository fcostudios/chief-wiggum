// src/components/layout/DetailsPanel.tsx
// Right details panel (280px) per SPEC-003 §2 Z4.
// Sections: Context Meter (placeholder), Cost Breakdown (placeholder).
// Each section is a collapsible accordion.

import type { Component, JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';
import { sessionState } from '@/stores/sessionStore';
import { projectState } from '@/stores/projectStore';
import { fileState } from '@/stores/fileStore';
import MarkdownContent from '@/components/conversation/MarkdownContent';
import FilePreview from '@/components/explorer/FilePreview';

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
  const activeSession = () =>
    sessionState.sessions.find((s) => s.id === sessionState.activeSessionId);

  const tokenDisplay = () => {
    const inp = activeSession()?.total_input_tokens;
    const out = activeSession()?.total_output_tokens;
    const inStr = inp ? `${(inp / 1000).toFixed(1)}K` : '\u2013';
    const outStr = out ? `${(out / 1000).toFixed(1)}K` : '\u2013';
    return `${inStr} / ${outStr}`;
  };

  const costDisplay = () => {
    const c = activeSession()?.total_cost_cents;
    return c ? `$${(c / 100).toFixed(2)}` : '$0.00';
  };

  return (
    <aside class="flex flex-col h-full overflow-y-auto" aria-label="Details panel">
      <Show when={fileState.selectedPath && fileState.previewContent}>
        <CollapsibleSection title="File Preview">
          <FilePreview content={fileState.previewContent!} isLoading={fileState.isPreviewLoading} />
        </CollapsibleSection>
      </Show>

      <Show when={!fileState.selectedPath && fileState.isVisible && projectState.activeProjectId}>
        <CollapsibleSection title="File Preview" defaultOpen={false}>
          <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Select a file from the sidebar to preview
          </p>
        </CollapsibleSection>
      </Show>

      <Show when={projectState.claudeMdContent}>
        <CollapsibleSection title="Project Context" defaultOpen={false}>
          <div class="text-xs max-h-48 overflow-y-auto">
            <MarkdownContent content={projectState.claudeMdContent!} />
          </div>
        </CollapsibleSection>
      </Show>

      <CollapsibleSection title="Context">
        <div
          class="flex items-center justify-between font-mono"
          style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
        >
          <span>Tokens</span>
          <span>{tokenDisplay()}</span>
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
          <span>{costDisplay()}</span>
        </div>
      </CollapsibleSection>
    </aside>
  );
};

export default DetailsPanel;
