// src/components/actions/ActionsCenter.tsx
// CHI-220/221: Cross-project Actions Center with warehouse overview + detail lanes.

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { ChevronLeft, Settings } from 'lucide-solid';
import { actionState, loadAllRunningActions } from '@/stores/actionStore';
import { projectState, setActiveProject } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import { toggleActionTechnicalMode, uiState } from '@/stores/uiStore';
import type { CrossProjectRunningAction } from '@/lib/types';
import WarehouseCard from './WarehouseCard';
import LaneCard from './LaneCard';
import LaneLogScreen from './LaneLogScreen';
import ActionQuickLaunch from './ActionQuickLaunch';
import LaneHistory from './LaneHistory';

const ActionsCenter: Component = () => {
  const [selectedWarehouseId, setSelectedWarehouseId] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal<'active' | 'history'>('active');
  const [selectedLaneId, setSelectedLaneId] = createSignal<string | null>(null);
  const [showQuickLaunch, setShowQuickLaunch] = createSignal(false);

  const projects = () => projectState.projects ?? [];

  onMount(async () => {
    await loadAllRunningActions();

    const openQuickLaunchListener = () => setShowQuickLaunch(true);
    window.addEventListener('cw:open-quick-launch', openQuickLaunchListener);
    onCleanup(() => window.removeEventListener('cw:open-quick-launch', openQuickLaunchListener));
  });

  const summaryText = createMemo(() => {
    const n = projects().length;
    const m = actionState.crossProjectRunning.length;
    return t('actions_center.summary').replace('{n}', String(n)).replace('{m}', String(m));
  });

  const hasProjects = createMemo(() => projects().length > 0);

  const selectedProject = () => projects().find((p) => p.id === selectedWarehouseId());

  const activeLanesForProject = (projectId: string) =>
    actionState.crossProjectRunning.filter((lane) => lane.project_id === projectId);

  const activeLanesForSelected = () =>
    selectedWarehouseId()
      ? actionState.crossProjectRunning.filter((l) => l.project_id === selectedWarehouseId())
      : [];

  const selectedLane = (): CrossProjectRunningAction | undefined =>
    activeLanesForSelected().find((l) => l.action_id === selectedLaneId());

  return (
    <div class="relative flex h-full flex-col overflow-hidden">
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

      <div class="flex-1 overflow-hidden flex flex-col">
        <Show
          when={selectedWarehouseId()}
          fallback={
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
          }
        >
          <Show
            when={selectedLane()}
            fallback={
              <div class="flex flex-col h-full">
                <div
                  class="shrink-0 flex items-center gap-2 px-4 py-2.5"
                  style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
                >
                  <button
                    class="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onClick={() => {
                      setSelectedWarehouseId(null);
                      setActiveTab('active');
                      setSelectedLaneId(null);
                    }}
                  >
                    <ChevronLeft size={13} />
                    Overview
                  </button>
                  <span style={{ color: 'var(--color-border-secondary)' }}>/</span>
                  <span
                    class="text-sm font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {selectedProject()?.name}
                  </span>
                  <div class="flex-1" />
                  <button
                    class="p-1.5 rounded text-[10px] transition-colors"
                    style={{
                      background: uiState.actionTechnicalMode
                        ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                        : 'var(--color-bg-elevated)',
                      color: uiState.actionTechnicalMode
                        ? 'var(--color-accent)'
                        : 'var(--color-text-tertiary)',
                      border: '1px solid var(--color-border-secondary)',
                    }}
                    aria-label="Toggle technical mode"
                    onClick={toggleActionTechnicalMode}
                    title="Technical mode — show commands and timestamps"
                  >
                    <Settings size={12} />
                  </button>
                </div>

                <div
                  class="shrink-0 flex"
                  style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
                >
                  <button
                    class="px-4 py-2 text-xs font-medium transition-colors"
                    style={{
                      color:
                        activeTab() === 'active'
                          ? 'var(--color-text-primary)'
                          : 'var(--color-text-tertiary)',
                      'border-bottom':
                        activeTab() === 'active'
                          ? '2px solid var(--color-accent)'
                          : '2px solid transparent',
                    }}
                    onClick={() => setActiveTab('active')}
                  >
                    Active ({activeLanesForSelected().length})
                  </button>
                  <button
                    class="px-4 py-2 text-xs font-medium transition-colors"
                    style={{
                      color:
                        activeTab() === 'history'
                          ? 'var(--color-text-primary)'
                          : 'var(--color-text-tertiary)',
                      'border-bottom':
                        activeTab() === 'history'
                          ? '2px solid var(--color-accent)'
                          : '2px solid transparent',
                    }}
                    onClick={() => setActiveTab('history')}
                  >
                    History
                  </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4">
                  <Show when={activeTab() === 'active'}>
                    <Show
                      when={activeLanesForSelected().length > 0}
                      fallback={
                        <div class="flex h-full items-center justify-center">
                          <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                            {t('actions_center.no_lanes')}
                          </p>
                        </div>
                      }
                    >
                      <div class="space-y-3">
                        <For each={activeLanesForSelected()}>
                          {(lane) => (
                            <LaneCard lane={lane} onInspect={(id) => setSelectedLaneId(id)} />
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>

                  <Show when={activeTab() === 'history'}>
                    <Show when={selectedWarehouseId()}>
                      {(projectId) => <LaneHistory projectId={projectId()} />}
                    </Show>
                  </Show>
                </div>
              </div>
            }
          >
            <LaneLogScreen lane={selectedLane()!} onBack={() => setSelectedLaneId(null)} />
          </Show>
        </Show>
      </div>

      <Show when={!selectedLaneId()}>
        <button
          id="launch-action-fab"
          class="absolute bottom-4 right-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
          onClick={() => setShowQuickLaunch(true)}
          aria-label={t('actions_center.launch_action')}
        >
          <span>+</span> {t('actions_center.launch_action')}
        </button>
      </Show>

      <Show when={showQuickLaunch()}>
        <ActionQuickLaunch
          preselectedProjectId={selectedWarehouseId() ?? undefined}
          onClose={() => setShowQuickLaunch(false)}
        />
      </Show>
    </div>
  );
};

export default ActionsCenter;
