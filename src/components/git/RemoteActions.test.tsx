import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import RemoteActions from './RemoteActions';

const mock = vi.hoisted(() => ({
  gitState: {
    remoteOperation: null as 'fetch' | 'pull' | 'push' | null,
    remoteProgress: null as { current: number; total: number; message: string } | null,
    remoteError: null as string | null,
  },
  fetchRemote: vi.fn().mockResolvedValue(undefined),
  pullRemote: vi.fn().mockResolvedValue('Already up to date.'),
  pushRemote: vi.fn().mockResolvedValue(undefined),
  addToast: vi.fn(),
}));

vi.mock('@/stores/gitStore', () => ({
  gitState: mock.gitState,
  fetchRemote: () => mock.fetchRemote(),
  pullRemote: () => mock.pullRemote(),
  pushRemote: () => mock.pushRemote(),
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: (...args: unknown[]) => mock.addToast(...args),
}));

describe('RemoteActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.gitState.remoteOperation = null;
    mock.gitState.remoteProgress = null;
    mock.gitState.remoteError = null;
  });

  it('renders Fetch, Pull, and Push buttons', () => {
    const { getByTitle } = render(() => <RemoteActions />);
    expect(getByTitle('Fetch')).toBeTruthy();
    expect(getByTitle('Pull')).toBeTruthy();
    expect(getByTitle('Push')).toBeTruthy();
  });

  it('calls fetchRemote when Fetch is clicked', () => {
    const { getByTitle } = render(() => <RemoteActions />);
    fireEvent.click(getByTitle('Fetch'));
    expect(mock.fetchRemote).toHaveBeenCalledOnce();
  });

  it('calls pullRemote when Pull is clicked', () => {
    const { getByTitle } = render(() => <RemoteActions />);
    fireEvent.click(getByTitle('Pull'));
    expect(mock.pullRemote).toHaveBeenCalledOnce();
  });

  it('calls pushRemote when Push is clicked', () => {
    const { getByTitle } = render(() => <RemoteActions />);
    fireEvent.click(getByTitle('Push'));
    expect(mock.pushRemote).toHaveBeenCalledOnce();
  });

  it('disables all buttons when operation is in progress', () => {
    mock.gitState.remoteOperation = 'fetch';
    const { getByTitle } = render(() => <RemoteActions />);
    expect(getByTitle('Fetch')).toBeDisabled();
    expect(getByTitle('Pull')).toBeDisabled();
    expect(getByTitle('Push')).toBeDisabled();
  });
});
