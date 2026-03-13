import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import ChangedFilesList from './ChangedFilesList';
import type { FileStatusEntry } from '@/stores/gitStore';

const mocks = vi.hoisted(() => ({
  setSelectedGitFile: vi.fn(),
  refreshGitStatus: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue({ old_content: 'old content', was_untracked: false }),
  addToast: vi.fn(),
  gitState: {
    projectId: 'proj-1' as string | null,
    selectedGitFile: null as FileStatusEntry | null,
  },
}));

vi.mock('@/stores/gitStore', () => ({
  gitState: mocks.gitState,
  setSelectedGitFile: mocks.setSelectedGitFile,
  refreshGitStatus: mocks.refreshGitStatus,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: mocks.addToast,
}));

const mockFiles: FileStatusEntry[] = [
  { path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null },
];

describe('ChangedFilesList — discard button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gitState.projectId = 'proj-1';
    mocks.gitState.selectedGitFile = null;
    mocks.invoke.mockResolvedValue({ old_content: 'old content', was_untracked: false });
  });

  it('renders discard button for unstaged files', () => {
    const { container } = render(() => <ChangedFilesList title="Changes" files={mockFiles} />);
    const discardBtn = container.querySelector('[aria-label*="Discard"]');
    expect(discardBtn).toBeTruthy();
  });

  it('calls git_discard_file IPC when discard is clicked', async () => {
    const { container } = render(() => <ChangedFilesList title="Changes" files={mockFiles} />);
    const discardBtn = container.querySelector('[aria-label*="Discard"]') as HTMLButtonElement;
    fireEvent.click(discardBtn);
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith(
        expect.stringContaining('discard'),
        expect.any(Object),
      );
    });
  });

  it('shows undo toast after discard', async () => {
    const { container } = render(() => <ChangedFilesList title="Changes" files={mockFiles} />);
    const discardBtn = container.querySelector('[aria-label*="Discard"]') as HTMLButtonElement;
    fireEvent.click(discardBtn);
    await waitFor(() => {
      expect(mocks.addToast).toHaveBeenCalledWith(
        expect.stringContaining('discarded'),
        'undo',
        expect.objectContaining({ label: 'Undo' }),
      );
    });
  });
});
