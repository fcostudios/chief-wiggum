import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import type { FileNode } from '@/lib/types';
import FileTreeNode from './FileTreeNode';

const stageFileMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const unstageFileMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const refreshGitStatusMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const invokeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ old_content: null, was_untracked: false }),
);

vi.mock('@/stores/projectStore', () => ({
  projectState: { activeProjectId: 'proj-1' },
  getActiveProject: vi.fn(() => ({ id: 'proj-1', path: '/tmp/project' })),
}));

vi.mock('@/stores/fileStore', () => ({
  fileState: { selectedPath: null, creatingIn: null, renamingPath: null, creatingInFolder: null, creatingType: null },
  setSelectedPath: vi.fn(),
  selectFile: vi.fn(),
  isExpanded: vi.fn(() => false),
  getChildren: vi.fn(() => []),
  toggleFolder: vi.fn(),
  openEditorTakeover: vi.fn(),
  getGitStatus: vi.fn(() => null),
  startCreating: vi.fn(),
  setRenamingPath: vi.fn(),
  createFileInProject: vi.fn(),
  createDirectoryInProject: vi.fn(),
  renameFileInProject: vi.fn(),
  duplicateFileInProject: vi.fn(),
  deleteFileInProject: vi.fn(),
  cancelCreating: vi.fn(),
}));

vi.mock('@/stores/contextStore', () => ({
  addFileBundle: vi.fn(),
  addFileReference: vi.fn(),
}));

vi.mock('@/stores/toastStore', () => ({ addToast: vi.fn() }));
vi.mock('@/stores/i18nStore', () => ({ t: (key: string) => key }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

vi.mock('@/stores/gitStore', () => ({
  gitState: {
    projectId: 'proj-1',
    statusEntries: [{ path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null }],
  },
  stageFile: stageFileMock,
  unstageFile: unstageFileMock,
  refreshGitStatus: refreshGitStatusMock,
}));

vi.mock('@/components/common/ContextMenu', () => ({
  default: (props: {
    items: { label: string; onClick?: () => void; separator?: boolean }[];
    onClose: () => void;
  }) => (
    <div role="menu">
      {props.items.map((item) =>
        item.separator ? (
          <div role="separator" />
        ) : (
          <button
            role="menuitem"
            onClick={() => {
              item.onClick?.();
              props.onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  ),
}));

const mockFile: FileNode = {
  name: 'app.ts',
  relative_path: 'src/app.ts',
  node_type: 'File',
  size_bytes: 1024,
  extension: 'ts',
  children: [],
  is_binary: false,
  is_git_ignored: false,
  preview_type: 'text',
};

describe('FileTreeNode — git context menu items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Stage action in context menu when file is unstaged modified', async () => {
    const { getByRole, findByRole } = render(() => <FileTreeNode node={mockFile} depth={1} />);
    fireEvent.contextMenu(getByRole('treeitem'));
    const menu = await findByRole('menu');
    expect(menu.textContent).toMatch(/Stage/);
    expect(menu.textContent).toMatch(/Discard changes/);
  });

  it('calls stageFile when Stage is clicked', async () => {
    const { getByRole, findByRole } = render(() => <FileTreeNode node={mockFile} depth={1} />);
    fireEvent.contextMenu(getByRole('treeitem'));
    const menu = await findByRole('menu');
    const stageItem = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Stage'),
    );
    if (stageItem) {
      fireEvent.click(stageItem);
    }
    await waitFor(() => expect(stageFileMock).toHaveBeenCalled());
  });
});
