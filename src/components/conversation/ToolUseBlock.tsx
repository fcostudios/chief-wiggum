import { Component, Show, Switch, Match, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight, Wrench, Terminal, FileEdit } from 'lucide-solid';
import type { Message, ToolUseData, ToolCategory } from '../../lib/types';

interface ToolUseBlockProps {
  message: Message;
}

/** Classify a tool name into a category for color-coding. */
function classifyTool(toolName: string): ToolCategory {
  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'file';
    case 'Bash':
      return 'bash';
    default:
      return 'neutral';
  }
}

/** Get the color token CSS variable for a tool category. */
function toolColor(category: ToolCategory): string {
  switch (category) {
    case 'file':
      return 'var(--color-tool-file)';
    case 'bash':
      return 'var(--color-tool-bash)';
    case 'neutral':
      return 'var(--color-tool-neutral)';
  }
}

/** Get the icon component for a tool category. */
function ToolIcon(props: { category: ToolCategory; color: string }) {
  return (
    <Switch fallback={<Wrench size={14} color={props.color} />}>
      <Match when={props.category === 'file'}>
        <FileEdit size={14} color={props.color} />
      </Match>
      <Match when={props.category === 'bash'}>
        <Terminal size={14} color={props.color} />
      </Match>
    </Switch>
  );
}

/** Parse tool_use message content. Handles both JSON (new) and markdown (legacy). */
function parseToolUseContent(content: string): ToolUseData {
  try {
    const parsed = JSON.parse(content);
    if (parsed.tool_name) return parsed as ToolUseData;
  } catch {
    // Fallback: parse legacy markdown format "**ToolName**\n```\ninput\n```"
  }
  const nameMatch = content.match(/\*\*(\w+)\*\*/);
  const inputMatch = content.match(/```\n?([\s\S]*?)```/);
  return {
    tool_name: nameMatch?.[1] ?? 'Unknown',
    tool_input: inputMatch?.[1]?.trim() ?? content,
  };
}

/** Generate a short summary of the tool input. */
function toolSummary(toolName: string, toolInput: string): string {
  try {
    const parsed = JSON.parse(toolInput);
    switch (toolName) {
      case 'Bash':
        return parsed.command ? String(parsed.command).slice(0, 60) : '';
      case 'Edit':
      case 'Write':
      case 'Read':
        return parsed.file_path ? (String(parsed.file_path).split('/').pop() ?? '') : '';
      case 'Glob':
        return parsed.pattern ? String(parsed.pattern) : '';
      case 'Grep':
        return parsed.pattern ? String(parsed.pattern) : '';
      default:
        return '';
    }
  } catch {
    return toolInput.slice(0, 60);
  }
}

export const ToolUseBlock: Component<ToolUseBlockProps> = (props) => {
  const data = () => parseToolUseContent(props.message.content);
  const category = () => classifyTool(data().tool_name);
  const color = () => toolColor(category());
  const summary = () => toolSummary(data().tool_name, data().tool_input);

  const [expanded, setExpanded] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-primary)',
        }}
      >
        {/* Left color stripe + content */}
        <div class="flex">
          {/* Color stripe */}
          <div class="w-[3px] shrink-0" style={{ background: color() }} />

          <div class="flex-1 min-w-0">
            {/* Header row — always visible */}
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={toggleExpanded}
              aria-expanded={expanded()}
              aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${data().tool_name} tool use`}
            >
              <ToolIcon category={category()} color={color()} />
              <span class="text-xs font-mono font-semibold" style={{ color: color() }}>
                {data().tool_name}
              </span>
              <Show when={summary()}>
                <span
                  class="text-xs truncate flex-1"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {summary()}
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

            {/* Expanded content — tool input */}
            <Show when={expanded()}>
              <div
                class="px-3 pb-2 border-t"
                style={{ 'border-color': 'var(--color-border-secondary)' }}
              >
                <pre
                  class="mt-2 rounded overflow-x-auto text-xs leading-5"
                  style={{
                    'font-family': 'var(--font-mono)',
                    background: 'var(--color-bg-inset)',
                    padding: '8px 12px',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <code>{data().tool_input}</code>
                </pre>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
