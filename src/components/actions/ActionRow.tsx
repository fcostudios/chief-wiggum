// src/components/actions/ActionRow.tsx
// Individual action row with play/stop controls per CHI-142.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Play, Square, RotateCw } from 'lucide-solid';
import type { ActionDefinition, ActionStatus } from '@/lib/types';
import {
  startAction,
  stopAction,
  restartAction,
  getActionStatus,
  selectAction,
} from '@/stores/actionStore';

interface ActionRowProps {
  action: ActionDefinition;
  onRun?: (action: ActionDefinition) => void;
  onEdit?: (action: ActionDefinition) => void;
  onCustomize?: (action: ActionDefinition) => void;
  onDelete?: (action: ActionDefinition) => void;
}

/** Category color mapping. */
function categoryColor(category: string): string {
  switch (category) {
    case 'dev':
      return 'var(--color-success)';
    case 'build':
      return 'var(--color-accent)';
    case 'test':
      return 'var(--color-info)';
    case 'lint':
      return 'var(--color-warning)';
    case 'deploy':
      return 'var(--color-error)';
    default:
      return 'var(--color-text-tertiary)';
  }
}

/** Status indicator dot. */
function StatusDot(props: { status: ActionStatus }) {
  const color = () => {
    switch (props.status) {
      case 'running':
      case 'starting':
        return 'var(--color-success)';
      case 'completed':
        return 'var(--color-info)';
      case 'failed':
        return 'var(--color-error)';
      case 'stopped':
        return 'var(--color-warning)';
      default:
        return 'transparent';
    }
  };

  return (
    <Show when={props.status !== 'idle'}>
      <div
        class="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: color(),
          animation: props.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      />
    </Show>
  );
}

const ActionRow: Component<ActionRowProps> = (props) => {
  const status = () => getActionStatus(props.action.id);
  const isRunning = () => status() === 'running' || status() === 'starting';

  function handlePlay(e: MouseEvent) {
    e.stopPropagation();
    if (props.onRun) {
      void props.onRun(props.action);
      return;
    }
    void startAction(props.action);
  }

  function handleStop(e: MouseEvent) {
    e.stopPropagation();
    void stopAction(props.action.id);
  }

  function handleRestart(e: MouseEvent) {
    e.stopPropagation();
    void restartAction(props.action);
  }

  function handleEdit(e: MouseEvent) {
    e.stopPropagation();
    props.onEdit?.(props.action);
  }

  function handleCustomize(e: MouseEvent) {
    e.stopPropagation();
    props.onCustomize?.(props.action);
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    props.onDelete?.(props.action);
  }

  const isCustomAction = () => props.action.source === 'claude_actions';

  return (
    <div
      class="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      onClick={() => selectAction(props.action.id)}
    >
      <div
        class="w-1 h-4 rounded-full shrink-0"
        style={{ background: categoryColor(props.action.category) }}
      />

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span
            class="text-xs font-mono font-medium truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {props.action.name}
          </span>
          <StatusDot status={status()} />
        </div>
        <Show when={props.action.description}>
          <p class="text-[10px] truncate mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            {props.action.description}
          </p>
        </Show>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <div
          class="flex items-center gap-1"
          classList={{ 'opacity-0 group-hover:opacity-100': !isRunning() }}
          style={{ 'transition-duration': 'var(--duration-fast)' }}
        >
          <Show
            when={isCustomAction()}
            fallback={
              <Show when={props.onCustomize}>
                <button
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    border: '1px solid var(--color-border-secondary)',
                    'transition-duration': 'var(--duration-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)';
                  }}
                  onClick={handleCustomize}
                  aria-label={`Customize ${props.action.name}`}
                  title="Customize"
                >
                  Customize
                </button>
              </Show>
            }
          >
            <Show when={props.onEdit}>
              <button
                class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid var(--color-border-secondary)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                }}
                onClick={handleEdit}
                aria-label={`Edit ${props.action.name}`}
                title="Edit"
              >
                Edit
              </button>
            </Show>
            <Show when={props.onDelete}>
              <button
                class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid var(--color-border-secondary)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-error)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                }}
                onClick={handleDelete}
                aria-label={`Remove ${props.action.name}`}
                title="Remove"
              >
                Remove
              </button>
            </Show>
          </Show>
        </div>
        <Show
          when={isRunning()}
          fallback={
            <button
              class="p-1 rounded transition-colors"
              style={{ color: 'var(--color-text-tertiary)', 'transition-duration': 'var(--duration-fast)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-success)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }}
              onClick={handlePlay}
              aria-label={`Run ${props.action.name}`}
              title="Run"
            >
              <Play size={12} />
            </button>
          }
        >
          <button
            class="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)', 'transition-duration': 'var(--duration-fast)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-error)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            onClick={handleStop}
            aria-label={`Stop ${props.action.name}`}
            title="Stop"
          >
            <Square size={12} />
          </button>
          <button
            class="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-tertiary)', 'transition-duration': 'var(--duration-fast)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            onClick={handleRestart}
            aria-label={`Restart ${props.action.name}`}
            title="Restart"
          >
            <RotateCw size={12} />
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ActionRow;
