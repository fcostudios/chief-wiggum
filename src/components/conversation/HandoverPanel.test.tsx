import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import HandoverPanel from './HandoverPanel';

vi.mock('@/stores/handoverStore', () => ({
  getHandoverEntry: () => ({
    sessionId: 's1',
    relayUrl: 'https://claude.ai/code/abc',
    startedAt: new Date().toISOString(),
    remoteMessageCount: 3,
  }),
  reclaimSession: vi.fn(),
}));

describe('HandoverPanel', () => {
  it('renders relay URL', () => {
    const { getByText } = render(() => <HandoverPanel sessionId="s1" onClose={() => {}} />);
    expect(getByText(/claude\.ai\/code\/abc/)).toBeTruthy();
  });

  it('shows remote message count', () => {
    const { getByText } = render(() => <HandoverPanel sessionId="s1" onClose={() => {}} />);
    expect(getByText(/3 remote messages mirrored/i)).toBeTruthy();
  });

  it('has a reclaim button', () => {
    const { getByRole } = render(() => <HandoverPanel sessionId="s1" onClose={() => {}} />);
    expect(getByRole('button', { name: /reclaim session/i })).toBeTruthy();
  });
});
