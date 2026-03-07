// src/components/explorer/FileTree.tsx
// File tree container with search and lazy-loaded directory tree.
// Loads root files on mount when a project is active.

import type { Component } from 'solid-js';
import { Show, For, createEffect, createSignal, onMount } from 'solid-js';
import { Search, Eye, EyeOff, Plus, FilePlus, FolderPlus } from 'lucide-solid';
import {
  fileState,
  loadRootFiles,
  getRootNodes,
  getChildren,
  searchFiles,
  clearSearch,
  selectFile,
  retryLoadFiles,
  toggleShowIgnoredFiles,
  startCreating,
  cancelCreating,
  createFileInProject,
  createDirectoryInProject,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import FileTreeNode from './FileTreeNode';
import InlineFileInput from './InlineFileInput';

interface FileTreeProps {
  singleScroll?: boolean;
}

const FileTree: Component<FileTreeProps> = (props) => {
  const projectId = () => projectState.activeProjectId;
  const [showIgnoredPulse, setShowIgnoredPulse] = createSignal(false);
  const [createMenuOpen, setCreateMenuOpen] = createSignal(false);
  const showIgnoredHintSeenKey = 'cw:showIgnoredHintSeen';

  onMount(() => {
    try {
      if (localStorage.getItem(showIgnoredHintSeenKey) !== '1') {
        setShowIgnoredPulse(true);
      }
    } catch {
      // localStorage may be unavailable in tests/browser mode.
    }
  });

  // Reload root when project changes
  createEffect(() => {
    const pid = projectId();
    if (pid) {
      loadRootFiles(pid);
    }
  });

  function handleSearchInput(e: InputEvent) {
    const pid = projectId();
    if (!pid) return;
    const value = (e.target as HTMLInputElement).value;
    searchFiles(pid, value);
  }

  function handleSearchResultClick(relativePath: string) {
    const pid = projectId();
    if (!pid) return;
    selectFile(pid, relativePath);
    clearSearch();
  }

  function handleToggleShowIgnoredFiles() {
    if (showIgnoredPulse()) {
      setShowIgnoredPulse(false);
      try {
        localStorage.setItem(showIgnoredHintSeenKey, '1');
      } catch {
        // localStorage may be unavailable.
      }
    }
    toggleShowIgnoredFiles();
  }

  function findNodeByPath(path: string): ReturnType<typeof getRootNodes>[number] | null {
    if (!path) return null;
    const walk = (nodes: ReturnType<typeof getRootNodes>[number][]): ReturnType<typeof getRootNodes>[number] | null => {
      for (const node of nodes) {
        if (node.relative_path === path) return node;
        if (node.node_type === 'Directory') {
          const found = walk(getChildren(node.relative_path));
          if (found) return found;
        }
      }
      return null;
    };
    return walk(getRootNodes());
  }

  function selectedFolder(): string {
    const selected = fileState.selectedPath;
    if (!selected) return '';
    const node = findNodeByPath(selected);
    if (node?.node_type === 'Directory') return selected;
    return selected.split('/').slice(0, -1).join('/');
  }

  function triggerCreate(type: 'file' | 'folder'): void {
    setCreateMenuOpen(false);
    startCreating(selectedFolder(), type);
  }

  return (
    <div
      class="flex flex-col min-h-0"
      classList={{ 'h-full': !props.singleScroll, 'h-auto': !!props.singleScroll }}
    >
      {/* Search + toolbar */}
      <div class="flex items-center gap-1 px-2 pb-1.5">
        <div class="relative flex-1 min-w-0">
          <Search
            size={10}
            class="absolute left-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-tertiary)' }}
          />
          <input
            type="text"
            class="w-full text-[11px] font-mono rounded-md pl-6 pr-2 py-1 focus:outline-none transition-colors"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
              'transition-duration': 'var(--duration-fast)',
            }}
            placeholder={t('explorer.searchFiles')}
            value={fileState.searchQuery}
            onInput={handleSearchInput}
          />
        </div>
        <button
          class="shrink-0 p-1 rounded transition-colors"
          classList={{ 'animate-pulse': showIgnoredPulse() }}
          style={{
            color: fileState.showIgnoredFiles
              ? 'var(--color-accent)'
              : 'var(--color-text-tertiary)',
            background: fileState.showIgnoredFiles ? 'var(--color-accent-muted)' : 'transparent',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={handleToggleShowIgnoredFiles}
          aria-label={
            fileState.showIgnoredFiles
              ? t('explorer.hideIgnoredFiles')
              : t('explorer.showIgnoredFiles')
          }
          aria-pressed={fileState.showIgnoredFiles}
          title={
            fileState.showIgnoredFiles
              ? t('explorer.hideIgnoredFilesShortcut')
              : t('explorer.showIgnoredFilesShortcut')
          }
        >
          <Show when={fileState.showIgnoredFiles} fallback={<EyeOff size={13} />}>
            <Eye size={13} />
          </Show>
        </button>
        <div class="relative shrink-0">
          <button
            class="p-1 rounded transition-colors text-text-tertiary hover:text-text-primary hover:bg-bg-secondary"
            onClick={() => setCreateMenuOpen((prev) => !prev)}
            aria-label="Create new file or folder"
          >
            <Plus size={13} />
          </button>
          <Show when={createMenuOpen()}>
            <div
              class="absolute right-0 top-full mt-1 z-30 w-[150px] rounded-md overflow-hidden"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-primary)',
                'box-shadow': 'var(--shadow-md)',
              }}
            >
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-text-primary hover:bg-bg-secondary"
                onClick={() => triggerCreate('file')}
              >
                <FilePlus size={12} />
                {t('files.newFile')}
              </button>
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-text-primary hover:bg-bg-secondary"
                onClick={() => triggerCreate('folder')}
              >
                <FolderPlus size={12} />
                {t('files.newFolder')}
              </button>
            </div>
          </Show>
        </div>
      </div>

      {/* Search results or tree */}
      <div
        data-file-tree-scroll-region
        class="min-h-0"
        classList={{ 'flex-1': !props.singleScroll, 'overflow-y-auto': !props.singleScroll }}
        style={{
          'scrollbar-gutter': props.singleScroll ? undefined : 'stable',
          'overscroll-behavior': props.singleScroll ? undefined : 'contain',
        }}
      >
        <Show
          when={!fileState.searchQuery}
          fallback={
            /* Search results */
            <div class="px-1">
              <Show when={fileState.isSearching}>
                <div class="px-2 py-2 text-[10px] text-text-tertiary/50">Searching...</div>
              </Show>
              <Show
                when={
                  !fileState.isSearching &&
                  fileState.searchResults.length === 0 &&
                  fileState.searchQuery
                }
              >
                <div class="px-2 py-2 text-[10px] text-text-tertiary/50">
                  {t('explorer.noFilesFound')}
                </div>
              </Show>
              <For each={fileState.searchResults}>
                {(result) => (
                  <button
                    class="flex items-center gap-2 w-full text-left px-2 py-1 rounded-sm text-xs transition-colors"
                    style={{
                      color: 'var(--color-text-secondary)',
                      'transition-duration': 'var(--duration-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                    }}
                    onClick={() => handleSearchResultClick(result.relative_path)}
                    title={result.relative_path}
                  >
                    <span class="font-mono text-[11px] truncate">{result.name}</span>
                    <span class="text-[9px] text-text-tertiary/40 truncate flex-1 text-right">
                      {result.relative_path}
                    </span>
                  </button>
                )}
              </For>
            </div>
          }
        >
          {/* File tree */}
          <Show
            when={!fileState.isLoading}
            fallback={
              <div class="px-2 py-2 text-[10px] text-text-tertiary/50">{t('common.loading')}</div>
            }
          >
            <Show when={fileState.loadError}>
              <div
                class="mx-1 mb-2 flex flex-col items-center gap-2 px-3 py-3 text-center rounded-md"
                style={{
                  border: '1px solid var(--color-error)',
                  background: 'var(--color-error-muted)',
                }}
                role="alert"
              >
                <p class="text-xs font-medium text-error">{t('errors.couldNotLoadFiles')}</p>
                <p class="text-[10px] text-text-tertiary break-all">{fileState.loadError}</p>
                <button
                  class="text-[10px] text-accent hover:underline"
                  onClick={() => void retryLoadFiles()}
                >
                  {t('common.retry')}
                </button>
              </div>
            </Show>

            <div class="px-1" role="tree" aria-label="File explorer">
              <Show when={fileState.creatingInFolder === '' && fileState.creatingType}>
                <InlineFileInput
                  parentPath=""
                  type={fileState.creatingType!}
                  depth={0}
                  onConfirm={(name) => {
                    const pid = projectId();
                    if (!pid) return;
                    if (fileState.creatingType === 'folder') {
                      void createDirectoryInProject(pid, name);
                    } else {
                      void createFileInProject(pid, name);
                    }
                  }}
                  onCancel={cancelCreating}
                />
              </Show>
              <Show
                when={getRootNodes().length > 0}
                fallback={
                  <div class="px-2 py-2 text-[10px] text-text-tertiary/50">
                    {t('files.noFiles')}
                  </div>
                }
              >
                <For each={getRootNodes()}>{(node) => <FileTreeNode node={node} depth={0} />}</For>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default FileTree;
