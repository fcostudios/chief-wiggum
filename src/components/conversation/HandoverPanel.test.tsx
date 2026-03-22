import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import HandoverPanel from './HandoverPanel';

vi.mock('qrcode', () => ({
  toString: vi.fn().mockResolvedValue('<svg />'),
}));

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
    const { getByTestId } = render(() => <HandoverPanel sessionId="s1" onClose={() => {}} />);
    const el = getByTestId('remote-message-count');
    expect(el.textContent).toContain('3');
    expect(el.textContent).toContain('mirrored');
  });

  it('has a reclaim button', () => {
    const { getByRole } = render(() => <HandoverPanel sessionId="s1" onClose={() => {}} />);
    expect(getByRole('button', { name: /reclaim session/i })).toBeTruthy();
  });

  it('shows QR fallback text when qrcode generation throws', async () => {
    const QRCode = await import('qrcode');
    vi.mocked(QRCode.toString).mockRejectedValueOnce(new Error('generation failed'));

    const { findByText } = render(() => <HandoverPanel sessionId="s1" onClose={() => {}} />);
    expect(await findByText(/QR unavailable/i)).toBeTruthy();
  });
});
