import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getDiffState: vi.fn<(key: string) => 'pending' | 'applied' | 'rejected'>(() => 'pending'),
  setDiffState: vi.fn(),
  addToast: vi.fn(),
  setActiveView: vi.fn(),
  setActiveInlineDiff: vi.fn(),
  activeProjectId: 'proj-1' as string | null,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('@/stores/conversationStore', () => ({
  getDiffState: mocks.getDiffState,
  setDiffState: mocks.setDiffState,
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: mocks.addToast,
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: {
    get activeProjectId() {
      return mocks.activeProjectId;
    },
  },
}));

vi.mock('@/stores/uiStore', () => ({
  setActiveView: mocks.setActiveView,
}));

vi.mock('@/stores/diffReviewStore', () => ({
  setActiveInlineDiff: mocks.setActiveInlineDiff,
}));

import InlineDiffBlock from './InlineDiffBlock';

const DIFF = `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,1 +1,1 @@
-old
+new`;

describe('InlineDiffBlock', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue({ content: 'old\n' });
    mocks.getDiffState.mockReset();
    mocks.getDiffState.mockReturnValue('pending');
    mocks.setDiffState.mockReset();
    mocks.addToast.mockReset();
    mocks.setActiveView.mockReset();
    mocks.setActiveInlineDiff.mockReset();
    mocks.activeProjectId = 'proj-1';
  });

  it('renders the diff code', () => {
    const { container } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:0" />);
    expect(container.textContent).toContain('old');
  });

  it('shows Apply, Reject, and Open in Diff buttons when pending', () => {
    const { getByRole } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:0" />);
    expect(getByRole('button', { name: /apply/i })).toBeTruthy();
    expect(getByRole('button', { name: /reject/i })).toBeTruthy();
    expect(getByRole('button', { name: /open in diff/i })).toBeTruthy();
  });

  it('shows Applied chip when state is applied', () => {
    mocks.getDiffState.mockReturnValue('applied');
    const { getByText } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:1" />);
    expect(getByText(/applied/i)).toBeTruthy();
  });

  it('shows Rejected chip when state is rejected', () => {
    mocks.getDiffState.mockReturnValue('rejected');
    const { getByText } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:2" />);
    expect(getByText(/rejected/i)).toBeTruthy();
  });

  it('calls setDiffState rejected when Reject clicked', () => {
    const { getByRole } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:3" />);
    fireEvent.click(getByRole('button', { name: /reject/i }));
    expect(mocks.setDiffState).toHaveBeenCalledWith('msg1:3', 'rejected');
  });

  it('applies diff and marks state applied when Apply succeeds', async () => {
    mocks.invoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_project_file') return Promise.resolve({ content: 'old\n' });
      if (cmd === 'write_file_content') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const { getByRole } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:4" />);
    const apply = getByRole('button', { name: /apply/i });
    await waitFor(() => {
      expect(apply).not.toBeDisabled();
    });
    fireEvent.click(apply);

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('read_project_file', {
        project_id: 'proj-1',
        relative_path: 'src/auth.ts',
      });
      expect(mocks.invoke).toHaveBeenCalledWith('write_file_content', {
        project_id: 'proj-1',
        relative_path: 'src/auth.ts',
        content: expect.stringContaining('new'),
      });
      expect(mocks.setDiffState).toHaveBeenCalledWith('msg1:4', 'applied');
    });
  });

  it('disables Apply when target file does not exist', async () => {
    mocks.invoke.mockRejectedValue(new Error('not found'));
    const { getByRole } = render(() => <InlineDiffBlock code={DIFF} diffKey="msg1:5" />);
    const apply = getByRole('button', { name: /apply/i });
    await waitFor(() => {
      expect(apply).toBeDisabled();
      expect(apply).toHaveAttribute('title', 'File not found in project.');
    });
  });
});
