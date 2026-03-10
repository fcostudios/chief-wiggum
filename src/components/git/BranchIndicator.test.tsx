import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import BranchIndicator from './BranchIndicator';

vi.mock('@/stores/gitStore', () => ({
  gitState: { repoInfo: null, isLoading: false },
  setGitProjectId: vi.fn(),
  refreshRepoInfo: vi.fn(),
}));

vi.mock('@/stores/uiStore', () => ({
  setActiveView: vi.fn(),
  uiState: { activeView: 'conversation' },
}));

describe('BranchIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no repoInfo', () => {
    const { container } = render(() => <BranchIndicator />);
    // Should render an empty fragment or null
    expect(container.textContent).toBe('');
  });

  it('renders branch name when repoInfo is present', async () => {
    const { gitState } = await import('@/stores/gitStore');
    Object.assign(gitState, { repoInfo: { root: '/tmp', head_branch: 'main', is_dirty: false } });

    const { getByText } = render(() => <BranchIndicator />);
    expect(getByText('main')).toBeTruthy();
  });

  it('shows dirty indicator when is_dirty is true', async () => {
    const { gitState } = await import('@/stores/gitStore');
    Object.assign(gitState, {
      repoInfo: { root: '/tmp', head_branch: 'feature/x', is_dirty: true },
    });

    const { container } = render(() => <BranchIndicator />);
    // Should contain dirty indicator (•)
    expect(container.textContent).toContain('•');
  });
});
