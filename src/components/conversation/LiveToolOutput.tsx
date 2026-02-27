import { type Component, Show, createSignal, onMount } from 'solid-js';
import { CheckCircle, ChevronDown, ChevronRight, XCircle } from 'lucide-solid';

interface LiveToolOutputProps {
  content: string;
  toolName: string;
  isError: boolean;
}

function extractExitCode(content: string): string | null {
  const match = content.match(/(?:^|\n)Exit code\s+(\d+)\b/i);
  return match?.[1] ?? null;
}

export const LiveToolOutput: Component<LiveToolOutputProps> = (props) => {
  let scrollRef: HTMLPreElement | undefined;
  const [expanded, setExpanded] = createSignal(true);
  const exitCode = () => extractExitCode(props.content);
  const exitCodeNum = () => {
    const code = exitCode();
    return code !== null ? Number.parseInt(code, 10) : null;
  };

  onMount(() => {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  });

  return (
    <div
      class="rounded-md overflow-hidden mt-1"
      style={{
        background: 'var(--color-bg-inset)',
        border: `1px solid ${props.isError ? 'var(--color-tool-permission-deny)' : 'var(--color-border-secondary)'}`,
      }}
    >
      <button
        class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded()}
        aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${props.toolName} output`}
      >
        <Show
          when={!props.isError}
          fallback={<XCircle size={12} color="var(--color-tool-permission-deny)" />}
        >
          <CheckCircle size={12} color="var(--color-tool-bash)" />
        </Show>
        <span
          class="text-[11px] font-mono"
          style={{
            color: props.isError ? 'var(--color-tool-permission-deny)' : 'var(--color-tool-bash)',
          }}
        >
          {props.toolName}
        </span>
        <span class="text-[11px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          output
        </span>
        <Show when={exitCodeNum() !== null}>
          <span
            class="text-[10px] font-mono px-1.5 py-0.5 rounded ml-1"
            style={{
              background: exitCodeNum() === 0 ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.12)',
              color:
                exitCodeNum() === 0
                  ? 'var(--color-tool-bash)'
                  : 'var(--color-tool-permission-deny)',
            }}
          >
            exit {exitCode()}
          </span>
        </Show>
        <div class="flex-1" />
        <Show
          when={expanded()}
          fallback={<ChevronRight size={12} color="var(--color-text-tertiary)" class="shrink-0" />}
        >
          <ChevronDown size={12} color="var(--color-text-tertiary)" class="shrink-0" />
        </Show>
      </button>

      <Show when={expanded()}>
        <pre
          ref={scrollRef}
          class="text-[11px] leading-relaxed overflow-x-auto overflow-y-auto px-3 pb-2 pt-1"
          style={{
            'font-family': 'var(--font-mono)',
            color: props.isError ? 'var(--color-tool-permission-deny)' : 'var(--color-text-secondary)',
            'max-height': '250px',
            'border-top': '1px solid var(--color-border-secondary)',
          }}
          aria-label={`${props.toolName} execution output`}
        >
          <code>{props.content}</code>
        </pre>
      </Show>
    </div>
  );
};
