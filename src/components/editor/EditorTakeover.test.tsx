import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: { activeProjectId: 'test-project' },
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  clearFileState,
  closeEditorTakeover,
  fileState,
  openEditorTakeover,
  setEditorCursorPosition,
} from '@/stores/fileStore';

describe('Editor Takeover store logic', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === 'read_project_file') {
        return Promise.resolve({
          relative_path: 'src/test.ts',
          content: 'console.log("hello");',
          line_count: 1,
          size_bytes: 21,
          language: 'typescript',
          estimated_tokens: 5,
          truncated: false,
          is_readonly: false,
          modified_at_ms: 1709500000000,
        });
      }
      if (command === 'get_file_mtime') {
        return Promise.resolve(1709500000000);
      }
      return Promise.resolve(null);
    });
    closeEditorTakeover();
    clearFileState();
  });

  it('opens editor takeover with file content', async () => {
    await openEditorTakeover('src/test.ts');
    expect(fileState.editorTakeoverActive).toBe(true);
    expect(fileState.editingFilePath).toBe('src/test.ts');
    expect(fileState.fullContent).toBe('console.log("hello");');
    expect(fileState.isDirty).toBe(false);
    expect(fileState.editorFileMtime).toBe(1709500000000);
  });

  it('closes editor takeover and resets editor state', async () => {
    await openEditorTakeover('src/test.ts');
    closeEditorTakeover();
    expect(fileState.editorTakeoverActive).toBe(false);
    expect(fileState.editingFilePath).toBeNull();
    expect(fileState.fullContent).toBeNull();
  });

  it('tracks cursor position', () => {
    setEditorCursorPosition(42, 7);
    expect(fileState.editorCursorLine).toBe(42);
    expect(fileState.editorCursorCol).toBe(7);
  });

  it('opens at specific line', async () => {
    await openEditorTakeover('src/test.ts', 42);
    expect(fileState.editorCursorLine).toBe(42);
  });
});
