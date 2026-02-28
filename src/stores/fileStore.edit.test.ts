import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// IPC mock
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock('@/stores/projectStore', () => ({
  projectState: { activeProjectId: 'proj-1' },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { addToast } from '@/stores/toastStore';

describe('fileStore editing state (CHI-217)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('enterEditMode sets isEditing=true and stores fullContent', async () => {
    const { enterEditMode, fileState } = await import('@/stores/fileStore');
    await enterEditMode('const x = 1;', 'src/main.ts');
    expect(fileState.isEditing).toBe(true);
    expect(fileState.fullContent).toBe('const x = 1;');
    expect(fileState.editingFilePath).toBe('src/main.ts');
  });

  it('exitEditMode resets all edit state', async () => {
    const { enterEditMode, exitEditMode, fileState } = await import('@/stores/fileStore');
    await enterEditMode('hello', 'src/a.ts');
    exitEditMode();
    expect(fileState.isEditing).toBe(false);
    expect(fileState.isDirty).toBe(false);
    expect(fileState.fullContent).toBeNull();
    expect(fileState.editingFilePath).toBeNull();
  });

  it('setEditBuffer marks isDirty', async () => {
    const { enterEditMode, setEditBuffer, fileState } = await import('@/stores/fileStore');
    await enterEditMode('original', 'src/a.ts');
    setEditBuffer('modified content');
    expect(fileState.isDirty).toBe(true);
    expect(fileState.fullContent).toBe('modified content');
  });

  it('saveFileEdit calls write_file_content IPC and shows toast on success', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { enterEditMode, setEditBuffer, saveFileEdit, fileState } = await import(
      '@/stores/fileStore'
    );
    await enterEditMode('original', 'src/a.ts');
    setEditBuffer('updated');
    await saveFileEdit('proj-1', 'src/a.ts');
    expect(invoke).toHaveBeenCalledWith('write_file_content', {
      project_id: 'proj-1',
      relative_path: 'src/a.ts',
      content: 'updated',
    });
    expect(fileState.saveStatus).toBe('saved');
    expect(addToast).toHaveBeenCalledWith('File saved', 'success');
  });

  it('saveFileEdit sets saveStatus=error on IPC failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('disk full'));
    const { enterEditMode, setEditBuffer, saveFileEdit, fileState } = await import(
      '@/stores/fileStore'
    );
    await enterEditMode('original', 'src/a.ts');
    setEditBuffer('modified');
    await saveFileEdit('proj-1', 'src/a.ts');
    expect(fileState.saveStatus).toBe('error');
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('disk full'), 'error');
  });
});
