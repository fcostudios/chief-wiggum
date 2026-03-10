import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import CommitBox from './CommitBox';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/stores/gitStore', () => ({
  gitState: {
    projectId: 'proj-1',
    statusEntries: [],
  },
  getStagedFiles: vi.fn(() => []),
  refreshGitStatus: vi.fn(),
  refreshRepoInfo: vi.fn(),
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
}));

describe('CommitBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the commit textarea', () => {
    const { getByPlaceholderText } = render(() => <CommitBox />);
    expect(getByPlaceholderText(/commit message/i)).toBeTruthy();
  });

  it('disables Commit button when no message', () => {
    const { getByRole } = render(() => <CommitBox />);
    const commitBtn = getByRole('button', { name: /^Commit \(/ });
    expect(commitBtn).toBeDisabled();
  });

  it('disables Commit button when no staged files', async () => {
    const gitStore = await import('@/stores/gitStore');
    vi.mocked(gitStore.getStagedFiles).mockReturnValue([]);
    const { getByRole } = render(() => <CommitBox />);
    const commitBtn = getByRole('button', { name: /^Commit \(/ });
    expect(commitBtn).toBeDisabled();
  });

  it('enables Commit button with message and staged files', async () => {
    const gitStore = await import('@/stores/gitStore');
    vi.mocked(gitStore.getStagedFiles).mockReturnValue([
      { path: 'src/main.ts', status: 'staged', is_staged: true, old_path: null },
    ]);

    const { getByPlaceholderText, getByRole } = render(() => <CommitBox />);
    const textarea = getByPlaceholderText(/commit message/i);
    fireEvent.input(textarea, { target: { value: 'feat: add feature' } });
    const commitBtn = getByRole('button', { name: /^Commit \(/ });
    expect(commitBtn).not.toBeDisabled();
  });

  it('shows character counter after 50 chars', () => {
    const { getByPlaceholderText, container } = render(() => <CommitBox />);
    const textarea = getByPlaceholderText(/commit message/i);
    const longMessage = 'a'.repeat(55);
    fireEvent.input(textarea, { target: { value: longMessage } });
    expect(container.textContent).toContain('55/72');
  });

  it('shows amend checkbox', () => {
    const { getByLabelText } = render(() => <CommitBox />);
    expect(getByLabelText(/amend/i)).toBeTruthy();
  });
});
