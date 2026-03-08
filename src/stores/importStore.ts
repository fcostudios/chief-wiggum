import { createStore } from 'solid-js/store';

interface ImportState {
  dialogOpen: boolean;
  phase: 'idle' | 'discovering' | 'importing' | 'done' | 'error';
  error: string | null;
}

const [importState, setImportState] = createStore<ImportState>({
  dialogOpen: false,
  phase: 'idle',
  error: null,
});

export { importState };

export function openImportDialog() {
  setImportState({ dialogOpen: true, phase: 'idle', error: null });
}

export function closeImportDialog() {
  setImportState({ dialogOpen: false, phase: 'idle', error: null });
}

export function setImportPhase(phase: ImportState['phase'], error?: string) {
  setImportState({ phase, error: error ?? null });
}
