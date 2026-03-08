import type { Component } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { DiscoveredSession, ImportResult } from '@/lib/types';
import { closeImportDialog, importState, setImportPhase } from '@/stores/importStore';
import { projectState } from '@/stores/projectStore';
import { loadSessions } from '@/stores/sessionStore';
import { addToast } from '@/stores/toastStore';
import ImportProgress from './ImportProgress';

const ImportDialog: Component = () => {
  const [discovered, setDiscovered] = createSignal<DiscoveredSession[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [results, setResults] = createSignal<ImportResult[]>([]);

  const activeProject = () => projectState.activeProjectId ?? '';

  async function discoverFromClaudeDir() {
    setImportPhase('discovering');
    try {
      const sessions = await invoke<DiscoveredSession[]>('discover_importable_sessions');
      setDiscovered(sessions);
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
      if (files.length === 0) return;
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
      await runImport(paths);
    };
    picker.click();
  }

  async function importSelected() {
    const paths = [...selected()];
    if (paths.length === 0) return;
    await runImport(paths);
  }

  async function runImport(filePaths: string[]) {
    if (!activeProject()) {
      addToast('No active project selected', 'error');
      return;
    }

    setImportPhase('importing');
    try {
      const importResults = await invoke<ImportResult[]>('import_jsonl_batch', {
        file_paths: filePaths,
        project_id: activeProject(),
      });
      setResults(importResults);
      setImportPhase('done');
      await loadSessions();
    } catch (error) {
      setImportPhase('error', String(error));
      addToast(`Import failed: ${String(error)}`, 'error');
    }
  }

  function toggleSelect(filePath: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }

  return (
    <Show when={importState.dialogOpen}>
      <div
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeImportDialog();
          }
        }}
      >
        <div
          class="relative flex w-full max-w-xl flex-col rounded-xl border border-border-primary bg-bg-secondary shadow-2xl"
          style={{ 'max-height': '80vh' }}
        >
          <div class="flex items-center justify-between border-b border-border-secondary px-5 py-4">
            <h2 class="text-base font-semibold text-text-primary">Import Sessions</h2>
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
              <ImportProgress results={results()} isRunning={false} onClose={closeImportDialog} />
            </Show>

            <Show when={importState.phase === 'importing'}>
              <ImportProgress results={[]} isRunning={true} onClose={() => undefined} />
            </Show>

            <Show when={importState.phase !== 'done' && importState.phase !== 'importing'}>
              <div class="flex flex-col gap-4 p-5">
                <div class="flex gap-2">
                  <button
                    onClick={discoverFromClaudeDir}
                    disabled={importState.phase === 'discovering'}
                    class="flex-1 rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary"
                  >
                    {importState.phase === 'discovering'
                      ? 'Scanning...'
                      : 'Scan ~/.claude/projects/'}
                  </button>
                  <button
                    onClick={pickFiles}
                    class="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg-primary"
                  >
                    Pick File...
                  </button>
                </div>

                <Show when={importState.phase === 'error'}>
                  <div class="rounded-md border border-error bg-error/10 px-3 py-2 text-sm text-error">
                    {importState.error}
                  </div>
                </Show>

                <Show when={discovered().length > 0}>
                  <div class="flex flex-col gap-1">
                    <div class="mb-1 text-xs font-medium text-text-secondary">
                      {discovered().length} session{discovered().length !== 1 ? 's' : ''} found
                    </div>
                    <For each={discovered()}>
                      {(session) => (
                        <label
                          class="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2"
                          style={{
                            background: session.already_imported
                              ? 'transparent'
                              : 'var(--color-bg-primary)',
                            opacity: session.already_imported ? '0.5' : '1',
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={session.already_imported}
                            checked={selected().has(session.file_path)}
                            onChange={() => toggleSelect(session.file_path)}
                            class="mt-0.5 shrink-0"
                          />
                          <div class="min-w-0 flex-1">
                            <div class="truncate text-sm font-medium text-text-primary">
                              {session.project_path}
                            </div>
                            <div class="truncate text-xs text-text-tertiary">
                              {session.cli_session_id}
                              {session.model ? ` • ${session.model}` : ''}
                              {session.already_imported ? ' • already imported' : ''}
                            </div>
                          </div>
                        </label>
                      )}
                    </For>

                    <button
                      onClick={importSelected}
                      disabled={selected().size === 0}
                      class="mt-2 w-full rounded-md px-4 py-2 text-sm font-medium"
                      style={{
                        background:
                          selected().size > 0 ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                        color:
                          selected().size > 0
                            ? 'var(--color-bg-primary)'
                            : 'var(--color-text-tertiary)',
                      }}
                    >
                      Import{' '}
                      {selected().size > 0
                        ? `${selected().size} session${selected().size !== 1 ? 's' : ''}`
                        : '...'}
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ImportDialog;
