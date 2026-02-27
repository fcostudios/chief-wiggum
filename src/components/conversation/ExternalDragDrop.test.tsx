import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import MessageInput from './MessageInput';

const mockAddToast = vi.fn();
const mockAddExternalFileAttachment = vi.fn();

vi.mock('@/stores/toastStore', () => ({
  addToast: (...args: unknown[]) => mockAddToast(...args),
}));

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    attachments: [],
    images: [],
    scores: {},
    suggestions: [],
    isAssembling: false,
  },
  addFileReference: vi.fn(),
  addExternalFileAttachment: (...args: unknown[]) => mockAddExternalFileAttachment(...args),
  removeAttachment: vi.fn(),
  addImageAttachment: vi.fn(),
  removeImageAttachment: vi.fn(),
  clearAttachments: vi.fn(),
  getAttachmentCount: () => 0,
  getImageCount: () => 0,
  getTotalEstimatedTokens: () => 0,
  assembleContext: () => Promise.resolve(''),
  getPromptImages: () => [],
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: { activeProjectId: 'proj-1', projects: [] },
}));

vi.mock('@/stores/slashStore', () => ({
  slashState: { isOpen: false, highlightedIndex: 0 },
  filteredCommands: () => [],
  openMenu: vi.fn(),
  closeMenu: vi.fn(),
  setFilter: vi.fn(),
  highlightPrev: vi.fn(),
  highlightNext: vi.fn(),
  getHighlightedCommand: () => null,
}));

vi.mock('@/stores/actionStore', () => ({
  actionState: { actions: [] },
  startAction: vi.fn(),
}));

vi.mock('@/stores/fileStore', () => ({
  selectFileForEditing: vi.fn(),
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

vi.mock('./SlashCommandMenu', () => ({ default: () => null }));
vi.mock('./FileMentionMenu', () => ({ default: () => null }));
vi.mock('./ContextChip', () => ({ default: () => null }));
vi.mock('./ContextSuggestions', () => ({ default: () => null }));

function createDropEvent(files: File[], types: string[] = ['Files']) {
  return {
    dataTransfer: {
      files: files as unknown as FileList,
      types,
      getData: () => '',
      dropEffect: 'none',
    } as unknown as DataTransfer,
  };
}

describe('External file drag-drop (CHI-191)', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
    mockAddExternalFileAttachment.mockClear();
  });

  it('shows drag state style when external files are dragged over', () => {
    const { container } = render(() => <MessageInput onSend={vi.fn()} />);
    const dropTarget = container.firstElementChild as HTMLElement;

    fireEvent.dragOver(dropTarget, {
      dataTransfer: { types: ['Files'], dropEffect: 'none' },
    });

    expect(dropTarget.style.borderTop).toContain('2px solid');
  });

  it('processes dropped text files', async () => {
    const { container } = render(() => <MessageInput onSend={vi.fn()} />);
    const dropTarget = container.firstElementChild as HTMLElement;
    const file = new File(['const x = 1;'], 'test.ts', { type: 'text/typescript' });

    fireEvent.drop(dropTarget, createDropEvent([file]));

    await waitFor(() => {
      expect(mockAddExternalFileAttachment).toHaveBeenCalledWith('test.ts', 'const x = 1;', '.ts');
    });
    expect(mockAddToast).toHaveBeenCalledWith('Added 1 file to prompt', 'success');
  });

  it('shows warning toast for unsupported dropped files', async () => {
    const { container } = render(() => <MessageInput onSend={vi.fn()} />);
    const dropTarget = container.firstElementChild as HTMLElement;
    const file = new File(['binary'], 'photo.exe', { type: 'application/octet-stream' });

    fireEvent.drop(dropTarget, createDropEvent([file]));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Unsupported file type skipped (1)', 'warning');
    });
    expect(mockAddExternalFileAttachment).not.toHaveBeenCalled();
  });
});
