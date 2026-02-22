// src/lib/typewriterBuffer.ts
// Character buffer for smooth streaming text rendering (CHI-73).
// Buffers incoming chunks and flushes at ~5ms intervals.
// Respects prefers-reduced-motion by bypassing buffering.

import { createSignal } from 'solid-js';

export interface TypewriterBuffer {
  /** Push new content into the buffer. */
  push(text: string): void;
  /** Get the currently rendered content (reactive SolidJS signal). */
  rendered: () => string;
  /** Reset the buffer and rendered content. */
  reset(): void;
  /** Flush all remaining buffered content immediately. */
  flush(): void;
}

export function createTypewriterBuffer(flushIntervalMs = 5): TypewriterBuffer {
  const [rendered, setRendered] = createSignal('');
  let buffer = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function startTimer(): void {
    if (timer || prefersReducedMotion) return;
    timer = setInterval(() => {
      if (buffer.length === 0) {
        stopTimer();
        return;
      }
      // Adaptive drain: flush more chars when buffer is large to prevent lag
      const drainSize =
        buffer.length > 200 ? Math.ceil(buffer.length / 4) : buffer.length > 50 ? 10 : 3;
      const chunk = buffer.slice(0, drainSize);
      buffer = buffer.slice(drainSize);
      setRendered((prev) => prev + chunk);
    }, flushIntervalMs);
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function push(text: string): void {
    if (prefersReducedMotion) {
      // No buffering -- append directly
      setRendered((prev) => prev + text);
      return;
    }
    buffer += text;
    startTimer();
  }

  function reset(): void {
    stopTimer();
    buffer = '';
    setRendered('');
  }

  function flush(): void {
    stopTimer();
    if (buffer.length > 0) {
      setRendered((prev) => prev + buffer);
      buffer = '';
    }
  }

  return { push, rendered, reset, flush };
}
