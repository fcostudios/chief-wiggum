// src/components/conversation/MessageBubble.tsx
// Individual message display per SPEC-003 §3.1 message anatomy.
// Role label, model badge, markdown content, timestamp + cost footer.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import type { Message } from '@/lib/types';
import MarkdownContent from './MarkdownContent';

interface MessageBubbleProps {
  message: Message;
}

/** Map role to display label */
function roleLabel(role: string): string {
  switch (role) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'tool_use':
      return 'Tool Use';
    case 'tool_result':
      return 'Tool Result';
    case 'thinking':
      return 'Thinking';
    default:
      return role;
  }
}

/** Map model ID to badge label + styles */
function modelBadgeInfo(model: string): {
  label: string;
  bg: string;
  color: string;
} {
  if (model.includes('opus'))
    return {
      label: 'Opus',
      bg: 'rgba(163, 113, 247, 0.15)',
      color: 'var(--color-model-opus)',
    };
  if (model.includes('sonnet'))
    return {
      label: 'Sonnet',
      bg: 'rgba(88, 166, 255, 0.15)',
      color: 'var(--color-model-sonnet)',
    };
  if (model.includes('haiku'))
    return {
      label: 'Haiku',
      bg: 'rgba(63, 185, 80, 0.15)',
      color: 'var(--color-model-haiku)',
    };
  return {
    label: model,
    bg: 'var(--color-bg-elevated)',
    color: 'var(--color-text-secondary)',
  };
}

/** Format ISO timestamp to HH:MM */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const MessageBubble: Component<MessageBubbleProps> = (props) => {
  const isUser = () => props.message.role === 'user';
  const isSystem = () => props.message.role === 'system';

  return (
    <div class={isUser() ? 'flex justify-end' : 'flex justify-start'}>
      <div
        class="max-w-[85%] rounded-lg px-4 py-3 relative"
        style={{
          background: isUser()
            ? 'rgba(232, 130, 90, 0.08)'
            : isSystem()
              ? 'var(--color-bg-inset)'
              : 'var(--color-bg-secondary)',
          border: isUser()
            ? '1px solid rgba(232, 130, 90, 0.15)'
            : isSystem()
              ? '1px solid var(--color-border-secondary)'
              : '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Left accent stripe for assistant messages */}
        <Show when={!isUser() && !isSystem()}>
          <div
            class="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
            style={{
              background:
                'linear-gradient(180deg, var(--color-accent) 0%, rgba(232, 130, 90, 0.2) 100%)',
            }}
          />
        </Show>

        {/* Role label + model badge */}
        <div class="flex items-center gap-2 mb-1.5">
          <span
            class="font-medium"
            style={{
              'font-size': '11px',
              color: isUser() ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              'letter-spacing': '0.02em',
            }}
          >
            {roleLabel(props.message.role)}
          </span>
          <Show when={props.message.model}>
            {(model) => {
              const info = modelBadgeInfo(model());
              return (
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
                  style={{
                    background: info.bg,
                    color: info.color,
                  }}
                >
                  {info.label}
                </span>
              );
            }}
          </Show>
        </div>

        {/* Content: user messages as plain text, others as markdown */}
        <Show
          when={!isUser()}
          fallback={
            <p class="text-text-primary text-base whitespace-pre-wrap">{props.message.content}</p>
          }
        >
          <MarkdownContent content={props.message.content} />
        </Show>

        {/* Footer: timestamp + cost — refined typography */}
        <div
          class="flex items-center gap-3 mt-2 font-mono"
          style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)', opacity: '0.6' }}
        >
          <span>{formatTime(props.message.created_at)}</span>
          <Show when={props.message.cost_cents != null && props.message.cost_cents! > 0}>
            <span>${((props.message.cost_cents ?? 0) / 100).toFixed(4)}</span>
          </Show>
          <Show when={props.message.input_tokens != null}>
            <span>
              {props.message.input_tokens}+{props.message.output_tokens} tok
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
