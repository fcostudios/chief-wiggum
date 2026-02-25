// src/components/explorer/FileTree.tsx
// File tree container with search and lazy-loaded directory tree.
// Loads root files on mount when a project is active.

import type { Component } from 'solid-js';
import { Show, For, createEffect } from 'solid-js';
import { Search } from 'lucide-solid';
import {
  fileState,
  loadRootFiles,
  getRootNodes,
  searchFiles,
  clearSearch,
  selectFile,
  retryLoadFiles,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import FileTreeNode from './FileTreeNode';

interface FileTreeProps {
  singleScroll?: boolean;
}

const FileTree: Component<FileTreeProps> = (props) => {
  const projectId = () => projectState.activeProjectId;

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

  return (
    <div
      class="flex flex-col min-h-0"
      classList={{ 'h-full': !props.singleScroll, 'h-auto': !!props.singleScroll }}
    >
      {/* Search input */}
      <div class="px-2 pb-1.5">
        <div class="relative">
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

            <Show
              when={getRootNodes().length > 0}
              fallback={
                <div class="px-2 py-2 text-[10px] text-text-tertiary/50">
                  {t('explorer.noFiles')}
                </div>
              }
            >
              <div class="px-1" role="tree" aria-label="File explorer">
                <For each={getRootNodes()}>{(node) => <FileTreeNode node={node} depth={0} />}</For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default FileTree;
