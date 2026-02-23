// src/stores/diagnosticsStore.ts
// State management for diagnostic bundle export (CHI-98).

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/lib/logger';
import type { BundleExportResult } from '@/lib/types';

const log = createLogger('ui/diagnostics');

interface DiagnosticsState {
  /** Whether the export dialog is open. */
  dialogOpen: boolean;
  /** Whether an export is currently in progress. */
  exporting: boolean;
  /** The last export result (for showing success state). */
  lastResult: BundleExportResult | null;
  /** Error message if export failed. */
  error: string | null;
}

const [state, setState] = createStore<DiagnosticsState>({
  dialogOpen: false,
  exporting: false,
  lastResult: null,
  error: null,
});

export { state as diagnosticsState };

/** Open the export consent dialog. */
export function openExportDialog(): void {
  setState({ dialogOpen: true, error: null, lastResult: null });
}

/** Close the export dialog. */
export function closeExportDialog(): void {
  setState({ dialogOpen: false });
}

/** Run the diagnostic bundle export via IPC. */
export async function exportDiagnosticBundle(): Promise<BundleExportResult | null> {
  setState({ exporting: true, error: null });
  try {
    const result = await invoke<BundleExportResult>('export_diagnostic_bundle');
    setState({ exporting: false, lastResult: result });
    log.info('Diagnostic bundle exported', {
      path: result.path,
      size: String(result.size_bytes),
      entries: String(result.log_entry_count),
    });
    return result;
  } catch (err) {
    const message = `Export failed: ${String(err)}`;
    setState({ exporting: false, error: message });
    log.error('Diagnostic bundle export failed', { error: String(err) });
    return null;
  }
}

/** Copy a one-liner debug info string to clipboard. */
export async function copyDebugInfo(): Promise<string> {
  const info = [
    `Chief Wiggum v${__APP_VERSION__}`,
    navigator.platform,
    `${navigator.language}`,
    `${window.screen.width}x${window.screen.height}`,
  ].join(' | ');

  try {
    await navigator.clipboard.writeText(info);
    log.info('Debug info copied to clipboard');
  } catch (err) {
    log.warn('Failed to copy debug info', { error: String(err) });
  }
  return info;
}

// Declare the global constant injected by Vite define
declare const __APP_VERSION__: string;
