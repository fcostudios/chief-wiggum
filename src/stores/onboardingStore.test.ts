import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHasSeenHint = vi.fn((_: string) => false);

vi.mock('@/stores/settingsStore', () => ({
  hasSeenHint: (id: string) => mockHasSeenHint(id),
  markHintSeen: vi.fn(),
  hintsEnabled: () => true,
}));

import { incrementSessionCount, sessionCount, shouldShowTooltip } from './onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    mockHasSeenHint.mockReturnValue(false);
  });

  it('returns sessionCount of 0 before first increment', () => {
    expect(sessionCount()).toBe(0);
  });

  it('increments session count and persists to localStorage', () => {
    incrementSessionCount();
    expect(sessionCount()).toBe(1);
    expect(localStorage.getItem('cw:onboarding:session-count')).toBe('1');
  });

  it('reads persisted count on init', () => {
    localStorage.setItem('cw:onboarding:session-count', '2');
    expect(sessionCount()).toBe(2);
  });

  it('shouldShowTooltip returns false if already seen', () => {
    mockHasSeenHint.mockReturnValue(true);
    localStorage.setItem('cw:onboarding:session-count', '2');
    expect(shouldShowTooltip('onboarding:at-mention', 1)).toBe(false);
  });

  it('shouldShowTooltip returns false if session count too low', () => {
    incrementSessionCount();
    expect(shouldShowTooltip('onboarding:auto-approve', 2)).toBe(false);
  });

  it('shouldShowTooltip returns true when session count meets threshold and not seen', () => {
    incrementSessionCount();
    expect(shouldShowTooltip('onboarding:at-mention', 1)).toBe(true);
  });
});
