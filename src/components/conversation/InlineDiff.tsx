import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight, FileDiff, ExternalLink } from 'lucide-solid';
import hljs from 'highlight.js';
import type { InlineDiffPreview } from '@/lib/inlineDiff';

interface InlineDiffProps {
  preview: InlineDiffPreview;
  defaultExpanded?: boolean;
  showOpenInDiff?: boolean;
  onOpenInDiff?: () => void;
}

type DiffLineKind = 'meta' | 'hunk' | 'add' | 'remove' | 'context';

function classifyDiffLine(line: string): DiffLineKind {
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode')
  ) {
    return 'meta';
  }
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  return 'context';
}

function lineStyles(kind: DiffLineKind): Record<string, string> {
  switch (kind) {
    case 'add':
      return {
        background: 'var(--color-diff-add-bg)',
        color: 'var(--color-diff-add-text)',
      };
    case 'remove':
      return {
        background: 'var(--color-diff-remove-bg)',
        color: 'var(--color-diff-remove-text)',
      };
    case 'hunk':
      return {
        background: 'var(--color-diff-modify-bg)',
        color: 'var(--color-text-primary)',
      };
    case 'meta':
      return {
        color: 'var(--color-text-tertiary)',
        background: 'rgba(255, 255, 255, 0.015)',
      };
    case 'context':
      return {
        color: 'var(--color-text-secondary)',
      };
  }
}

const InlineDiff: Component<InlineDiffProps> = (props) => {
  const [expanded, setExpanded] = createSignal(props.defaultExpanded ?? false);

  const lines = createMemo(() => props.preview.diffText.split('\n'));
  const renderedLines = createMemo(() =>
    lines().map((line) => {
      const safeLine = line.length === 0 ? ' ' : line;
      const kind = classifyDiffLine(line);
      let html = safeLine;
      try {
        html = hljs.highlight(safeLine, { language: 'diff', ignoreIllegals: true }).value;
      } catch {
        html = safeLine.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      }
      return { html, kind };
    }),
  );

  const summary = () => `+${props.preview.addedLines} / -${props.preview.removedLines}`;

  return (
    <div
      class="mt-2 rounded-md overflow-hidden"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-primary)',
      }}
    >
      <div class="flex">
        <div class="w-[3px] shrink-0" style={{ background: 'var(--color-tool-file)' }} />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 px-3 py-2">
            <button
              class="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-90 transition-opacity"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded()}
              aria-label={`${expanded() ? 'Collapse' : 'Expand'} diff preview`}
            >
              <FileDiff size={13} color="var(--color-tool-file)" class="shrink-0" />
              <span class="text-xs font-mono font-medium truncate text-text-primary">
                {props.preview.filePath}
              </span>
              <span class="text-[10px] font-mono shrink-0 text-text-tertiary">{summary()}</span>
              <Show
                when={expanded()}
                fallback={
                  <ChevronRight
                    size={13}
                    color="var(--color-text-tertiary)"
                    class="shrink-0 ml-auto"
                  />
                }
              >
                <ChevronDown
                  size={13}
                  color="var(--color-text-tertiary)"
                  class="shrink-0 ml-auto"
                />
              </Show>
            </button>

            <Show when={props.showOpenInDiff && props.onOpenInDiff}>
              <button
                class="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
                style={{
                  color: 'var(--color-accent)',
                  background: 'rgba(232, 130, 90, 0.08)',
                  border: '1px solid rgba(232, 130, 90, 0.18)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onOpenInDiff?.();
                }}
                title="Open in Diff view"
              >
                <ExternalLink size={11} />
                <span>Open in Diff</span>
              </button>
            </Show>
          </div>

          <Show when={expanded()}>
            <div
              class="border-t px-2 pb-2"
              style={{ 'border-color': 'var(--color-border-secondary)' }}
            >
              <pre
                class="mt-2 rounded overflow-auto text-xs leading-5 max-h-[260px]"
                style={{
                  background: 'var(--color-bg-inset)',
                  border: '1px solid var(--color-border-secondary)',
                  'font-family': 'var(--font-mono)',
                }}
              >
                <code class="block p-0">
                  <For each={renderedLines()}>
                    {(line) => (
                      <div
                        class="px-3 py-[1px] whitespace-pre-wrap break-all"
                        style={lineStyles(line.kind)}
                      >
                        {/* eslint-disable-next-line solid/no-innerhtml -- highlight.js output is escaped */}
                        <span class="hljs bg-transparent p-0" innerHTML={line.html || '&nbsp;'} />
                      </div>
                    )}
                  </For>
                </code>
              </pre>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default InlineDiff;
