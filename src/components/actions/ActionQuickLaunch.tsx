// src/components/actions/ActionQuickLaunch.tsx
// CHI-223: 2-step action launch modal.

import {
  Component,
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from 'solid-js';
import { Search, X } from 'lucide-solid';
import type { ActionDefinition } from '@/lib/types';
import { actionState, discoverActions, startAction } from '@/stores/actionStore';
import { projectState, setActiveProject } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';

interface ActionQuickLaunchProps {
  preselectedProjectId?: string;
  onClose: () => void;
}

const ALL_CATEGORIES = ['dev', 'build', 'test', 'lint', 'deploy', 'custom'] as const;

const CATEGORY_ICONS: Record<string, string> = {
  dev: '⚙️',
  build: '🔨',
  test: '🧪',
  lint: '🎨',
  deploy: '🚀',
  custom: '✨',
};

const SOURCE_LABELS: Record<string, string> = {
  package_json: 'npm',
  cargo_toml: 'cargo',
  makefile: 'make',
  docker_compose: 'docker',
  claude_actions: 'custom',
};

const ActionQuickLaunch: Component<ActionQuickLaunchProps> = (props) => {
  const initialProjectId = untrack(() => props.preselectedProjectId) ?? '';
  const closeModal = () => props.onClose();

  const [step, setStep] = createSignal<'project' | 'action'>(
    initialProjectId ? 'action' : 'project',
  );
  const [selectedProjectId, setSelectedProjectId] = createSignal<string>(initialProjectId);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedCategory, setSelectedCategory] = createSignal<string>('all');
  const [focusedIndex, setFocusedIndex] = createSignal(0);

  let searchInputRef: HTMLInputElement | undefined;
  let modalRef: HTMLDivElement | undefined;

  const selectedProject = () =>
    projectState.projects.find((p) => p.id === selectedProjectId()) ?? null;

  const filteredActions = createMemo(() => {
    const actions = actionState.actions;
    const q = searchQuery().trim().toLowerCase();
    const cat = selectedCategory();

    return actions.filter(
      (a) =>
        (cat === 'all' || a.category === cat) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          (a.description ?? '').toLowerCase().includes(q) ||
          a.command.toLowerCase().includes(q)),
    );
  });

  async function enterActionStep(projectId: string): Promise<void> {
    setSelectedProjectId(projectId);
    const project = projectState.projects.find((p) => p.id === projectId);
    if (!project) return;

    setActiveProject(project.id);
    await discoverActions(project.path);

    setStep('action');
    setFocusedIndex(0);
    setTimeout(() => searchInputRef?.focus(), 50);
  }

  async function handleLaunch(action: ActionDefinition): Promise<void> {
    if (!selectedProject()) return;
    await startAction(action);
    closeModal();
  }

  function handleActionKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, Math.max(filteredActions().length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const action = filteredActions()[focusedIndex()];
      if (action) {
        void handleLaunch(action);
      }
    }
  }

  onMount(() => {
    modalRef?.focus();

    // If one project only, skip to action step.
    if (!initialProjectId && projectState.projects.length === 1) {
      void enterActionStep(projectState.projects[0].id);
    }

    // If preselected, load actions immediately.
    if (initialProjectId) {
      void enterActionStep(initialProjectId);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        ref={modalRef}
        class="w-[520px] max-h-[70vh] rounded-xl flex flex-col overflow-hidden outline-none"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-secondary)',
          'box-shadow': '0 24px 64px rgba(0,0,0,0.5)',
        }}
        tabIndex={-1}
        role="dialog"
        aria-label={t('actions_center.launch_action')}
        aria-modal="true"
      >
        <div
          class="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <h2 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('actions_center.launch_action')}
          </h2>
          <button
            class="p-1 rounded hover:opacity-70"
            style={{ color: 'var(--color-text-tertiary)' }}
            onClick={() => closeModal()}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <Show when={step() === 'project'}>
          <div class="flex-1 overflow-y-auto p-4">
            <p class="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              Select a project
            </p>
            <div class="grid grid-cols-2 gap-2">
              <For each={projectState.projects}>
                {(project) => (
                  <button
                    class="rounded-lg p-3 text-left hover:opacity-80 transition-opacity"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-secondary)',
                    }}
                    onClick={() => void enterActionStep(project.id)}
                  >
                    <div class="flex items-center gap-2">
                      <span>🏭</span>
                      <span
                        class="text-xs font-medium truncate"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {project.name}
                      </span>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={step() === 'action'}>
          <div class="shrink-0 px-4 pt-3 pb-2">
            <div
              class="flex items-center gap-2 rounded px-2 py-1.5"
              style={{
                background: 'var(--color-bg-inset)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <Search size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search actions…"
                value={searchQuery()}
                onInput={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  setFocusedIndex(0);
                }}
                onKeyDown={handleActionKeyDown}
                class="flex-1 bg-transparent text-xs outline-none"
                style={{ color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          <div class="shrink-0 flex items-center gap-1.5 px-4 pb-2 flex-wrap">
            <button
              class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
              style={{
                background:
                  selectedCategory() === 'all' ? 'var(--color-accent)' : 'var(--color-bg-inset)',
                color:
                  selectedCategory() === 'all'
                    ? 'var(--color-bg-primary)'
                    : 'var(--color-text-tertiary)',
              }}
              onClick={() => {
                setSelectedCategory('all');
                setFocusedIndex(0);
              }}
            >
              All
            </button>
            <For each={ALL_CATEGORIES}>
              {(cat) => (
                <button
                  class="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
                  style={{
                    background:
                      selectedCategory() === cat ? 'var(--color-accent)' : 'var(--color-bg-inset)',
                    color:
                      selectedCategory() === cat
                        ? 'var(--color-bg-primary)'
                        : 'var(--color-text-tertiary)',
                  }}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setFocusedIndex(0);
                  }}
                >
                  {CATEGORY_ICONS[cat]} {cat}
                </button>
              )}
            </For>
          </div>

          <div class="flex-1 overflow-y-auto px-4 pb-4">
            <Show
              when={filteredActions().length > 0}
              fallback={
                <p class="text-xs py-4 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  No actions found
                </p>
              }
            >
              <div class="space-y-1">
                <For each={filteredActions()}>
                  {(action, i) => (
                    <button
                      class="w-full rounded p-2.5 text-left transition-colors"
                      style={{
                        background:
                          i() === focusedIndex() ? 'var(--color-bg-secondary)' : 'transparent',
                        border:
                          i() === focusedIndex()
                            ? '1px solid var(--color-border-secondary)'
                            : '1px solid transparent',
                      }}
                      onMouseEnter={() => setFocusedIndex(i())}
                      onClick={() => void handleLaunch(action)}
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-sm">{CATEGORY_ICONS[action.category] ?? '✨'}</span>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span
                              class="text-xs font-medium truncate"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {action.name}
                            </span>
                            <span
                              class="text-[9px] px-1 py-0.5 rounded shrink-0"
                              style={{
                                background: 'var(--color-bg-inset)',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {SOURCE_LABELS[action.source] ?? action.source}
                            </span>
                          </div>
                          <Show when={action.description}>
                            <p
                              class="text-[10px] truncate"
                              style={{ color: 'var(--color-text-tertiary)' }}
                            >
                              {action.description}
                            </p>
                          </Show>
                        </div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionQuickLaunch;
