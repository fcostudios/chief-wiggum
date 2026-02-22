import { Component, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';

interface StreamingThinkingBlockProps {
  content: string;
}

function thinkingPreview(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77) + '...';
}

export const StreamingThinkingBlock: Component<StreamingThinkingBlockProps> = (props) => {
  // Always expanded during streaming
  const [expanded, setExpanded] = createSignal(true);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start animate-fade-in">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'rgba(22, 27, 34, 0.5)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Header */}
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleExpanded}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
        >
          <span class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Thinking
          </span>

          <Show when={!expanded()}>
            <span
              class="text-xs italic truncate flex-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.7' }}
            >
              {thinkingPreview(props.content)}
            </span>
          </Show>

          <span
            class="animate-thinking-shimmer text-[10px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            ...
          </span>

          <Show
            when={expanded()}
            fallback={
              <ChevronRight size={14} color="var(--color-text-tertiary)" class="shrink-0" />
            }
          >
            <ChevronDown size={14} color="var(--color-text-tertiary)" class="shrink-0" />
          </Show>
        </button>

        <Show when={expanded()}>
          <div
            class="px-3 pb-3 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <p
              class="mt-2 text-xs italic leading-5 whitespace-pre-wrap"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {props.content}
              <span
                class="inline-block w-[3px] h-3 rounded-[1px] animate-cursor-blink ml-0.5"
                style={{ background: 'var(--color-text-tertiary)' }}
              />
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
};
