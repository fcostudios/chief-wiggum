// src/components/conversation/MessageBubble.tsx
// Individual message display per SPEC-003 §3.1 message anatomy.
// Role label, model badge, markdown content, timestamp + cost footer.

import type { Component } from 'solid-js';
import { Show, createSignal } from 'solid-js';
import { Copy, Check } from 'lucide-solid';
import type { Message } from '@/lib/types';
import { addToast } from '@/stores/toastStore';
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
    case 'permission':
      return 'Permission';
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

/** Format token count as K notation */
function formatTokens(input: number | null, output: number | null): string | null {
  const total = (input ?? 0) + (output ?? 0);
  if (total === 0) return null;
  return total >= 1000 ? `${(total / 1000).toFixed(1)}K tokens` : `${total} tokens`;
}

/** Format cost in dollars */
function formatCost(cents: number | null): string | null {
  if (!cents || cents <= 0) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

const CopyButton: Component<{ content: string }> = (props) => {
  const [copied, setCopied] = createSignal(false);
  return (
    <button
      class="p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors press-feedback"
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() => {
        navigator.clipboard.writeText(props.content);
        setCopied(true);
        addToast('Copied to clipboard', 'success');
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label="Copy message"
      title="Copy message"
    >
      <Show when={copied()} fallback={<Copy size={11} />}>
        <Check size={11} color="var(--color-success)" />
      </Show>
    </button>
  );
};

const MessageBubble: Component<MessageBubbleProps> = (props) => {
  const isUser = () => props.message.role === 'user';
  const isSystem = () => props.message.role === 'system';

  return (
    <div class={isUser() ? 'flex justify-end' : 'flex justify-start'}>
      <div
        class="max-w-[85%] rounded-lg px-4 py-3 relative hover-lift"
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

        {/* Footer: timestamp + tokens + cost + hover actions */}
        <div class="group/footer flex items-center gap-2 mt-2">
          <div
            class="flex items-center gap-1.5 font-mono"
            style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)', opacity: '0.6' }}
          >
            <span>{formatTime(props.message.created_at)}</span>
            <Show
              when={
                !isUser() && formatTokens(props.message.input_tokens, props.message.output_tokens)
              }
            >
              {(tokens) => (
                <>
                  <span style={{ opacity: '0.4' }}>&middot;</span>
                  <span>{tokens()}</span>
                </>
              )}
            </Show>
            <Show when={!isUser() && formatCost(props.message.cost_cents)}>
              {(cost) => (
                <>
                  <span style={{ opacity: '0.4' }}>&middot;</span>
                  <span>{cost()}</span>
                </>
              )}
            </Show>
          </div>

          {/* Hover actions — Copy (assistant messages only) */}
          <Show when={!isUser() && !isSystem() && props.message.role === 'assistant'}>
            <div
              class="flex items-center gap-1 opacity-0 group-hover/footer:opacity-100 transition-opacity"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
            >
              <CopyButton content={props.message.content} />
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
