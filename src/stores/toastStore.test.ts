import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToast, dismissToast, toastState, type ToastVariant } from './toastStore';

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

  it('auto-dismisses success toasts after 3s', () => {
    addToast('Done', 'success');
    expect(toastState.toasts.length).toBe(1);
    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(300);
    expect(toastState.toasts.length).toBe(0);
  });

  it('auto-dismisses info toasts after 5s', () => {
    addToast('Info', 'info');
    expect(toastState.toasts.length).toBe(1);
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(300);
    expect(toastState.toasts.length).toBe(0);
  });

  it('auto-dismisses warning toasts after 8s', () => {
    addToast('Warning', 'warning');
    expect(toastState.toasts.length).toBe(1);
    vi.advanceTimersByTime(8000);
    vi.advanceTimersByTime(300);
    expect(toastState.toasts.length).toBe(0);
  });

  it('does NOT auto-dismiss error toasts', () => {
    const id = addToast('Error', 'error');
    vi.advanceTimersByTime(60000);
    expect(toastState.toasts.length).toBe(1);
    dismissToast(id);
    vi.advanceTimersByTime(300);
  });

  it('auto-dismisses tip toasts after 8s', () => {
    addToast('Tip', 'tip' as ToastVariant);
    expect(toastState.toasts.length).toBe(1);
    vi.advanceTimersByTime(8000);
    vi.advanceTimersByTime(300);
    expect(toastState.toasts.length).toBe(0);
  });

  it('auto-dismisses undo toasts after 5s', () => {
    addToast('Deleted', 'undo' as ToastVariant, { label: 'Undo', onClick: () => {} });
    expect(toastState.toasts.length).toBe(1);
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(300);
    expect(toastState.toasts.length).toBe(0);
  });

  it('undo toasts have countdown field set', () => {
    addToast('Deleted', 'undo' as ToastVariant, { label: 'Undo', onClick: () => {} });
    expect(toastState.toasts[0] && 'countdown' in toastState.toasts[0]).toBe(true);
  });

  it('error toasts support details field', () => {
    addToast('CLI failed', 'error', undefined, 'SIGTERM at 14:32');
    expect(toastState.toasts[0] && 'details' in toastState.toasts[0]).toBe(true);
  });
});
