import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { ImportResult, ImportReviewItem } from '@/lib/types';
import {
  closeImportDialog,
  getSelectedImportFilePaths,
  getVisibleImportReviewItems,
  importState,
  mergePickedReviewItems,
  setFocusedImportItem,
  setImportPhase,
  setImportResults,
  setImportReviewItems,
  setImportSearchQuery,
  toggleImportSelection,
} from '@/stores/importStore';
import { projectState } from '@/stores/projectStore';
import { loadSessions } from '@/stores/sessionStore';
import { addToast } from '@/stores/toastStore';
import ImportProgress from './ImportProgress';
import ImportReviewList from './ImportReviewList';
import ImportSessionDetails from './ImportSessionDetails';

const ImportDialog: Component = () => {
  const activeProjectId = () => projectState.activeProjectId ?? '';
  const activeProject = () =>
    projectState.projects.find((project) => project.id === projectState.activeProjectId) ?? null;
  const activeProjectPath = () => activeProject()?.path ?? '';
  const visibleItems = () => getVisibleImportReviewItems();
  const focusedItem = () =>
    importState.reviewItems.find((item) => item.file_path === importState.focusedPath) ?? null;
  const selectedCount = () => getSelectedImportFilePaths().length;

  async function discoverFromClaudeDir() {
    setImportPhase('discovering');
    try {
      const sessions = await invoke<ImportReviewItem[]>('discover_importable_sessions');
      setImportReviewItems(sessions);
      setImportPhase('idle');
    } catch (error) {
      setImportPhase('error', String(error));
    }
  }

  async function pickFiles() {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = '.jsonl';
    picker.onchange = async () => {
      const files = Array.from(picker.files ?? []);
      if (files.length === 0) {
        return;
      }
      const paths = files
        .map((file) => {
          const maybePath = (file as File & { path?: string }).path;
          return typeof maybePath === 'string' ? maybePath : '';
        })
        .filter((path) => path.length > 0);
      if (paths.length === 0) {
        addToast('Could not read selected file path(s)', 'error');
        return;
      }

      setImportPhase('discovering');
      try {
        const reviewItems = await invoke<ImportReviewItem[]>('inspect_importable_files', {
          file_paths: paths,
        });
        mergePickedReviewItems(reviewItems);
        setImportPhase('idle');
      } catch (error) {
        setImportPhase('error', String(error));
        addToast(`Could not inspect selected file(s): ${String(error)}`, 'error');
      }
    };
    picker.click();
  }

  async function importSelected() {
    const filePaths = getSelectedImportFilePaths();
    if (filePaths.length === 0) {
      return;
    }
    await runImport(filePaths);
  }

  async function runImport(filePaths: string[]) {
    if (!activeProjectId()) {
      addToast('No active project selected', 'error');
      return;
    }

    setImportPhase('importing');
    try {
      const importResults = await invoke<ImportResult[]>('import_jsonl_batch', {
        file_paths: filePaths,
        project_id: activeProjectId(),
      });
      setImportResults(importResults);
      setImportPhase('done');
      await loadSessions();
    } catch (error) {
      setImportPhase('error', String(error));
      addToast(`Import failed: ${String(error)}`, 'error');
    }
  }

  return (
    <Show when={importState.dialogOpen}>
      <div
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-6 py-8"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeImportDialog();
          }
        }}
      >
        <div
          class="relative flex w-full max-w-6xl flex-col rounded-2xl border border-border-primary bg-bg-secondary shadow-2xl"
          style={{ 'max-height': '88vh' }}
          role="dialog"
          aria-modal="true"
          aria-label="Import Sessions"
        >
          <div class="flex items-center justify-between border-b border-border-secondary px-6 py-4">
            <div>
              <h2 class="text-base font-semibold text-text-primary">Import Sessions</h2>
              <p class="mt-1 text-sm text-text-secondary">
                Review each session before importing it into the active project.
              </p>
            </div>
            <button
              onClick={closeImportDialog}
              class="text-lg leading-none text-text-tertiary transition-colors hover:text-text-primary"
              aria-label="Close"
            >
              x
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <Show when={importState.phase === 'done'}>
              <ImportProgress
                results={importState.results}
                isRunning={false}
                onClose={closeImportDialog}
              />
            </Show>

            <Show when={importState.phase === 'importing'}>
              <ImportProgress results={[]} isRunning={true} onClose={() => undefined} />
            </Show>

            <Show when={importState.phase !== 'done' && importState.phase !== 'importing'}>
              <div class="flex flex-col gap-4 p-6">
                <div class="flex flex-wrap gap-3">
                  <button
                    onClick={discoverFromClaudeDir}
                    disabled={importState.phase === 'discovering'}
                    class="rounded-lg border border-border-default bg-bg-primary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-accent/60 disabled:cursor-wait disabled:opacity-70"
                  >
                    {importState.phase === 'discovering'
                      ? 'Scanning...'
                      : 'Scan ~/.claude/projects/'}
                  </button>
                  <button
                    onClick={pickFiles}
                    class="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg-primary transition-opacity hover:opacity-90"
                  >
                    Pick File...
                  </button>
                </div>

                <Show when={importState.phase === 'error' && importState.error}>
                  <div class="rounded-lg border border-error bg-error/10 px-4 py-3 text-sm text-error">
                    {importState.error}
                  </div>
                </Show>

                <div class="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(21rem,1.05fr)]">
                  <ImportReviewList
                    items={visibleItems()}
                    selectedPaths={importState.selectedPaths}
                    focusedPath={importState.focusedPath}
                    searchQuery={importState.searchQuery}
                    activeProjectPath={activeProjectPath()}
                    onSearchQueryChange={setImportSearchQuery}
                    onToggleSelect={toggleImportSelection}
                    onFocus={setFocusedImportItem}
                  />
                  <ImportSessionDetails
                    item={focusedItem()}
                    activeProjectPath={activeProjectPath()}
                  />
                </div>
              </div>
            </Show>
          </div>

          <Show when={importState.phase !== 'done' && importState.phase !== 'importing'}>
            <div class="flex items-center justify-between gap-4 border-t border-border-secondary px-6 py-4">
              <div class="text-sm text-text-secondary">
                {selectedCount()} session{selectedCount() === 1 ? '' : 's'} selected
                <Show when={activeProject()}>
                  {(project) => <span>{` • Importing into ${project().name}`}</span>}
                </Show>
              </div>
              <button
                onClick={importSelected}
                disabled={selectedCount() === 0}
                class="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-bg-primary)',
                }}
              >
                Import{' '}
                {selectedCount() > 0
                  ? `${selectedCount()} session${selectedCount() === 1 ? '' : 's'}`
                  : 'sessions'}
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default ImportDialog;
