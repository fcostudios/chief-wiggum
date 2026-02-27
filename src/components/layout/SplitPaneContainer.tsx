import type { Component } from 'solid-js';
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-solid';
import type { Message, PromptImageInput } from '@/lib/types';
import ConversationView from '@/components/conversation/ConversationView';
import MessageInput from '@/components/conversation/MessageInput';
import MessageBubble from '@/components/conversation/MessageBubble';
import { viewState, focusPane, closePane, setPaneSession } from '@/stores/viewStore';
import { sessionState, createNewSession, setActiveSession } from '@/stores/sessionStore';
import {
  sendMessage,
  switchSession,
  conversationState,
  clearSessionUnread,
} from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import { getActiveProject } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';

const MIN_PANE_SIZE = 300; // px
const SNAPSHOT_MESSAGE_LIMIT = 30;

interface SnapshotState {
  messagesBySession: Record<string, Message[]>;
  loadingBySession: Record<string, boolean>;
}

function paneTitle(pane: { sessionId: string | null }): string {
  if (!pane.sessionId) return 'No session selected';
  const session = sessionState.sessions.find((s) => s.id === pane.sessionId);
  return session?.title || t('sidebar.newSession');
}

function formatSnapshotUpdatedAt(pane: { sessionId: string | null }): string {
  if (!pane.sessionId) return '';
  const session = sessionState.sessions.find((s) => s.id === pane.sessionId);
  if (!session?.updated_at) return '';
  try {
    return new Date(session.updated_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const SplitPaneContainer: Component = () => {
  let containerRef: HTMLDivElement | undefined;
  const [dividerPos, setDividerPos] = createSignal(50);
  const [snapshots, setSnapshots] = createStore<SnapshotState>({
    messagesBySession: {},
    loadingBySession: {},
  });

  const isHorizontal = () => viewState.layoutMode === 'split-horizontal';

  function isPaneFocused(pane: { id: string }): boolean {
    return viewState.activePaneId === pane.id;
  }

  function isPaneLive(pane: { id: string; sessionId: string | null }): boolean {
    return (
      isPaneFocused(pane) && !!pane.sessionId && pane.sessionId === sessionState.activeSessionId
    );
  }

  async function loadSnapshot(sessionId: string): Promise<void> {
    if (snapshots.loadingBySession[sessionId]) return;
    setSnapshots('loadingBySession', sessionId, true);
    try {
      const messages = await invoke<Message[]>('list_messages', { session_id: sessionId });
      setSnapshots('messagesBySession', sessionId, messages);
    } catch {
      // Leave snapshot empty on failure; the live pane remains the source of truth.
      setSnapshots('messagesBySession', sessionId, []);
    } finally {
      setSnapshots('loadingBySession', sessionId, false);
    }
  }

  createEffect(() => {
    const activeSessionId = sessionState.activeSessionId;
    if (!activeSessionId) return;
    // Cache the live conversation so it can be shown in the non-focused pane as a snapshot.
    setSnapshots('messagesBySession', activeSessionId, [...conversationState.messages]);
  });

  createEffect(() => {
    for (const pane of viewState.panes) {
      if (!pane.sessionId) continue;
      if (pane.sessionId === sessionState.activeSessionId) continue;
      if (snapshots.messagesBySession[pane.sessionId] !== undefined) continue;
      void loadSnapshot(pane.sessionId);
    }
  });

  async function handleFocusPane(pane: { id: string; sessionId: string | null }): Promise<void> {
    focusPane(pane.id);
    if (!pane.sessionId || pane.sessionId === sessionState.activeSessionId) return;
    const oldId = sessionState.activeSessionId;
    setActiveSession(pane.sessionId);
    clearSessionUnread(pane.sessionId);
    await switchSession(pane.sessionId, oldId);
  }

  async function assignActiveSessionToPane(pane: { id: string }): Promise<void> {
    const activeSessionId = sessionState.activeSessionId;
    if (!activeSessionId) return;
    focusPane(pane.id);
    setPaneSession(pane.id, activeSessionId);
    clearSessionUnread(activeSessionId);
    await loadSnapshot(activeSessionId);
  }

  async function sendFromPane(
    pane: { id: string; sessionId: string | null },
    text: string,
    images?: PromptImageInput[],
  ): Promise<void> {
    if (!isPaneFocused(pane)) {
      await handleFocusPane(pane);
      return;
    }

    let sessionId = pane.sessionId;
    if (!sessionId) {
      const project = getActiveProject();
      const session = await createNewSession(
        project?.default_model ?? 'claude-sonnet-4-6',
        project?.id,
      );
      sessionId = session.id;
      setPaneSession(pane.id, sessionId);
    }

    await sendMessage(text, sessionId, images);
  }

  function startDrag(e: MouseEvent): void {
    e.preventDefault();
    if (!containerRef) return;

    const onMove = (ev: MouseEvent) => {
      if (!containerRef) return;
      const rect = containerRef.getBoundingClientRect();
      const total = isHorizontal() ? rect.width : rect.height;
      if (total <= 0) return;
      const offset = isHorizontal() ? ev.clientX - rect.left : ev.clientY - rect.top;
      const minPct = (MIN_PANE_SIZE / total) * 100;
      const nextPct = Math.max(minPct, Math.min(100 - minPct, (offset / total) * 100));
      setDividerPos(nextPct);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = isHorizontal() ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  onCleanup(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  return (
    <div
      ref={containerRef}
      class={`flex-1 flex min-h-0 overflow-hidden ${isHorizontal() ? 'flex-row' : 'flex-col'}`}
    >
      <For each={viewState.panes}>
        {(pane, index) => {
          const paneMessages = () => {
            if (isPaneLive(pane)) return conversationState.messages;
            if (!pane.sessionId) return [];
            return snapshots.messagesBySession[pane.sessionId] ?? [];
          };

          return (
            <>
              <Show when={index() > 0}>
                <div
                  class={`shrink-0 ${
                    isHorizontal() ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
                  } hover:bg-accent/40 transition-colors`}
                  style={{ background: 'var(--color-border-secondary)' }}
                  onMouseDown={startDrag}
                  role="separator"
                  aria-orientation={isHorizontal() ? 'vertical' : 'horizontal'}
                />
              </Show>

              <section
                class="flex flex-col min-w-0 min-h-0 overflow-hidden"
                style={{
                  'flex-basis': index() === 0 ? `${dividerPos()}%` : `${100 - dividerPos()}%`,
                  'flex-grow': 0,
                  'flex-shrink': 0,
                  border: isPaneFocused(pane)
                    ? '2px solid var(--color-accent-muted)'
                    : '2px solid transparent',
                  transition: 'border-color var(--duration-fast)',
                }}
                onClick={() => {
                  void handleFocusPane(pane);
                }}
              >
                <div
                  class="flex items-center justify-between gap-2 px-2 py-1 shrink-0"
                  style={{
                    'border-bottom': '1px solid var(--color-border-secondary)',
                    background: 'var(--color-bg-secondary)',
                  }}
                >
                  <div class="min-w-0 flex-1">
                    <div class="text-[10px] font-semibold truncate">{paneTitle(pane)}</div>
                    <div class="text-[9px] text-text-tertiary truncate">
                      <Show
                        when={pane.sessionId}
                        fallback="Click to focus, then create/select a session"
                      >
                        {isPaneLive(pane)
                          ? 'Live pane'
                          : snapshots.loadingBySession[pane.sessionId!]
                            ? 'Loading snapshot...'
                            : `Snapshot • ${formatSnapshotUpdatedAt(pane) || 'saved history'}`}
                      </Show>
                    </div>
                  </div>

                  <Show when={!pane.sessionId && sessionState.activeSessionId}>
                    <button
                      class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                      style={{
                        color: 'var(--color-accent)',
                        background: 'rgba(232, 130, 90, 0.08)',
                        border: '1px solid rgba(232, 130, 90, 0.15)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void assignActiveSessionToPane(pane);
                      }}
                      title="Assign current active session"
                    >
                      Use active
                    </button>
                  </Show>

                  <button
                    class="p-0.5 rounded hover:bg-bg-elevated transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePane(pane.id);
                    }}
                    title="Close pane"
                    aria-label="Close pane"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div class="flex-1 min-h-0 overflow-hidden">
                  <Show
                    when={isPaneLive(pane)}
                    fallback={<PaneSnapshot messages={paneMessages()} />}
                  >
                    <ConversationView />
                  </Show>
                </div>

                <div class="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <MessageInput
                    onSend={(text, images) => {
                      void sendFromPane(pane, text, images);
                    }}
                    isLoading={isPaneLive(pane) ? conversationState.isLoading : false}
                    isDisabled={!cliState.isDetected || !isPaneFocused(pane)}
                  />
                </div>
              </section>
            </>
          );
        }}
      </For>
    </div>
  );
};

const PaneSnapshot: Component<{ messages: Message[] }> = (props) => {
  const recentMessages = () => props.messages.slice(-SNAPSHOT_MESSAGE_LIMIT);

  return (
    <div class="h-full overflow-y-auto p-4 space-y-4">
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class="h-full flex items-center justify-center text-center">
            <div>
              <p class="text-sm text-text-tertiary">No messages yet in this pane</p>
              <p class="text-xs text-text-tertiary/60 mt-1">
                Focus this pane and send a message to start a conversation.
              </p>
            </div>
          </div>
        }
      >
        <Show when={props.messages.length > SNAPSHOT_MESSAGE_LIMIT}>
          <div
            class="text-[10px] px-2 py-1 rounded"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-secondary)',
            }}
          >
            Showing last {SNAPSHOT_MESSAGE_LIMIT} messages (snapshot preview)
          </div>
        </Show>
        <For each={recentMessages()}>{(message) => <MessageBubble message={message} />}</For>
      </Show>
    </div>
  );
};

export default SplitPaneContainer;
