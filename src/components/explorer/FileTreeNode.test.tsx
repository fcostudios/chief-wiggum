import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileNode, GitFileStatus } from '@/lib/types';

let mockProjectId: string | null = 'proj-1';
let mockSelectedPath: string | null = null;
let mockExpanded = false;
let mockGitStatus: GitFileStatus | null = null;

const mockToggleFolder = vi.fn(async (_projectId?: string, _relativePath?: string) => {});
const mockSelectFile = vi.fn(async (_projectId?: string, _relativePath?: string) => {});
const mockOpenEditorTakeover = vi.fn(async (_relativePath: string) => {});
const mockStartCreating = vi.fn((_folderPath: string, _type: 'file' | 'folder') => {});
const mockSetRenamingPath = vi.fn((_path: string | null) => {});
const mockCreateFileInProject = vi.fn(
  async (_projectId: string, _relativePath: string, _content?: string) => {},
);
const mockCreateDirectoryInProject = vi.fn(async (_projectId: string, _relativePath: string) => {});
const mockRenameFileInProject = vi.fn(
  async (_projectId: string, _oldPath: string, _newPath: string) => {},
);
const mockDuplicateFileInProject = vi.fn(async (_projectId: string, _relativePath: string) => {});
const mockDeleteFileInProject = vi.fn(async (_projectId: string, _relativePath: string) => {});
const mockCancelCreating = vi.fn();

vi.mock('@/stores/fileStore', () => ({
  fileState: {
    get selectedPath() {
      return mockSelectedPath;
    },
    get editingAttachmentId() {
      return null;
    },
    get selectedRange() {
      return null;
    },
    creatingInFolder: null,
    creatingType: null,
  },
  isExpanded: () => mockExpanded,
  getChildren: () => [],
  toggleFolder: (projectId: string, relativePath: string) =>
    mockToggleFolder(projectId, relativePath),
  selectFile: (projectId: string, relativePath: string) => mockSelectFile(projectId, relativePath),
  openEditorTakeover: (relativePath: string) => mockOpenEditorTakeover(relativePath),
  getGitStatus: () => mockGitStatus,
  startCreating: (folderPath: string, type: 'file' | 'folder') =>
    mockStartCreating(folderPath, type),
  setRenamingPath: (path: string | null) => mockSetRenamingPath(path),
  createFileInProject: (projectId: string, relativePath: string, content?: string) =>
    mockCreateFileInProject(projectId, relativePath, content),
  createDirectoryInProject: (projectId: string, relativePath: string) =>
    mockCreateDirectoryInProject(projectId, relativePath),
  renameFileInProject: (projectId: string, oldPath: string, newPath: string) =>
    mockRenameFileInProject(projectId, oldPath, newPath),
  duplicateFileInProject: (projectId: string, relativePath: string) =>
    mockDuplicateFileInProject(projectId, relativePath),
  deleteFileInProject: (projectId: string, relativePath: string) =>
    mockDeleteFileInProject(projectId, relativePath),
  cancelCreating: () => mockCancelCreating(),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return mockProjectId;
    },
  },
}));

vi.mock('@/stores/contextStore', () => ({ addFileReference: vi.fn(), addFileBundle: vi.fn() }));
vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));
vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));
vi.mock('@/components/common/ContextMenu', () => ({
  default: () => <div data-testid="context-menu" />,
}));

import FileTreeNode from './FileTreeNode';

const fileNode: FileNode = {
  name: 'helper.ts',
  relative_path: 'src/helper.ts',
  node_type: 'File',
  size_bytes: 2048,
  extension: 'ts',
  children: null,
  is_binary: false,
  is_git_ignored: false,
  preview_type: 'text',
};

const folderNode: FileNode = {
  name: 'src',
  relative_path: 'src',
  node_type: 'Directory',
  size_bytes: null,
  extension: null,
  children: [],
  is_binary: false,
  is_git_ignored: false,
  preview_type: 'text',
};

describe('FileTreeNode', () => {
  beforeEach(() => {
    mockProjectId = 'proj-1';
    mockSelectedPath = null;
    mockExpanded = false;
    mockGitStatus = null;
    vi.clearAllMocks();
  });

  it('renders file name and size badge', () => {
    render(() => <FileTreeNode node={fileNode} depth={0} />);
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('2K')).toBeInTheDocument();
  });

  it('clicking a file node selects the file', () => {
    render(() => <FileTreeNode node={fileNode} depth={0} />);
    fireEvent.click(screen.getByRole('treeitem'));
    expect(mockSelectFile).toHaveBeenCalledWith('proj-1', 'src/helper.ts');
  });

  it('clicking a directory node toggles the folder and reflects expanded state', () => {
    mockExpanded = true;
    render(() => <FileTreeNode node={folderNode} depth={0} />);
    const item = screen.getByRole('treeitem');
    expect(item).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(item);
    expect(mockToggleFolder).toHaveBeenCalledWith('proj-1', 'src');
  });

  it('renders git status indicator text alternative when status exists', () => {
    mockGitStatus = { status: 'modified' };
    render(() => <FileTreeNode node={fileNode} depth={0} />);
    expect(screen.getByLabelText('Git status: Modified')).toBeInTheDocument();
  });

  it('dims gitignored files and renders ignored badge', () => {
    render(() => <FileTreeNode node={{ ...fileNode, is_git_ignored: true }} depth={0} />);
    const item = screen.getByRole('treeitem');
    expect(item).toHaveClass('opacity-50');
    expect(screen.getByLabelText('Ignored by .gitignore')).toBeInTheDocument();
  });
});
