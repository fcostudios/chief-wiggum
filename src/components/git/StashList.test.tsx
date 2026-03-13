import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import StashList from './StashList';

const gitStoreMock = vi.hoisted(() => ({
  gitState: {
    stashes: [{ index: 0, message: 'On main: WIP feature', oid: 'abc1234' }],
    stashesLoaded: true,
    isStashing: false,
  },
  loadStashes: vi.fn().mockResolvedValue(undefined),
  pushStash: vi.fn().mockResolvedValue(undefined),
  popStash: vi.fn().mockResolvedValue(undefined),
  dropStash: vi.fn().mockResolvedValue(undefined),
}));

const toastMock = vi.hoisted(() => ({
  addToast: vi.fn(),
}));

vi.mock('@/stores/gitStore', () => gitStoreMock);
vi.mock('@/stores/toastStore', () => toastMock);

describe('StashList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gitStoreMock.gitState.stashes = [{ index: 0, message: 'On main: WIP feature', oid: 'abc1234' }];
  });

  it('renders stash entries after opening the section', async () => {
    const { getByRole, getByText } = render(() => <StashList />);
    fireEvent.click(getByRole('button', { name: /stashes/i }));
    expect(getByText(/WIP feature/)).toBeTruthy();
  });

  it('calls popStash when Apply & Drop is clicked', async () => {
    const { getByRole, getByTitle } = render(() => <StashList />);
    fireEvent.click(getByRole('button', { name: /stashes/i }));
    fireEvent.click(getByTitle('Apply & Drop stash'));
    await waitFor(() => expect(gitStoreMock.popStash).toHaveBeenCalledWith(0));
  });

  it('calls dropStash when Drop is clicked', async () => {
    const { getByRole, getByTitle } = render(() => <StashList />);
    fireEvent.click(getByRole('button', { name: /stashes/i }));
    fireEvent.click(getByTitle('Drop stash'));
    await waitFor(() => expect(gitStoreMock.dropStash).toHaveBeenCalledWith(0));
  });

  it('shows empty state when no stashes', () => {
    gitStoreMock.gitState.stashes = [];
    const { getByRole, getByText } = render(() => <StashList />);
    fireEvent.click(getByRole('button', { name: /stashes/i }));
    expect(getByText('No stashes.')).toBeTruthy();
  });
});
