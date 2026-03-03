import { beforeEach, describe, expect, it, vi } from 'vitest';

const seenHints = new Set<string>();
const mockHasSeenHint = vi.fn((id: string) => seenHints.has(id));

vi.mock('@/stores/settingsStore', () => ({
  hasSeenHint: (id: string) => mockHasSeenHint(id),
  markHintSeen: vi.fn(),
  hintsEnabled: () => true,
}));

import { incrementSessionCount, sessionCount, shouldShowTooltip } from './onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    seenHints.clear();
    mockHasSeenHint.mockImplementation((id: string) => seenHints.has(id));
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
    seenHints.add('onboarding:at-mention');
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

  it('allows only one onboarding tooltip from flow at a time', () => {
    localStorage.setItem('cw:onboarding:session-count', '2');
    expect(shouldShowTooltip('onboarding:at-mention', 1)).toBe(true);
    expect(shouldShowTooltip('onboarding:cmd-k', 1)).toBe(false);
    expect(shouldShowTooltip('onboarding:cycle-model', 2)).toBe(false);
    expect(shouldShowTooltip('onboarding:auto-approve', 2)).toBe(false);
  });

  it('unlocks next tooltip in flow after current one is seen', () => {
    localStorage.setItem('cw:onboarding:session-count', '2');
    seenHints.add('onboarding:at-mention');
    expect(shouldShowTooltip('onboarding:cmd-k', 1)).toBe(true);
    expect(shouldShowTooltip('onboarding:cycle-model', 2)).toBe(false);
  });

  it('keeps legacy behavior for unknown tooltip ids', () => {
    localStorage.setItem('cw:onboarding:session-count', '3');
    seenHints.add('onboarding:at-mention');
    seenHints.add('onboarding:cmd-k');
    seenHints.add('onboarding:cycle-model');
    seenHints.add('onboarding:auto-approve');
    seenHints.add('onboarding:drag-attach');
    expect(shouldShowTooltip('onboarding:custom', 1)).toBe(true);
  });
});
