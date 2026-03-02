// src/components/actions/LaneCard.tsx
// CHI-221: Individual running action card with conveyor animation and controls.

import { Component, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { Square, RotateCcw, Bot } from 'lucide-solid';
import type { CrossProjectRunningAction } from '@/lib/types';
import { getActionById, restartAction, stopAction, selectAction } from '@/stores/actionStore';
import { t } from '@/stores/i18nStore';
import { uiState, setActiveView } from '@/stores/uiStore';
import { addToast } from '@/stores/toastStore';

interface LaneCardProps {
  lane: CrossProjectRunningAction;
  onInspect: (actionId: string) => void;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const CATEGORY_ICONS: Record<string, string> = {
  dev: '⚙️',
  build: '🔨',
  test: '🧪',
  lint: '🎨',
  deploy: '🚀',
  custom: '✨',
};

const LaneCard: Component<LaneCardProps> = (props) => {
  const [elapsed, setElapsed] = createSignal(0);

  createEffect(() => {
    setElapsed(props.lane.elapsed_ms);
  });

  onMount(() => {
    const interval = setInterval(() => {
      if (props.lane.status === 'running' || props.lane.status === 'starting') {
        setElapsed((prev) => prev + 1000);
      }
    }, 1000);
    onCleanup(() => clearInterval(interval));
  });

  const laneStatusClass = () => {
    switch (props.lane.status) {
      case 'running':
        return 'lane-running';
      case 'starting':
        return 'lane-starting';
      case 'failed':
        return 'lane-failed';
      default:
        return 'lane-stopped';
    }
  };

  const borderColor = () => {
    switch (props.lane.status) {
      case 'running':
        return 'var(--color-success)';
      case 'starting':
        return 'var(--color-warning)';
      case 'failed':
        return 'var(--color-error)';
      default:
        return 'var(--color-border-secondary)';
    }
  };

  function handleAskAi() {
    const msg = `The action "${props.lane.action_name}" just completed with exit code ${props.lane.status === 'failed' ? '1' : '0'} after ${formatElapsed(elapsed())}.\nHere's the last output:\n${props.lane.last_output_line ?? '(no output)'}\n\nWhat happened and what should I do next?`;
    window.dispatchEvent(new CustomEvent('cw:prefill-input', { detail: { text: msg } }));
    setActiveView('conversation');
    selectAction(props.lane.action_id);
  }

  function handleRestart(e: MouseEvent) {
    e.stopPropagation();
    const action = getActionById(props.lane.action_id);
    if (!action) {
      addToast('Action definition is not loaded yet for restart', 'warning');
      return;
    }
    void restartAction(action);
  }

  function handleStop(e: MouseEvent) {
    e.stopPropagation();
    const confirmation = t('actions_center.lane.stop_confirm').replace(
      '{name}',
      props.lane.action_name,
    );
    if (!window.confirm(confirmation)) return;
    void stopAction(props.lane.action_id);
  }

  return (
    <div
      class={`group relative cursor-pointer overflow-hidden rounded-lg transition-opacity ${laneStatusClass()}`}
      style={{
        border: `1px solid ${borderColor()}`,
        background: 'var(--color-bg-elevated)',
        'border-left-width': '3px',
      }}
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${props.lane.action_name} — view live logs`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-controls]')) return;
        props.onInspect(props.lane.action_id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onInspect(props.lane.action_id);
        }
      }}
    >
      <div class="flex items-center justify-between px-3 pb-1 pt-2.5">
        <div class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 text-sm" aria-hidden="true">
            {CATEGORY_ICONS[props.lane.category] ?? '✨'}
          </span>
          <span class="truncate text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {props.lane.action_name}
          </span>
        </div>
        <span
          class="ml-2 shrink-0 font-mono text-[10px]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('actions_center.lane.elapsed').replace('{duration}', formatElapsed(elapsed()))}
        </span>
      </div>

      <div
        class={`conveyor-strip h-1.5 ${props.lane.status === 'running' ? 'active' : ''} ${laneStatusClass()}`}
        aria-hidden="true"
      />

      <div class="px-3 py-1.5">
        <p class="truncate font-mono text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {props.lane.last_output_line ?? '…'}
        </p>
        <Show when={uiState.actionTechnicalMode}>
          <p
            class="mt-0.5 truncate font-mono text-[9px]"
            style={{ color: 'var(--color-text-tertiary)', opacity: '0.6' }}
          >
            {props.lane.command}
          </p>
        </Show>
      </div>

      <Show when={props.lane.status === 'completed' || props.lane.status === 'failed'}>
        <div class="px-3 pb-2">
          <span
            class="rounded px-1 py-0.5 font-mono text-[9px]"
            style={{
              background:
                props.lane.status === 'completed'
                  ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                  : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
              color:
                props.lane.status === 'completed' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {props.lane.status === 'completed' ? '✓ 0' : '✗ 1'}
          </span>
        </div>
      </Show>

      <div
        data-controls
        class="absolute bottom-2 right-2 flex gap-0.5 rounded-full px-1.5 py-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        style={{
          background: 'color-mix(in srgb, var(--color-bg-elevated) 85%, transparent)',
          border: '1px solid var(--color-border-secondary)',
          'transition-duration': 'var(--duration-fast)',
        }}
      >
        <Show when={props.lane.status === 'running' || props.lane.status === 'starting'}>
          <button
            class="rounded p-1 transition-colors hover:text-red-400"
            style={{
              color: 'var(--color-text-tertiary)',
              'transition-duration': 'var(--duration-fast)',
            }}
            aria-label={t('actions_center.stop')}
            title={t('actions_center.stop')}
            onClick={handleStop}
          >
            <Square size={11} />
          </button>
        </Show>

        <button
          class="rounded p-1 transition-colors hover:text-yellow-400"
          style={{
            color: 'var(--color-text-tertiary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          aria-label={t('actions_center.restart')}
          title={t('actions_center.restart')}
          onClick={handleRestart}
        >
          <RotateCcw size={11} />
        </button>

        <button
          class="rounded p-1 transition-colors hover:text-blue-400"
          style={{
            color: 'var(--color-text-tertiary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          aria-label={t('actions_center.ask_ai')}
          title={t('actions_center.ask_ai')}
          onClick={(e) => {
            e.stopPropagation();
            handleAskAi();
          }}
        >
          <Bot size={11} />
        </button>
      </div>

      <span
        class="pointer-events-none absolute bottom-1 right-2 text-[9px] opacity-0 transition-opacity group-hover:opacity-50"
        style={{
          color: 'var(--color-text-tertiary)',
          'transition-duration': 'var(--duration-fast)',
        }}
        aria-hidden="true"
      >
        {t('actions_center.lane.inspect_hint')}
      </span>
    </div>
  );
};

export default LaneCard;
