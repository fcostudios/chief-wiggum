// src/components/actions/LaneHistory.tsx
// Lazy-loaded action history list for a selected warehouse lane.

import type { Component } from 'solid-js';
import { For, Show, createMemo, onMount } from 'solid-js';
import { CheckCircle2, Clock4, FileText, XCircle } from 'lucide-solid';
import { actionState, loadActionHistory, loadMoreActionHistory } from '@/stores/actionStore';
import { CATEGORY_ICONS } from './LaneCard';

interface LaneHistoryProps {
  projectId: string;
}

const PAGE_SIZE = 50;

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  if (date >= startOfToday) {
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (date >= startOfYesterday) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const LaneHistory: Component<LaneHistoryProps> = (props) => {
  onMount(() => {
    void loadActionHistory(props.projectId, PAGE_SIZE);
  });

  const entries = createMemo(() => actionState.history[props.projectId] ?? []);
  const isLoading = () => actionState.historyLoading[props.projectId] ?? false;
  const canLoadMore = createMemo(() => entries().length > 0 && entries().length % PAGE_SIZE === 0);

  return (
    <div class="flex h-full flex-col">
      <Show when={isLoading() && entries().length === 0}>
        <div class="flex items-center justify-center py-12">
          <span class="text-sm animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>
            Loading history...
          </span>
        </div>
      </Show>

      <Show when={!isLoading() && entries().length === 0}>
        <div class="flex h-full flex-col items-center justify-center gap-2 py-12">
          <FileText size={24} style={{ color: 'var(--color-text-tertiary)', opacity: 0.45 }} />
          <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            No history yet - run an action to see it here
          </p>
        </div>
      </Show>

      <Show when={entries().length > 0}>
        <div class="flex-1 space-y-2 overflow-y-auto p-3">
          <For each={entries()}>
            {(entry) => {
              const succeeded = () => (entry.exit_code ?? 0) === 0;
              return (
                <div
                  class="rounded-md px-3 py-2"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm shrink-0" aria-hidden="true">
                      {CATEGORY_ICONS[entry.category] ?? '⚙'}
                    </span>
                    <span
                      class="flex-1 truncate text-sm font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                      title={entry.command}
                    >
                      {entry.action_name}
                    </span>
                    <span
                      class="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px]"
                      style={{
                        background: succeeded()
                          ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                          : 'color-mix(in srgb, var(--color-error) 15%, transparent)',
                        color: succeeded() ? 'var(--color-success)' : 'var(--color-error)',
                        border: `1px solid color-mix(in srgb, ${succeeded() ? 'var(--color-success)' : 'var(--color-error)'} 30%, transparent)`,
                      }}
                      aria-label={`Exit code ${entry.exit_code ?? 0}`}
                    >
                      <Show
                        when={succeeded()}
                        fallback={<XCircle size={9} class="inline mr-0.5" />}
                      >
                        <CheckCircle2 size={9} class="inline mr-0.5" />
                      </Show>
                      {entry.exit_code ?? 0}
                    </span>
                    <span
                      class="flex shrink-0 items-center gap-0.5 font-mono text-[10px]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <Clock4 size={9} />
                      {formatDuration(entry.duration_ms)}
                    </span>
                    <span
                      class="shrink-0 text-[10px]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {formatDateLabel(entry.started_at)}
                    </span>
                  </div>

                  <Show when={entry.output_preview}>
                    <pre
                      class="mt-1 max-h-16 overflow-x-auto whitespace-pre-wrap break-words rounded px-2 py-1.5 text-[10px] leading-4"
                      style={{
                        background: 'var(--color-bg-inset)',
                        color: 'var(--color-text-tertiary)',
                        border: '1px solid var(--color-border-secondary)',
                        'font-family': 'var(--font-mono)',
                      }}
                    >
                      {entry.output_preview}
                    </pre>
                  </Show>
                </div>
              );
            }}
          </For>

          <Show when={canLoadMore()}>
            <div class="flex justify-center py-2">
              <button
                class="rounded px-3 py-1.5 text-xs transition-colors"
                style={{
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border-secondary)',
                }}
                onClick={() => void loadMoreActionHistory(props.projectId, PAGE_SIZE)}
                disabled={isLoading()}
                aria-busy={isLoading()}
              >
                <Show when={isLoading()} fallback="Load more">
                  Loading...
                </Show>
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default LaneHistory;
