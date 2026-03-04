// src/stores/unsentStore.ts
// Tracks live composer content for unsent-content guards (CHI-256).

const UNSENT_THRESHOLD = 50;

let contentAccessor: (() => string) | null = null;
let discardHandler: (() => void) | null = null;

export function registerUnsentAccessors(accessor: () => string, onDiscard: () => void): void {
  contentAccessor = accessor;
  discardHandler = onDiscard;
}

export function unregisterUnsentAccessor(accessor: () => string): void {
  if (contentAccessor !== accessor) return;
  contentAccessor = null;
  discardHandler = null;
}

export function hasUnsentContent(): boolean {
  return (contentAccessor?.()?.trim().length ?? 0) > UNSENT_THRESHOLD;
}

export function discardUnsentContent(): void {
  discardHandler?.();
}
