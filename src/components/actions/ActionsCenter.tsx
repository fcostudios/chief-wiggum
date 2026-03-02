// src/components/actions/ActionsCenter.tsx
// CHI-220/221: Cross-project Actions Center with warehouse overview + detail lanes.

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { ChevronLeft, Settings } from 'lucide-solid';
import { actionState, loadActionHistory, loadAllRunningActions } from '@/stores/actionStore';
import { projectState, setActiveProject } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import { toggleActionTechnicalMode, uiState } from '@/stores/uiStore';
import type { CrossProjectRunningAction } from '@/lib/types';
import WarehouseCard from './WarehouseCard';
import LaneCard, { CATEGORY_ICONS } from './LaneCard';
import LaneLogScreen from './LaneLogScreen';

const ActionsCenter: Component = () => {
  const [selectedWarehouseId, setSelectedWarehouseId] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal<'active' | 'history'>('active');
  const [selectedLaneId, setSelectedLaneId] = createSignal<string | null>(null);

  const projects = () => projectState.projects ?? [];

  onMount(async () => {
    await loadAllRunningActions();
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

  const historyForSelected = () => {
    const pid = selectedWarehouseId();
    if (!pid) return [];
    return actionState.history[pid] ?? [];
  };

  const selectedLane = (): CrossProjectRunningAction | undefined =>
    activeLanesForSelected().find((l) => l.action_id === selectedLaneId());

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
                    onClick={() => {
                      setActiveTab('history');
                      const pid = selectedWarehouseId();
                      if (pid && historyForSelected().length === 0) {
                        void loadActionHistory(pid);
                      }
                    }}
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
                    <Show
                      when={historyForSelected().length > 0}
                      fallback={
                        <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                          {t('actions_center.no_history')}
                        </p>
                      }
                    >
                      <div class="space-y-2">
                        <For each={historyForSelected()}>
                          {(entry) => (
                            <div
                              class="flex items-center gap-2 rounded px-3 py-2 text-xs"
                              style={{
                                background: 'var(--color-bg-elevated)',
                                border: '1px solid var(--color-border-secondary)',
                              }}
                            >
                              <span>{CATEGORY_ICONS[entry.category] ?? '✨'}</span>
                              <span
                                class="flex-1 font-medium truncate"
                                style={{ color: 'var(--color-text-primary)' }}
                              >
                                {entry.action_name}
                              </span>
                              <span
                                class="font-mono text-[10px] px-1 py-0.5 rounded"
                                style={{
                                  background:
                                    entry.exit_code === 0
                                      ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                                      : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
                                  color:
                                    entry.exit_code === 0
                                      ? 'var(--color-success)'
                                      : 'var(--color-error)',
                                }}
                              >
                                {entry.exit_code === 0 ? '✓ 0' : `✗ ${entry.exit_code ?? '?'}`}
                              </span>
                            </div>
                          )}
                        </For>
                      </div>
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
    </div>
  );
};

export default ActionsCenter;
