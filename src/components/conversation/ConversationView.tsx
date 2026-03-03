// src/components/conversation/ConversationView.tsx
// Virtualized scrollable message list with auto-scroll and "jump to latest" button.
// Uses @tanstack/solid-virtual for windowed rendering (CHI-132).

import type { Component } from 'solid-js';
import { createEffect, createMemo, createSignal, Show, For, onCleanup, onMount } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { ArrowDown } from 'lucide-solid';
import {
  conversationState,
  deleteMessage,
  editMessage,
  regenerateResponse,
  retryLastMessage,
  sendMessage,
  switchSession,
  typewriter,
} from '@/stores/conversationStore';
import {
  dismissResume,
  forkSession,
  getSessionLastActiveAt,
  setActiveSession,
  sessionState,
  shouldShowResumeCard,
} from '@/stores/sessionStore';
import { cliState } from '@/stores/cliStore';
import { pickAndCreateProject, projectState } from '@/stores/projectStore';
import { closeMessageSearch, uiState } from '@/stores/uiStore';
import MessageBubble from './MessageBubble';
import MarkdownContent from './MarkdownContent';
import ConversationSearch from './ConversationSearch';
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';
import { StreamingActivitySection } from './StreamingActivitySection';
import { PermissionRecordBlock } from './PermissionRecordBlock';
import SessionResumeCard from './SessionResumeCard';
import ResponseProgress from './ResponseProgress';
import WelcomeScreen from './WelcomeScreen';
import type { Message } from '@/lib/types';
import type { SearchMatch } from '@/lib/messageSearch';
import { extractResumeData } from '@/lib/resumeDetector';
import { stabilizeStreamingMarkdown } from '@/lib/streamingMarkdown';
import { t } from '@/stores/i18nStore';
import { maybeShowHint } from '@/stores/hintStore';
import { settingsState } from '@/stores/settingsStore';
import { fileState, saveConversationScrollTop } from '@/stores/fileStore';

/** Threshold for enabling virtual scrolling. Below this, use plain <For>. */
const VIRTUALIZATION_THRESHOLD = 50;

/** Overscan: number of items to render above/below viewport. */
const OVERSCAN = 5;

/** Render the correct component for a message by role. */
function parseToolUse(content: string): { tool_name: string; tool_use_id: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.tool_name === 'string' &&
      typeof parsed.tool_use_id === 'string'
    ) {
      return { tool_name: parsed.tool_name, tool_use_id: parsed.tool_use_id };
    }
  } catch {
    // Best-effort parsing only.
  }
  return null;
}

function parseToolResult(
  content: string,
): { tool_use_id: string; content: string; is_error: boolean } | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.tool_use_id === 'string' &&
      typeof parsed.content === 'string' &&
      typeof parsed.is_error === 'boolean'
    ) {
      return {
        tool_use_id: parsed.tool_use_id,
        content: parsed.content,
        is_error: parsed.is_error,
      };
    }
  } catch {
    // Best-effort parsing only.
  }
  return null;
}

function isTodoWriteSuccessEcho(message: Message): boolean {
  if (message.role !== 'tool_result') return false;
  const parsedResult = parseToolResult(message.content);
  if (!parsedResult || parsedResult.is_error) return false;
  if (!parsedResult.content.toLowerCase().includes('todos have been modified successfully')) {
    return false;
  }

  const relatedToolUse = conversationState.messages.find((msg) => {
    if (msg.role !== 'tool_use') return false;
    const parsedToolUse = parseToolUse(msg.content);
    return parsedToolUse?.tool_use_id === parsedResult.tool_use_id;
  });

  if (!relatedToolUse) return false;
  const parsedToolUse = parseToolUse(relatedToolUse.content);
  return parsedToolUse?.tool_name === 'TodoWrite';
}

