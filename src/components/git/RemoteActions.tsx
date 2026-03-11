import type { Component } from 'solid-js';
import { Show, createMemo } from 'solid-js';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-solid';
import { addToast } from '@/stores/toastStore';
import { fetchRemote, gitState, pullRemote, pushRemote } from '@/stores/gitStore';

const RemoteActions: Component = () => {
  const isRunning = createMemo(() => gitState.remoteOperation !== null);

  async function handleFetch() {
    try {
      await fetchRemote();
      addToast('Fetched from origin', 'success');
    } catch {
      addToast(`Fetch failed: ${gitState.remoteError ?? 'unknown error'}`, 'error');
    }
  }

  async function handlePull() {
    try {
      const message = await pullRemote();
      addToast(message, 'success');
    } catch {
      addToast(`Pull failed: ${gitState.remoteError ?? 'unknown error'}`, 'error');
    }
  }

  async function handlePush() {
    try {
      await pushRemote();
      addToast('Pushed to origin', 'success');
    } catch {
      addToast(`Push failed: ${gitState.remoteError ?? 'unknown error'}`, 'error');
    }
  }

  return (
    <div class="flex items-center gap-0.5">
      <button
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)' }}
        onClick={() => void handleFetch()}
        disabled={isRunning()}
        title="Fetch"
        aria-label="Fetch from remote"
      >
        <RefreshCw size={11} classList={{ 'animate-spin': gitState.remoteOperation === 'fetch' }} />
        <span class="hidden sm:inline">Fetch</span>
      </button>

      <button
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)' }}
        onClick={() => void handlePull()}
        disabled={isRunning()}
        title="Pull"
        aria-label="Pull from remote"
      >
        <ArrowDown size={11} classList={{ 'animate-bounce': gitState.remoteOperation === 'pull' }} />
        <span class="hidden sm:inline">Pull</span>
      </button>

      <button
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)' }}
        onClick={() => void handlePush()}
        disabled={isRunning()}
        title="Push"
        aria-label="Push to remote"
      >
        <ArrowUp size={11} classList={{ 'animate-bounce': gitState.remoteOperation === 'push' }} />
        <span class="hidden sm:inline">Push</span>
      </button>

      <Show when={gitState.remoteProgress && gitState.remoteProgress.total > 0}>
        <span class="ml-1 text-[9px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          {gitState.remoteProgress!.current}/{gitState.remoteProgress!.total}
        </span>
      </Show>
    </div>
  );
};

export default RemoteActions;
