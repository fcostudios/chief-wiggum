import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import MergeConflictBanner from './MergeConflictBanner';

const gitStoreMock = vi.hoisted(() => ({
  gitState: {
    projectId: 'project-1',
    statusEntries: [
      { path: 'src/app.ts', status: 'conflicted', is_staged: false, old_path: null },
      { path: 'src/utils.ts', status: 'conflicted', is_staged: false, old_path: null },
    ],
  },
  refreshGitStatus: vi.fn().mockResolvedValue(undefined),
}));

const invokeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toastMock = vi.hoisted(() => ({ addToast: vi.fn() }));

vi.mock('@/stores/gitStore', () => gitStoreMock);
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@/stores/toastStore', () => toastMock);

describe('MergeConflictBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders conflict count', () => {
    const { getByText } = render(() => <MergeConflictBanner />);
    expect(getByText(/Merge conflict in 2 file/)).toBeTruthy();
  });

  it('calls git_abort_merge when Abort Merge is clicked', async () => {
    const { getByRole } = render(() => <MergeConflictBanner />);
    fireEvent.click(getByRole('button', { name: /Abort merge/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('git_abort_merge', { project_id: 'project-1' }),
    );
  });
});
