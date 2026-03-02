import { Component, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Copy, Check } from 'lucide-solid';
import type { Message, ToolResultData, ToolUseData } from '../../lib/types';
import { conversationState } from '@/stores/conversationStore';
import { extractInlineDiffPreview } from '@/lib/inlineDiff';
import { setActiveInlineDiff } from '@/stores/diffReviewStore';
import { setActiveView } from '@/stores/uiStore';
import { addToast } from '@/stores/toastStore';
import InlineDiff from './InlineDiff';
import { LiveToolOutput } from './LiveToolOutput';

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

function extractExitCode(content: string): string | null {
  const match = content.match(/(?:^|\n)Exit code\s+(\d+)\b/i);
  return match?.[1] ?? null;
}

function parseToolUseContent(content: string): ToolUseData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && 'tool_name' in parsed) {
      return parsed as ToolUseData;
    }
  } catch {
    // Best-effort only for pairing tool_result to tool_use
  }
  return null;
}

function findRelatedToolUse(toolUseId: string): ToolUseData | null {
  if (!toolUseId) return null;
  const messages = conversationState.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'tool_use') continue;
    const parsed = parseToolUseContent(msg.content);
    if (parsed?.tool_use_id === toolUseId) return parsed;
  }
  return null;
}

export const ToolResultBlock: Component<ToolResultBlockProps> = (props) => {
  const data = () => parseToolResultContent(props.message.content);
  const isError = () => data().is_error;
  const preview = () => resultPreview(data().content);
  const relatedToolUse = () => findRelatedToolUse(data().tool_use_id);
  const relatedToolName = () => relatedToolUse()?.tool_name ?? 'Tool';
  const toolOutput = () => conversationState.toolOutputs[data().tool_use_id] ?? null;
  const exitCode = () => (isError() ? extractExitCode(data().content) : null);
  const inlineDiff = () => {
    if (isError()) return null;
    const toolUse = relatedToolUse();
    return extractInlineDiffPreview(data().content, toolUse?.tool_name, toolUse?.tool_input);
  };

  const [expanded, setExpanded] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const toggleExpanded = () => setExpanded((prev) => !prev);
  const handleCopy = () => {
    navigator.clipboard.writeText(data().content).catch(() => {});
    setCopied(true);
    addToast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="flex justify-start">
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
        <Show when={toolOutput()}>
          {(output) => (
            <LiveToolOutput content={output()} toolName={relatedToolName()} isError={isError()} />
          )}
        </Show>

        {/* Header row */}
        <div class="group flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.02] transition-colors">
          <button
            class="flex min-w-0 flex-1 items-center gap-2 text-left"
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
              class="text-[11px] font-mono shrink-0"
              style={{
                color: isError()
                  ? 'var(--color-tool-permission-deny)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              {isError() ? 'Tool Error' : 'Tool Result'}
            </span>
            <span class="text-[11px] text-text-tertiary/80 shrink-0">•</span>
            <span
              class="text-[11px] font-mono shrink-0"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {relatedToolName()}
            </span>
            <span
              class="text-[11px] font-mono truncate flex-1"
              style={{
                color: isError()
                  ? 'var(--color-tool-permission-deny)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              {expanded()
                ? isError()
                  ? `Execution output${exitCode() ? ` (exit ${exitCode()})` : ''}`
                  : 'Execution output'
                : preview()}
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
          <button
            class="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 shrink-0"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            aria-label="Copy tool result"
            title="Copy tool result"
          >
            <Show when={copied()} fallback={<Copy size={11} color="var(--color-text-tertiary)" />}>
              <Check size={11} color="var(--color-success)" />
            </Show>
          </button>
        </div>

        {/* Expanded content — result output */}
        <Show when={expanded()}>
          <div
            class="px-3 pb-2 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <Show when={isError()}>
              <div
                class="mt-2 rounded px-2.5 py-1.5 text-[10px] leading-relaxed"
                style={{
                  color: 'var(--color-tool-permission-deny)',
                  background: 'rgba(248, 81, 73, 0.06)',
                  border: '1px solid rgba(248, 81, 73, 0.2)',
                }}
              >
                Tool execution failed in <span class="font-mono">{relatedToolName()}</span>
                <Show when={exitCode()}>{(code) => <span> (exit {code()})</span>}</Show>. This is
                tool output, not a Chief Wiggum UI error.
              </div>
            </Show>

            <Show when={inlineDiff()}>
              {(diff) => (
                <InlineDiff
                  preview={diff()}
                  showOpenInDiff
                  onOpenInDiff={() => {
                    setActiveInlineDiff(diff());
                    setActiveView('diff');
                  }}
                />
              )}
            </Show>

            <Show when={inlineDiff()}>
              <div
                class="mt-2 text-[10px] font-mono px-2 py-1 rounded"
                style={{
                  color: 'var(--color-text-tertiary)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                Raw tool output
              </div>
            </Show>
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
