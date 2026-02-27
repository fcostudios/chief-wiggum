import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import MessageInput from './MessageInput';

const { mockAddImageAttachment, mockRemoveImageAttachment, mockImages } = vi.hoisted(() => ({
  mockAddImageAttachment: vi.fn(),
  mockRemoveImageAttachment: vi.fn(),
  mockImages: [
    {
      id: 'img-1',
      data_url: 'data:image/png;base64,YWJj',
      mime_type: 'image/png',
      file_name: 'paste-1.png',
      size_bytes: 1024,
      estimated_tokens: 85,
      width: 512,
      height: 512,
    },
  ],
}));

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
  onerror: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL(_blob: Blob): void {
    this.result = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
    this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
  }
}

class MockImage {
  width = 640;
  height = 480;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    attachments: [],
    images: mockImages,
    scores: {},
    suggestions: [],
    isAssembling: false,
  },
  addFileReference: vi.fn(),
  addExternalFileAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  addImageAttachment: (...args: unknown[]) => mockAddImageAttachment(...args),
  removeImageAttachment: (...args: unknown[]) => mockRemoveImageAttachment(...args),
  clearAttachments: vi.fn(),
  getAttachmentCount: () => 0,
  getImageCount: () => mockImages.length,
  getTotalEstimatedTokens: () => 0,
  assembleContext: () => Promise.resolve(''),
  getPromptImages: () => [],
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
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

function makeClipboardImageItem(file: File) {
  return {
    kind: 'file',
    type: file.type,
    getAsFile: () => file,
  };
}

describe('Image attachment UI (CHI-208)', () => {
  beforeEach(() => {
    mockAddImageAttachment.mockClear();
    mockRemoveImageAttachment.mockClear();
    Object.defineProperty(window, 'FileReader', {
      configurable: true,
      writable: true,
      value: MockFileReader,
    });
    Object.defineProperty(window, 'Image', {
      configurable: true,
      writable: true,
      value: MockImage,
    });
  });

  it('renders image attachment chip with token estimate', () => {
    const { getByAltText, getByText } = render(() => <MessageInput onSend={vi.fn()} />);
    expect(getByAltText('paste-1.png')).toBeInTheDocument();
    expect(getByText('~85 tok')).toBeInTheDocument();
  });

  it('remove button calls removeImageAttachment with image id', () => {
    const { getByLabelText } = render(() => <MessageInput onSend={vi.fn()} />);
    fireEvent.click(getByLabelText('Remove paste-1.png'));
    expect(mockRemoveImageAttachment).toHaveBeenCalledWith('img-1');
  });

  it('pasting image invokes addImageAttachment with decoded metadata', async () => {
    const { getByLabelText } = render(() => <MessageInput onSend={vi.fn()} />);
    const textarea = getByLabelText('Message input');
    const file = new File(['fake-image'], 'clip.png', { type: 'image/png' });
    const item = makeClipboardImageItem(file);

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [item],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(mockAddImageAttachment).toHaveBeenCalledWith(
        'data:image/png;base64,ZmFrZS1pbWFnZQ==',
        'image/png',
        file.size,
        640,
        480,
      );
    });
  });

  it('pasting multiple images processes each image item', async () => {
    const { getByLabelText } = render(() => <MessageInput onSend={vi.fn()} />);
    const textarea = getByLabelText('Message input');
    const file1 = new File(['one'], 'first.png', { type: 'image/png' });
    const file2 = new File(['two'], 'second.jpeg', { type: 'image/jpeg' });

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [makeClipboardImageItem(file1), makeClipboardImageItem(file2)],
        types: ['Files'],
      },
    });

    await waitFor(() => {
      expect(mockAddImageAttachment).toHaveBeenCalledTimes(2);
    });
  });
});
