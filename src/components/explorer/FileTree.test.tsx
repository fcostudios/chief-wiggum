import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileNode, FileSearchResult } from '@/lib/types';

let mockProjectId: string | null = 'proj-1';
let mockSearchQuery = '';
let mockSearchResults: FileSearchResult[] = [];
let mockIsSearching = false;
let mockIsLoading = false;
let mockLoadError: string | null = null;
let mockRootNodes: FileNode[] = [];
let mockShowIgnoredFiles = false;

const mockLoadRootFiles = vi.fn();
const mockSearchFiles = vi.fn();
const mockClearSearch = vi.fn();
const mockSelectFile = vi.fn();
const mockRetryLoadFiles = vi.fn(async () => {});
const mockToggleShowIgnoredFiles = vi.fn();

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get searchQuery() {
      return mockSearchQuery;
    },
    get searchResults() {
      return mockSearchResults;
    },
    get isSearching() {
      return mockIsSearching;
    },
    get isLoading() {
      return mockIsLoading;
    },
    get loadError() {
      return mockLoadError;
    },
    get showIgnoredFiles() {
      return mockShowIgnoredFiles;
    },
  },
  loadRootFiles: (...args: unknown[]) => mockLoadRootFiles(...args),
  getRootNodes: () => mockRootNodes,
  searchFiles: (...args: unknown[]) => mockSearchFiles(...args),
  clearSearch: () => mockClearSearch(),
  selectFile: (...args: unknown[]) => mockSelectFile(...args),
  retryLoadFiles: () => mockRetryLoadFiles(),
  toggleShowIgnoredFiles: () => mockToggleShowIgnoredFiles(),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return mockProjectId;
    },
  },
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

vi.mock('./FileTreeNode', () => ({
  default: (props: { node: FileNode }) => <div data-testid="file-tree-node">{props.node.name}</div>,
}));

import FileTree from './FileTree';

describe('FileTree', () => {
  beforeEach(() => {
    mockProjectId = 'proj-1';
    mockSearchQuery = '';
    mockSearchResults = [];
    mockIsSearching = false;
    mockIsLoading = false;
    mockLoadError = null;
    mockRootNodes = [];
    mockShowIgnoredFiles = false;
    vi.clearAllMocks();
  });

  it('loads root files on mount when a project is active', () => {
    render(() => <FileTree />);
    expect(mockLoadRootFiles).toHaveBeenCalledWith('proj-1');
  });

  it('renders search input and dispatches searchFiles on input', () => {
    render(() => <FileTree />);
    const input = screen.getByPlaceholderText('explorer.searchFiles');
    fireEvent.input(input, { target: { value: 'main' } });
    expect(mockSearchFiles).toHaveBeenCalledWith('proj-1', 'main');
  });

  it('toggles ignored-file visibility from explorer toolbar button', () => {
    render(() => <FileTree />);
    fireEvent.click(screen.getByRole('button', { name: 'explorer.showIgnoredFiles' }));
    expect(mockToggleShowIgnoredFiles).toHaveBeenCalled();
  });

  it('renders search results and selects a file on click', () => {
    mockSearchQuery = 'main';
    mockSearchResults = [
      { name: 'main.ts', relative_path: 'src/main.ts', extension: 'ts', score: 10 },
    ];
    render(() => <FileTree />);

    fireEvent.click(screen.getByRole('button', { name: /main\.ts/i }));
    expect(mockSelectFile).toHaveBeenCalledWith('proj-1', 'src/main.ts');
    expect(mockClearSearch).toHaveBeenCalled();
  });

  it('renders load error alert and retries loading', () => {
    mockLoadError = 'boom';
    render(() => <FileTree />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(mockRetryLoadFiles).toHaveBeenCalled();
  });
});
