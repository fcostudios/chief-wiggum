import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import CommitBox from './CommitBox';

type StagedEntry = {
  path: string;
  status: 'staged';
  is_staged: true;
  old_path: null;
};

const invokeMock = vi.hoisted(() => vi.fn());
const getStagedFilesMock = vi.hoisted(() => vi.fn<() => StagedEntry[]>(() => []));
const refreshGitStatusMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const refreshRepoInfoMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const addToastMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/stores/gitStore', () => ({
  gitState: {
    projectId: 'proj-1',
    statusEntries: [],
  },
  getStagedFiles: getStagedFilesMock,
  refreshGitStatus: refreshGitStatusMock,
  refreshRepoInfo: refreshRepoInfoMock,
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: addToastMock,
}));

describe('CommitBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStagedFilesMock.mockReturnValue([]);
  });

  it('renders the commit textarea', () => {
    const { getByPlaceholderText } = render(() => <CommitBox />);
    expect(getByPlaceholderText(/commit message/i)).toBeTruthy();
  });

  it('disables Commit button when no message', () => {
    const { getByRole } = render(() => <CommitBox />);
    expect(getByRole('button', { name: /^Commit \(/ })).toBeDisabled();
  });

  it('disables Commit button when no staged files', () => {
    const { getByRole } = render(() => <CommitBox />);
    expect(getByRole('button', { name: /^Commit \(/ })).toBeDisabled();
  });

  it('enables Commit button with message and staged files', () => {
    getStagedFilesMock.mockReturnValue([
      { path: 'src/main.ts', status: 'staged', is_staged: true, old_path: null },
    ]);

    const { getByPlaceholderText, getByRole } = render(() => <CommitBox />);
    fireEvent.input(getByPlaceholderText(/commit message/i), {
      target: { value: 'feat: add feature' },
    });
    expect(getByRole('button', { name: /^Commit \(/ })).not.toBeDisabled();
  });

  it('shows character counter after 50 chars', () => {
    const { getByPlaceholderText, container } = render(() => <CommitBox />);
    fireEvent.input(getByPlaceholderText(/commit message/i), {
      target: { value: 'a'.repeat(55) },
    });
    expect(container.textContent).toContain('55/72');
  });

  it('shows amend checkbox', () => {
    const { getByLabelText } = render(() => <CommitBox />);
    expect(getByLabelText(/amend/i)).toBeTruthy();
  });

  it('AI Message button is enabled when staged files exist', () => {
    getStagedFilesMock.mockReturnValue([
      { path: 'src/app.ts', status: 'staged', is_staged: true, old_path: null },
    ]);
    const { getByRole } = render(() => <CommitBox />);
    expect(getByRole('button', { name: /Generate AI commit message/i })).not.toBeDisabled();
  });

  it('calls git_generate_commit_message IPC when AI Message is clicked', async () => {
    getStagedFilesMock.mockReturnValue([
      { path: 'src/app.ts', status: 'staged', is_staged: true, old_path: null },
    ]);
    invokeMock.mockResolvedValueOnce('Fix authentication bug in login flow');

    const { getByRole } = render(() => <CommitBox />);
    fireEvent.click(getByRole('button', { name: /Generate AI commit message/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('git_generate_commit_message', {
        project_id: 'proj-1',
      });
    });
  });

  it('populates textarea with generated message', async () => {
    getStagedFilesMock.mockReturnValue([
      { path: 'src/app.ts', status: 'staged', is_staged: true, old_path: null },
    ]);
    invokeMock.mockResolvedValueOnce('Fix type error in utils.ts');

    const { getByPlaceholderText, getByRole } = render(() => <CommitBox />);
    fireEvent.click(getByRole('button', { name: /Generate AI commit message/i }));

    await waitFor(() => {
      const textarea = getByPlaceholderText('Commit message...') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Fix type error in utils.ts');
    });
  });

  it('shows error toast when generation fails', async () => {
    getStagedFilesMock.mockReturnValue([
      { path: 'src/app.ts', status: 'staged', is_staged: true, old_path: null },
    ]);
    invokeMock.mockRejectedValueOnce(new Error('CLI not found'));

    const { getByRole } = render(() => <CommitBox />);
    fireEvent.click(getByRole('button', { name: /Generate AI commit message/i }));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(expect.stringContaining('failed'), 'error');
    });
  });
});
