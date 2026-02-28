import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileContent } from '@/lib/types';

let mockSelectedRange: { start: number; end: number } | null = null;
const mockAddFileReference = vi.fn();
const mockUpdateAttachmentRange = vi.fn();
const mockNavigateToFolder = vi.fn();
const mockSetSelectedRange = vi.fn();
const mockClearConflict = vi.fn();
const mockEnterEditMode = vi.fn(() => Promise.resolve());
const mockExitEditMode = vi.fn();
const mockSaveFileEdit = vi.fn(() => Promise.resolve());
const mockSelectFile = vi.fn(() => Promise.resolve());
const mockSetEditBuffer = vi.fn();
const mockAddToast = vi.fn();
const mockClipboardWriteText = vi.fn(() => Promise.resolve());

vi.mock('highlight.js', () => ({
  default: {
    getLanguage: () => true,
    highlight: (code: string) => ({ value: code }),
    highlightAuto: (code: string) => ({ value: code }),
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    get attachments() {
      return [];
    },
  },
  addFileReference: (...args: unknown[]) => mockAddFileReference(...args),
  updateAttachmentRange: (...args: unknown[]) => mockUpdateAttachmentRange(...args),
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get selectedRange() {
      return mockSelectedRange;
    },
    get editingAttachmentId() {
      return null;
    },
    get isEditing() {
      return false;
    },
    get isDirty() {
      return false;
    },
    get saveStatus() {
      return 'idle';
    },
    get editingFilePath() {
      return null;
    },
    get conflictDetected() {
      return false;
    },
    get isReadonly() {
      return false;
    },
  },
  clearConflict: () => mockClearConflict(),
  enterEditMode: (content: string, relativePath: string) =>
    mockEnterEditMode(content, relativePath),
  exitEditMode: () => mockExitEditMode(),
  navigateToFolder: (projectId: string, folderPath: string) =>
    mockNavigateToFolder(projectId, folderPath),
  saveFileEdit: (projectId: string, relativePath: string) =>
    mockSaveFileEdit(projectId, relativePath),
  selectFile: (projectId: string, relativePath: string) => mockSelectFile(projectId, relativePath),
  setEditBuffer: (content: string) => mockSetEditBuffer(content),
  setSelectedRange: (range: { start: number; end: number } | null) => mockSetSelectedRange(range),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return 'proj-1';
    },
  },
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: (...args: unknown[]) => mockAddToast(...args),
}));

import FilePreview from './FilePreview';

const content: FileContent = {
  relative_path: 'src/test.ts',
  content: 'const x = 1;\nconst y = 2;',
  line_count: 2,
  size_bytes: 28,
  language: 'typescript',
  estimated_tokens: 7,
  truncated: false,
  is_readonly: false,
};

describe('FilePreview', () => {
  beforeEach(() => {
    mockSelectedRange = null;
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockClipboardWriteText },
    });
  });

  it('renders file name, breadcrumb, content, and line numbers', () => {
    render(() => <FilePreview content={content} isLoading={false} />);
    expect(screen.getAllByText('test.ts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText(/const x = 1/)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows loading preview state', () => {
    render(() => <FilePreview content={content} isLoading />);
    expect(screen.getByText(/Loading preview/i)).toBeInTheDocument();
  });

  it('Add to prompt button adds a file reference', () => {
    render(() => <FilePreview content={content} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Add to prompt/i }));
    expect(mockAddFileReference).toHaveBeenCalledWith(
      expect.objectContaining({ relative_path: 'src/test.ts', name: 'test.ts' }),
    );
  });

  it('Copy path button writes to clipboard', async () => {
    render(() => <FilePreview content={content} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy path/i }));
    expect(mockClipboardWriteText).toHaveBeenCalledWith('src/test.ts');
  });
});
