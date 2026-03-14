import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import GitPanel from './GitPanel';

type RepoInfo = {
  root: string;
  head_branch: string | null;
  is_dirty: boolean;
  ahead: number;
  behind: number;
};
type FileStatusEntry = {
  path: string;
  status: 'staged' | 'modified' | 'untracked' | 'deleted' | 'renamed' | 'conflicted';
  is_staged: boolean;
  old_path: string | null;
};

const mock = vi.hoisted(() => ({
  setGitProjectId: vi.fn(),
  refreshGitStatus: vi.fn(),
  refreshRepoInfo: vi.fn(),
  projectState: {
    activeProjectId: 'proj-1' as string | null,
  },
  stagedFiles: [] as FileStatusEntry[],
  unstagedFiles: [] as FileStatusEntry[],
  untrackedFiles: [] as FileStatusEntry[],
  gitState: {
    repoInfo: null as RepoInfo | null,
    statusEntries: [] as FileStatusEntry[],
    stashes: [] as { index: number; message: string; oid: string }[],
    remoteOperation: null as 'fetch' | 'pull' | 'push' | null,
    remoteProgress: null as { current: number; total: number; message: string } | null,
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock('@/stores/gitStore', () => ({
  gitState: mock.gitState,
  getStagedFiles: () => mock.stagedFiles,
  getUnstagedFiles: () => mock.unstagedFiles,
  getUntrackedFiles: () => mock.untrackedFiles,
  setGitProjectId: (id: string | null) => mock.setGitProjectId(id),
  refreshGitStatus: () => mock.refreshGitStatus(),
  refreshRepoInfo: () => mock.refreshRepoInfo(),
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: mock.projectState,
}));

vi.mock('@/components/git/CommitLog', () => ({
  default: () => <div data-testid="commit-log" />,
}));

vi.mock('@/components/git/CommitBox', () => ({
  default: () => <div data-testid="commit-box" />,
}));

vi.mock('@/components/git/RemoteActions', () => ({
  default: () => <div data-testid="remote-actions" />,
}));

vi.mock('@/components/git/StashList', () => ({
  default: () => <div data-testid="stash-list" />,
}));

vi.mock('@/components/git/MergeConflictBanner', () => ({
  default: () => <div data-testid="merge-conflict-banner" />,
  hasConflicts: (entries: FileStatusEntry[]) =>
    entries.some((entry) => entry.status === 'conflicted'),
}));

describe('GitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.projectState.activeProjectId = 'proj-1';
    mock.gitState.repoInfo = null;
    mock.gitState.statusEntries = [];
    mock.gitState.stashes = [];
    mock.gitState.remoteOperation = null;
    mock.gitState.remoteProgress = null;
    mock.gitState.isLoading = false;
    mock.gitState.error = null;
    mock.stagedFiles = [];
    mock.unstagedFiles = [];
    mock.untrackedFiles = [];
  });

  it('renders the Git panel header', () => {
    const { getByText } = render(() => <GitPanel />);
    expect(getByText('Git')).toBeTruthy();
    expect(mock.setGitProjectId).toHaveBeenCalledWith('proj-1');
    expect(mock.refreshRepoInfo).toHaveBeenCalled();
    expect(mock.refreshGitStatus).toHaveBeenCalled();
  });

  it('shows no-repo message when repoInfo is null', () => {
    const { getByText } = render(() => <GitPanel />);
    expect(getByText(/no git repository/i)).toBeTruthy();
  });

  it('does not refresh git data when no active project is selected', () => {
    mock.projectState.activeProjectId = null;
    render(() => <GitPanel />);
    expect(mock.setGitProjectId).toHaveBeenCalledWith(null);
    expect(mock.refreshRepoInfo).not.toHaveBeenCalled();
    expect(mock.refreshGitStatus).not.toHaveBeenCalled();
  });

  it('shows changed file sections when status entries exist', () => {
    mock.gitState.repoInfo = {
      root: '/tmp/repo',
      head_branch: 'main',
      is_dirty: true,
      ahead: 0,
      behind: 0,
    };
    mock.unstagedFiles = [
      { path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null },
    ];

    const { getByText } = render(() => <GitPanel />);
    expect(getByText(/changes/i)).toBeTruthy();
  });
});
