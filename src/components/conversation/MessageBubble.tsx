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
    default:
      return role;
  }
}

/** Map model ID to badge label + color class */
function modelBadgeInfo(model: string): { label: string; colorClass: string } {
  if (model.includes('opus'))
    return { label: 'Opus', colorClass: 'bg-model-opus/20 text-model-opus' };
  if (model.includes('sonnet'))
    return { label: 'Sonnet', colorClass: 'bg-model-sonnet/20 text-model-sonnet' };
  if (model.includes('haiku'))
    return { label: 'Haiku', colorClass: 'bg-model-haiku/20 text-model-haiku' };
  return { label: model, colorClass: 'bg-bg-elevated text-text-secondary' };
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
  const isSystem = () =>
    props.message.role === 'system' ||
    props.message.role === 'tool_use' ||
    props.message.role === 'tool_result';

  const bgClass = () => {
    if (isUser()) return 'bg-accent-muted border border-accent/20';
    if (isSystem()) return 'bg-bg-inset border border-border-secondary';
    return 'bg-bg-secondary border border-border-primary';
  };

  return (
    <div class={isUser() ? 'flex justify-end' : 'flex justify-start'}>
      <div class={`max-w-[85%] rounded-lg px-4 py-3 ${bgClass()}`}>
        {/* Role label + model badge */}
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm text-text-secondary font-medium">
            {roleLabel(props.message.role)}
          </span>
          <Show when={props.message.model}>
            {(model) => {
              const info = modelBadgeInfo(model());
              return (
                <span class={`px-1.5 py-0.5 rounded text-xs font-mono ${info.colorClass}`}>
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

        {/* Footer: timestamp + cost */}
        <div class="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
          <span>{formatTime(props.message.created_at)}</span>
          <Show when={props.message.cost_cents != null && props.message.cost_cents! > 0}>
            <span class="font-mono">${((props.message.cost_cents ?? 0) / 100).toFixed(4)}</span>
          </Show>
          <Show when={props.message.input_tokens != null}>
            <span class="font-mono">
              {props.message.input_tokens}+{props.message.output_tokens} tok
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
