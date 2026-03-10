// src/components/git/GitDiffView.tsx
// Renders a unified diff for the selected Git file (CHI-318).

import type { Component } from 'solid-js';
import { For, Show, createEffect } from 'solid-js';
import { FileCode, RefreshCw } from 'lucide-solid';
import {
  gitState,
  loadFileDiff,
  stageFile,
  stageHunk,
  type DiffLineKind,
  unstageFile,
  unstageHunk,
} from '@/stores/gitStore';

function diffLineBg(kind: DiffLineKind): string {
  switch (kind) {
    case 'added':
      return 'var(--color-diff-add-bg, rgba(63, 185, 80, 0.15))';
    case 'removed':
      return 'var(--color-diff-remove-bg, rgba(248, 81, 73, 0.15))';
    default:
      return 'transparent';
  }
}

function diffLinePrefix(kind: DiffLineKind): string {
  switch (kind) {
    case 'added':
      return '+';
    case 'removed':
      return '-';
    default:
      return ' ';
  }
}

function diffLinePrefixColor(kind: DiffLineKind): string {
  switch (kind) {
    case 'added':
      return 'var(--color-success)';
    case 'removed':
      return 'var(--color-error)';
    default:
      return 'var(--color-text-tertiary)';
  }
}

const GitDiffView: Component = () => {
  createEffect(() => {
    const file = gitState.selectedGitFile;
    if (file) {
      void loadFileDiff(file);
    }
  });

  return (
    <Show when={gitState.selectedGitFile}>
      {(file) => (
        <div class="flex h-full flex-col" style={{ background: 'var(--color-bg-primary)' }}>
          <div
            class="flex shrink-0 items-center gap-2 px-3 py-2"
            style={{
              background: 'var(--color-bg-secondary)',
              'border-bottom': '1px solid var(--color-border-secondary)',
            }}
          >
            <FileCode size={13} style={{ color: 'var(--color-text-tertiary)', 'flex-shrink': '0' }} />
            <span
              class="min-w-0 flex-1 truncate font-mono text-xs"
              style={{ color: 'var(--color-text-primary)' }}
              title={file().path}
            >
              {file().path}
            </span>
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
              style={{
                background: file().is_staged
                  ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                  : 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                color: file().is_staged ? 'var(--color-success)' : 'var(--color-warning)',
              }}
            >
              {file().is_staged ? 'staged' : file().status}
            </span>
            <div class="ml-auto flex items-center gap-1.5">
              <Show when={!file().is_staged}>
                <button
                  class="rounded px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
                    color: 'var(--color-success)',
                    border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
                  }}
                  onClick={() => void stageFile(file())}
                  title="Stage file"
                >
                  Stage
                </button>
              </Show>
              <Show when={file().is_staged}>
                <button
                  class="rounded px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                    color: 'var(--color-warning)',
                    border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
                  }}
                  onClick={() => void unstageFile(file())}
                  title="Unstage file"
                >
                  Unstage
                </button>
              </Show>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <Show when={gitState.isDiffLoading}>
              <div
                class="flex items-center justify-center py-8"
                style={{ color: 'var(--color-text-tertiary)' }}
                aria-busy="true"
              >
                <RefreshCw size={16} class="animate-spin" />
              </div>
            </Show>

            <Show when={!gitState.isDiffLoading && !gitState.selectedFileDiff}>
              <p class="px-4 py-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                No diff available.
              </p>
            </Show>

            <Show when={!gitState.isDiffLoading && gitState.selectedFileDiff?.is_binary}>
              <p class="px-4 py-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Binary file changed.
              </p>
            </Show>

            <Show
              when={
                !gitState.isDiffLoading &&
                gitState.selectedFileDiff &&
                !gitState.selectedFileDiff.is_binary
              }
            >
              <For each={gitState.selectedFileDiff?.hunks ?? []}>
                {(hunk, hunkIdx) => (
                  <div>
                    <div
                      class="sticky top-0 flex items-center justify-between px-2 py-0.5 font-mono text-[10px]"
                      style={{
                        background: 'var(--color-bg-elevated)',
                        color: 'var(--color-text-tertiary)',
                        'border-bottom': '1px solid var(--color-border-secondary)',
                        'z-index': '1',
                      }}
                    >
                      <span>{hunk.header}</span>
                      <div class="flex items-center gap-1">
                        <Show when={!file().is_staged}>
                          <button
                            class="rounded px-1.5 py-0.5 text-[9px] font-semibold transition-opacity hover:opacity-80"
                            style={{
                              background:
                                'color-mix(in srgb, var(--color-success) 15%, transparent)',
                              color: 'var(--color-success)',
                            }}
                            onClick={() => void stageHunk(file().path, hunkIdx())}
                            title={`Stage hunk ${hunkIdx() + 1}`}
                          >
                            +
                          </button>
                        </Show>
                        <Show when={file().is_staged}>
                          <button
                            class="rounded px-1.5 py-0.5 text-[9px] font-semibold transition-opacity hover:opacity-80"
                            style={{
                              background:
                                'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                              color: 'var(--color-warning)',
                            }}
                            onClick={() => void unstageHunk(file().path, hunkIdx())}
                            title={`Unstage hunk ${hunkIdx() + 1}`}
                          >
                            -
                          </button>
                        </Show>
                      </div>
                    </div>

                    <For each={hunk.lines}>
                      {(line) => (
                        <div
                          class="flex items-stretch font-mono text-xs"
                          style={{ background: diffLineBg(line.kind) }}
                        >
                          <span
                            class="w-10 shrink-0 select-none px-1 text-right text-[10px]"
                            style={{
                              color: 'var(--color-text-tertiary)',
                              'border-right': '1px solid var(--color-border-secondary)',
                            }}
                          >
                            {line.old_lineno ?? ''}
                          </span>
                          <span
                            class="w-10 shrink-0 select-none px-1 text-right text-[10px]"
                            style={{
                              color: 'var(--color-text-tertiary)',
                              'border-right': '1px solid var(--color-border-secondary)',
                            }}
                          >
                            {line.new_lineno ?? ''}
                          </span>
                          <span
                            class="w-4 shrink-0 select-none text-center text-[10px]"
                            style={{ color: diffLinePrefixColor(line.kind) }}
                          >
                            {diffLinePrefix(line.kind)}
                          </span>
                          <span
                            class="min-w-0 flex-1 whitespace-pre px-1 py-px"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {line.content}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};

export default GitDiffView;
