// src/components/actions/ActionsPanel.tsx
// Actions panel for sidebar per CHI-142. Groups actions by source.

import type { Component } from 'solid-js';
import { For, Show, createSignal, createMemo } from 'solid-js';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-solid';
import { actionState, saveCustomAction } from '@/stores/actionStore';
import { getActiveProject } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';
import type { ActionDefinition, ActionSource, CustomActionDraft } from '@/lib/types';
import ActionRow from './ActionRow';
import ActionEditor from './ActionEditor';

const SOURCE_ORDER: ActionSource[] = [
  'package_json',
  'cargo_toml',
  'makefile',
  'docker_compose',
  'claude_actions',
];

function sourceLabel(source: ActionSource): string {
  switch (source) {
    case 'package_json':
      return 'npm scripts';
    case 'makefile':
      return 'make targets';
    case 'cargo_toml':
      return 'cargo';
    case 'docker_compose':
      return 'docker compose';
    case 'claude_actions':
      return 'custom actions';
  }
}

const ActionsPanel: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<ActionSource>>(new Set());
  const [isAddingAction, setIsAddingAction] = createSignal(false);
  const [isSavingAction, setIsSavingAction] = createSignal(false);

  const groupedActions = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const groups = new Map<ActionSource, ActionDefinition[]>();

    for (const source of SOURCE_ORDER) {
      const matching = actionState.actions.filter(
        (a) =>
          a.source === source &&
          (query === '' ||
            a.name.toLowerCase().includes(query) ||
            (a.description ?? '').toLowerCase().includes(query)),
      );
      if (matching.length > 0) {
        groups.set(source, matching);
      }
    }

    return groups;
  });

  function toggleGroup(source: ActionSource) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  }

  async function handleSaveAction(draft: CustomActionDraft) {
    const activeProject = getActiveProject();
    if (!activeProject) {
      addToast('Select a project before creating a custom action', 'warning');
      return;
    }

    setIsSavingAction(true);
    try {
      await saveCustomAction(activeProject.path, {
        ...draft,
        working_dir: draft.working_dir.trim() || activeProject.path,
      });
      setIsAddingAction(false);
      addToast(`Saved custom action: ${draft.name}`, 'success');
    } catch (err) {
      addToast(
        `Failed to save action: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setIsSavingAction(false);
    }
  }

  return (
    <div class="flex flex-col h-full">
      <div class="px-2 py-2" style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-md"
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <Search size={11} style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="Filter actions..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="flex-1 bg-transparent text-xs outline-none"
            style={{
              color: 'var(--color-text-primary)',
              'font-family': 'var(--font-mono)',
            }}
          />
        </div>

        <button
          class="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            background: isAddingAction() ? 'var(--color-bg-elevated)' : 'transparent',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={() => setIsAddingAction((prev) => !prev)}
        >
          <Plus size={11} />
          <span>{isAddingAction() ? 'Cancel New Action' : 'Add Action'}</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-1 py-1">
        <Show when={isAddingAction()}>
          <ActionEditor
            isSaving={isSavingAction()}
            initialDraft={{ working_dir: getActiveProject()?.path ?? '' }}
            onSave={handleSaveAction}
            onCancel={() => setIsAddingAction(false)}
          />
        </Show>

        <Show
          when={actionState.actions.length > 0}
          fallback={
            <div class="px-2 py-6 text-center">
              <Show
                when={!actionState.isDiscovering}
                fallback={
                  <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Scanning project...
                  </p>
                }
              >
                <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  No actions found
                </p>
                <p
                  class="text-[10px] mt-1"
                  style={{ color: 'var(--color-text-tertiary)', opacity: '0.6' }}
                >
                  Add scripts to package.json or .claude/actions.json
                </p>
              </Show>
            </div>
          }
        >
          <For each={[...groupedActions().entries()]}>
            {([source, actions]) => (
              <div class="mb-1">
                <button
                  class="flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={() => toggleGroup(source)}
                >
                  <Show
                    when={!collapsedGroups().has(source)}
                    fallback={<ChevronRight size={10} style={{ color: 'var(--color-text-tertiary)' }} />}
                  >
                    <ChevronDown size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                  </Show>
                  <span
                    class="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {sourceLabel(source)}
                  </span>
                  <span
                    class="text-[9px] font-mono"
                    style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
                  >
                    ({actions.length})
                  </span>
                </button>

                <Show when={!collapsedGroups().has(source)}>
                  <For each={actions}>{(action) => <ActionRow action={action} />}</For>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default ActionsPanel;
