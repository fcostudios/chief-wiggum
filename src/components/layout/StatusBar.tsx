// src/components/layout/StatusBar.tsx
// Status bar (28px) per SPEC-003 §2 Z5.
// Left: agent/model status. Center: token usage. Right: cost pill.

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { uiState } from '@/stores/uiStore';
import { cliState } from '@/stores/cliStore';
import { conversationState } from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';
import { openExportDialog } from '@/stores/diagnosticsStore';
import type { ProcessStatus } from '@/lib/types';
import {
  getRecentActionEvents,
  getRunningActions,
  stopAction,
  restartAction,
  selectAction,
} from '@/stores/actionStore';

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
      return { label: 'Ready', color: 'var(--color-success)' };
  }
}

const StatusBar: Component = () => {
  let actionsButtonRef: HTMLButtonElement | undefined;
  let actionsPopoverRef: HTMLDivElement | undefined;
  const [actionsPopoverOpen, setActionsPopoverOpen] = createSignal(false);

  const activeSession = () =>
    sessionState.sessions.find((s) => s.id === sessionState.activeSessionId);
  const activeSessionId = () => sessionState.activeSessionId;

  const inputK = () => {
    const t = activeSession()?.total_input_tokens;
    return t ? `${(t / 1000).toFixed(1)}K` : '\u2013';
  };
  const outputK = () => {
    const t = activeSession()?.total_output_tokens;
    return t ? `${(t / 1000).toFixed(1)}K` : '\u2013';
  };
  const costDisplay = () => {
    const c = activeSession()?.total_cost_cents;
    return c ? `$${(c / 100).toFixed(2)}` : '$0.00';
  };
  const backgroundRunningCount = () => {
    const activeId = activeSessionId();
    const statuses = conversationState.sessionStatuses;
    return Object.entries(statuses).filter(
      ([sessionId, status]) =>
        sessionId !== activeId && (status === 'running' || status === 'starting'),
    ).length;
  };
  const runningActions = createMemo(() => getRunningActions());
  const recentActions = createMemo(() => getRecentActionEvents().slice(0, 3));
  const runningActionCount = () => runningActions().length;

  function toggleActionsPopover() {
    setActionsPopoverOpen((prev) => !prev);
  }

  onMount(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!actionsPopoverOpen()) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (actionsButtonRef?.contains(target)) return;
      if (actionsPopoverRef?.contains(target)) return;
      setActionsPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleDocumentClick);
    onCleanup(() => document.removeEventListener('mousedown', handleDocumentClick));
  });

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

      {/* Left: status — permission tier indicator + process status */}
      <div class="flex items-center gap-2">
        <Show when={uiState.yoloMode}>
          <span
            class="font-semibold tracking-[0.08em] uppercase"
            style={{
              'font-size': '10px',
              color: 'var(--color-warning)',
            }}
          >
            YOLO
          </span>
        </Show>
        <Show when={!uiState.yoloMode && uiState.developerMode}>
          <span
            class="font-semibold tracking-[0.08em] uppercase"
            style={{
              'font-size': '10px',
              color: 'var(--color-accent)',
            }}
          >
            DEV
          </span>
        </Show>
        <Show when={!uiState.yoloMode}>
          <Show
            when={cliState.isDetected}
            fallback={
              <span class="text-error font-medium tracking-wide" style={{ 'font-size': '10px' }}>
                CLI not found
              </span>
            }
          >
            <div class="flex items-center gap-1.5">
              <div
                class="w-1.5 h-1.5 rounded-full"
                classList={{ 'animate-pulse': conversationState.processStatus === 'running' }}
                style={{
                  background: processStatusDisplay(conversationState.processStatus).color,
                  'box-shadow':
                    conversationState.processStatus === 'running'
                      ? '0 0 4px rgba(63, 185, 80, 0.4)'
                      : 'none',
                }}
                role="img"
                aria-label={`Process status: ${conversationState.processStatus}`}
                title={processStatusDisplay(conversationState.processStatus).label}
              />
              <span class="text-text-tertiary font-mono" style={{ 'font-size': '10px' }}>
                {processStatusDisplay(conversationState.processStatus).label}
              </span>
            </div>
          </Show>
        </Show>
        <Show when={backgroundRunningCount() > 0}>
          <span
            class="font-mono px-1 py-0.5 rounded"
            style={{
              'font-size': '9px',
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-elevated)',
            }}
          >
            {backgroundRunningCount()} active
          </span>
        </Show>
        <Show when={runningActionCount() > 0 || recentActions().length > 0}>
          <div class="relative">
            <button
              ref={actionsButtonRef}
              class="font-mono px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
              style={{
                'font-size': '9px',
                color:
                  runningActionCount() > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                background: 'var(--color-bg-elevated)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(63, 185, 80, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-elevated)';
              }}
              onClick={toggleActionsPopover}
              title={
                runningActionCount() > 0
                  ? `${runningActionCount()} action(s) running`
                  : 'Recent action activity'
              }
              aria-expanded={actionsPopoverOpen()}
            >
              <span>▶</span>
              <span>
                {runningActionCount() > 0
                  ? `${runningActionCount()} running`
                  : `${recentActions().length} recent`}
              </span>
            </button>

            <Show when={actionsPopoverOpen()}>
              <div
                ref={actionsPopoverRef}
                class="absolute left-0 bottom-7 z-40 w-[320px] rounded-lg overflow-hidden animate-fade-in"
                style={{
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-primary)',
                  'box-shadow': 'var(--shadow-lg)',
                }}
              >
                <div
                  class="px-3 py-2 text-[10px] uppercase tracking-[0.08em] font-semibold"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    background: 'var(--color-bg-secondary)',
                    'border-bottom': '1px solid var(--color-border-secondary)',
                  }}
                >
                  Actions
                </div>

                <div class="max-h-[260px] overflow-y-auto">
                  <Show when={runningActionCount() > 0}>
                    <div class="px-2 py-2">
                      <div
                        class="px-1 py-1 text-[10px] uppercase tracking-[0.08em]"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        Running
                      </div>
                      <For each={runningActions()}>
                        {(action) => (
                          <div
                            class="flex items-center gap-2 px-1.5 py-1 rounded"
                            style={{ 'background-color': 'transparent' }}
                          >
                            <button
                              class="min-w-0 flex-1 text-left"
                              onClick={() => {
                                selectAction(action.id);
                                setActionsPopoverOpen(false);
                              }}
                              title={action.command}
                            >
                              <div
                                class="text-xs font-mono truncate"
                                style={{ color: 'var(--color-text-primary)' }}
                              >
                                {action.name}
                              </div>
                              <div
                                class="text-[10px] truncate"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                {action.command}
                              </div>
                            </button>
                            <button
                              class="px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                color: 'var(--color-error)',
                                background: 'rgba(248,81,73,0.08)',
                                border: '1px solid rgba(248,81,73,0.15)',
                              }}
                              onClick={() => void stopAction(action.id)}
                            >
                              Stop
                            </button>
                            <button
                              class="px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                color: 'var(--color-accent)',
                                background: 'rgba(232,130,90,0.08)',
                                border: '1px solid rgba(232,130,90,0.15)',
                              }}
                              onClick={() => void restartAction(action)}
                            >
                              Restart
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={recentActions().length > 0}>
                    <div
                      class="px-2 py-2"
                      style={{
                        'border-top':
                          runningActionCount() > 0
                            ? '1px solid var(--color-border-secondary)'
                            : 'none',
                      }}
                    >
                      <div
                        class="px-1 py-1 text-[10px] uppercase tracking-[0.08em]"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        Recent
                      </div>
                      <For each={recentActions()}>
                        {(evt) => (
                          <div class="flex items-center justify-between gap-2 px-1.5 py-1">
                            <div class="min-w-0">
                              <div
                                class="text-xs font-mono truncate"
                                style={{ color: 'var(--color-text-primary)' }}
                              >
                                {evt.name}
                              </div>
                              <div
                                class="text-[10px] truncate"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                {evt.status}
                                <Show when={evt.exit_code !== null}> • exit {evt.exit_code}</Show>
                              </div>
                            </div>
                            <button
                              class="px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                color: 'var(--color-text-tertiary)',
                                background: 'var(--color-bg-elevated)',
                                border: '1px solid var(--color-border-secondary)',
                              }}
                              onClick={() => {
                                selectAction(evt.action_id);
                                setActionsPopoverOpen(false);
                              }}
                            >
                              View
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Center: token usage */}
      <span
        class="font-mono text-text-tertiary/50"
        style={{ 'font-size': '10px', 'letter-spacing': '0.02em' }}
      >
        {inputK()} / {outputK()}
      </span>

      {/* Right: diagnostics export + cost pill */}
      <div class="flex items-center gap-2">
        <button
          class="px-2 py-0.5 rounded transition-colors"
          style={{
            'font-size': '10px',
            color: 'var(--color-text-secondary)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-elevated)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          onClick={openExportDialog}
          title="Export diagnostic bundle for bug reports"
        >
          Export Diagnostics
        </button>
        <span
          class="font-mono px-1.5 py-0.5 rounded-full"
          style={{
            'font-size': '10px',
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-elevated)',
          }}
        >
          {costDisplay()}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
