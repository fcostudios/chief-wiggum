// src/components/actions/ActionsPanel.tsx
// Actions panel for sidebar per CHI-142. Groups actions by source.

import type { Component } from 'solid-js';
import { For, Show, createSignal, createMemo } from 'solid-js';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-solid';
import {
  actionState,
  deleteCustomAction,
  runActionWithArgs,
  saveCustomAction,
  startAction,
} from '@/stores/actionStore';
import { getActiveProject } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';
import type { ActionDefinition, ActionSource, CustomActionDraft } from '@/lib/types';
import ActionRow from './ActionRow';
import ActionEditor from './ActionEditor';
import ActionArgPrompt from './ActionArgPrompt';

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
  const [editingRowActionId, setEditingRowActionId] = createSignal<string | null>(null);
  const [editingRowOriginalName, setEditingRowOriginalName] = createSignal<string | null>(null);
  const [editingRowDraft, setEditingRowDraft] = createSignal<Partial<CustomActionDraft> | null>(
    null,
  );
  const [pendingDeleteActionId, setPendingDeleteActionId] = createSignal<string | null>(null);
  const [argPromptActionId, setArgPromptActionId] = createSignal<string | null>(null);

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

  async function handleSaveEditedAction(draft: CustomActionDraft) {
    const activeProject = getActiveProject();
    if (!activeProject) {
      addToast('Select a project before editing a custom action', 'warning');
      return;
    }

    setIsSavingAction(true);
    try {
      const originalName = editingRowOriginalName();
      const normalizedDraft: CustomActionDraft = {
        ...draft,
        working_dir: draft.working_dir.trim() || activeProject.path,
      };

      await saveCustomAction(activeProject.path, normalizedDraft);
      if (originalName && originalName !== normalizedDraft.name) {
        await deleteCustomAction(activeProject.path, originalName);
      }

      setEditingRowActionId(null);
      setEditingRowOriginalName(null);
      setEditingRowDraft(null);
      setPendingDeleteActionId(null);
      addToast(`Saved custom action: ${normalizedDraft.name}`, 'success');
    } catch (err) {
      addToast(
        `Failed to save action: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setIsSavingAction(false);
    }
  }

  function openEditAction(action: ActionDefinition) {
    setIsAddingAction(false);
    setPendingDeleteActionId(null);
    setArgPromptActionId(null);
    setEditingRowActionId(action.id);
    setEditingRowOriginalName(action.name);
    setEditingRowDraft({
      name: action.name,
      command: action.command,
      working_dir: action.working_dir,
      category: action.category,
      description: action.description,
      is_long_running: action.is_long_running,
      before_commands: action.before_commands,
      after_commands: action.after_commands,
      env_vars: action.env_vars,
      args: action.args,
    });
  }

  function openCustomizeAction(action: ActionDefinition) {
    setIsAddingAction(false);
    setPendingDeleteActionId(null);
    setArgPromptActionId(null);
    setEditingRowActionId(action.id);
    setEditingRowOriginalName(null);
    setEditingRowDraft({
      name: action.name,
      command: action.command,
      working_dir: action.working_dir,
      category: action.category,
      description: action.description,
      is_long_running: action.is_long_running,
      before_commands: action.before_commands,
      after_commands: action.after_commands,
      env_vars: action.env_vars,
      args: action.args,
    });
  }

  async function confirmDeleteAction(action: ActionDefinition) {
    const activeProject = getActiveProject();
    if (!activeProject) {
      addToast('Select a project before removing a custom action', 'warning');
      return;
    }

    setIsSavingAction(true);
    try {
      await deleteCustomAction(activeProject.path, action.name);
      setPendingDeleteActionId(null);
      if (editingRowActionId() === action.id) {
        setEditingRowActionId(null);
        setEditingRowOriginalName(null);
        setEditingRowDraft(null);
      }
      addToast(`Removed custom action: ${action.name}`, 'success');
    } catch (err) {
      addToast(
        `Failed to remove action: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setIsSavingAction(false);
    }
  }

  async function handleRunAction(action: ActionDefinition) {
    setPendingDeleteActionId(null);

    if (action.args && action.args.length > 0) {
      setIsAddingAction(false);
      setEditingRowActionId(null);
      setEditingRowOriginalName(null);
      setEditingRowDraft(null);
      setArgPromptActionId((prev) => (prev === action.id ? null : action.id));
      return;
    }

    setArgPromptActionId(null);
    await startAction(action);
  }

  async function handleRunActionWithArgs(
    action: ActionDefinition,
    resolvedArgs: Record<string, string>,
  ) {
    setArgPromptActionId(null);
    await runActionWithArgs(action, resolvedArgs);
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
                    fallback={
                      <ChevronRight size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                    }
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
                  <For each={actions}>
                    {(action) => (
                      <>
                        <ActionRow
                          action={action}
                          onRun={handleRunAction}
                          onEdit={
                            action.source === 'claude_actions'
                              ? () => openEditAction(action)
                              : undefined
                          }
                          onCustomize={
                            action.source !== 'claude_actions'
                              ? () => openCustomizeAction(action)
                              : undefined
                          }
                          onDelete={
                            action.source === 'claude_actions'
                              ? () =>
                                  setPendingDeleteActionId((prev) =>
                                    prev === action.id ? null : action.id,
                                  )
                              : undefined
                          }
                        />

                        <Show
                          when={argPromptActionId() === action.id && (action.args?.length ?? 0) > 0}
                        >
                          <ActionArgPrompt
                            action={action}
                            onCancel={() => setArgPromptActionId(null)}
                            onRun={(values) => handleRunActionWithArgs(action, values)}
                          />
                        </Show>

                        <Show when={pendingDeleteActionId() === action.id}>
                          <div
                            class="mx-2 mb-2 rounded-md px-2 py-1.5 flex items-center justify-between gap-2"
                            style={{
                              background: 'var(--color-bg-secondary)',
                              border: '1px solid var(--color-border-secondary)',
                            }}
                          >
                            <span
                              class="text-[11px]"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              Remove <span class="font-mono">{action.name}</span>?
                            </span>
                            <div class="flex items-center gap-1">
                              <button
                                class="px-2 py-0.5 rounded text-[10px]"
                                style={{
                                  color: 'var(--color-text-tertiary)',
                                  border: '1px solid var(--color-border-secondary)',
                                }}
                                onClick={() => setPendingDeleteActionId(null)}
                                disabled={isSavingAction()}
                              >
                                No
                              </button>
                              <button
                                class="px-2 py-0.5 rounded text-[10px] font-medium"
                                style={{
                                  color: 'white',
                                  background: 'var(--color-error)',
                                  opacity: isSavingAction() ? '0.7' : '1',
                                }}
                                onClick={() => void confirmDeleteAction(action)}
                                disabled={isSavingAction()}
                              >
                                Yes
                              </button>
                            </div>
                          </div>
                        </Show>

                        <Show when={editingRowActionId() === action.id && editingRowDraft()}>
                          {(draft) => (
                            <ActionEditor
                              initialDraft={draft()}
                              isSaving={isSavingAction()}
                              onSave={handleSaveEditedAction}
                              onCancel={() => {
                                setEditingRowActionId(null);
                                setEditingRowOriginalName(null);
                                setEditingRowDraft(null);
                              }}
                            />
                          )}
                        </Show>
                      </>
                    )}
                  </For>
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
