// src/components/actions/ActionsCenter.tsx
// CHI-220: Cross-project Actions Center overview.

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { actionState, loadAllRunningActions } from '@/stores/actionStore';
import { projectState, setActiveProject } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import WarehouseCard from './WarehouseCard';

const ActionsCenter: Component = () => {
  const [selectedWarehouseId, setSelectedWarehouseId] = createSignal<string | null>(null);
  const projects = () => projectState.projects ?? [];

  onMount(async () => {
    await loadAllRunningActions();
  });

  const summaryText = createMemo(() => {
    const n = projects().length;
    const m = actionState.crossProjectRunning.length;
    return t('actions_center.summary').replace('{n}', String(n)).replace('{m}', String(m));
  });

  const activeLanesForProject = (projectId: string) =>
    actionState.crossProjectRunning.filter((lane) => lane.project_id === projectId);

  const hasProjects = createMemo(() => projects().length > 0);

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <div
        class="shrink-0 px-4 py-3"
        style={{
          'border-bottom': '1px solid var(--color-border-secondary)',
          background: 'var(--color-bg-primary)',
        }}
      >
        <h2 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t('actions_center.title')}
        </h2>
        <div
          role="status"
          aria-live="polite"
          class="mt-0.5 text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {summaryText()}
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <Show
          when={hasProjects()}
          fallback={
            <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span class="text-3xl" aria-hidden="true">
                🏭
              </span>
              <p class="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t('actions_center.open_project')}
              </p>
            </div>
          }
        >
          <div
            class="grid gap-3"
            style={{ 'grid-template-columns': 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            <For each={projects()}>
              {(project) => {
                const lanes = createMemo(() => activeLanesForProject(project.id));
                return (
                  <div
                    class="rounded-lg transition-colors"
                    style={{
                      border:
                        selectedWarehouseId() === project.id
                          ? '1px solid var(--color-accent)'
                          : '1px solid transparent',
                    }}
                  >
                    <WarehouseCard
                      projectId={project.id}
                      projectName={project.name}
                      activeLaneCount={lanes().length}
                      activeLanes={lanes()}
                      onSelect={(id) => {
                        setSelectedWarehouseId(id);
                        setActiveProject(id);
                      }}
                    />
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionsCenter;
