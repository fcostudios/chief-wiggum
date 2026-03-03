// src/components/conversation/ResponseProgress.tsx
// Indeterminate progress bar + elapsed timer for active Claude responses (CHI-237).
// Mounts absolutely at top of ConversationView's relative wrapper.
// Fades out 3s after response ends.

import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { conversationState } from '@/stores/conversationStore';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ResponseProgress: Component = () => {
  const [elapsed, setElapsed] = createSignal(0);
  const [visible, setVisible] = createSignal(false);
  const [fading, setFading] = createSignal(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let fadeTimerId: ReturnType<typeof setTimeout> | null = null;

  function startTimer(): void {
    if (fadeTimerId) {
      clearTimeout(fadeTimerId);
      fadeTimerId = null;
    }
    setElapsed(0);
    setFading(false);
    setVisible(true);
    intervalId = setInterval(() => setElapsed((s) => s + 1), 1000);
  }

  function stopTimer(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    setFading(true);
    fadeTimerId = setTimeout(() => setVisible(false), 3000);
  }

  createEffect(() => {
    const active = conversationState.isLoading || conversationState.isStreaming;
    if (active && !intervalId) {
      startTimer();
    } else if (!active && intervalId) {
      stopTimer();
    }
  });

  onCleanup(() => {
    if (intervalId) clearInterval(intervalId);
    if (fadeTimerId) clearTimeout(fadeTimerId);
  });

  return (
    <Show when={visible()}>
      <div
        data-testid="response-progress"
        class="absolute top-0 left-0 right-0 z-20 flex items-center pointer-events-none"
        style={{
          transition: 'opacity var(--duration-slow) var(--ease-default)',
          opacity: fading() ? 0 : 1,
        }}
      >
        <div
          class="relative w-full overflow-hidden"
          style={{
            height: '3px',
            background: 'var(--color-progress-track)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '0',
              width: '30%',
              background: 'var(--color-progress-fill)',
              animation: 'progress-shimmer 1.6s ease-in-out infinite',
            }}
          />
        </div>
        <span
          data-testid="elapsed-timer"
          class="absolute right-2 top-[4px] font-mono"
          style={{
            'font-size': '10px',
            color: 'var(--color-text-tertiary)',
            opacity: 0.7,
          }}
        >
          {formatElapsed(elapsed())}
        </span>
      </div>
    </Show>
  );
};

export default ResponseProgress;
