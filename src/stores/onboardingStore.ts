// src/stores/onboardingStore.ts
// Tracks onboarding session count and tooltip visibility (CHI-241).
// Session count is persisted in localStorage.

import { hasSeenHint, hintsEnabled, markHintSeen } from '@/stores/settingsStore';

const STORAGE_KEY = 'cw:onboarding:session-count';

function readStoredCount(): number {
  const raw = localStorage.getItem(STORAGE_KEY) ?? '0';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** How many app sessions the user has completed. */
export function sessionCount(): number {
  return readStoredCount();
}

/** Call once per app start (from App.tsx onMount). */
export function incrementSessionCount(): void {
  const next = readStoredCount() + 1;
  localStorage.setItem(STORAGE_KEY, String(next));
}

/**
 * Returns true if this tooltip should show:
 * - hints are enabled globally
 * - user has had at least `requiredSession` sessions
 * - hint has not been dismissed
 */
export function shouldShowTooltip(id: string, requiredSession: number): boolean {
  return hintsEnabled() && sessionCount() >= requiredSession && !hasSeenHint(id);
}

/** Dismiss a tooltip permanently. */
export function dismissTooltip(id: string): void {
  markHintSeen(id);
}
