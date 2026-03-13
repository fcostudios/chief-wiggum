import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import GitDiffView from './GitDiffView';

const gitStoreMock = vi.hoisted(() => ({
  gitState: {
    selectedGitFile: null,
    selectedFileDiff: null,
    isDiffLoading: false,
  },
  loadFileDiff: vi.fn(),
  stageFile: vi.fn(),
  unstageFile: vi.fn(),
  stageHunk: vi.fn().mockResolvedValue(undefined),
  unstageHunk: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/gitStore', () => gitStoreMock);

describe('GitDiffView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(gitStoreMock.gitState, {
      selectedGitFile: null,
      selectedFileDiff: null,
      isDiffLoading: false,
    });
  });

  it('renders nothing when no file is selected', () => {
    const { container } = render(() => <GitDiffView />);
    expect(container.textContent).toBe('');
  });

  it('shows loading state when isDiffLoading is true', () => {
    Object.assign(gitStoreMock.gitState, {
      selectedGitFile: { path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null },
      isDiffLoading: true,
      selectedFileDiff: null,
    });
    const { container } = render(() => <GitDiffView />);
    expect(container.querySelector('[aria-busy]') || container.textContent).toBeTruthy();
  });

  it('renders diff hunks when diff is loaded', () => {
    Object.assign(gitStoreMock.gitState, {
      selectedGitFile: { path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null },
      isDiffLoading: false,
      selectedFileDiff: {
        path: 'src/app.ts',
        old_path: null,
        is_binary: false,
        is_new_file: false,
        hunks: [
          {
            header: '@@ -1,3 +1,4 @@',
            old_start: 1,
            old_lines: 3,
            new_start: 1,
            new_lines: 4,
            lines: [
              { kind: 'context', old_lineno: 1, new_lineno: 1, content: 'const x = 1;' },
              { kind: 'removed', old_lineno: 2, new_lineno: null, content: 'const y = 2;' },
              { kind: 'added', old_lineno: null, new_lineno: 2, content: 'const y = 99;' },
            ],
          },
        ],
      },
    });
    const { getByText } = render(() => <GitDiffView />);
    expect(getByText('@@ -1,3 +1,4 @@')).toBeTruthy();
    expect(getByText('const y = 2;')).toBeTruthy();
    expect(getByText('const y = 99;')).toBeTruthy();
  });

  it('shows binary file message for binary diffs', () => {
    Object.assign(gitStoreMock.gitState, {
      selectedGitFile: { path: 'img.png', status: 'modified', is_staged: false, old_path: null },
      isDiffLoading: false,
      selectedFileDiff: {
        path: 'img.png',
        old_path: null,
        is_binary: true,
        is_new_file: false,
        hunks: [],
      },
    });
    const { getByText } = render(() => <GitDiffView />);
    expect(getByText(/binary/i)).toBeTruthy();
  });

  it('pressing s stages the focused hunk', async () => {
    Object.assign(gitStoreMock.gitState, {
      selectedGitFile: { path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null },
      isDiffLoading: false,
      selectedFileDiff: {
        path: 'src/app.ts',
        old_path: null,
        is_binary: false,
        is_new_file: false,
        hunks: [
          {
            header: '@@ -1,3 +1,4 @@',
            old_start: 1,
            old_lines: 3,
            new_start: 1,
            new_lines: 4,
            lines: [{ kind: 'added', old_lineno: null, new_lineno: 1, content: 'new line' }],
          },
          {
            header: '@@ -10,3 +11,4 @@',
            old_start: 10,
            old_lines: 3,
            new_start: 11,
            new_lines: 4,
            lines: [{ kind: 'removed', old_lineno: 10, new_lineno: null, content: 'old line' }],
          },
        ],
      },
    });

    const { getByTestId } = render(() => <GitDiffView />);
    const diffContainer = getByTestId('git-diff-view');
    diffContainer.focus();
    fireEvent.keyDown(diffContainer, { key: 's', code: 'KeyS' });

    await waitFor(() => expect(gitStoreMock.stageHunk).toHaveBeenCalledWith('src/app.ts', 0));
  });

  it('pressing u unstages the focused hunk', async () => {
    Object.assign(gitStoreMock.gitState, {
      selectedGitFile: { path: 'src/app.ts', status: 'staged', is_staged: true, old_path: null },
      isDiffLoading: false,
      selectedFileDiff: {
        path: 'src/app.ts',
        old_path: null,
        is_binary: false,
        is_new_file: false,
        hunks: [
          {
            header: '@@ -1,3 +1,4 @@',
            old_start: 1,
            old_lines: 3,
            new_start: 1,
            new_lines: 4,
            lines: [{ kind: 'added', old_lineno: null, new_lineno: 1, content: 'new line' }],
          },
        ],
      },
    });

    const { getByTestId } = render(() => <GitDiffView />);
    const diffContainer = getByTestId('git-diff-view');
    diffContainer.focus();
    fireEvent.keyDown(diffContainer, { key: 'u', code: 'KeyU' });

    await waitFor(() => expect(gitStoreMock.unstageHunk).toHaveBeenCalledWith('src/app.ts', 0));
  });
});
