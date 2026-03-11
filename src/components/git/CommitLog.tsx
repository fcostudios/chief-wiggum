import type { Component } from 'solid-js';
import { For, Show, createMemo } from 'solid-js';
import { RefreshCw } from 'lucide-solid';
import { gitState, loadCommits, type CommitEntry } from '@/stores/gitStore';

const PAGE_SIZE = 20;

function formatRelativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

const CommitLogEntry: Component<{ entry: CommitEntry }> = (props) => (
  <div
    class="flex items-start gap-2 px-3 py-1.5 transition-colors"
    style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
  >
    <span
      class="mt-0.5 shrink-0 font-mono text-[10px]"
      style={{ color: 'var(--color-text-tertiary)', 'min-width': '48px' }}
      title={props.entry.sha}
    >
      {props.entry.short_sha}
    </span>
    <span
      class="min-w-0 flex-1 truncate text-xs"
      style={{ color: 'var(--color-text-primary)' }}
      title={props.entry.message || props.entry.summary}
    >
      {props.entry.summary || '(no message)'}
    </span>
    <span
      class="ml-1 shrink-0 text-[10px]"
      style={{ color: 'var(--color-text-tertiary)' }}
      title={new Date(props.entry.timestamp * 1000).toLocaleString()}
    >
      {formatRelativeTime(props.entry.timestamp)}
    </span>
  </div>
);

const CommitLog: Component = () => {
  const hasMore = createMemo(
    () =>
      gitState.commitsLoaded &&
      gitState.commits.length > 0 &&
      gitState.commits.length % PAGE_SIZE === 0,
  );

  return (
    <div style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
      <div class="flex items-center justify-between px-3 py-1.5">
        <span
          class="text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Recent Commits
        </span>
        <Show when={gitState.commitsLoading}>
          <RefreshCw
            size={10}
            class="animate-spin"
            style={{ color: 'var(--color-text-tertiary)' }}
          />
        </Show>
      </div>

      <Show
        when={gitState.commits.length > 0}
        fallback={
          <Show when={gitState.commitsLoaded && !gitState.commitsLoading}>
            <p class="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              No commits yet.
            </p>
          </Show>
        }
      >
        <For each={gitState.commits}>{(entry) => <CommitLogEntry entry={entry} />}</For>

        <Show when={hasMore()}>
          <button
            class="w-full px-3 py-2 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              'border-top': '1px solid var(--color-border-secondary)',
            }}
            onClick={() => void loadCommits(false)}
            disabled={gitState.commitsLoading}
          >
            {gitState.commitsLoading ? 'Loading…' : 'Load more'}
          </button>
        </Show>
      </Show>
    </div>
  );
};

export default CommitLog;
