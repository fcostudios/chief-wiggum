// src/components/conversation/ConversationView.tsx
// Scrollable message list with auto-scroll, empty state, and loading indicator.
// Per SPEC-003 §3.1: primary interaction surface.

import type { Component } from 'solid-js';
import { createEffect, createSignal, Show, For } from 'solid-js';
import { conversationState } from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import MessageBubble from './MessageBubble';
import MarkdownContent from './MarkdownContent';
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';

const ConversationView: Component = () => {
  let scrollRef: HTMLDivElement | undefined;
  const [isAutoScroll, setIsAutoScroll] = createSignal(true);

  // Auto-scroll to bottom when messages change or streaming content updates
  createEffect(() => {
    // Access length and streamingContent to track as reactive dependencies
    void conversationState.messages.length;
    void conversationState.streamingContent;
    if (isAutoScroll() && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  // Detect manual scroll — pause auto-scroll when user scrolls up
  function handleScroll() {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScroll(atBottom);
  }

  return (
    <div ref={scrollRef} class="flex-1 overflow-y-auto" onScroll={handleScroll}>
      <Show
        when={conversationState.messages.length > 0}
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
                    Claude Code CLI Not Found
                  </p>
                  <p class="text-xs text-text-tertiary mb-4 tracking-wide">
                    Install it to start chatting
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
              <div class="text-center">
                <div
                  class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(232, 130, 90, 0.1) 0%, rgba(232, 130, 90, 0.05) 100%)',
                    border: '1px solid rgba(232, 130, 90, 0.15)',
                    'box-shadow': 'var(--glow-accent-subtle)',
                  }}
                >
                  <span class="text-2xl" style={{ 'line-height': '1' }}>
                    &gt;_
                  </span>
                </div>
                <p
                  class="text-sm font-medium text-text-primary mb-1.5"
                  style={{ 'letter-spacing': '-0.01em' }}
                >
                  Ready to go
                </p>
                <p class="text-xs text-text-tertiary/60 tracking-wide">
                  Type a message to start a conversation
                </p>
              </div>
            </Show>
          </div>
        }
      >
        <div class="px-4 py-5 space-y-4 max-w-4xl mx-auto w-full">
          <For each={conversationState.messages}>
            {(msg, index) => (
              <div
                class="animate-fade-in-up"
                style={{ 'animation-delay': `${Math.min(index() * 30, 200)}ms` }}
              >
                {msg.role === 'tool_use' ? (
                  <ToolUseBlock message={msg} />
                ) : msg.role === 'tool_result' ? (
                  <ToolResultBlock message={msg} />
                ) : msg.role === 'thinking' ? (
                  <ThinkingBlock message={msg} />
                ) : (
                  <MessageBubble message={msg} />
                )}
              </div>
            )}
          </For>

          {/* Live thinking display during streaming */}
          <Show when={conversationState.isStreaming && conversationState.thinkingContent}>
            <StreamingThinkingBlock content={conversationState.thinkingContent} />
          </Show>

          {/* Streaming content */}
          <Show when={conversationState.isStreaming && conversationState.streamingContent}>
            <div class="flex justify-start animate-fade-in-up">
              <div
                class="max-w-[85%] rounded-lg px-4 py-3"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="text-[11px] font-medium text-text-tertiary tracking-wide">
                    Assistant
                  </span>
                </div>
                <MarkdownContent content={conversationState.streamingContent} />
                <span
                  class="inline-block w-[3px] h-4 rounded-[1px] animate-cursor-blink ml-0.5"
                  style={{ background: 'var(--color-accent)' }}
                />
              </div>
            </div>
          </Show>

          {/* Loading indicator — shimmer effect */}
          <Show when={conversationState.isLoading && !conversationState.isStreaming}>
            <div class="flex justify-start animate-fade-in-up">
              <div
                class="rounded-lg px-4 py-3"
                style={{
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                <div class="flex items-center gap-2">
                  <div class="flex gap-1">
                    <span
                      class="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        background: 'var(--color-accent)',
                        'animation-delay': '0ms',
                      }}
                    />
                    <span
                      class="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        background: 'var(--color-accent)',
                        'animation-delay': '150ms',
                      }}
                    />
                    <span
                      class="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        background: 'var(--color-accent)',
                        'animation-delay': '300ms',
                      }}
                    />
                  </div>
                  <span class="text-xs text-text-tertiary tracking-wide">Thinking</span>
                </div>
              </div>
            </div>
          </Show>

          {/* Error display */}
          <Show when={conversationState.error}>
            <div class="flex justify-center animate-fade-in">
              <div
                class="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: 'rgba(248, 81, 73, 0.08)',
                  border: '1px solid rgba(248, 81, 73, 0.2)',
                  color: 'var(--color-error)',
                }}
              >
                {conversationState.error}
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default ConversationView;
