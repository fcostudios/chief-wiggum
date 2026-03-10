// src/components/git/BranchIndicator.tsx
// Branch name pill in the status bar (CHI-315).
// Clicking it opens the Git panel.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { GitBranch } from 'lucide-solid';
import { gitState } from '@/stores/gitStore';
import { setActiveView } from '@/stores/uiStore';

const BranchIndicator: Component = () => {
  return (
    <Show when={gitState.repoInfo}>
      {(info) => (
        <button
          class="flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-colors hover:opacity-80"
          style={{
            'font-size': '10px',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={() => setActiveView('git')}
          title="Open Git panel"
          aria-label={`Git branch: ${info().head_branch ?? 'detached HEAD'}`}
        >
          <GitBranch size={10} />
          <span class="font-mono max-w-[120px] truncate">{info().head_branch ?? 'HEAD'}</span>
          <Show when={info().is_dirty}>
            <span
              style={{ color: 'var(--color-warning)' }}
              aria-label="uncommitted changes"
              title="Uncommitted changes"
            >
              •
            </span>
          </Show>
        </button>
      )}
    </Show>
  );
};

export default BranchIndicator;
