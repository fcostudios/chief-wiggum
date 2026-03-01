import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import {
  clearFileState,
  clearSearch,
  fileState,
  getChildren,
  getGitStatus,
  getRootNodes,
  getSelectedRangeTokens,
  isExpanded,
  loadGitStatuses,
  loadRootFiles,
  searchFiles,
  selectFile,
  setSelectedRange,
  toggleFilesVisible,
  toggleShowIgnoredFiles,
  toggleFolder,
} from './fileStore';
import { setActiveProject } from '@/stores/projectStore';
import type { FileNode } from '@/lib/types';

const mockRootNodes: FileNode[] = [
  {
    name: 'src',
    relative_path: 'src',
    node_type: 'Directory',
    size_bytes: null,
    extension: null,
    children: null,
    is_binary: false,
    is_git_ignored: false,
  },
  {
    name: 'README.md',
    relative_path: 'README.md',
    node_type: 'File',
    size_bytes: 1024,
    extension: 'md',
    children: null,
    is_binary: false,
    is_git_ignored: false,
  },
];

describe('fileStore', () => {
  beforeEach(() => {
    clearFileState();
    localStorage.clear();
    setActiveProject(null);
    mockIpcCommand('list_project_files', () => mockRootNodes);
    mockIpcCommand('read_project_file', (args) => ({
      relative_path: String((args as { relative_path?: string }).relative_path ?? 'README.md'),
      content: 'line1\nline2\nline3\nline4\nline5',
      line_count: 5,
      size_bytes: 25,
      language: 'markdown',
      estimated_tokens: 25,
      truncated: false,
    }));
    mockIpcCommand('search_project_files', () => []);
    mockIpcCommand('get_git_file_statuses', () => ({}));
  });

  it('starts with empty tree state', () => {
    expect(getRootNodes()).toEqual([]);
    expect(fileState.selectedPath).toBeNull();
    expect(fileState.isLoading).toBe(false);
  });

  it('loadRootFiles fetches tree from backend', async () => {
    let callArgs: Record<string, unknown> | null = null;
    mockIpcCommand('list_project_files', (args) => {
      callArgs = args as Record<string, unknown>;
      return mockRootNodes;
    });
    await loadRootFiles('proj-1');
    expect(getRootNodes()).toHaveLength(2);
    expect(fileState.isLoading).toBe(false);
    expect(callArgs?.['show_ignored']).toBe(false);
  });

  it('loadRootFiles handles IPC error', async () => {
    mockIpcCommand('list_project_files', () => {
      throw new Error('access denied');
    });
    await loadRootFiles('proj-1');
    expect(fileState.loadError).toContain('access denied');
  });

  it('toggleFolder expands and loads children', async () => {
    mockIpcCommand('list_project_files', (args) => {
      const relPath = (args as { relative_path?: string | null }).relative_path;
      if (relPath === 'src') {
        return [
          {
            name: 'main.ts',
            relative_path: 'src/main.ts',
            node_type: 'File',
            size_bytes: 500,
            extension: 'ts',
            children: null,
            is_binary: false,
          } satisfies FileNode,
        ];
      }
      return mockRootNodes;
    });
    await loadRootFiles('proj-1');
    await toggleFolder('proj-1', 'src');
    expect(isExpanded('src')).toBe(true);
    expect(getChildren('src')).toHaveLength(1);
  });

  it('toggleFolder collapses expanded directory', async () => {
    await loadRootFiles('proj-1');
    await toggleFolder('proj-1', 'src');
    expect(isExpanded('src')).toBe(true);
    await toggleFolder('proj-1', 'src');
    expect(isExpanded('src')).toBe(false);
  });

  it('selectFile sets selectedPath and loads preview', async () => {
    await selectFile('proj-1', 'README.md');
    expect(fileState.selectedPath).toBe('README.md');
    expect(fileState.previewContent?.relative_path).toBe('README.md');
    expect(fileState.isPreviewLoading).toBe(false);
  });

  it('searchFiles debounces and loads results', async () => {
    vi.useFakeTimers();
    mockIpcCommand('search_project_files', () => [
      { relative_path: 'src/main.ts', name: 'main.ts', extension: 'ts', score: 99 },
    ]);
    searchFiles('proj-1', 'main');
    expect(fileState.searchQuery).toBe('main');
    expect(fileState.isSearching).toBe(true);
    await vi.advanceTimersByTimeAsync(151);
    expect(fileState.searchResults).toHaveLength(1);
    expect(fileState.isSearching).toBe(false);
    vi.useRealTimers();
  });

  it('clearSearch resets search state', () => {
    clearSearch();
    expect(fileState.searchQuery).toBe('');
    expect(fileState.searchResults).toEqual([]);
    expect(fileState.isSearching).toBe(false);
  });

  it('clearFileState resets cached state', () => {
    clearFileState();
    expect(getRootNodes()).toEqual([]);
    expect(fileState.expandedPaths).toEqual([]);
    expect(fileState.selectedPath).toBeNull();
    expect(fileState.previewContent).toBeNull();
    expect(fileState.gitStatuses).toEqual({});
  });

  it('setSelectedRange sets and clears range', () => {
    setSelectedRange({ start: 5, end: 10 });
    expect(fileState.selectedRange).toEqual({ start: 5, end: 10 });
    setSelectedRange(null);
    expect(fileState.selectedRange).toBeNull();
  });

  it('getSelectedRangeTokens estimates from preview content', async () => {
    await selectFile('proj-1', 'README.md');
    setSelectedRange({ start: 2, end: 4 });
    expect(getSelectedRangeTokens()).toBeGreaterThan(0);
  });

  it('getSelectedRangeTokens returns 0 without range', () => {
    expect(getSelectedRangeTokens()).toBe(0);
  });

  it('loadGitStatuses fetches statuses from backend', async () => {
    mockIpcCommand('get_git_file_statuses', () => ({
      'src/main.ts': { status: 'modified' },
    }));
    await loadGitStatuses('proj-1');
    expect(getGitStatus('src/main.ts')?.status).toBe('modified');
    expect(getGitStatus('unknown.ts')).toBeNull();
  });

  it('toggleFilesVisible toggles visibility', () => {
    const initial = fileState.isVisible;
    toggleFilesVisible();
    expect(fileState.isVisible).toBe(!initial);
    toggleFilesVisible();
    expect(fileState.isVisible).toBe(initial);
  });

  it('loadRootFiles applies persisted showIgnoredFiles preference', async () => {
    let callArgs: Record<string, unknown> | null = null;
    localStorage.setItem('cw:showIgnoredFiles:proj-1', '1');
    mockIpcCommand('list_project_files', (args) => {
      callArgs = args as Record<string, unknown>;
      return mockRootNodes;
    });

    await loadRootFiles('proj-1');

    expect(fileState.showIgnoredFiles).toBe(true);
    expect(callArgs?.['show_ignored']).toBe(true);
  });

  it('toggleShowIgnoredFiles persists and reloads when an active project exists', async () => {
    const callArgs: Array<Record<string, unknown>> = [];
    mockIpcCommand('list_project_files', (args) => {
      callArgs.push(args as Record<string, unknown>);
      return mockRootNodes;
    });

    setActiveProject('proj-1');
    await loadRootFiles('proj-1');
    toggleShowIgnoredFiles();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fileState.showIgnoredFiles).toBe(true);
    expect(localStorage.getItem('cw:showIgnoredFiles:proj-1')).toBe('1');
    expect(callArgs.some((args) => args['show_ignored'] === true)).toBe(true);
  });
});
