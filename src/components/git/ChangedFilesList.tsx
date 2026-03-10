// src/components/git/ChangedFilesList.tsx
// Collapsible section showing files in one status category (CHI-316).

import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import { AlertCircle, ChevronRight, FileEdit, FilePlus, Minus } from 'lucide-solid';
import {
  gitState,
  setSelectedGitFile,
  type FileStatusEntry,
  type FileStatusKind,
} from '@/stores/gitStore';

interface Props {
  title: string;
  files: FileStatusEntry[];
  defaultOpen?: boolean;
}

function fileStatusIcon(status: FileStatusKind): Component<{ size?: number }> {
  switch (status) {
    case 'staged':
    case 'modified':
      return FileEdit;
    case 'untracked':
      return FilePlus;
    case 'deleted':
      return Minus;
    default:
      return AlertCircle;
  }
}

function fileStatusColor(status: FileStatusKind): string {
  switch (status) {
    case 'staged':
      return 'var(--color-success)';
    case 'modified':
      return 'var(--color-warning)';
    case 'untracked':
      return 'var(--color-text-tertiary)';
    case 'deleted':
    case 'conflicted':
      return 'var(--color-error)';
    default:
      return 'var(--color-text-tertiary)';
  }
}

const ChangedFilesList: Component<Props> = (props) => {
  const [isOpen, setIsOpen] = createSignal(props.defaultOpen ?? true);

  return (
    <div class="mb-1">
      <button
        class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:opacity-80"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen()}
      >
        <ChevronRight
          size={10}
          style={{
            transform: isOpen() ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
        <span
          class="text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {props.title}
        </span>
        <span
          class="ml-auto rounded-full px-1.5 text-[9px] font-semibold"
          style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}
        >
          {props.files.length}
        </span>
      </button>

      <Show when={isOpen()}>
        <div>
          <For each={props.files}>
            {(file) => {
              const Icon = fileStatusIcon(file.status);
              const color = fileStatusColor(file.status);
              const filename = file.path.split('/').pop() ?? file.path;
              const dirname = file.path.includes('/')
                ? file.path.slice(0, file.path.lastIndexOf('/'))
                : '';

              return (
                <button
                  class="flex w-full items-center gap-2 px-4 py-0.5 text-left transition-colors hover:opacity-80"
                  classList={{
                    'bg-[rgba(232,130,90,0.08)]': gitState.selectedGitFile?.path === file.path,
                  }}
                  style={{ 'min-height': '24px' }}
                  title={file.path}
                  onClick={() => setSelectedGitFile(file)}
                >
                  <span style={{ color, 'flex-shrink': '0' }}>
                    <Icon size={11} />
                  </span>
                  <span
                    class="min-w-0 flex-1 truncate text-xs"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {filename}
                  </span>
                  <Show when={dirname}>
                    <span
                      class="shrink-0 max-w-[80px] truncate text-[10px] font-mono"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      title={dirname}
                  >
                    {dirname}
                  </span>
                </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ChangedFilesList;
