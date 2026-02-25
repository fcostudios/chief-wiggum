import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import {
  closeExportDialog,
  copyDebugInfo,
  diagnosticsState,
  exportDiagnosticBundle,
  openExportDialog,
} from './diagnosticsStore';

describe('diagnosticsStore', () => {
  beforeEach(() => {
    openExportDialog();
    closeExportDialog();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('starts with dialog closed', () => {
    expect(diagnosticsState.dialogOpen).toBe(false);
    expect(diagnosticsState.exporting).toBe(false);
    expect(diagnosticsState.lastResult).toBeNull();
    expect(diagnosticsState.error).toBeNull();
  });

  it('opens export dialog and clears error/result', () => {
    openExportDialog();
    expect(diagnosticsState.dialogOpen).toBe(true);
    expect(diagnosticsState.error).toBeNull();
    expect(diagnosticsState.lastResult).toBeNull();
  });

  it('closes export dialog', () => {
    openExportDialog();
    closeExportDialog();
    expect(diagnosticsState.dialogOpen).toBe(false);
  });

  it('exports diagnostic bundle via IPC', async () => {
    const mockResult = {
      path: '/tmp/diagnostics.zip',
      size_bytes: 12345,
      log_entry_count: 100,
      redaction: {
        rules_applied: ['api_key'],
        entries_redacted: 5,
        total_entries: 100,
        fields_redacted: 5,
      },
    };
    mockIpcCommand('export_diagnostic_bundle', () => mockResult);

    const result = await exportDiagnosticBundle();
    expect(result).toEqual(mockResult);
    expect(diagnosticsState.exporting).toBe(false);
    expect(diagnosticsState.lastResult).toEqual(mockResult);
    expect(diagnosticsState.error).toBeNull();
  });

  it('handles export failure', async () => {
    mockIpcCommand('export_diagnostic_bundle', () => {
      throw new Error('disk full');
    });

    const result = await exportDiagnosticBundle();
    expect(result).toBeNull();
    expect(diagnosticsState.exporting).toBe(false);
    expect(diagnosticsState.error).toContain('disk full');
  });

  it('copyDebugInfo returns formatted string', async () => {
    const clipboard = navigator.clipboard as unknown as { writeText: ReturnType<typeof vi.fn> };
    const info = await copyDebugInfo();
    expect(info).toContain('Chief Wiggum');
    expect(clipboard.writeText).toHaveBeenCalledWith(info);
  });
});
