// src/components/layout/StatusBar.tsx
// Status bar (32px) per SPEC-003 §2 Z5.
// Left: agent/model status. Center: token usage. Right: cost pill.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { uiState } from '@/stores/uiStore';

const StatusBar: Component = () => {
  return (
    <footer
      class="flex items-center justify-between px-3 bg-bg-secondary border-t border-border-primary text-xs text-text-secondary font-mono select-none"
      style={{ height: 'var(--status-bar-height)' }}
      role="status"
    >
      {/* Left: status */}
      <Show when={uiState.yoloMode} fallback={<span>Ready</span>}>
        <span class="text-warning font-semibold">YOLO MODE</span>
      </Show>

      {/* Center: token usage */}
      <span class="text-text-tertiary">&ndash; / &ndash;</span>

      {/* Right: cost */}
      <span>$0.00</span>
    </footer>
  );
};

export default StatusBar;
