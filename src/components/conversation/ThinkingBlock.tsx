import { Component, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-solid';
import type { Message } from '../../lib/types';
import { addToast } from '@/stores/toastStore';

interface ThinkingBlockProps {
  message: Message;
  isStreaming?: boolean;
}

/** Generate a preview of thinking content (~80 chars). */
function thinkingPreview(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77) + '...';
}

export const ThinkingBlock: Component<ThinkingBlockProps> = (props) => {
  // Expanded during streaming, collapsed after (on restore or after complete)
  // eslint-disable-next-line solid/reactivity -- initial value from prop, not reactive tracking
  const [expanded, setExpanded] = createSignal(props.isStreaming ?? false);
  const [copied, setCopied] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);
  const handleCopy = () => {
    navigator.clipboard.writeText(props.message.content).catch(() => {});
    setCopied(true);
    addToast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const preview = () => thinkingPreview(props.message.content);

  return (
    <div class="flex justify-start">
      <div
        class="max-w-[92%] w-full rounded-md overflow-hidden"
        style={{
          background: 'rgba(22, 27, 34, 0.5)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Header row */}
        <div class="group flex items-center">
          <button
            class="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={toggleExpanded}
            aria-expanded={expanded()}
            aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
          >
            <span class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Thinking
            </span>

            {/* Preview text when collapsed */}
            <Show when={!expanded()}>
              <span
                class="text-xs italic truncate flex-1"
                style={{ color: 'var(--color-text-tertiary)', opacity: '0.7' }}
              >
                {preview()}
              </span>
            </Show>

            {/* Streaming shimmer indicator */}
            <Show when={props.isStreaming}>
              <span
                class="animate-thinking-shimmer text-[10px]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                ...
              </span>
            </Show>

            <Show
              when={expanded()}
              fallback={
                <ChevronRight size={14} color="var(--color-text-tertiary)" class="shrink-0" />
              }
            >
              <ChevronDown size={14} color="var(--color-text-tertiary)" class="shrink-0" />
            </Show>
          </button>
          <button
            class="rounded px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={handleCopy}
            aria-label="Copy thinking content"
            title="Copy thinking"
          >
            <Show when={copied()} fallback={<Copy size={11} color="var(--color-text-tertiary)" />}>
              <Check size={11} color="var(--color-success)" />
            </Show>
          </button>
        </div>

        {/* Expanded content */}
        <Show when={expanded()}>
          <div
            class="px-3 pb-3 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <p
              class="mt-2 text-xs italic leading-5 whitespace-pre-wrap"
              style={{
                color: 'var(--color-text-secondary)',
                'font-family': 'var(--font-ui)',
              }}
            >
              {props.message.content}
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
};
