// src/components/conversation/ConversationView.tsx
// Scrollable message list with auto-scroll, empty state, and loading indicator.
// Per SPEC-003 §3.1: primary interaction surface.

import type { Component } from 'solid-js';
import { createEffect, createSignal, Show, For } from 'solid-js';
import { conversationState, retryLastMessage, sendMessage } from '@/stores/conversationStore';
import { sessionState } from '@/stores/sessionStore';
import { cliState } from '@/stores/cliStore';
import MessageBubble from './MessageBubble';
import MarkdownContent from './MarkdownContent';
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';

const SAMPLE_PROMPTS = [
  {
    title: 'Explain this codebase',
    description: 'Get a high-level overview of the project structure and architecture',
    prompt:
      'Give me a high-level overview of this codebase. What does it do, how is it structured, and what are the key files?',
  },
  {
    title: 'Find and fix a bug',
    description: 'Describe a bug and let Claude investigate and propose a fix',
    prompt: "Help me debug an issue I'm seeing. Let me describe what's happening...",
  },
  {
    title: 'Write a new feature',
    description: 'Describe what you want to build and Claude will plan and implement it',
    prompt: 'I want to add a new feature. Here is what it should do...',
  },
];

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

  function handleSamplePrompt(prompt: string) {
    const sessionId = sessionState.activeSessionId;
    if (!sessionId) return;
    sendMessage(prompt, sessionId);
  }

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
              <div class="text-center max-w-md mx-auto px-4">
                {/* App branding */}
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
                  Chief Wiggum
                </p>
                <p class="text-xs text-text-tertiary/60 mb-6 tracking-wide">
                  What would you like to work on?
                </p>

                {/* Sample prompt cards */}
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
                          {sample.title}
                        </p>
                        <p class="text-[11px] text-text-tertiary/70 leading-relaxed">
                          {sample.description}
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

          {/* Premium typing indicator (CHI-72) */}
          <Show when={conversationState.isLoading && !conversationState.isStreaming}>
            <div class="flex justify-start animate-fade-in-up">
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
                  <span class="text-xs text-text-tertiary tracking-wide">Thinking</span>
                </div>
              </div>
            </div>
          </Show>

          {/* Error display with retry */}
          <Show when={conversationState.error}>
            <div class="flex justify-center animate-fade-in">
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
                    Retry
                  </button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default ConversationView;
