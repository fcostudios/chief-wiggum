// src/components/conversation/ConversationView.tsx
// Scrollable message list with auto-scroll, empty state, and loading indicator.
// Per SPEC-003 §3.1: primary interaction surface.

import type { Component } from 'solid-js';
import { createEffect, createSignal, Show, For } from 'solid-js';
import { conversationState } from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import MessageBubble from './MessageBubble';
import MarkdownContent from './MarkdownContent';

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
          <div class="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Show
              when={cliState.isDetected}
              fallback={
                <div class="text-center">
                  <p class="text-lg mb-2 text-error">Claude Code CLI Not Found</p>
                  <p class="text-sm mb-4">Install it to start chatting:</p>
                  <code class="bg-bg-elevated px-3 py-1.5 rounded text-xs text-text-primary">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                </div>
              }
            >
              <p class="text-lg mb-2">No messages yet</p>
              <p class="text-sm">Type a message below to start a conversation</p>
            </Show>
          </div>
        }
      >
        <div class="p-4 space-y-4">
          <For each={conversationState.messages}>{(msg) => <MessageBubble message={msg} />}</For>

          {/* Streaming content */}
          <Show when={conversationState.isStreaming && conversationState.streamingContent}>
            <div class="flex justify-start">
              <div class="max-w-[85%] bg-bg-secondary border border-border-primary rounded-lg px-4 py-3">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm text-text-secondary font-medium">Assistant</span>
                </div>
                <MarkdownContent content={conversationState.streamingContent} />
                <span class="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
              </div>
            </div>
          </Show>

          {/* Loading indicator */}
          <Show when={conversationState.isLoading && !conversationState.isStreaming}>
            <div class="flex justify-start">
              <div class="bg-bg-secondary border border-border-primary rounded-lg px-4 py-3">
                <span class="text-sm text-text-secondary">Thinking...</span>
              </div>
            </div>
          </Show>

          {/* Error display */}
          <Show when={conversationState.error}>
            <div class="flex justify-center">
              <div class="bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-error text-sm">
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
