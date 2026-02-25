import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToast, dismissToast, toastState } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const toast of [...toastState.toasts]) {
      dismissToast(toast.id);
    }
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('starts with empty toasts', () => {
    expect(toastState.toasts).toEqual([]);
  });

  it('adds a toast', () => {
    const id = addToast('Test message', 'error');
    expect(toastState.toasts.length).toBeGreaterThan(0);
    expect(toastState.toasts[0]?.message).toBe('Test message');
    dismissToast(id);
    vi.advanceTimersByTime(300);
  });

  it('limits to max 3 toasts', () => {
    addToast('One', 'error');
    addToast('Two', 'error');
    addToast('Three', 'error');
    addToast('Four', 'error');
    expect(toastState.toasts.length).toBeLessThanOrEqual(3);
  });
});
