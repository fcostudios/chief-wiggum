// src/stores/toastStore.ts
// Toast notification state. Max 3 visible, auto-dismiss timers.
// Per GUIDE-001 §3.4: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { logError } from './errorLogStore';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info' | 'tip' | 'undo';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
  details?: string;
  countdown?: number;
  dismissing?: boolean;
}

interface ToastState {
  toasts: Toast[];
}

const [state, setState] = createStore<ToastState>({
  toasts: [],
});

const timers = new Map<string, ReturnType<typeof setTimeout>>();

const AUTO_DISMISS_MS: Record<ToastVariant, number | null> = {
  success: 3000,
  info: 5000,
  warning: 8000,
  error: null,
  tip: 8000,
  undo: 5000,
};

/** Add a toast notification. Returns the toast ID. */
export function addToast(
  message: string,
  variant: ToastVariant = 'info',
  action?: Toast['action'],
  details?: string,
): string {
  const id = crypto.randomUUID();
  const toast: Toast = { id, message, variant, action };

  if (details) {
    toast.details = details;
  }
  if (variant === 'undo') {
    toast.countdown = AUTO_DISMISS_MS.undo ?? 5000;
  }
  if (variant === 'error') {
    logError(message, details, 'error');
  } else if (variant === 'warning') {
    logError(message, details, 'warning');
  }

  setState('toasts', (prev) => {
    // Keep max 3 — remove oldest if full
    const updated = [...prev, toast];
    if (updated.length > 3) {
      const removed = updated.shift()!;
      clearTimer(removed.id);
    }
    return updated;
  });

  // Auto-dismiss timer
  const ms = AUTO_DISMISS_MS[variant];
  if (ms) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), ms),
    );
  }

  return id;
}

/** Dismiss a toast with slide-out animation. */
export function dismissToast(id: string): void {
  clearTimer(id);
  // Mark as dismissing for exit animation
  setState('toasts', (t) => t.id === id, 'dismissing', true);
  // Remove after animation completes
  setTimeout(() => {
    setState('toasts', (prev) => prev.filter((t) => t.id !== id));
  }, 300);
}

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export { state as toastState };
