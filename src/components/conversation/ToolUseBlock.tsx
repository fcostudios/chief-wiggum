import { Component, Show, Switch, Match, For, createMemo, createSignal } from 'solid-js';
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Terminal,
  FileEdit,
  MessageCircleQuestion,
  Copy,
  Check,
} from 'lucide-solid';
import type { Message, ToolUseData, ToolCategory, QuestionItem } from '../../lib/types';
import { TodoWriteBlock } from './TodoWriteBlock';
import { addToast } from '@/stores/toastStore';

interface ToolUseBlockProps {
  message: Message;
  isCompleted?: boolean;
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
    case 'AskUserQuestion':
      return 'question';
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
    case 'question':
      return '#a371f7';
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
      <Match when={props.category === 'question'}>
        <MessageCircleQuestion size={14} color={props.color} />
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
  const parsedInput = createMemo(() => {
    try {
      return JSON.parse(data().tool_input) as {
        questions?: QuestionItem[];
        answers?: Record<string, string>;
      };
    } catch {
      return null;
    }
  });
  const category = () => classifyTool(data().tool_name);
  const color = () => toolColor(category());
  const summary = () => toolSummary(data().tool_name, data().tool_input);

  const [expanded, setExpanded] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);
  const handleCopy = () => {
    navigator.clipboard.writeText(data().tool_input).catch(() => {});
    setCopied(true);
    addToast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Show
      when={data().tool_name !== 'TodoWrite'}
      fallback={<TodoWriteBlock message={props.message} />}
    >
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

            <div class="flex-1 min-w-0 group">
              {/* Header row — always visible */}
              <div class="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors">
                <button
                  class="flex min-w-0 flex-1 items-center gap-2 text-left"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={toggleExpanded}
                  aria-expanded={expanded()}
                  aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${data().tool_name} tool use`}
                >
                  <ToolIcon category={category()} color={color()} />
                  <span class="text-xs font-mono font-semibold" style={{ color: color() }}>
                    {data().tool_name}
                  </span>
                  <Show when={props.isCompleted}>
                    <span
                      data-testid="tool-use-complete"
                      class="inline-flex items-center justify-center rounded-full w-4 h-4"
                      style={{
                        background: 'rgba(63, 185, 80, 0.14)',
                        color: 'var(--color-success)',
                        animation:
                          'check-appear var(--duration-celebration) var(--ease-celebration) forwards',
                      }}
                      aria-label="Tool completed"
                      title="Tool completed"
                    >
                      <Check size={10} />
                    </span>
                  </Show>
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
                <button
                  class="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 shrink-0"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy();
                  }}
                  aria-label="Copy tool input"
                  title="Copy tool input"
                >
                  <Show
                    when={copied()}
                    fallback={<Copy size={11} color="var(--color-text-tertiary)" />}
                  >
                    <Check size={11} color="var(--color-success)" />
                  </Show>
                </button>
              </div>

              {/* Expanded content — tool input */}
              <Show when={expanded()}>
                <div
                  class="px-3 pb-2 border-t"
                  style={{ 'border-color': 'var(--color-border-secondary)' }}
                >
                  <Show
                    when={data().tool_name === 'AskUserQuestion' && parsedInput()?.answers}
                    fallback={
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
                    }
                  >
                    <div
                      class="mt-2 space-y-1 rounded text-xs px-3 py-2"
                      style={{
                        background: 'rgba(163, 113, 247, 0.06)',
                        border: '1px solid rgba(163, 113, 247, 0.2)',
                      }}
                    >
                      <For each={Object.entries(parsedInput()?.answers ?? {})}>
                        {([question, answer]) => {
                          const item = (parsedInput()?.questions ?? []).find(
                            (q) => q.question === question,
                          );
                          return (
                            <div class="text-xs">
                              <span class="font-medium" style={{ color: '#a371f7' }}>
                                {item?.header ?? 'Q'}:
                              </span>
                              <span class="ml-1.5 text-text-primary">{String(answer)}</span>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