function MessageRenderer(props: {
  message: Message;
  isToolCompleted?: (message: Message) => boolean;
}) {
  return (
    <>
      {props.message.role === 'tool_use' ? (
        <ToolUseBlock
          message={props.message}
          isCompleted={props.isToolCompleted?.(props.message) ?? false}
        />
      ) : props.message.role === 'tool_result' ? (
        isTodoWriteSuccessEcho(props.message) ? null : (
          <ToolResultBlock message={props.message} />
        )
      ) : props.message.role === 'thinking' ? (
        <ThinkingBlock message={props.message} />
      ) : props.message.role === 'permission' ? (
        <PermissionRecordBlock message={props.message} />
      ) : (
        <MessageBubble
          message={props.message}
          onEdit={(id, content) => {
            const sid = sessionState.activeSessionId;
            if (!sid) return;
            void editMessage(id, content, sid);
          }}
          onRegenerate={(id) => {
            const sid = sessionState.activeSessionId;
            if (!sid) return;
            void regenerateResponse(id, sid);
          }}
          onDelete={(id) => {
            const sid = sessionState.activeSessionId;
            if (!sid) return;
            void deleteMessage(id, sid);
          }}
          onFork={(id) => {
            const currentSessionId = sessionState.activeSessionId;
            if (!currentSessionId) return;
            void (async () => {
              const newSessionId = await forkSession(currentSessionId, id);
              if (!newSessionId) return;
              setActiveSession(newSessionId);
              await switchSession(newSessionId, currentSessionId);
            })();
          }}
        />
      )}
    </>
  );
}

