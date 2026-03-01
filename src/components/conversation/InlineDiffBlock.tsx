// src/components/conversation/InlineDiffBlock.tsx
// Inline unified diff actions (Apply / Reject / Open in Diff) for assistant messages (CHI-230).

import type { Component } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { applyDiff, extractFilePath } from '@/lib/diffApplicator';
import { getDiffState, setDiffState } from '@/stores/conversationStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';
import { setActiveView } from '@/stores/uiStore';
import { setActiveInlineDiff } from '@/stores/diffReviewStore';
import type { FileContent } from '@/lib/types';

interface InlineDiffBlockProps {
  code: string;
  diffKey: string;
}

function countChangedLines(diffText: string): { addedLines: number; removedLines: number } {
  let addedLines = 0;
  let removedLines = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      addedLines += 1;
      continue;
    }
    if (line.startsWith('-')) removedLines += 1;
  }
  return { addedLines, removedLines };
}

const InlineDiffBlock: Component<InlineDiffBlockProps> = (props) => {
  const [isApplying, setIsApplying] = createSignal(false);
  const [targetFileExists, setTargetFileExists] = createSignal<boolean | null>(null);
  const state = () => getDiffState(props.diffKey);
  const filePath = () => extractFilePath(props.code);
  const projectId = () => projectState.activeProjectId;

  const lines = createMemo(() =>
    props.code.split('\n').map((line) => {
      let color = 'var(--color-text-secondary)';
      let bg = 'transparent';
      if (line.startsWith('+') && !line.startsWith('+++')) {
        color = 'var(--color-diff-add-text)';
        bg = 'var(--color-diff-add-bg)';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        color = 'var(--color-diff-remove-text)';
        bg = 'var(--color-diff-remove-bg)';
      } else if (line.startsWith('@@')) {
        color = 'var(--color-accent)';
      }
      return { text: line, color, bg };
    }),
  );

  createEffect(() => {
    const path = filePath();
    const pid = projectId();
    if (!path || !pid) {
      setTargetFileExists(false);
      return;
    }

    let cancelled = false;
    setTargetFileExists(null);
    void invoke<FileContent>('read_project_file', {
      project_id: pid,
      relative_path: path,
    })
      .then(() => {
        if (!cancelled) setTargetFileExists(true);
      })
      .catch(() => {
        if (!cancelled) setTargetFileExists(false);
      });

    onCleanup(() => {
      cancelled = true;
    });
  });

  function openInDiffView(): void {
    const path = filePath() ?? 'Modified file';
    const counts = countChangedLines(props.code);
    setActiveInlineDiff({
      filePath: path,
      diffText: props.code,
      addedLines: counts.addedLines,
      removedLines: counts.removedLines,
    });
    setActiveView('diff');
  }

  async function handleApply(): Promise<void> {
    if (state() !== 'pending') return;
    const path = filePath();
    const pid = projectId();
    if (!path || !pid || targetFileExists() !== true) return;

    setIsApplying(true);
    try {
      const current = await invoke<FileContent>('read_project_file', {
        project_id: pid,
        relative_path: path,
      });

      const patched = applyDiff(current.content, props.code);
      if (patched == null) {
        addToast('Could not apply — file has changed. Open in Diff to review.', 'error', {
          label: 'Open in Diff',
          onClick: openInDiffView,
        });
        return;
      }

      await invoke('write_file_content', {
        project_id: pid,
        relative_path: path,
        content: patched,
      });

      setDiffState(props.diffKey, 'applied');
      addToast(`Applied to ${path}`, 'success');
    } catch {
      addToast('Could not apply — file has changed. Open in Diff to review.', 'error', {
        label: 'Open in Diff',
        onClick: openInDiffView,
      });
    } finally {
      setIsApplying(false);
    }
  }

  function handleReject(): void {
    if (state() !== 'pending') return;
    setDiffState(props.diffKey, 'rejected');
  }

  const canApply = () =>
    !!filePath() && !!projectId() && targetFileExists() === true && !isApplying();

  const applyTitle = () => {
    if (!filePath()) return 'File path could not be extracted from diff';
    if (!projectId()) return 'No active project';
    if (targetFileExists() === null) return 'Checking file availability...';
    if (targetFileExists() === false) return 'File not found in project.';
    return `Apply to ${filePath()}`;
  };

  return (
    <div
      class="my-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--color-border-secondary)' }}
    >
      <Show when={filePath()}>
        <div
          class="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono"
          style={{
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-tertiary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          <span>📄</span>
          <span>{filePath()}</span>
        </div>
      </Show>

      <pre
        class="overflow-x-auto text-xs font-mono p-3"
        style={{ background: 'var(--color-bg-inset)', margin: 0 }}
      >
        <For each={lines()}>
          {(line) => (
            <div style={{ background: line.bg, color: line.color, 'white-space': 'pre' }}>
              {line.text}
            </div>
          )}
        </For>
      </pre>

      <div
        class="flex items-center gap-2 px-3 py-2"
        style={{
          background: 'var(--color-bg-secondary)',
          'border-top': '1px solid var(--color-border-secondary)',
        }}
      >
        <Show
          when={state() === 'pending'}
          fallback={
            <Show
              when={state() === 'applied'}
              fallback={
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    background: 'var(--color-bg-elevated)',
                  }}
                >
                  ✗ Rejected
                </span>
              }
            >
              <span
                class="text-xs px-2 py-0.5 rounded-full"
                style={{
                  color: 'var(--color-success)',
                  background: 'rgba(63, 185, 80, 0.1)',
                }}
              >
                ✓ Applied
              </span>
            </Show>
          }
        >
          <button
            class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
            style={{
              background: canApply() ? 'var(--color-success)' : 'var(--color-bg-elevated)',
              color: canApply() ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
              cursor: canApply() ? 'pointer' : 'not-allowed',
              opacity: isApplying() ? '0.6' : '1',
            }}
            onClick={() => void handleApply()}
            disabled={!canApply()}
            aria-label="Apply"
            title={applyTitle()}
          >
            {isApplying() ? '⏳' : '✓'} Apply
          </button>

          <button
            class="px-2.5 py-1 rounded text-xs transition-colors"
            style={{
              color: 'var(--color-error)',
              background: 'rgba(248,81,73,0.08)',
              border: '1px solid rgba(248,81,73,0.15)',
            }}
            onClick={handleReject}
            aria-label="Reject"
          >
            ✗ Reject
          </button>

          <button
            class="ml-auto px-2 py-1 rounded text-xs transition-colors"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-elevated)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            onClick={openInDiffView}
            aria-label="Open in Diff"
          >
            ↗ Open in Diff
          </button>
        </Show>
      </div>
    </div>
  );
};

export default InlineDiffBlock;
