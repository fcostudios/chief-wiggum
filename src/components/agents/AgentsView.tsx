// src/components/agents/AgentsView.tsx
// Parallel session manager grid for the Agents tab (CHI-227).

import type { Component } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Users } from 'lucide-solid';
import { sessionState, createNewSession, setActiveSession } from '@/stores/sessionStore';
import {
  conversationState,
  getSessionStatus,
  stopSessionCli,
  switchSession,
} from '@/stores/conversationStore';
import { setActiveView, uiState } from '@/stores/uiStore';
import { getActiveProject, projectState } from '@/stores/projectStore';
import { focusPane, setPaneSession, splitView, viewState } from '@/stores/viewStore';
import SessionCard from './SessionCard';
import type { Message, ProcessStatus } from '@/lib/types';

const SHORTCUTS_KEY = 'cw:agents-shortcuts-hidden';

function isShortcutsHiddenPersisted(): boolean {
  try {
    return localStorage.getItem(SHORTCUTS_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistShortcutsHidden(hidden: boolean): void {
  try {
    localStorage.setItem(SHORTCUTS_KEY, String(hidden));
  } catch {
    // Ignore persistence errors.
  }
}

interface SessionSummary {
  messageCount: number;
  lastAssistantPreview: string;
}

function summarizeMessages(messages: Message[]): SessionSummary {
  let lastAssistantPreview = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const normalized = msg.content.replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) continue;
    lastAssistantPreview = normalized;
    break;
  }
  return {
    messageCount: messages.length,
    lastAssistantPreview,
  };
}

const AgentsView: Component = () => {
  const [shortcutsHidden, setShortcutsHidden] = createSignal(isShortcutsHiddenPersisted());
  const [sessionSummaries, setSessionSummaries] = createSignal<Record<string, SessionSummary>>({});
  let summaryLoadSeq = 0;
  const sessions = () => sessionState.sessions;
  const activeId = () => sessionState.activeSessionId;
  const resolveCardStatus = (sessionId: string): ProcessStatus | 'waiting' => {
    if (uiState.permissionRequest && activeId() === sessionId) return 'waiting';
    return getSessionStatus(sessionId);
  };
  const runningCount = () =>
    sessions().filter((s) => {
      const status = resolveCardStatus(s.id);
      return status === 'running' || status === 'starting' || status === 'waiting';
    }).length;

  const visibleSessions = createMemo(() => sessions().slice(0, 4));

  const activeSession = () => sessions().find((s) => s.id === activeId());
  const activePreview = () => {
    const messages = conversationState.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      const normalized = message.content.replace(/\s+/g, ' ').trim();
      if (normalized.length === 0) continue;
      return normalized.slice(0, 80);
    }
    return '';
  };

  async function loadSessionSummaries(sessionIds: string[]): Promise<void> {
    const seq = ++summaryLoadSeq;
    const next: Record<string, SessionSummary> = {};

    await Promise.all(
      sessionIds.map(async (sessionId) => {
        try {
          const messages = await invoke<Message[]>('list_messages', { session_id: sessionId });
          next[sessionId] = summarizeMessages(messages);
        } catch {
          next[sessionId] = { messageCount: 0, lastAssistantPreview: '' };
        }
      }),
    );

    if (seq !== summaryLoadSeq) return;
    setSessionSummaries(next);
  }

  createEffect(() => {
    const ids = visibleSessions()
      .map((session) => session.id)
      .join('|');
    if (!ids) {
      setSessionSummaries({});
      return;
    }
    void loadSessionSummaries(ids.split('|'));
  });

  function closeShortcuts(): void {
    setShortcutsHidden(true);
    persistShortcutsHidden(true);
  }

  function showShortcuts(): void {
    setShortcutsHidden(false);
    persistShortcutsHidden(false);
  }

  async function handleFocus(sessionId: string): Promise<void> {
    const previousId = sessionState.activeSessionId;
    if (!sessionId) return;
    setActiveSession(sessionId);
    if (previousId && previousId !== sessionId) {
      await switchSession(sessionId, previousId);
    }
    setActiveView('conversation');
  }

  async function handleStop(sessionId: string): Promise<void> {
    await stopSessionCli(sessionId);
  }

  function ensureSplitWithSessions(primarySessionId: string, secondarySessionId: string): void {
    if (viewState.layoutMode === 'single') {
      splitView('horizontal');
    }

    const panes = [...viewState.panes];
    if (panes.length === 0) return;

    const primaryPane = panes.find((p) => p.id === viewState.activePaneId) ?? panes[0];
    const secondaryPane = panes.find((p) => p.id !== primaryPane.id) ?? panes[0];

    setPaneSession(primaryPane.id, primarySessionId);
    setPaneSession(secondaryPane.id, secondarySessionId);
  }

  async function handleSplit(sessionId: string): Promise<void> {
    const currentId = activeId();
    if (!currentId || currentId === sessionId) {
      await handleFocus(sessionId);
      return;
    }

    ensureSplitWithSessions(currentId, sessionId);
    setActiveView('conversation');
  }

  async function handleNewParallel(): Promise<void> {
    const currentId = activeId();
    const project = getActiveProject();
    const model = activeSession()?.model ?? project?.default_model ?? 'claude-sonnet-4-6';
    const created = await createNewSession(model, project?.id);

    if (currentId && currentId !== created.id) {
      ensureSplitWithSessions(currentId, created.id);
      const secondaryPane =
        viewState.panes.find((p) => p.id !== viewState.activePaneId) ?? viewState.panes[0];
      if (secondaryPane) {
        focusPane(secondaryPane.id);
      }
      setActiveSession(created.id);
    }

    setActiveView('conversation');
  }

  function sessionPreview(sessionId: string): string | undefined {
    if (sessionId === activeId()) {
      const preview = activePreview();
      if (preview.length > 0) return preview;
    }
    const summaries = sessionSummaries();
    const fetchedPreview = summaries[sessionId]?.lastAssistantPreview;
    if (fetchedPreview && fetchedPreview.length > 0) {
      return fetchedPreview;
    }
    const session = sessions().find((s) => s.id === sessionId);
    const title = session?.title ?? '';
    return title.length > 0 ? title : undefined;
  }

  function sessionMessageCount(sessionId: string): number {
    if (sessionId === activeId() && conversationState.messages.length > 0) {
      return conversationState.messages.length;
    }
    return sessionSummaries()[sessionId]?.messageCount ?? 0;
  }

  function projectNameForSession(sessionId: string): string | undefined {
    const projectId = sessions().find((session) => session.id === sessionId)?.project_id;
    if (!projectId) return undefined;
    return projectState.projects.find((project) => project.id === projectId)?.name;
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Users size={16} style={{ color: 'var(--color-accent)' }} />
          <span class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Parallel Sessions
          </span>
          <span
            class="text-xs px-1.5 py-0.5 rounded-full font-mono"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {sessions().length}
          </span>
          <span
            class="text-xs px-1.5 py-0.5 rounded-full font-mono"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {runningCount()} running
          </span>
        </div>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onClick={() => void handleNewParallel()}
        >
          + New Parallel Session
        </button>
      </div>

      <Show
        when={!shortcutsHidden()}
        fallback={
          <button
            class="self-start text-[10px] px-2 py-1 rounded"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-secondary)',
            }}
            onClick={showShortcuts}
          >
            Show shortcuts
          </button>
        }
      >
        <div
          class="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 rounded-lg text-[10px]"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <span>
            <kbd class="font-mono">Cmd+\</kbd> Split panes
          </span>
          <span>
            <kbd class="font-mono">Cmd+N</kbd> New session
          </span>
          <span>
            <kbd class="font-mono">Cmd+[</kbd> Focus left pane
          </span>
          <span>
            <kbd class="font-mono">Cmd+]</kbd> Focus right pane
          </span>
          <button class="ml-auto underline" onClick={closeShortcuts}>
            Hide
          </button>
        </div>
      </Show>

      <Show
        when={sessions().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center flex-1 gap-3 text-center">
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-accent-muted)' }}
            >
              <Users size={24} style={{ color: 'var(--color-accent)' }} />
            </div>
            <p class="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              No sessions yet
            </p>
            <p class="text-xs max-w-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Start a parallel session to run multiple Claude conversations simultaneously.
            </p>
          </div>
        }
      >
        <div class="grid grid-cols-2 gap-3 auto-rows-min">
          <For each={visibleSessions()}>
            {(session) => (
              <SessionCard
                session={session}
                status={resolveCardStatus(session.id)}
                isActive={session.id === activeId()}
                lastMessage={sessionPreview(session.id)}
                messageCount={sessionMessageCount(session.id)}
                projectName={projectNameForSession(session.id)}
                onFocus={() => void handleFocus(session.id)}
                onStop={() => void handleStop(session.id)}
                onSplit={() => void handleSplit(session.id)}
              />
            )}
          </For>
          <Show when={sessions().length < 4}>
            <div
              class="flex flex-col items-center justify-center gap-3 rounded-lg p-4 text-center cursor-pointer transition-colors"
              style={{
                border: '1.5px dashed var(--color-border-primary)',
                color: 'var(--color-text-tertiary)',
              }}
              onMouseEnter={(e) => {
                const node = e.currentTarget as HTMLDivElement;
                node.style.borderColor = 'var(--color-accent)';
                node.style.color = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                const node = e.currentTarget as HTMLDivElement;
                node.style.borderColor = 'var(--color-border-primary)';
                node.style.color = 'var(--color-text-tertiary)';
              }}
              onClick={() => void handleNewParallel()}
              role="button"
              aria-label="Start another session"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void handleNewParallel();
                }
              }}
            >
              <span class="text-2xl">+</span>
              <div>
                <p class="text-xs font-medium">Start another session</p>
                <p class="text-[10px] mt-0.5">Run sessions in parallel for different tasks</p>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default AgentsView;
