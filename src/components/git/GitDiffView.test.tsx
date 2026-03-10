import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import GitDiffView from './GitDiffView';

vi.mock('@/stores/gitStore', () => ({
  gitState: {
    selectedGitFile: null,
    selectedFileDiff: null,
    isDiffLoading: false,
  },
  loadFileDiff: vi.fn(),
}));

describe('GitDiffView', () => {
  it('renders nothing when no file is selected', () => {
    const { container } = render(() => <GitDiffView />);
    expect(container.textContent).toBe('');
  });

  it('shows loading state when isDiffLoading is true', async () => {
    const gitStore = await import('@/stores/gitStore');
    Object.assign(gitStore.gitState, {
      selectedGitFile: { path: 'src/app.ts', status: 'modified', is_staged: false, old_path: null },
      isDiffLoading: true,
      selectedFileDiff: null,
    });
    const { container } = render(() => <GitDiffView />);
    expect(container.querySelector('[aria-busy]') || container.textContent).toBeTruthy();
  });

  it('renders diff hunks when diff is loaded', async () => {
    const gitStore = await import('@/stores/gitStore');
    Object.assign(gitStore.gitState, {
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

  it('shows binary file message for binary diffs', async () => {
    const gitStore = await import('@/stores/gitStore');
    Object.assign(gitStore.gitState, {
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
});
