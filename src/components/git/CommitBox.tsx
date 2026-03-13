// src/components/git/CommitBox.tsx
// Commit message input + action buttons for Git panel (CHI-320).

import type { Component } from 'solid-js';
import { Show, createMemo, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles } from 'lucide-solid';
import { gitState, getStagedFiles, refreshGitStatus, refreshRepoInfo } from '@/stores/gitStore';
import { addToast } from '@/stores/toastStore';

const CommitBox: Component = () => {
  const [message, setMessage] = createSignal('');
  const [amend, setAmend] = createSignal(false);
  const [isCommitting, setIsCommitting] = createSignal(false);
  const [isGenerating, setIsGenerating] = createSignal(false);

  const staged = createMemo(() => getStagedFiles());
  const stagedCount = createMemo(() => staged().length);
  const firstLine = createMemo(() => message().split('\n')[0] ?? '');
  const firstLineLength = createMemo(() => firstLine().length);
  const showCounter = createMemo(() => firstLineLength() > 50);
  const counterOver = createMemo(() => firstLineLength() > 72);

  const canCommit = createMemo(
    () => message().trim().length > 0 && (stagedCount() > 0 || amend()) && !isCommitting(),
  );

  async function handleCommit() {
    if (!canCommit()) return;
    const projectId = gitState.projectId;
    if (!projectId) return;

    setIsCommitting(true);
    try {
      const sha = await invoke<string>(amend() ? 'git_amend_commit' : 'git_create_commit', {
        project_id: projectId,
        message: message().trim(),
      });
      setMessage('');
      setAmend(false);
      addToast(`Committed ${sha} — ${firstLine()}`, 'success');
      await refreshGitStatus();
      await refreshRepoInfo();
    } catch (err) {
      addToast(`Commit failed: ${String(err)}`, 'error');
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleAmendToggle(checked: boolean) {
    setAmend(checked);
    if (checked && message().trim() === '') {
      const projectId = gitState.projectId;
      if (!projectId) return;
      try {
        const lastMsg = await invoke<string | null>('git_get_last_commit_message', {
          project_id: projectId,
        });
        if (lastMsg) setMessage(lastMsg.trimEnd());
      } catch {
        // Ignore prefill failures.
      }
    }
  }

  async function handleGenerateMessage() {
    const projectId = gitState.projectId;
    if (!projectId || stagedCount() === 0) return;

    setIsGenerating(true);
    try {
      const generated = await invoke<string>('git_generate_commit_message', {
        project_id: projectId,
      });
      setMessage(generated);
    } catch (err) {
      const reason = String(err).split(':').pop()?.trim() ?? 'unknown';
      addToast(`AI message generation failed: ${reason}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleCommit();
    }
  }

  return (
    <div
      class="shrink-0 px-3 py-3"
      style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
    >
      <div class="relative mb-2">
        <textarea
          class="w-full resize-none rounded-md px-3 py-2 font-mono text-sm transition-colors"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-primary)',
            'min-height': '56px',
            'max-height': '96px',
            outline: 'none',
            'line-height': '1.5',
          }}
          placeholder="Commit message..."
          value={message()}
          onInput={(e) => setMessage(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          aria-label="Commit message"
          rows={2}
        />
        <Show when={showCounter()}>
          <span
            class="absolute bottom-2 right-2 text-[10px] font-mono"
            style={{ color: counterOver() ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}
          >
            {firstLineLength()}/72
          </span>
        </Show>
      </div>

      <label
        class="mb-2 flex items-center gap-1.5 text-xs"
        style={{ color: 'var(--color-text-secondary)', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={amend()}
          onChange={(e) => void handleAmendToggle(e.currentTarget.checked)}
          aria-label="Amend last commit"
        />
        <span>Amend last commit</span>
      </label>

      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1 rounded px-2 py-1 text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
          }}
          disabled={stagedCount() === 0 || isGenerating()}
          onClick={() => void handleGenerateMessage()}
          title={stagedCount() === 0 ? 'Stage changes first' : 'Generate AI commit message'}
          aria-label="Generate AI commit message"
        >
          <Show
            when={isGenerating()}
            fallback={
              <>
                <Sparkles size={11} />
                AI Message
              </>
            }
          >
            <svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25" />
              <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
            </svg>
            Generating...
          </Show>
        </button>

        <button
          class="ml-auto rounded px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-40"
          style={{
            background: canCommit() ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
            color: canCommit() ? 'white' : 'var(--color-text-tertiary)',
            border: canCommit() ? 'none' : '1px solid var(--color-border-secondary)',
          }}
          disabled={!canCommit()}
          onClick={() => void handleCommit()}
          title={
            stagedCount() === 0 && !amend()
              ? 'Stage changes to commit'
              : message().trim() === ''
                ? 'Enter a commit message'
                : 'Cmd+Enter to commit'
          }
          aria-label={`${amend() ? 'Amend' : 'Commit'} (${stagedCount()} staged)`}
        >
          {amend() ? `Amend (${stagedCount()})` : `Commit (${stagedCount()})`}
        </button>
      </div>
    </div>
  );
};

export default CommitBox;
