import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypewriterBuffer } from './typewriterBuffer';

describe('typewriterBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) =>
        ({
          matches: query.includes('reduce') ? false : false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) satisfies Partial<MediaQueryList>,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty rendered content', () => {
    const buf = createTypewriterBuffer(5);
    expect(buf.rendered()).toBe('');
  });

  it('push buffers and drains via timer', () => {
    const buf = createTypewriterBuffer(5);
    buf.push('hello');
    expect(buf.rendered()).toBe('');
    vi.advanceTimersByTime(10);
    expect(buf.rendered().length).toBeGreaterThan(0);
  });

  it('flush outputs all buffered content immediately', () => {
    const buf = createTypewriterBuffer(5);
    buf.push('hello world');
    buf.flush();
    expect(buf.rendered()).toBe('hello world');
  });

  it('reset clears buffer and rendered content', () => {
    const buf = createTypewriterBuffer(5);
    buf.push('hello');
    buf.flush();
    expect(buf.rendered()).toBe('hello');
    buf.reset();
    expect(buf.rendered()).toBe('');
  });

  it('drains buffer gradually via timer', () => {
    const buf = createTypewriterBuffer(5);
    buf.push('abcdefghij');
    vi.advanceTimersByTime(5);
    const partial = buf.rendered();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThanOrEqual(10);
    buf.flush();
    expect(buf.rendered()).toBe('abcdefghij');
  });

  it('adaptive drain flushes large buffers faster', () => {
    const buf = createTypewriterBuffer(5);
    const large = 'x'.repeat(300);
    buf.push(large);
    vi.advanceTimersByTime(5);
    expect(buf.rendered().length).toBeGreaterThanOrEqual(75);
    buf.flush();
    expect(buf.rendered()).toBe(large);
  });

  it('multiple pushes accumulate in order', () => {
    const buf = createTypewriterBuffer(5);
    buf.push('hello ');
    buf.push('world');
    buf.flush();
    expect(buf.rendered()).toBe('hello world');
  });

  it('reduced motion bypasses buffering', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) satisfies Partial<MediaQueryList>,
    });
    const buf = createTypewriterBuffer(5);
    buf.push('hello');
    expect(buf.rendered()).toBe('hello');
  });
});
