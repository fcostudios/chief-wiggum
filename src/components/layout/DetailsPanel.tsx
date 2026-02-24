// src/components/layout/DetailsPanel.tsx
// Right details panel (280px) per SPEC-003 §2 Z4.
// Sections: Context Meter (placeholder), Cost Breakdown (placeholder).
// Each section is a collapsible accordion.

import type { Component, JSX } from 'solid-js';
import { createEffect, createSignal, Show } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';
import { sessionState } from '@/stores/sessionStore';
import { projectState } from '@/stores/projectStore';
import { fileState } from '@/stores/fileStore';
import { actionState } from '@/stores/actionStore';
import MarkdownContent from '@/components/conversation/MarkdownContent';
import FilePreview from '@/components/explorer/FilePreview';
import ActionOutputPanel from '@/components/actions/ActionOutputPanel';

interface SectionProps {
  id: string;
  title: string;
  children: JSX.Element;
  open: boolean;
  focused: boolean;
  onHeaderClick: () => void;
}

const CollapsibleSection: Component<SectionProps> = (props) => {
  return (
    <section
      class="flex flex-col shrink-0"
      classList={{ 'flex-1': props.open && props.focused, 'min-h-0': props.open && props.focused }}
      style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      data-section-id={props.id}
    >
      <button
        class="flex items-center gap-2 w-full px-3 py-2.5 text-left transition-colors"
        style={{
          'transition-duration': 'var(--duration-fast)',
          background: props.focused ? 'rgba(232, 130, 90, 0.07)' : 'transparent',
        }}
        onClick={() => props.onHeaderClick()}
        aria-expanded={props.open}
        onMouseEnter={(e) => {
          if (!props.focused) {
            e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = props.focused
            ? 'rgba(232, 130, 90, 0.07)'
            : 'transparent';
        }}
      >
        <Show
          when={props.open}
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
      <Show when={props.open}>
        <div
          class="px-3 pb-3 animate-fade-in"
          classList={{
            'flex-1': props.focused,
            'min-h-0': props.focused,
            'overflow-y-auto': props.focused,
            'overflow-x-hidden': props.focused,
          }}
          style={{
            'animation-duration': '150ms',
            'scrollbar-gutter': props.focused ? 'stable' : undefined,
            'overscroll-behavior': props.focused ? 'contain' : undefined,
          }}
        >
          {props.children}
        </div>
      </Show>
    </section>
  );
};

const DetailsPanel: Component = () => {
  const [focusedSectionId, setFocusedSectionId] = createSignal<string | null>(null);
  const [sectionOpenState, setSectionOpenState] = createSignal<Record<string, boolean>>({
    actionOutput: true,
    filePreview: true,
    projectContext: false,
    context: true,
    cost: true,
  });

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

  const isSectionOpen = (id: string, fallback = true) =>
    sectionOpenState()[id] ?? fallback;
  const isFocused = (id: string) => focusedSectionId() === id;

  function handleSectionHeaderClick(id: string, fallback = true) {
    const currentlyOpen = isSectionOpen(id, fallback);
    const currentlyFocused = isFocused(id);

    if (!currentlyOpen) {
      setSectionOpenState((prev) => ({ ...prev, [id]: true }));
      setFocusedSectionId(id);
      return;
    }

    if (!currentlyFocused) {
      setFocusedSectionId(id);
      return;
    }

    setSectionOpenState((prev) => ({ ...prev, [id]: false }));
    setFocusedSectionId((prev) => (prev === id ? null : prev));
  }

  createEffect(() => {
    const hasActionOutput = Boolean(actionState.selectedActionId);
    const hasFilePreview = Boolean(fileState.selectedPath && fileState.previewContent);
    const focused = focusedSectionId();

    if (focused === 'actionOutput' && !hasActionOutput) {
      setFocusedSectionId(null);
    }
    if (focused === 'filePreview' && !hasFilePreview && !fileState.isVisible) {
      setFocusedSectionId(null);
    }

    if (!focusedSectionId()) {
      if (hasActionOutput) {
        setFocusedSectionId('actionOutput');
      } else if (hasFilePreview) {
        setFocusedSectionId('filePreview');
      }
    }
  });

  return (
    <aside
      class="flex flex-col h-full min-h-0"
      classList={{
        'overflow-hidden': Boolean(focusedSectionId()),
        'overflow-y-auto': !focusedSectionId(),
      }}
      aria-label="Details panel"
    >
      <Show when={actionState.selectedActionId}>
        <CollapsibleSection
          id="actionOutput"
          title="Action Output"
          open={isSectionOpen('actionOutput')}
          focused={isFocused('actionOutput')}
          onHeaderClick={() => handleSectionHeaderClick('actionOutput')}
        >
          <div
            class="min-h-0"
            classList={{
              'h-[380px]': !isFocused('actionOutput'),
              'h-full': isFocused('actionOutput'),
              'min-h-0': isFocused('actionOutput'),
            }}
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <ActionOutputPanel />
          </div>
        </CollapsibleSection>
      </Show>

      <Show when={fileState.selectedPath && fileState.previewContent}>
        <CollapsibleSection
          id="filePreview"
          title="File Preview"
          open={isSectionOpen('filePreview')}
          focused={isFocused('filePreview')}
          onHeaderClick={() => handleSectionHeaderClick('filePreview')}
        >
          <div classList={{ 'h-full': isFocused('filePreview'), 'min-h-0': isFocused('filePreview') }}>
            <FilePreview
              content={fileState.previewContent!}
              isLoading={fileState.isPreviewLoading}
              fillHeight={isFocused('filePreview')}
            />
          </div>
        </CollapsibleSection>
      </Show>

      <Show when={!fileState.selectedPath && fileState.isVisible && projectState.activeProjectId}>
        <CollapsibleSection
          id="filePreview"
          title="File Preview"
          open={isSectionOpen('filePreview', false)}
          focused={isFocused('filePreview')}
          onHeaderClick={() => handleSectionHeaderClick('filePreview', false)}
        >
          <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Select a file from the sidebar to preview
          </p>
        </CollapsibleSection>
      </Show>

      <Show when={projectState.claudeMdContent}>
        <CollapsibleSection
          id="projectContext"
          title="Project Context"
          open={isSectionOpen('projectContext', false)}
          focused={isFocused('projectContext')}
          onHeaderClick={() => handleSectionHeaderClick('projectContext', false)}
        >
          <div
            class="text-xs"
            classList={{
              'h-full': isFocused('projectContext'),
              'min-h-0': isFocused('projectContext'),
              'overflow-y-auto': true,
              'max-h-48': !isFocused('projectContext'),
            }}
          >
            <MarkdownContent content={projectState.claudeMdContent!} />
          </div>
        </CollapsibleSection>
      </Show>

      <CollapsibleSection
        id="context"
        title="Context"
        open={isSectionOpen('context')}
        focused={isFocused('context')}
        onHeaderClick={() => handleSectionHeaderClick('context')}
      >
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

      <CollapsibleSection
        id="cost"
        title="Cost"
        open={isSectionOpen('cost')}
        focused={isFocused('cost')}
        onHeaderClick={() => handleSectionHeaderClick('cost')}
      >
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
