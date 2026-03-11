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
  refreshGitStatus: vi.fn(),
  refreshRepoInfo: vi.fn(),
  stagedFiles: [] as FileStatusEntry[],
  unstagedFiles: [] as FileStatusEntry[],
  untrackedFiles: [] as FileStatusEntry[],
  gitState: {
    repoInfo: null as RepoInfo | null,
    statusEntries: [] as FileStatusEntry[],
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock('@/stores/gitStore', () => ({
  gitState: mock.gitState,
  getStagedFiles: () => mock.stagedFiles,
  getUnstagedFiles: () => mock.unstagedFiles,
  getUntrackedFiles: () => mock.untrackedFiles,
  refreshGitStatus: () => mock.refreshGitStatus(),
  refreshRepoInfo: () => mock.refreshRepoInfo(),
}));

vi.mock('@/components/git/CommitLog', () => ({
  default: () => <div data-testid="commit-log" />,
}));

describe('GitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.gitState.repoInfo = null;
    mock.gitState.statusEntries = [];
    mock.gitState.isLoading = false;
    mock.gitState.error = null;
    mock.stagedFiles = [];
    mock.unstagedFiles = [];
    mock.untrackedFiles = [];
  });

  it('renders the Git panel header', () => {
    const { getByText } = render(() => <GitPanel />);
    expect(getByText('Git')).toBeTruthy();
  });

  it('shows no-repo message when repoInfo is null', () => {
    const { getByText } = render(() => <GitPanel />);
    expect(getByText(/no git repository/i)).toBeTruthy();
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
