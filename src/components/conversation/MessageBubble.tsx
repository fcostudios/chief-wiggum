// src/components/conversation/MessageBubble.tsx
// Individual message display per SPEC-003 §3.1 message anatomy.
// Role label, model badge, markdown content, timestamp + cost footer.

import type { Component } from 'solid-js';
import { Show, createSignal } from 'solid-js';
import { Copy, Check, Pencil, RefreshCw, Trash2, GitFork } from 'lucide-solid';
import type { Message } from '@/lib/types';
import { addToast } from '@/stores/toastStore';
import MarkdownContent from './MarkdownContent';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';

interface MessageBubbleProps {
  message: Message;
  onEdit?: (messageId: string, newContent: string) => void | Promise<void>;
  onRegenerate?: (messageId: string) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onFork?: (messageId: string) => void | Promise<void>;
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
  const isAssistant = () => props.message.role === 'assistant';
  const [isEditing, setIsEditing] = createSignal(false);
  const [editContent, setEditContent] = createSignal('');
  const [contextMenuPos, setContextMenuPos] = createSignal<{ x: number; y: number } | null>(null);

  function startEditing(): void {
    setEditContent(props.message.content);
    setIsEditing(true);
  }

  function cancelEditing(): void {
    setEditContent(props.message.content);
    setIsEditing(false);
  }

  function saveAndResend(): void {
    const trimmed = editContent().trim();
    if (!trimmed) {
      addToast('Message cannot be empty', 'warning');
      return;
    }
    setIsEditing(false);
    if (trimmed === props.message.content) return;
    void props.onEdit?.(props.message.id, trimmed);
  }

  function copyMessage(): void {
    navigator.clipboard.writeText(props.message.content);
    addToast('Copied to clipboard', 'success');
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }

  function handleKeyboardContextMenu(e: KeyboardEvent & { currentTarget: HTMLDivElement }): void {
    if (e.target !== e.currentTarget) return;
    if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenuPos({
      x: Math.round(rect.left + Math.min(24, Math.max(rect.width - 8, 8))),
      y: Math.round(rect.top + Math.min(24, Math.max(rect.height - 8, 8))),
    });
  }

  const menuItems = (): ContextMenuItem[] => [
    {
      label: 'Copy message',
      icon: Copy,
      onClick: copyMessage,
    },
    ...(isUser()
      ? [
          {
            label: 'Edit and resend',
            icon: Pencil,
            onClick: startEditing,
          } satisfies ContextMenuItem,
        ]
      : []),
    ...(isAssistant()
      ? [
          {
            label: 'Regenerate',
            icon: RefreshCw,
            onClick: () => {
              void props.onRegenerate?.(props.message.id);
            },
          } satisfies ContextMenuItem,
        ]
      : []),
    { separator: true, label: 'separator' },
    {
      label: 'Fork from here',
      icon: GitFork,
      onClick: () => {
        void props.onFork?.(props.message.id);
      },
      disabled: !props.onFork,
    },
    {
      label: 'Delete message',
      icon: Trash2,
      danger: true,
      onClick: () => {
        void props.onDelete?.(props.message.id);
      },
      disabled: !props.onDelete,
    },
  ];

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
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyboardContextMenu}
        tabindex="0"
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
          when={isUser()}
          fallback={
            <MarkdownContent content={props.message.content} messageId={props.message.id} />
          }
        >
          <Show
            when={!isEditing()}
            fallback={
              <div class="space-y-2">
                <textarea
                  class="w-full text-sm rounded-md px-3 py-2 outline-none resize-y min-h-[60px]"
                  style={{
                    background: 'var(--color-bg-inset)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-focus)',
                  }}
                  value={editContent()}
                  onInput={(e) => setEditContent(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      saveAndResend();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditing();
                    }
                  }}
                />
                <div class="flex gap-2">
                  <button
                    class="px-3 py-1 rounded text-xs font-medium transition-colors"
                    style={{
                      background: 'var(--color-accent)',
                      color: 'var(--color-bg-primary)',
                      'transition-duration': 'var(--duration-fast)',
                    }}
                    onClick={saveAndResend}
                  >
                    Save & Resend
                  </button>
                  <button
                    class="px-3 py-1 rounded text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                    style={{ 'transition-duration': 'var(--duration-fast)' }}
                    onClick={cancelEditing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            }
          >
            <p class="text-text-primary text-base whitespace-pre-wrap">{props.message.content}</p>
          </Show>
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

          {/* Hover actions */}
          <Show when={isUser() && !isEditing()}>
            <div
              class="flex items-center gap-1 opacity-0 group-hover/footer:opacity-100 transition-opacity"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
            >
              <button
                class="p-0.5 rounded text-text-tertiary hover:text-accent transition-colors press-feedback"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
                aria-label="Edit message"
                title="Edit and resend"
              >
                <Pencil size={11} />
              </button>
            </div>
          </Show>

          <Show when={!isUser() && !isSystem() && isAssistant()}>
            <div
              class="flex items-center gap-1 opacity-0 group-hover/footer:opacity-100 transition-opacity"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
            >
              <button
                class="p-0.5 rounded text-text-tertiary hover:text-accent transition-colors press-feedback"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  void props.onRegenerate?.(props.message.id);
                }}
                aria-label="Regenerate response"
                title="Regenerate"
              >
                <RefreshCw size={11} />
              </button>
              <CopyButton content={props.message.content} />
            </div>
          </Show>
        </div>
      </div>

      <Show when={contextMenuPos()}>
        {(pos) => (
          <ContextMenu
            items={menuItems()}
            x={pos().x}
            y={pos().y}
            onClose={() => setContextMenuPos(null)}
          />
        )}
      </Show>
    </div>
  );
};

export default MessageBubble;
