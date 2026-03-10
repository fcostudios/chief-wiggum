import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  type FileStatusKind,
  gitState,
  loadFileDiff,
  refreshGitStatus,
  refreshRepoInfo,
  setGitProjectId,
  setSelectedGitFile,
} from './gitStore';

describe('gitStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGitProjectId(null);
  });

  it('starts with null repo info and empty status', () => {
    expect(gitState.repoInfo).toBeNull();
    expect(gitState.statusEntries).toEqual([]);
    expect(gitState.isLoading).toBe(false);
    expect(gitState.projectId).toBeNull();
  });

  it('refreshRepoInfo calls git_get_repo_info with project id', async () => {
    const mockInfo = { root: '/tmp/repo', head_branch: 'main', is_dirty: false };
    vi.mocked(invoke).mockResolvedValueOnce(mockInfo);
    setGitProjectId('project-1');
    await refreshRepoInfo();
    expect(invoke).toHaveBeenCalledWith('git_get_repo_info', { project_id: 'project-1' });
    expect(gitState.repoInfo).toEqual(mockInfo);
  });

  it('refreshRepoInfo does nothing when no projectId', async () => {
    await refreshRepoInfo();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refreshGitStatus calls git_get_status and updates statusEntries', async () => {
    const mockEntries = [
      { path: 'src/main.ts', status: 'modified', is_staged: false, old_path: null },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(mockEntries);
    setGitProjectId('project-1');
    await refreshGitStatus();
    expect(invoke).toHaveBeenCalledWith('git_get_status', { project_id: 'project-1' });
    expect(gitState.statusEntries).toEqual(mockEntries);
  });

  it('sets isLoading true during fetch, false after', async () => {
    let resolvePromise!: (v: unknown) => void;
    const promise = new Promise((r) => {
      resolvePromise = r;
    });
    vi.mocked(invoke).mockReturnValueOnce(promise);
    setGitProjectId('project-1');

    const fetchPromise = refreshRepoInfo();
    expect(gitState.isLoading).toBe(true);
    resolvePromise({ root: '/r', head_branch: 'main', is_dirty: false });
    await fetchPromise;
    expect(gitState.isLoading).toBe(false);
  });
});

describe('gitStore — diff loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGitProjectId(null);
    setSelectedGitFile(null);
  });

  it('selectedGitFile starts null', () => {
    expect(gitState.selectedGitFile).toBeNull();
    expect(gitState.selectedFileDiff).toBeNull();
  });

  it('setSelectedGitFile updates selectedGitFile', () => {
    const entry = {
      path: 'src/main.ts',
      status: 'modified' as FileStatusKind,
      is_staged: false,
      old_path: null,
    };
    setSelectedGitFile(entry);
    expect(gitState.selectedGitFile).toEqual(entry);
  });

  it('loadFileDiff calls git_get_file_diff with correct params', async () => {
    const entry = {
      path: 'src/main.ts',
      status: 'modified' as FileStatusKind,
      is_staged: false,
      old_path: null,
    };
    const mockDiff = {
      path: 'src/main.ts',
      old_path: null,
      is_binary: false,
      is_new_file: false,
      hunks: [],
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockDiff);
    setGitProjectId('project-1');
    await loadFileDiff(entry);
    expect(invoke).toHaveBeenCalledWith('git_get_file_diff', {
      project_id: 'project-1',
      file_path: 'src/main.ts',
      staged: false,
    });
    expect(gitState.selectedFileDiff).toEqual(mockDiff);
  });

  it('loadFileDiff uses staged=true for staged files', async () => {
    const entry = {
      path: 'src/main.ts',
      status: 'staged' as FileStatusKind,
      is_staged: true,
      old_path: null,
    };
    vi.mocked(invoke).mockResolvedValueOnce(null);
    setGitProjectId('project-1');
    await loadFileDiff(entry);
    expect(invoke).toHaveBeenCalledWith('git_get_file_diff', {
      project_id: 'project-1',
      file_path: 'src/main.ts',
      staged: true,
    });
  });
});
