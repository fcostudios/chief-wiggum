// src/stores/hintStore.ts
// CHI-228: Contextual hint queue with cooldown and per-hint dedup.

import { createSignal } from 'solid-js';
import { hasSeenHint, hintsEnabled, markHintSeen } from '@/stores/settingsStore';

export type HintId =
  | 'at-mention'
  | 'slash-commands'
  | 'split-panes'
  | 'context-scoring'
  | 'message-search'
  | 'keyboard-shortcuts'
  | 'developer-mode'
  | 'artifacts'
  | 'actions-center'
  | 'session-resume';

interface QueuedHint {
  id: HintId;
  text: string;
  shortcut?: string;
  anchorSelector: string;
}

const COOLDOWN_MS = 45_000;

const [activeHint, setActiveHint] = createSignal<QueuedHint | null>(null);
let lastShownAt = 0;

export const hintState = {
  get activeHint(): QueuedHint | null {
    return activeHint();
  },
};

export function maybeShowHint(
  id: HintId,
  text: string,
  shortcut?: string,
  anchorSelector?: string,
): void {
  if (!hintsEnabled()) return;
  if (hasSeenHint(id)) return;
  if (activeHint() !== null) return;

  const now = Date.now();
  if (now - lastShownAt < COOLDOWN_MS) return;

  setActiveHint({
    id,
    text,
    shortcut,
    anchorSelector: anchorSelector ?? 'body',
  });
  lastShownAt = now;
}

export function dismissHint(): void {
  const hint = activeHint();
  if (!hint) return;
  setActiveHint(null);
  markHintSeen(hint.id);
}
