// src/components/git/GitPanel.tsx
// Main Git panel view — shows repo status, branch, changed files (CHI-316).

import type { Component } from 'solid-js';
import { Show, createMemo, onMount } from 'solid-js';
import { GitBranch, RefreshCw } from 'lucide-solid';
import {
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  gitState,
  refreshGitStatus,
  refreshRepoInfo,
} from '@/stores/gitStore';
import ChangedFilesList from '@/components/git/ChangedFilesList';
import CommitBox from '@/components/git/CommitBox';
import CommitLog from '@/components/git/CommitLog';
import RemoteActions from '@/components/git/RemoteActions';
import StashList from '@/components/git/StashList';

const GitPanel: Component = () => {
  onMount(() => {
    void refreshRepoInfo();
    void refreshGitStatus();
  });

  const staged = createMemo(() => getStagedFiles());
  const unstaged = createMemo(() => getUnstagedFiles());
  const untracked = createMemo(() => getUntrackedFiles());
  const hasChanges = createMemo(
    () => staged().length > 0 || unstaged().length > 0 || untracked().length > 0,
  );

  function handleRefresh() {
    void refreshRepoInfo();
    void refreshGitStatus();
  }

  return (
    <div class="flex h-full flex-col" style={{ background: 'var(--color-bg-primary)' }}>
      <div
        class="flex shrink-0 items-center justify-between px-4 py-2.5"
        style={{
          background: 'var(--color-bg-secondary)',
          'border-bottom': '1px solid var(--color-border-secondary)',
        }}
      >
        <div class="flex items-center gap-2">
          <GitBranch size={14} style={{ color: 'var(--color-accent)' }} />
          <span class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Git
          </span>
          <Show when={gitState.repoInfo?.head_branch}>
            {(branch) => (
              <span
                class="rounded-full px-2 py-0.5 font-mono text-[10px]"
                style={{
                  background: 'var(--color-bg-elevated)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                {branch()}
              </span>
            )}
          </Show>
          <Show when={gitState.repoInfo && gitState.repoInfo.ahead > 0}>
            <span
              class="font-mono text-[10px] font-semibold"
              style={{ color: 'var(--color-success)' }}
              title={`${gitState.repoInfo!.ahead} commit(s) ahead of upstream`}
            >
              ↑{gitState.repoInfo!.ahead}
            </span>
          </Show>
          <Show when={gitState.repoInfo && gitState.repoInfo.behind > 0}>
            <span
              class="font-mono text-[10px] font-semibold"
              style={{ color: 'var(--color-warning)' }}
              title={`${gitState.repoInfo!.behind} commit(s) behind upstream`}
            >
              ↓{gitState.repoInfo!.behind}
            </span>
          </Show>
        </div>

        <div class="flex items-center gap-1">
          <Show when={gitState.repoInfo}>
            <RemoteActions />
          </Show>
          <button
            class="rounded p-1 transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none' }}
            onClick={handleRefresh}
            title="Refresh Git status"
            aria-label="Refresh Git status"
            disabled={gitState.isLoading}
          >
            <RefreshCw size={13} classList={{ 'animate-spin': gitState.isLoading }} />
          </button>
        </div>
      </div>

      <Show when={gitState.remoteOperation !== null && gitState.remoteProgress}>
        {(progress) => (
          <div class="h-0.5 w-full shrink-0" style={{ background: 'var(--color-bg-elevated)' }}>
            <div
              class="h-full"
              style={{
                background: 'var(--color-accent)',
                width:
                  progress().total > 0
                    ? `${Math.min(100, Math.round((progress().current / progress().total) * 100))}%`
                    : '30%',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        )}
      </Show>

      <div class="min-h-0 flex-1 overflow-y-auto py-2">
        <Show when={!gitState.repoInfo && !gitState.isLoading}>
          <div
            class="flex flex-col items-center justify-center px-6 py-12 text-center"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <GitBranch size={32} class="mb-3 opacity-40" />
            <p class="text-sm">No Git repository</p>
            <p class="mt-1 text-xs opacity-70">
              Open a project folder that contains a Git repository.
            </p>
          </div>
        </Show>

        <Show when={gitState.isLoading}>
          <div
            class="flex items-center justify-center py-8"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <RefreshCw size={16} class="animate-spin" />
          </div>
        </Show>

        <Show when={gitState.repoInfo && !gitState.isLoading && !hasChanges()}>
          <div class="px-4 py-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            No changes. Working tree is clean.
          </div>
        </Show>

        <Show when={gitState.repoInfo && !gitState.isLoading && hasChanges()}>
          <Show when={staged().length > 0}>
            <ChangedFilesList title="Staged" files={staged()} defaultOpen={true} />
          </Show>
          <Show when={unstaged().length > 0}>
            <ChangedFilesList title="Changes" files={unstaged()} defaultOpen={true} />
          </Show>
          <Show when={untracked().length > 0}>
            <ChangedFilesList title="Untracked" files={untracked()} defaultOpen={false} />
          </Show>
        </Show>

        <Show when={gitState.error}>
          <div
            class="mx-3 rounded-md px-3 py-2 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
              border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)',
            }}
          >
            {gitState.error}
          </div>
        </Show>
      </div>

      <Show when={gitState.repoInfo}>
        <CommitBox />
        <CommitLog />
        <StashList />
      </Show>
    </div>
  );
};

export default GitPanel;
