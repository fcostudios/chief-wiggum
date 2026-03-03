import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';

const mockState = { isLoading: false, isStreaming: false };

vi.mock('@/stores/conversationStore', () => ({
  get conversationState() {
    return mockState;
  },
}));

import ResponseProgress from './ResponseProgress';

describe('ResponseProgress', () => {
  beforeEach(() => {
    mockState.isLoading = false;
    mockState.isStreaming = false;
  });

  it('renders nothing when not loading or streaming', () => {
    const { container } = render(() => <ResponseProgress />);
    expect(container.querySelector('[data-testid="response-progress"]')).toBeNull();
  });

  it('renders bar when isLoading is true', () => {
    mockState.isLoading = true;
    const { container } = render(() => <ResponseProgress />);
    expect(container.querySelector('[data-testid="response-progress"]')).toBeTruthy();
  });

  it('renders bar when isStreaming is true', () => {
    mockState.isStreaming = true;
    const { container } = render(() => <ResponseProgress />);
    expect(container.querySelector('[data-testid="response-progress"]')).toBeTruthy();
  });

  it('shows elapsed timer formatted as 00:00', () => {
    mockState.isLoading = true;
    const { container } = render(() => <ResponseProgress />);
    expect(container.querySelector('[data-testid="elapsed-timer"]')?.textContent).toBe('00:00');
  });
});
