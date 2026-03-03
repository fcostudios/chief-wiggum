// src/stores/onboardingStore.ts
// Tracks onboarding session count and tooltip visibility (CHI-241).
// Session count is persisted in localStorage.

import { hasSeenHint, hintsEnabled, markHintSeen } from '@/stores/settingsStore';

const STORAGE_KEY = 'cw:onboarding:session-count';
const TOOLTIP_FLOW: Array<{ id: string; requiredSession: number }> = [
  { id: 'onboarding:at-mention', requiredSession: 1 },
  { id: 'onboarding:cmd-k', requiredSession: 1 },
  { id: 'onboarding:cycle-model', requiredSession: 2 },
  { id: 'onboarding:auto-approve', requiredSession: 2 },
  { id: 'onboarding:drag-attach', requiredSession: 3 },
];

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

function firstEligibleFlowTooltipId(): string | null {
  const sessions = sessionCount();
  for (const tooltip of TOOLTIP_FLOW) {
    if (sessions < tooltip.requiredSession) continue;
    if (hasSeenHint(tooltip.id)) continue;
    return tooltip.id;
  }
  return null;
}

/**
 * Returns true if this tooltip should show:
 * - hints are enabled globally
 * - user has had at least `requiredSession` sessions
 * - hint has not been dismissed
 */
export function shouldShowTooltip(id: string, requiredSession: number): boolean {
  if (!hintsEnabled()) return false;
  if (sessionCount() < requiredSession) return false;
  if (hasSeenHint(id)) return false;

  // Prevent stacked overlays: only the first eligible onboarding tooltip in the
  // flow is allowed to render at a time. Unknown IDs keep legacy behavior.
  const activeFlowId = firstEligibleFlowTooltipId();
  if (activeFlowId) {
    return activeFlowId === id;
  }

  return true;
}

/** Dismiss a tooltip permanently. */
export function dismissTooltip(id: string): void {
  markHintSeen(id);
}
