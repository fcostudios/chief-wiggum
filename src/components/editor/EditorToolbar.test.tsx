import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import EditorToolbar from './EditorToolbar';

const mocks = vi.hoisted(() => ({
  fileState: {
    editingFilePath: 'src/current.ts',
    editorCursorLine: 12,
    editorCursorCol: 4,
    isDirty: false,
  },
  saveFileEdit: vi.fn(() => Promise.resolve()),
  saveFileAs: vi.fn(() => Promise.resolve()),
  projectState: {
    activeProjectId: 'proj-1',
  },
  uiState: {
    zenModeActive: false,
  },
  toggleZenMode: vi.fn(),
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: mocks.fileState,
  saveFileEdit: mocks.saveFileEdit,
  saveFileAs: mocks.saveFileAs,
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: mocks.projectState,
}));

vi.mock('@/stores/uiStore', () => ({
  uiState: mocks.uiState,
  toggleZenMode: mocks.toggleZenMode,
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
}));

describe('EditorToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fileState.editingFilePath = 'src/current.ts';
    mocks.projectState.activeProjectId = 'proj-1';
  });

  it('renders Save As action', () => {
    render(() => <EditorToolbar onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save As' })).toBeInTheDocument();
  });

  it('triggers saveFileAs from Save As button', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('src/new.ts');
    render(() => <EditorToolbar onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save As' }));

    expect(promptSpy).toHaveBeenCalledWith('Save As — enter new file path:', 'src/current.ts');
    expect(mocks.saveFileAs).toHaveBeenCalledWith('proj-1', 'src/new.ts');
    promptSpy.mockRestore();
  });
});
