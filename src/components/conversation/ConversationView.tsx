// src/components/conversation/ConversationView.tsx
// Virtualized scrollable message list with auto-scroll and "jump to latest" button.
// Uses @tanstack/solid-virtual for windowed rendering (CHI-132).

import type { Component } from 'solid-js';
import { createEffect, createSignal, Show, For, onCleanup, onMount } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { ArrowDown } from 'lucide-solid';
import {
  conversationState,
  editMessage,
  regenerateResponse,
  retryLastMessage,
  sendMessage,
  typewriter,
} from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';
import { cliState } from '@/stores/cliStore';
import MessageBubble from './MessageBubble';
import MarkdownContent from './MarkdownContent';
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';
import { PermissionRecordBlock } from './PermissionRecordBlock';
import type { Message } from '@/lib/types';
import { t } from '@/stores/i18nStore';

const SAMPLE_PROMPTS = [
  {
    titleKey: 'conversation.sampleExplain',
    descriptionKey: 'conversation.sampleExplainDesc',
    prompt:
      'Give me a high-level overview of this codebase. What does it do, how is it structured, and what are the key files?',
  },
  {
    titleKey: 'conversation.sampleBug',
    descriptionKey: 'conversation.sampleBugDesc',
    prompt: "Help me debug an issue I'm seeing. Let me describe what's happening...",
  },
  {
    titleKey: 'conversation.sampleFeature',
    descriptionKey: 'conversation.sampleFeatureDesc',
    prompt: 'I want to add a new feature. Here is what it should do...',
  },
];

/** Threshold for enabling virtual scrolling. Below this, use plain <For>. */
const VIRTUALIZATION_THRESHOLD = 50;

/** Overscan: number of items to render above/below viewport. */
const OVERSCAN = 5;

/** Render the correct component for a message by role. */
function MessageRenderer(props: { message: Message }) {
  return (
    <>
      {props.message.role === 'tool_use' ? (
        <ToolUseBlock message={props.message} />
      ) : props.message.role === 'tool_result' ? (
        <ToolResultBlock message={props.message} />
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
        />
      )}
    </>
  );
}

function VirtualMessageRow(props: {
  virtualItem: { index: number; start: number };
  message: Message | undefined;
  virtualizer: { measureElement: (el: Element) => void };
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
          <MessageRenderer message={props.message!} />
        </Show>
      </div>
    </div>
  );
}

const ConversationView: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  let measureRaf: number | null = null;
  const [isAutoScroll, setIsAutoScroll] = createSignal(true);
  const [showJumpButton, setShowJumpButton] = createSignal(false);

  const messages = () => conversationState.messages;
  const hasActiveTurnLayout = () => conversationState.isLoading || conversationState.isStreaming;
  const hasComplexMessageLayout = () =>
    messages().some((m) => {
      if (m.role !== 'user' && m.role !== 'assistant') return true;
      if ((m.content?.length ?? 0) > 4000) return true;
      const newlineCount = (m.content.match(/\n/g) ?? []).length;
      return newlineCount > 40;
    });
  const useVirtualization = () =>
    messages().length >= VIRTUALIZATION_THRESHOLD &&
    !hasActiveTurnLayout() &&
    !hasComplexMessageLayout();

  // ── Virtual scroller (active when messages >= threshold) ──
  const virtualizer = createVirtualizer({
    get count() {
      return messages().length;
    },
    getItemKey: (index) => messages()[index]?.id ?? index,
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
    const count = messages().length;
    const firstId = messages()[0]?.id ?? null;
    const lastId = count > 0 ? messages()[count - 1]?.id : null;
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
    if (useVirtualization() && messages().length > 0) {
      const lastIndex = messages().length - 1;
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

  function handleSamplePrompt(prompt: string) {
    const sessionId = sessionState.activeSessionId;
    if (!sessionId) return;
    sendMessage(prompt, sessionId);
  }

  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
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

  return (
    <div class="relative flex-1 min-h-0">
      <div ref={scrollRef} class="h-full overflow-y-auto" onScroll={handleScroll}>
        <Show
          when={messages().length > 0}
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
                <div class="text-center max-w-md mx-auto px-4">
                  <div
                    class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(232, 130, 90, 0.12) 0%, rgba(232, 130, 90, 0.04) 100%)',
                      border: '1px solid rgba(232, 130, 90, 0.15)',
                      'box-shadow': 'var(--glow-accent-subtle)',
                    }}
                  >
                    <span
                      class="text-xl font-bold"
                      style={{ 'line-height': '1', color: 'var(--color-accent)' }}
                    >
                      CW
                    </span>
                  </div>
                  <p
                    class="text-sm font-medium text-text-primary mb-1"
                    style={{ 'letter-spacing': '-0.01em' }}
                  >
                    {t('conversation.emptyTitle')}
                  </p>
                  <p class="text-xs text-text-tertiary/60 mb-6 tracking-wide">
                    {t('conversation.emptySubtitle')}
                  </p>
                  <div class="space-y-2">
                    <For each={SAMPLE_PROMPTS}>
                      {(sample) => (
                        <button
                          class="w-full text-left px-3.5 py-2.5 rounded-lg transition-all group"
                          style={{
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border-secondary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(232, 130, 90, 0.3)';
                            e.currentTarget.style.background = 'var(--color-bg-elevated)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
                            e.currentTarget.style.background = 'var(--color-bg-secondary)';
                          }}
                          onClick={() => handleSamplePrompt(sample.prompt)}
                        >
                          <p class="text-xs font-medium text-text-primary mb-0.5 group-hover:text-accent transition-colors">
                            {t(sample.titleKey)}
                          </p>
                          <p class="text-[11px] text-text-tertiary/70 leading-relaxed">
                            {t(sample.descriptionKey)}
                          </p>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>
          }
        >
          <div class="px-4 py-5 max-w-4xl mx-auto w-full">
            <Show
              when={useVirtualization()}
              fallback={
                <div class="space-y-4">
                  <For each={messages()}>
                    {(msg, index) => (
                      <div
                        class="animate-fade-in-up"
                        style={{
                          'animation-delay': `${Math.min(index() * 30, 200)}ms`,
                        }}
                      >
                        <MessageRenderer message={msg} />
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
                    const msg = () => messages()[virtualItem.index];
                    return (
                      <VirtualMessageRow
                        virtualItem={virtualItem}
                        message={msg()}
                        virtualizer={virtualizer}
                      />
                    );
                  }}
                </For>
              </div>
            </Show>

            <Show when={conversationState.isStreaming && conversationState.thinkingContent}>
              <div class="mt-4">
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
                  <MarkdownContent content={typewriter.rendered()} />
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
