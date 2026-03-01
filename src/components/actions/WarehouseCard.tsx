// src/components/actions/WarehouseCard.tsx
// CHI-220: Project warehouse card used by Actions Center overview.

import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import type { CrossProjectRunningAction } from '@/lib/types';

interface WarehouseCardProps {
  projectId: string;
  projectName: string;
  activeLaneCount: number;
  activeLanes?: CrossProjectRunningAction[];
  onSelect: (projectId: string) => void;
}

const WarehouseCard: Component<WarehouseCardProps> = (props) => {
  const isActive = () => props.activeLaneCount > 0;

  return (
    <button
      class="w-full rounded-lg p-3 text-left transition-colors group"
      role="button"
      aria-label={`Open ${props.projectName} warehouse`}
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-secondary)',
        'transition-duration': 'var(--duration-normal)',
      }}
      onClick={() => props.onSelect(props.projectId)}
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="min-w-0 flex items-center gap-2">
          <span class="text-base" aria-hidden="true">
            🏭
          </span>
          <span class="truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {props.projectName}
          </span>
        </div>
        <span
          class="lane-count-badge ml-2 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold"
          style={{
            background: isActive()
              ? 'color-mix(in srgb, var(--color-success) 20%, transparent)'
              : 'var(--color-bg-inset)',
            color: isActive() ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            'border-color': isActive()
              ? 'color-mix(in srgb, var(--color-success) 30%, transparent)'
              : 'var(--color-border-secondary)',
          }}
        >
          {props.activeLaneCount} active
        </span>
      </div>

      <div
        class={`conveyor-strip rounded ${isActive() ? 'active lane-running' : 'lane-stopped'}`}
        aria-hidden="true"
      />

      <Show when={(props.activeLanes?.length ?? 0) > 0}>
        <div class="mt-2 flex items-center gap-1.5">
          <For each={props.activeLanes?.slice(0, 5)}>
            {(lane) => (
              <span
                class="h-2 w-2 rounded-full"
                title={lane.action_name}
                style={{
                  background:
                    lane.status === 'running'
                      ? 'var(--color-success)'
                      : lane.status === 'starting'
                        ? 'var(--color-warning)'
                        : 'var(--color-error)',
                  animation: lane.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
                }}
                aria-label={`${lane.action_name}: ${lane.status}`}
              />
            )}
          </For>
          <Show when={(props.activeLanes?.length ?? 0) > 5}>
            <span class="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              +{(props.activeLanes?.length ?? 0) - 5}
            </span>
          </Show>
        </div>
      </Show>
    </button>
  );
};

export default WarehouseCard;
