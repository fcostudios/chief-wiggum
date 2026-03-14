// src/components/git/ChangedFilesList.tsx
// Collapsible section showing files in one status category (CHI-316).

import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, ChevronRight, FileEdit, FilePlus, Minus, X } from 'lucide-solid';
import { addToast } from '@/stores/toastStore';
import {
  gitState,
  refreshGitStatus,
  setSelectedGitFile,
  type DiscardResult,
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

  async function discardFile(file: FileStatusEntry): Promise<void> {
    const projectId = gitState.projectId;
    if (!projectId) return;

    try {
      const result = await invoke<DiscardResult>('git_discard_file', {
        project_id: projectId,
        file_path: file.path,
      });
      await refreshGitStatus();
      setSelectedGitFile(null);

      const undo = result.old_content
        ? async () => {
            try {
              await invoke('write_file_content', {
                project_id: projectId,
                relative_path: file.path,
                content: result.old_content,
              });
              await refreshGitStatus();
            } catch {
              addToast('Undo failed — could not restore file', 'error');
            }
          }
        : undefined;

      addToast(
        `Changes discarded for ${file.path.split('/').pop() ?? file.path}`,
        'undo',
        undo ? { label: 'Undo', onClick: () => void undo() } : undefined,
      );
    } catch (err) {
      addToast(`Discard failed: ${String(err)}`, 'error');
    }
  }

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
                <div
                  class="group flex w-full items-center gap-1 px-1.5"
                  classList={{
                    'bg-[rgba(232,130,90,0.08)]': gitState.selectedGitFile?.path === file.path,
                  }}
                  title={file.path}
                >
                  <button
                    class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-0.5 text-left transition-colors hover:opacity-80"
                    style={{ 'min-height': '24px' }}
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
                  <Show when={!file.is_staged}>
                    <button
                      class="ml-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:opacity-70"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-error)',
                      }}
                      aria-label={`Discard changes to ${file.path}`}
                      title="Discard changes"
                      onClick={() => void discardFile(file)}
                    >
                      <X size={11} />
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ChangedFilesList;
