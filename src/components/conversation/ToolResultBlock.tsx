import { Component, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-solid';
import type { Message, ToolResultData } from '../../lib/types';

interface ToolResultBlockProps {
  message: Message;
}

/** Parse tool_result message content. Handles both JSON (new) and plain text (legacy). */
function parseToolResultContent(content: string): ToolResultData {
  try {
    const parsed = JSON.parse(content);
    if ('tool_use_id' in parsed) return parsed as ToolResultData;
  } catch {
    // Fallback: legacy plain text format
  }
  const isError = content.startsWith('[Error]');
  return {
    tool_use_id: '',
    content: isError ? content.replace(/^\[Error\]\s*/, '') : content,
    is_error: isError,
  };
}

/** Truncate long output for the collapsed preview. */
function resultPreview(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}

export const ToolResultBlock: Component<ToolResultBlockProps> = (props) => {
  const data = () => parseToolResultContent(props.message.content);
  const isError = () => data().is_error;
  const preview = () => resultPreview(data().content);

  const [expanded, setExpanded] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start -mt-1">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: `1px solid ${isError() ? 'var(--color-tool-permission-deny)' : 'var(--color-border-secondary)'}`,
          'border-top': 'none',
          'border-top-left-radius': '0',
          'border-top-right-radius': '0',
        }}
      >
        {/* Header row */}
        <button
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleExpanded}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} tool result`}
        >
          <Show
            when={!isError()}
            fallback={<XCircle size={12} color="var(--color-tool-permission-deny)" />}
          >
            <CheckCircle size={12} color="var(--color-tool-bash)" />
          </Show>
          <span
            class="text-[11px] font-mono truncate flex-1"
            style={{
              color: isError() ? 'var(--color-tool-permission-deny)' : 'var(--color-text-tertiary)',
            }}
          >
            {expanded() ? (isError() ? 'Error' : 'Result') : preview()}
          </span>
          <Show
            when={expanded()}
            fallback={
              <ChevronRight size={12} color="var(--color-text-tertiary)" class="shrink-0" />
            }
          >
            <ChevronDown size={12} color="var(--color-text-tertiary)" class="shrink-0" />
          </Show>
        </button>

        {/* Expanded content — result output */}
        <Show when={expanded()}>
          <div
            class="px-3 pb-2 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <pre
              class="mt-1.5 rounded overflow-x-auto text-xs leading-5 max-h-[300px]"
              style={{
                'font-family': 'var(--font-mono)',
                background: 'var(--color-bg-inset)',
                padding: '8px 12px',
                color: isError()
                  ? 'var(--color-tool-permission-deny)'
                  : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <code>{data().content}</code>
            </pre>
          </div>
        </Show>
      </div>
    </div>
  );
};
