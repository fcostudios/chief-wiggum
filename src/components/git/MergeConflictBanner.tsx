// src/components/git/MergeConflictBanner.tsx
// Banner shown at top of GitPanel when merge conflicts are detected (CHI-327).

import type { Component } from 'solid-js';
import { createMemo } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle } from 'lucide-solid';
import { gitState, refreshGitStatus } from '@/stores/gitStore';
import { addToast } from '@/stores/toastStore';

export function hasConflicts(statusEntries: { status: string }[]): boolean {
  return statusEntries.some((entry) => entry.status === 'conflicted');
}

const MergeConflictBanner: Component = () => {
  const conflicted = createMemo(() =>
    gitState.statusEntries.filter((entry) => entry.status === 'conflicted'),
  );

  async function handleAbortMerge() {
    const projectId = gitState.projectId;
    if (!projectId) return;

    try {
      await invoke('git_abort_merge', { project_id: projectId });
      await refreshGitStatus();
      addToast('Merge aborted', 'success');
    } catch (err) {
      addToast(`Abort merge failed: ${String(err)}`, 'error');
    }
  }

  const count = createMemo(() => conflicted().length);
  const fileList = createMemo(() => {
    const names = conflicted()
      .map((entry) => entry.path.split('/').pop() ?? entry.path)
      .slice(0, 3)
      .join(', ');
    return count() > 3 ? `${names} +${count() - 3} more` : names;
  });

  return (
    <div
      role="alert"
      class="flex items-start gap-2 px-3 py-2"
      style={{
        background: 'var(--color-diff-modify-bg, rgba(210, 153, 34, 0.15))',
        'border-bottom': '1px solid var(--color-warning)',
      }}
    >
      <AlertTriangle
        size={13}
        style={{
          color: 'var(--color-warning)',
          'flex-shrink': '0',
          'margin-top': '1px',
        }}
      />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
          Merge conflict in {count()} file{count() !== 1 ? 's' : ''}
        </p>
        <p class="truncate text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
          {fileList()}
        </p>
      </div>
      <button
        class="shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-70"
        style={{
          background: 'none',
          border: '1px solid var(--color-warning)',
          color: 'var(--color-warning)',
          cursor: 'pointer',
        }}
        aria-label="Abort merge"
        onClick={() => void handleAbortMerge()}
      >
        Abort Merge
      </button>
    </div>
  );
};

export default MergeConflictBanner;
