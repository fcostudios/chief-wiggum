import { describe, expect, it, vi } from 'vitest';
import {
  discardUnsentContent,
  hasUnsentContent,
  registerUnsentAccessors,
  unregisterUnsentAccessor,
} from './unsentStore';

describe('unsentStore', () => {
  it('returns false when nothing is registered', () => {
    expect(hasUnsentContent()).toBe(false);
  });

  it('detects unsent content with threshold', () => {
    const accessor = () => 'x'.repeat(60);
    registerUnsentAccessors(accessor, vi.fn());
    expect(hasUnsentContent()).toBe(true);
    unregisterUnsentAccessor(accessor);
  });

  it('invokes discard handler', () => {
    const discard = vi.fn();
    const accessor = () => 'x'.repeat(80);
    registerUnsentAccessors(accessor, discard);
    discardUnsentContent();
    expect(discard).toHaveBeenCalled();
    unregisterUnsentAccessor(accessor);
  });
});
