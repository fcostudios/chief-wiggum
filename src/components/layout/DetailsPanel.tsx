// src/components/layout/DetailsPanel.tsx
// Right details panel (280px) per SPEC-003 §2 Z4.
// Sections: Context Meter (placeholder), Cost Breakdown (placeholder).
// Each section is a collapsible accordion.

import type { Component, JSX } from 'solid-js';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ChevronRight } from 'lucide-solid';
import type { Artifact } from '@/lib/types';
import { loadSessionSummary, sessionState } from '@/stores/sessionStore';
import { projectState } from '@/stores/projectStore';
import { fileState } from '@/stores/fileStore';
import { actionState } from '@/stores/actionStore';
import MarkdownContent from '@/components/conversation/MarkdownContent';
import FilePreview from '@/components/explorer/FilePreview';
import ActionOutputPanel from '@/components/actions/ActionOutputPanel';

interface SectionProps {
  id: string;
  title: JSX.Element;
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
    history: false,
    artifacts: false,
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

  // History section state
  const sessionSummary = () =>
    sessionState.activeSessionId
      ? sessionState.sessionSummaries[sessionState.activeSessionId]
      : undefined;

  // Artifacts section state
  const [artifacts, setArtifacts] = createSignal<Artifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = createSignal(false);
  const [artifactSearch, setArtifactSearch] = createSignal('');

  async function loadArtifacts() {
    const sid = sessionState.activeSessionId;
    if (!sid) return;
    setArtifactsLoading(true);
    try {
      const result = await invoke<Artifact[]>('extract_session_artifacts', {
        session_id: sid,
      });
      setArtifacts(result);
    } catch {
      // Best-effort: fail silently and show empty state.
      setArtifacts([]);
    } finally {
      setArtifactsLoading(false);
    }
  }

  const filteredArtifacts = () => {
    const q = artifactSearch().toLowerCase().trim();
    if (!q) return artifacts();
    return artifacts().filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.language ?? '').toLowerCase().includes(q) ||
        a.preview.toLowerCase().includes(q),
    );
  };

  const isSectionOpen = (id: string, fallback = true) => sectionOpenState()[id] ?? fallback;
  const isFocused = (id: string) => focusedSectionId() === id;
  const filePreviewTitle = (
    <>
      File Preview
      <Show when={fileState.isDirty && fileState.editingFilePath === fileState.selectedPath}>
        <span
          class="ml-1 text-[8px]"
          style={{ color: 'var(--color-warning)' }}
          title="Unsaved changes"
          aria-label="Unsaved changes"
        >
          ●
        </span>
      </Show>
    </>
  );

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
          title={<>Action Output</>}
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
          title={filePreviewTitle}
          open={isSectionOpen('filePreview')}
          focused={isFocused('filePreview')}
          onHeaderClick={() => handleSectionHeaderClick('filePreview')}
        >
          <div
            classList={{ 'h-full': isFocused('filePreview'), 'min-h-0': isFocused('filePreview') }}
          >
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
          title={filePreviewTitle}
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
          title={<>Project Context</>}
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
        title={<>Context</>}
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
        title={<>Cost</>}
        open={isSectionOpen('cost')}
        focused={isFocused('cost')}
        onHeaderClick={() => handleSectionHeaderClick('cost')}
      >
        <div
          class="flex items-center justify-between font-mono"
          style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
        >
          <span>Session total</span>
          <span style={{ color: 'var(--color-text-primary)' }}>{costDisplay()}</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="history"
        title={<>History</>}
        open={isSectionOpen('history', false)}
        focused={isFocused('history')}
        onHeaderClick={() => {
          handleSectionHeaderClick('history', false);
          if (!sessionSummary() && sessionState.activeSessionId) {
            void loadSessionSummary(sessionState.activeSessionId);
          }
        }}
      >
        <Show
          when={sessionSummary()}
          fallback={
            <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Loading…
            </p>
          }
        >
          {(summary) => (
            <div class="space-y-1.5">
              <For
                each={
                  [
                    ['Messages', summary().message_count],
                    ['Tool calls', summary().tool_count],
                    ['Artifacts', summary().artifact_count],
                    [
                      'Duration',
                      summary().duration_secs < 60
                        ? `${summary().duration_secs}s`
                        : `${Math.floor(summary().duration_secs / 60)}m`,
                    ],
                  ] as [string, string | number][]
                }
              >
                {([label, value]) => (
                  <div
                    class="flex items-center justify-between font-mono"
                    style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
                  >
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                )}
              </For>
              <Show when={summary().models_used.length > 0}>
                <div
                  class="flex flex-wrap gap-1 pt-1"
                  style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
                >
                  <For each={summary().models_used}>
                    {(model) => (
                      <span
                        class="text-[9px] px-1 py-0.5 rounded font-mono"
                        style={{
                          background: 'var(--color-bg-elevated)',
                          color: 'var(--color-text-tertiary)',
                          border: '1px solid var(--color-border-secondary)',
                        }}
                      >
                        {model}
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </CollapsibleSection>

      <CollapsibleSection
        id="artifacts"
        title={
          <>
            Artifacts
            <Show when={artifacts().length > 0}>
              <span
                class="ml-1 px-1 py-0.5 rounded text-[8px] font-mono"
                style={{
                  background: 'rgba(232, 130, 90, 0.12)',
                  color: 'var(--color-accent)',
                }}
              >
                {artifacts().length}
              </span>
            </Show>
          </>
        }
        open={isSectionOpen('artifacts', false)}
        focused={isFocused('artifacts')}
        onHeaderClick={() => {
          const wasOpen = isSectionOpen('artifacts', false);
          handleSectionHeaderClick('artifacts', false);
          if (!wasOpen && artifacts().length === 0) {
            void loadArtifacts();
          }
        }}
      >
        <Show when={artifactsLoading()}>
          <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Extracting…
          </p>
        </Show>
        <Show when={!artifactsLoading()}>
          <Show when={artifacts().length === 0}>
            <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No code blocks found in this session yet.
            </p>
          </Show>
          <Show when={artifacts().length > 0}>
            <input
              type="search"
              placeholder="Search artifacts…"
              value={artifactSearch()}
              onInput={(e) => setArtifactSearch(e.currentTarget.value)}
              class="w-full text-xs px-2 py-1 rounded mb-2"
              style={{
                background: 'var(--color-bg-inset)',
                border: '1px solid var(--color-border-secondary)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
            <div class="space-y-1.5">
              <For each={filteredArtifacts()}>
                {(artifact) => (
                  <div
                    class="rounded px-2 py-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-secondary)',
                    }}
                    title={`${artifact.type} · ${artifact.line_count} lines`}
                  >
                    <div class="flex items-center gap-1.5 mb-0.5">
                      <Show when={artifact.language}>
                        <span
                          class="text-[8px] font-mono px-1 py-0.5 rounded shrink-0"
                          style={{
                            background: 'var(--color-bg-inset)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {artifact.language}
                        </span>
                      </Show>
                      <span
                        class="text-[10px] font-medium truncate"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {artifact.title}
                      </span>
                    </div>
                    <p
                      class="text-[9px] font-mono truncate"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {artifact.preview}
                    </p>
                  </div>
                )}
              </For>
              <Show when={filteredArtifacts().length === 0 && artifactSearch()}>
                <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  No matches for "{artifactSearch()}"
                </p>
              </Show>
            </div>
          </Show>
        </Show>
      </CollapsibleSection>
    </aside>
  );
};

export default DetailsPanel;
