// src/components/layout/StatusBar.tsx
// Status bar (28px) per SPEC-003 §2 Z5.
// CHI-229: 3-zone hierarchy with progressive disclosure popovers.

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { closeStatusCostPopover, toggleStatusCostPopover, uiState } from '@/stores/uiStore';
import { cliState } from '@/stores/cliStore';
import { conversationState } from '@/stores/conversationStore';
import { sessionState, setActiveSession } from '@/stores/sessionStore';
import { openExportDialog } from '@/stores/diagnosticsStore';
import { t } from '@/stores/i18nStore';
import type { ProcessStatus, Session, TodoItem } from '@/lib/types';
import {
  getRecentActionEvents,
  getRunningActions,
  restartAction,
  selectAction,
  stopAction,
} from '@/stores/actionStore';

function formatCost(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function formatTokenCount(tokens: number): string {
  if (tokens <= 0) return '\u2013';
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}K`;
}

function isRunningStatus(status: ProcessStatus | string | null | undefined): boolean {
  return status === 'running' || status === 'starting';
}

function parseSessionTimestamp(session: Session): Date | null {
  const raw = session.updated_at ?? session.created_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const StatusBar: Component = () => {
  let statusButtonRef: HTMLButtonElement | undefined;
  let statusPopoverRef: HTMLDivElement | undefined;
  let costButtonRef: HTMLButtonElement | undefined;
  let costPopoverRef: HTMLDivElement | undefined;
  const [statusPopoverOpen, setStatusPopoverOpen] = createSignal(false);

  const activeSession = () =>
    sessionState.sessions.find((s) => s.id === sessionState.activeSessionId) ?? null;
  const activeSessionId = () => sessionState.activeSessionId;
  const runningActions = createMemo(() => getRunningActions());
  const recentActions = createMemo(() => getRecentActionEvents().slice(0, 3));
  const runningActionCount = () => runningActions().length;

  const latestTodos = createMemo<TodoItem[] | null>(() => {
    const messages = conversationState.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'tool_use') {
        continue;
      }
      try {
        const parsed = JSON.parse(message.content) as { tool_name?: string; tool_input?: string };
        if (parsed.tool_name !== 'TodoWrite' || typeof parsed.tool_input !== 'string') {
          continue;
        }
        const input = JSON.parse(parsed.tool_input) as { todos?: unknown };
        if (Array.isArray(input.todos) && input.todos.length > 0) {
          return input.todos as TodoItem[];
        }
      } catch {
        // Ignore malformed tool payloads.
      }
    }
    return null;
  });

  const todoBadge = createMemo<{ done: number; total: number } | null>(() => {
    if (!isRunningStatus(conversationState.processStatus)) {
      return null;
    }
    const todos = latestTodos();
    if (!todos) return null;
    const done = todos.filter((item) => item.status === 'completed').length;
    return { done, total: todos.length };
  });

  const runningSessions = createMemo(() => {
    const activeId = activeSessionId();
    return sessionState.sessions
      .map((session) => {
        const status =
          session.id === activeId
            ? conversationState.processStatus
            : conversationState.sessionStatuses[session.id];
        return { session, status };
      })
      .filter(({ status }) => isRunningStatus(status));
  });

  const runningSessionCount = createMemo(() => runningSessions().length);
  const totalTokenDisplay = createMemo(() => {
    const session = activeSession();
    if (!session) return '\u2013';
    const total = (session.total_input_tokens ?? 0) + (session.total_output_tokens ?? 0);
    return formatTokenCount(total);
  });
  const sessionCostDisplay = createMemo(() => formatCost(activeSession()?.total_cost_cents));

  const todayAndWeekCosts = createMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    let today = 0;
    let week = 0;
    for (const session of sessionState.sessions) {
      const ts = parseSessionTimestamp(session);
      if (!ts) continue;
      const cents = session.total_cost_cents ?? 0;
      if (ts >= startOfWeek) week += cents;
      if (ts >= startOfToday) today += cents;
    }

    return { today, week };
  });

  const aggregateRunningCostDisplay = createMemo(() => {
    const cents = runningSessions().reduce(
      (sum, entry) => sum + (entry.session.total_cost_cents ?? 0),
      0,
    );
    return formatCost(cents);
  });

  const statusPill = createMemo(() => {
    if (!cliState.isDetected) {
      return {
        label: t('status.cli_not_found'),
        color: 'var(--color-error)',
        pulse: false,
      };
    }
    if (uiState.permissionRequest) {
      return {
        label: t('status.permission_needed'),
        color: 'var(--color-warning)',
        pulse: false,
      };
    }
    if (runningSessionCount() > 0) {
      return {
        label: t('status.running_count', { count: runningSessionCount() }),
        color: 'var(--color-success)',
        pulse: true,
      };
    }
    return {
      label: t('status.idle'),
      color: 'var(--color-text-tertiary)',
      pulse: false,
    };
  });

  function closeAllPopovers() {
    setStatusPopoverOpen(false);
    closeStatusCostPopover();
  }

  function handleStatusPillClick() {
    setStatusPopoverOpen((prev) => !prev);
    if (!statusPopoverOpen()) closeStatusCostPopover();
  }

  function handleCostPillClick() {
    toggleStatusCostPopover();
    if (!uiState.statusCostPopoverVisible) {
      setStatusPopoverOpen(false);
    }
  }

  onMount(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedStatus = statusButtonRef?.contains(target) || statusPopoverRef?.contains(target);
      const clickedCost = costButtonRef?.contains(target) || costPopoverRef?.contains(target);
      if (!clickedStatus && !clickedCost) {
        closeAllPopovers();
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    onCleanup(() => document.removeEventListener('mousedown', onDocumentMouseDown));
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
      <div
        class="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(232, 130, 90, 0.08) 50%, transparent 100%)',
        }}
      />

      {/* Left: mode prefix + running/idle status pill */}
      <div class="relative flex items-center gap-1.5 min-w-0">
        <Show when={uiState.yoloMode || uiState.developerMode}>
          <span
            class="font-semibold tracking-[0.08em] uppercase"
            style={{
              'font-size': '10px',
              color: uiState.yoloMode ? 'var(--color-warning)' : 'var(--color-accent)',
            }}
          >
            {uiState.yoloMode ? t('statusBar.yolo') : t('statusBar.dev')} ·
          </span>
        </Show>

        <button
          ref={statusButtonRef}
          class="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full transition-colors"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-secondary)',
          }}
          aria-label={statusPill().label}
          aria-expanded={statusPopoverOpen()}
          onClick={handleStatusPillClick}
        >
          <span
            class="inline-block w-1.5 h-1.5 rounded-full"
            classList={{ 'animate-pulse': statusPill().pulse }}
            style={{ background: statusPill().color }}
          />
          <span class="font-mono text-[10px]">{statusPill().label}</span>
          <ChevronDown size={11} class="text-text-tertiary" />
        </button>

        <Show when={statusPopoverOpen()}>
          <div
            ref={statusPopoverRef}
            class="absolute left-0 bottom-7 z-40 w-[340px] rounded-lg overflow-hidden animate-fade-in"
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
              {t('statusBar.runningSessions')}
            </div>

            <div class="max-h-[260px] overflow-y-auto px-2 py-2">
              <Show
                when={runningSessions().length > 0}
                fallback={
                  <p class="px-1 py-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('statusBar.noRunningSessions')}
                  </p>
                }
              >
                <For each={runningSessions()}>
                  {({ session, status }) => (
                    <button
                      class="w-full text-left px-1.5 py-1 rounded transition-colors"
                      style={{
                        background:
                          session.id === activeSessionId()
                            ? 'rgba(232, 130, 90, 0.1)'
                            : 'transparent',
                      }}
                      onClick={() => {
                        setActiveSession(session.id);
                        closeAllPopovers();
                      }}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span
                          class="text-xs truncate"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {session.title ?? session.id}
                        </span>
                        <span
                          class="text-[10px] font-mono"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {status}
                        </span>
                      </div>
                    </button>
                  )}
                </For>
              </Show>

              <Show when={todoBadge()}>
                <div class="px-1.5 pt-2">
                  <span
                    class="font-mono px-1 py-0.5 rounded"
                    style={{
                      'font-size': '9px',
                      color: 'var(--color-text-secondary)',
                      background: 'var(--color-bg-elevated)',
                    }}
                  >
                    {`✓ ${todoBadge()!.done}/${todoBadge()!.total}`}
                  </span>
                </div>
              </Show>

              <Show when={runningActionCount() > 0 || recentActions().length > 0}>
                <div
                  class="pt-2 mt-2"
                  style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
                >
                  <Show when={runningActionCount() > 0}>
                    <div
                      class="px-1.5 pb-1 text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {t('statusBar.running')}
                    </div>
                    <For each={runningActions()}>
                      {(action) => (
                        <div class="flex items-center gap-1.5 px-1.5 py-1">
                          <button
                            class="min-w-0 flex-1 text-left"
                            onClick={() => {
                              selectAction(action.id);
                              closeAllPopovers();
                            }}
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
                            {t('common.stop')}
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
                            {t('common.retry')}
                          </button>
                        </div>
                      )}
                    </For>
                  </Show>

                  <Show when={recentActions().length > 0}>
                    <div
                      class="px-1.5 pt-1 pb-1 text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {t('statusBar.recent')}
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
                              closeAllPopovers();
                            }}
                          >
                            View
                          </button>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      {/* Center: total token usage */}
      <span
        class="font-mono text-text-tertiary/70"
        style={{ 'font-size': '10px', 'letter-spacing': '0.02em' }}
      >
        {t('statusBar.tokens', { value: totalTokenDisplay() })}
      </span>

      {/* Right: cost pill + breakdown popover */}
      <div class="relative flex items-center">
        <button
          ref={costButtonRef}
          class="flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-colors"
          style={{
            'font-size': '10px',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={handleCostPillClick}
          aria-label={t('statusBar.costBreakdown')}
          aria-expanded={uiState.statusCostPopoverVisible}
        >
          <span class="font-mono">{sessionCostDisplay()}</span>
          <ChevronDown size={11} class="text-text-tertiary" />
        </button>

        <Show when={uiState.statusCostPopoverVisible}>
          <div
            ref={costPopoverRef}
            class="absolute right-0 bottom-7 z-40 w-[260px] rounded-lg overflow-hidden animate-fade-in"
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
              {t('statusBar.costBreakdown')}
            </div>

            <div class="px-3 py-2 text-xs space-y-1.5">
              <div class="flex items-center justify-between">
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('statusBar.sessionCost')}
                </span>
                <span class="font-mono" style={{ color: 'var(--color-text-primary)' }}>
                  {sessionCostDisplay()}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('statusBar.todayCost')}
                </span>
                <span class="font-mono" style={{ color: 'var(--color-text-primary)' }}>
                  {formatCost(todayAndWeekCosts().today)}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {t('statusBar.weekCost')}
                </span>
                <span class="font-mono" style={{ color: 'var(--color-text-primary)' }}>
                  {formatCost(todayAndWeekCosts().week)}
                </span>
              </div>
              <Show when={runningSessionCount() > 1}>
                <div
                  class="flex items-center justify-between pt-1"
                  style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
                >
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('statusBar.runningAggregate')}
                  </span>
                  <span class="font-mono" style={{ color: 'var(--color-accent)' }}>
                    {aggregateRunningCostDisplay()}
                  </span>
                </div>
              </Show>
            </div>

            <div class="px-3 pb-3">
              <button
                class="w-full px-2 py-1 rounded text-xs transition-colors"
                style={{
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border-secondary)',
                }}
                onClick={() => {
                  openExportDialog();
                  closeAllPopovers();
                }}
              >
                {t('statusBar.exportDiagnostics')}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </footer>
  );
};

export default StatusBar;
