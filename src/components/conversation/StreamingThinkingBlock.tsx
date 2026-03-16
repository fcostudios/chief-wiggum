import { Component, Show, createSignal, onCleanup } from 'solid-js';
import { Brain, ChevronDown, ChevronRight } from 'lucide-solid';

interface StreamingThinkingBlockProps {
  content: string;
}

function compactSummary(content: string): string {
  const trimmed = content.trim().replace(/\n/g, ' ');
  if (trimmed.length <= 60) return trimmed;
  const cut = trimmed.lastIndexOf(' ', 60);
  return trimmed.slice(0, cut > 20 ? cut : 57) + '...';
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.round(content.length / 4));
}

export const StreamingThinkingBlock: Component<StreamingThinkingBlockProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [elapsed, setElapsed] = createSignal(0);

  const intervalId = setInterval(() => {
    setElapsed((current) => current + 1);
  }, 1000);
  onCleanup(() => clearInterval(intervalId));

  const tokenLabel = () => {
    const tokens = estimateTokens(props.content);
    return tokens >= 1000 ? `~${(tokens / 1000).toFixed(1)}K` : `~${tokens}`;
  };

  return (
    <div class="flex justify-start animate-fade-in">
      <div
        class="max-w-[92%] w-full rounded-md overflow-hidden"
        style={{
          background: 'rgba(22, 27, 34, 0.5)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Header */}
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
        >
          <Brain
            size={14}
            class="shrink-0 animate-thinking-shimmer"
            style={{ color: 'var(--color-text-tertiary)' }}
          />

          <span class="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            Thinking
          </span>

          <Show when={!expanded()}>
            <span
              class="text-xs italic truncate flex-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.6' }}
            >
              {compactSummary(props.content)}
            </span>
          </Show>

          <span
            class="text-[10px] font-mono shrink-0"
            style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
          >
            {formatElapsed(elapsed())} · {tokenLabel()} tokens
          </span>

          <span
            class="animate-thinking-shimmer text-[10px] shrink-0"
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
