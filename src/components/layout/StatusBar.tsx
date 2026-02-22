// src/components/layout/StatusBar.tsx
// Status bar (28px) per SPEC-003 §2 Z5.
// Left: agent/model status. Center: token usage. Right: cost pill.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { uiState } from '@/stores/uiStore';
import { cliState } from '@/stores/cliStore';
import { conversationState } from '@/stores/conversationStore';
import type { ProcessStatus } from '@/lib/types';

function processStatusDisplay(status: ProcessStatus): { label: string; color: string } {
  switch (status) {
    case 'running':
      return { label: 'Running', color: 'var(--color-success)' };
    case 'starting':
      return { label: 'Starting...', color: 'var(--color-warning)' };
    case 'error':
      return { label: 'Error', color: 'var(--color-error)' };
    case 'shutting_down':
      return { label: 'Stopping...', color: 'var(--color-warning)' };
    case 'exited':
      return { label: 'Done', color: 'var(--color-text-tertiary)' };
    default:
      return { label: 'Ready', color: 'var(--color-text-tertiary)' };
  }
}

const StatusBar: Component = () => {
  return (
    <footer
      class="flex items-center justify-between px-3 text-[11px] select-none relative"
      style={{
        height: 'var(--status-bar-height)',
        background:
          'linear-gradient(180deg, var(--color-bg-secondary) 0%, var(--color-bg-primary) 100%)',
        'border-top': '1px solid var(--color-border-secondary)',
      }}
      role="status"
    >
      {/* Subtle warm glow on top edge */}
      <div
        class="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(232, 130, 90, 0.08) 50%, transparent 100%)',
        }}
      />

      {/* Left: status */}
      <Show
        when={uiState.yoloMode}
        fallback={
          <Show
            when={cliState.isDetected}
            fallback={
              <span class="text-error font-medium tracking-wide" style={{ 'font-size': '10px' }}>
                CLI not found
              </span>
            }
          >
            {(() => {
              const status = processStatusDisplay(conversationState.processStatus);
              return (
                <div class="flex items-center gap-1.5">
                  <div
                    class="w-1.5 h-1.5 rounded-full"
                    classList={{ 'animate-pulse': conversationState.processStatus === 'running' }}
                    style={{
                      background: status.color,
                      'box-shadow':
                        conversationState.processStatus === 'running'
                          ? '0 0 4px rgba(63, 185, 80, 0.4)'
                          : 'none',
                    }}
                  />
                  <span class="text-text-tertiary font-mono" style={{ 'font-size': '10px' }}>
                    {status.label}
                  </span>
                </div>
              );
            })()}
          </Show>
        }
      >
        <span
          class="font-semibold tracking-[0.08em] uppercase"
          style={{
            'font-size': '10px',
            color: 'var(--color-warning)',
          }}
        >
          YOLO MODE
        </span>
      </Show>

      {/* Center: token usage */}
      <span
        class="font-mono text-text-tertiary/50"
        style={{ 'font-size': '10px', 'letter-spacing': '0.02em' }}
      >
        &ndash; / &ndash;
      </span>

      {/* Right: cost pill */}
      <span
        class="font-mono px-1.5 py-0.5 rounded-full"
        style={{
          'font-size': '10px',
          color: 'var(--color-text-tertiary)',
          background: 'var(--color-bg-elevated)',
        }}
      >
        $0.00
      </span>
    </footer>
  );
};

export default StatusBar;