function VirtualMessageRow(props: {
  virtualItem: { index: number; start: number };
  message: Message | undefined;
  virtualizer: { measureElement: (el: Element) => void };
  isToolCompleted: (message: Message) => boolean;
}) {
  let rowRef: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let rowMeasureRaf: number | null = null;

  const measureRow = () => {
    if (!rowRef) return;
    if (rowMeasureRaf !== null) {
      cancelAnimationFrame(rowMeasureRaf);
      rowMeasureRaf = null;
    }
    rowMeasureRaf = requestAnimationFrame(() => {
      if (!rowRef?.isConnected) return;
      props.virtualizer.measureElement(rowRef);
      rowMeasureRaf = null;
    });
  };

  onMount(() => {
    measureRow();

    if (typeof ResizeObserver !== 'undefined' && rowRef) {
      resizeObserver = new ResizeObserver(() => {
        measureRow();
      });
      resizeObserver.observe(rowRef);
    }

    onCleanup(() => {
      if (rowMeasureRaf !== null) {
        cancelAnimationFrame(rowMeasureRaf);
      }
      resizeObserver?.disconnect();
    });
  });

  createEffect(() => {
    void props.message?.id;
    void props.message?.content;
    measureRow();
  });

  return (
    <div
      data-index={props.virtualItem.index}
      data-message-index={props.virtualItem.index}
      ref={rowRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${props.virtualItem.start}px)`,
      }}
    >
      <div class="pb-4">
        <Show when={props.message}>
          <MessageRenderer message={props.message!} isToolCompleted={props.isToolCompleted} />
        </Show>
      </div>
    </div>
  );
}

const ConversationView: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  let measureRaf: number | null = null;
  let previousEditorTakeoverActive = false;
  let shouldRestoreLatestOnEditorClose = false;
  const [isAutoScroll, setIsAutoScroll] = createSignal(true);
  const [showJumpButton, setShowJumpButton] = createSignal(false);
  const [searchMatches, setSearchMatches] = createSignal<SearchMatch[]>([]);

  const activeSessionId = () => sessionState.activeSessionId;
  const activeSession = () => sessionState.sessions.find((s) => s.id === activeSessionId());
  const messages = () => conversationState.messages;
  const hasActiveTurnLayout = () => conversationState.isLoading || conversationState.isStreaming;
  // Index of the last user message (start of current turn).
  const currentTurnStartIndex = (): number => {
    const msgs = messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return i;
    }
    return 0;
  };
  // Tool messages that belong to the current active turn (after last user message).
  const currentTurnToolMessages = () => {
    if (!hasActiveTurnLayout()) return [];
    const msgs = messages();
    const startIdx = currentTurnStartIndex();
    return msgs
      .slice(startIdx + 1)
      .filter((m) => m.role === 'tool_use' || m.role === 'tool_result');
  };
  // Messages to show in the main list: all when idle, historical-only during active turn.
  const displayMessages = () => {
    if (!hasActiveTurnLayout()) return messages();
    const msgs = messages();
    const startIdx = currentTurnStartIndex();
    return msgs.slice(0, startIdx + 1);
  };
  const hasComplexMessageLayout = () =>
    messages().some((m) => {
      if (m.role !== 'user' && m.role !== 'assistant') return true;
      if ((m.content?.length ?? 0) > 4000) return true;
      const newlineCount = (m.content.match(/\n/g) ?? []).length;
      return newlineCount > 40;
    });
  const useVirtualization = () =>
    displayMessages().length >= VIRTUALIZATION_THRESHOLD &&
    !hasActiveTurnLayout() &&
    !hasComplexMessageLayout();
  const resumeData = () => {
    const sid = activeSessionId();
    if (!sid) return null;
    const msgs = messages();
    if (!shouldShowResumeCard(sid, msgs.length)) return null;
    return extractResumeData(msgs);
  };
  const resumedAgo = () => {
    const sid = activeSessionId();
    if (!sid) return '';
    const lastActive = getSessionLastActiveAt(sid);
    if (!lastActive) return '';
    const diffMs = Math.max(0, Date.now() - lastActive);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };
  const activeProjectName = () => {
    const pid = projectState.activeProjectId;
    if (!pid) return undefined;
    return projectState.projects.find((p) => p.id === pid)?.name;
  };
  const sessionCostDisplay = () => {
    const cents = activeSession()?.total_cost_cents;
    if (cents == null) return undefined;
    return `$${(cents / 100).toFixed(2)}`;
  };
  const completedToolIds = createMemo<Set<string>>(() => {
    const completed = new Set<string>();
    for (const message of conversationState.messages) {
      if (message.role !== 'tool_result') continue;
      const parsed = parseToolResult(message.content);
      if (parsed?.tool_use_id) {
        completed.add(parsed.tool_use_id);
      }
    }
    return completed;
  });

  function isToolCompleted(message: Message): boolean {
    if (message.role !== 'tool_use') return false;
    const parsed = parseToolUse(message.content);
    if (!parsed?.tool_use_id) return false;
    return completedToolIds().has(parsed.tool_use_id);
  }

  // ── Virtual scroller (active when messages >= threshold) ──
  const virtualizer = createVirtualizer({
    get count() {
      return displayMessages().length;
    },
    getItemKey: (index) => displayMessages()[index]?.id ?? index,
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => 120,
    overscan: OVERSCAN,
  });

  function scheduleVirtualMeasure() {
    if (!scrollRef || !useVirtualization()) return;
    if (measureRaf !== null) {
      cancelAnimationFrame(measureRaf);
      measureRaf = null;
    }
    measureRaf = requestAnimationFrame(() => {
      virtualizer.measure();
      requestAnimationFrame(() => {
        virtualizer.measure();
      });
    });
  }

  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      scheduleVirtualMeasure();
    });

    createEffect(() => {
      const el = scrollRef;
      if (!el) return;
      observer.observe(el);
      onCleanup(() => observer.unobserve(el));
    });

    onCleanup(() => observer.disconnect());
  });

  // Reset virtualizer measurements when switching sessions / reloading message lists.
  // Without stable re-measurement, cached row heights from a previous session can
  // produce incorrect offsets and make newly rendered messages overlap older rows.
  createEffect(() => {
    void sessionState.activeSessionId;
    const count = displayMessages().length;
    const firstId = displayMessages()[0]?.id ?? null;
    const lastId = count > 0 ? displayMessages()[count - 1]?.id : null;
    void firstId;
    void lastId;

    scheduleVirtualMeasure();
  });

  // When we switch between virtualized/non-virtualized modes (e.g. old tool-heavy
  // chats, long markdown replies), force a scroll-height reflow on the next frame
  // so offsets and jump-button state are derived from the correct layout tree.
  createEffect(() => {
    void useVirtualization();
    requestAnimationFrame(() => {
      if (!scrollRef) return;
      if (isAutoScroll()) {
        scrollRef.scrollTop = scrollRef.scrollHeight;
      } else {
        handleScroll();
      }
    });
  });

  // Remeasure when loading state flips or streaming blocks appear/disappear outside
  // the virtualized list. These affect scroll height and can expose stale row offsets
  // after app reloads into older conversations. We also suspend virtualization while
  // a turn is active to avoid row-height drift during the "send -> thinking/streaming"
  // transition for long historical conversations.
  createEffect(() => {
    void conversationState.isLoading;
    void conversationState.isStreaming;
    void conversationState.thinkingContent;
    void typewriter.rendered();
    void currentTurnToolMessages().length;
    void displayMessages().length;
    scheduleVirtualMeasure();
  });

  // ── Auto-scroll ──
  function scrollToLatest(options?: { smooth?: boolean }) {
    if (!scrollRef) return;

    // In virtualized mode, using scrollHeight directly can produce incorrect
    // offsets while many row heights are still estimated. Ask the virtualizer
    // to scroll to the final item, then snap to the true container bottom on
    // the next frame to include streaming/loading blocks rendered after the
    // virtualized list.
    if (useVirtualization() && displayMessages().length > 0) {
      const lastIndex = displayMessages().length - 1;
      virtualizer.measure();
      virtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: options?.smooth ? 'smooth' : 'auto',
      });
      requestAnimationFrame(() => {
        virtualizer.measure();
        if (scrollRef) {
          scrollRef.scrollTop = scrollRef.scrollHeight;
        }
      });
      return;
    }

    scrollRef.scrollTo({
      top: scrollRef.scrollHeight,
      behavior: options?.smooth ? 'smooth' : 'auto',
    });
  }

  createEffect(() => {
    void conversationState.messages.length;
    void typewriter.rendered();
    if (isAutoScroll() && scrollRef) {
      requestAnimationFrame(() => {
        scrollToLatest();
      });
    }
  });

  // Preserve and restore conversation scroll around Editor Takeover transitions.
  createEffect(() => {
    const editorActive = fileState.editorTakeoverActive;
    if (editorActive && !previousEditorTakeoverActive && scrollRef) {
      shouldRestoreLatestOnEditorClose = isAutoScroll();
      saveConversationScrollTop(scrollRef.scrollTop);
    }

    if (!editorActive && previousEditorTakeoverActive && scrollRef) {
      const restoreTop = fileState.savedScrollTop;
      requestAnimationFrame(() => {
        if (!scrollRef) return;
        scheduleVirtualMeasure();
        if (shouldRestoreLatestOnEditorClose) {
          scrollToLatest();
          setIsAutoScroll(true);
          setShowJumpButton(false);
        } else {
          scrollRef.scrollTop = restoreTop;
          handleScroll();
        }
        shouldRestoreLatestOnEditorClose = false;
      });
    }

    previousEditorTakeoverActive = editorActive;
  });

  function handleSamplePrompt(prompt: string) {
    const sessionId = sessionState.activeSessionId;
    if (!sessionId) return;
    sendMessage(prompt, sessionId);
  }

  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    saveConversationScrollTop(scrollTop);
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distFromBottom < 50;
    setIsAutoScroll(atBottom);
    setShowJumpButton(distFromBottom > 300);
  }

  function jumpToLatest() {
    if (!scrollRef) return;
    scrollToLatest({ smooth: true });
    setIsAutoScroll(true);
    setShowJumpButton(false);
  }

  function scrollToMessage(messageIndex: number): void {
    if (!scrollRef) return;
    if (messageIndex < 0 || messageIndex >= displayMessages().length) return;

    if (useVirtualization()) {
      virtualizer.scrollToIndex(messageIndex, { align: 'center', behavior: 'smooth' });
      return;
    }

    const target = scrollRef.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div class="relative flex-1 min-h-0">
      <ResponseProgress />
      <Show when={uiState.messageSearchVisible}>
        <div class="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-[400px] max-w-[90%]">
          <ConversationSearch
            messages={messages()}
            onNavigate={scrollToMessage}
            onMatchesChange={setSearchMatches}
            onClose={() => {
              closeMessageSearch();
              if (searchMatches().length > 0) {
                setSearchMatches([]);
              }
            }}
          />
        </div>
      </Show>
      <div ref={scrollRef} class="h-full overflow-y-auto" onScroll={handleScroll}>
        <Show
          when={displayMessages().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full animate-fade-in">
              <Show
                when={cliState.isDetected}
                fallback={
                  <div class="text-center">
                    <div
                      class="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                      style={{
                        background: 'rgba(248, 81, 73, 0.1)',
                        border: '1px solid rgba(248, 81, 73, 0.2)',
                      }}
                    >
                      <span class="text-xl">!</span>
                    </div>
                    <p
                      class="text-sm font-medium mb-2"
                      style={{ color: 'var(--color-error)', 'letter-spacing': '-0.01em' }}
                    >
                      {t('conversation.cliNotFoundTitle')}
                    </p>
                    <p class="text-xs text-text-tertiary mb-4 tracking-wide">
                      {t('conversation.cliNotFoundSubtitle')}
                    </p>
                    <code
                      class="px-4 py-2 rounded-lg text-xs font-mono"
                      style={{
                        background: 'var(--color-bg-inset)',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-secondary)',
                      }}
                    >
                      npm install -g @anthropic-ai/claude-code
                    </code>
                  </div>
                }
              >
                <WelcomeScreen
                  onPromptSelect={handleSamplePrompt}
                  model={activeSession()?.model ?? settingsState.settings.cli.default_model}
                  onOpenProject={() => {
                    void pickAndCreateProject();
                  }}
                />
              </Show>
            </div>
          }
        >
          <div class="px-4 py-5 max-w-4xl mx-auto w-full">
            <Show when={resumeData()}>
              {(data) => (
                <SessionResumeCard
                  resume={data()}
                  resumedAgo={resumedAgo()}
                  projectName={activeProjectName()}
                  costDisplay={sessionCostDisplay()}
                  onDismiss={() => {
                    const sid = activeSessionId();
                    if (!sid) return;
                    dismissResume(sid);
                    maybeShowHint(
                      'session-resume',
                      'Next time, press Cmd+Shift+R to resume the last session instantly',
                      'Cmd+Shift+R',
                    );
                  }}
                  onContinue={() => {
                    const input = document.querySelector<HTMLTextAreaElement>(
                      'textarea[aria-label="Message input"]',
                    );
                    input?.focus();
                  }}
                />
              )}
            </Show>
            <Show
              when={useVirtualization()}
              fallback={
                <div class="space-y-4">
                  <For each={displayMessages()}>
                    {(msg, index) => (
                      <div
                        data-message-index={index()}
                        class="animate-fade-in-up"
                        style={{
                          'animation-delay': `${Math.min(index() * 30, 200)}ms`,
                        }}
                      >
                        <MessageRenderer message={msg} isToolCompleted={isToolCompleted} />
                      </div>
                    )}
                  </For>
                </div>
              }
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                <For each={virtualizer.getVirtualItems()}>
                  {(virtualItem) => {
                    const msg = () => displayMessages()[virtualItem.index];
                    return (
                      <VirtualMessageRow
                        virtualItem={virtualItem}
                        message={msg()}
                        virtualizer={virtualizer}
                        isToolCompleted={isToolCompleted}
                      />
                    );
                  }}
                </For>
              </div>
            </Show>

            {/* Current-turn tool activity — only during active turn */}
            <Show when={hasActiveTurnLayout() && currentTurnToolMessages().length > 0}>
              <StreamingActivitySection messages={currentTurnToolMessages()} />
            </Show>

            <Show when={conversationState.isStreaming && conversationState.thinkingContent}>
              <div class="mt-3">
                <StreamingThinkingBlock content={conversationState.thinkingContent} />
              </div>
            </Show>

            <Show when={conversationState.isStreaming && typewriter.rendered()}>
              <div class="flex justify-start mt-4 animate-fade-in-up">
                <div
                  class="max-w-[85%] rounded-lg px-4 py-3"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="text-[11px] font-medium text-text-tertiary tracking-wide">
                      {t('conversation.assistant')}
                    </span>
                  </div>
                  <div class="streaming-markdown">
                    <MarkdownContent
                      content={stabilizeStreamingMarkdown(typewriter.rendered())}
                      isStreaming={true}
                    />
                  </div>
                  <span
                    class="inline-block w-[3px] h-4 rounded-[1px] animate-cursor-blink ml-0.5"
                    style={{ background: 'var(--color-accent)' }}
                  />
                </div>
              </div>
            </Show>

            <Show when={conversationState.isLoading && !conversationState.isStreaming}>
              <div class="flex justify-start mt-4 animate-fade-in-up">
                <div
                  class="rounded-lg px-4 py-3"
                  style={{
                    'background-color': 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <div class="flex items-center gap-2.5">
                    <div class="flex gap-1.5">
                      <span
                        class="w-2 h-2 rounded-full animate-typing-bounce"
                        style={{
                          'background-color': 'var(--color-accent)',
                          'animation-delay': '0ms',
                        }}
                      />
                      <span
                        class="w-2 h-2 rounded-full animate-typing-bounce"
                        style={{
                          'background-color': 'var(--color-accent)',
                          'animation-delay': '200ms',
                        }}
                      />
                      <span
                        class="w-2 h-2 rounded-full animate-typing-bounce"
                        style={{
                          'background-color': 'var(--color-accent)',
                          'animation-delay': '400ms',
                        }}
                      />
                    </div>
                    <span class="text-xs text-text-tertiary tracking-wide">
                      {t('conversation.thinking')}
                    </span>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={conversationState.error}>
              <div class="flex justify-center mt-4 animate-fade-in">
                <div
                  class="rounded-lg px-4 py-3 text-sm flex items-center gap-3"
                  style={{
                    background: 'rgba(248, 81, 73, 0.08)',
                    border: '1px solid rgba(248, 81, 73, 0.2)',
                    color: 'var(--color-error)',
                  }}
                >
                  <span>{conversationState.error}</span>
                  <Show when={conversationState.lastUserMessage}>
                    <button
                      class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors shrink-0"
                      style={{
                        background: 'rgba(248, 81, 73, 0.15)',
                        color: 'var(--color-error)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(248, 81, 73, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(248, 81, 73, 0.15)';
                      }}
                      onClick={() => {
                        const sid = sessionState.activeSessionId;
                        if (sid) retryLastMessage(sid);
                      }}
                    >
                      {t('common.retry')}
                    </button>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={showJumpButton() && messages().length > 0}>
        <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
              'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.3)',
              'transition-duration': 'var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
              e.currentTarget.style.color = 'var(--color-text-primary)';
            }}
            onClick={jumpToLatest}
          >
            <ArrowDown size={12} />
            {t('conversation.jumpToLatest')}
          </button>
        </div>
      </Show>
    </div>
  );
};

export default ConversationView;
