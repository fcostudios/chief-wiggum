// src/components/diagnostics/ExportDialog.tsx
// Consent dialog for diagnostic bundle export (CHI-98).
// Shows what's included, privacy assurance, and export/cancel actions.

import type { Component } from 'solid-js';
import { Show, createEffect, onCleanup } from 'solid-js';
import {
  diagnosticsState,
  closeExportDialog,
  exportDiagnosticBundle,
} from '@/stores/diagnosticsStore';
import { addToast } from '@/stores/toastStore';

const ExportDialog: Component = () => {
  let dialogRef: HTMLDivElement | undefined;

  // Focus trap + Escape to close
  createEffect(() => {
    if (!diagnosticsState.dialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeExportDialog();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));

    // Auto-focus the dialog
    requestAnimationFrame(() => dialogRef?.focus());
  });

  async function handleExport(): Promise<void> {
    const result = await exportDiagnosticBundle();
    if (result) {
      closeExportDialog();
      const sizeMb = (result.size_bytes / 1024 / 1024).toFixed(2);
      addToast(
        `Diagnostic bundle exported (${result.log_entry_count} logs, ${sizeMb} MB)`,
        'success',
        {
          label: 'Copy Path',
          onClick: () => {
            navigator.clipboard
              .writeText(result.path)
              .then(() => addToast('Copied path to clipboard', 'success'))
              .catch(() => addToast('Failed to copy path', 'error'));
          },
        },
      );
    }
  }

  return (
    <Show when={diagnosticsState.dialogOpen}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        style={{ 'background-color': 'rgba(0, 0, 0, 0.5)' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeExportDialog();
        }}
      >
        {/* Dialog */}
        <div
          ref={dialogRef}
          class="rounded-lg shadow-xl max-w-md w-full mx-4 outline-none"
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-primary)',
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
          {/* Header */}
          <div
            class="px-5 py-4"
            style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
          >
            <h2
              id="export-dialog-title"
              class="text-base font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Export Diagnostic Bundle
            </h2>
            <p class="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Creates a ZIP file for bug reports and support.
            </p>
          </div>

          {/* Content — what's included */}
          <div class="px-5 py-4 space-y-3">
            <p class="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              The bundle includes:
            </p>
            <ul class="text-xs space-y-1.5 ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              <li class="flex items-start gap-2">
                <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                <span>Application logs (last ~10 minutes)</span>
              </li>
              <li class="flex items-start gap-2">
                <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                <span>System info (OS, app version, architecture)</span>
              </li>
              <li class="flex items-start gap-2">
                <span style={{ color: 'var(--color-success)' }}>&#10003;</span>
                <span>Redaction summary (what was sanitized)</span>
              </li>
            </ul>

            {/* Privacy assurance */}
            <div
              class="rounded-md px-3 py-2.5 text-xs"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <span class="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Privacy:
              </span>{' '}
              API keys, emails, tokens, and local file paths are automatically redacted before
              export. No conversation content is included.
            </div>

            {/* Error state */}
            <Show when={diagnosticsState.error}>
              <div
                class="rounded-md px-3 py-2 text-xs"
                style={{
                  background: 'rgba(248, 81, 73, 0.1)',
                  color: 'var(--color-error)',
                }}
              >
                {diagnosticsState.error}
              </div>
            </Show>
          </div>

          {/* Actions */}
          <div
            class="px-5 py-3 flex justify-end gap-2"
            style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
          >
            <button
              class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-elevated)',
              }}
              onClick={closeExportDialog}
              disabled={diagnosticsState.exporting}
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                color: 'var(--color-text-inverse)',
                background: 'var(--color-accent)',
                opacity: diagnosticsState.exporting ? '0.6' : '1',
              }}
              onClick={() => void handleExport()}
              disabled={diagnosticsState.exporting}
            >
              {diagnosticsState.exporting ? 'Exporting...' : 'Export & Open Folder'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ExportDialog;
