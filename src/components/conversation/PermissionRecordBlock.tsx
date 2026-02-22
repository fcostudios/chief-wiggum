// src/components/conversation/PermissionRecordBlock.tsx
// Inline permission outcome display per CHI-91.
// Shows a compact, collapsible record of allowed/denied/yolo permission decisions.

import type { Component } from 'solid-js';
import { Show, Switch, Match, createSignal } from 'solid-js';
import { CheckCircle, XCircle, Zap, ChevronDown, ChevronRight } from 'lucide-solid';
import type { Message, PermissionRecordData } from '../../lib/types';

interface PermissionRecordBlockProps {
  message: Message;
}

function parsePermissionContent(content: string): PermissionRecordData {
  try {
    return JSON.parse(content) as PermissionRecordData;
  } catch {
    return { tool: 'Unknown', command: content, outcome: 'denied', risk_level: 'low' };
  }
}

function outcomeColor(outcome: PermissionRecordData['outcome']): string {
  switch (outcome) {
    case 'allowed':
      return 'var(--color-success)';
    case 'denied':
      return 'var(--color-error)';
    case 'yolo':
      return 'var(--color-warning)';
  }
}

function outcomeLabel(outcome: PermissionRecordData['outcome']): string {
  switch (outcome) {
    case 'allowed':
      return 'Allowed';
    case 'denied':
      return 'Denied';
    case 'yolo':
      return 'Auto-approved (YOLO)';
  }
}

export const PermissionRecordBlock: Component<PermissionRecordBlockProps> = (props) => {
  const data = () => parsePermissionContent(props.message.content);
  const color = () => outcomeColor(data().outcome);
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="flex justify-start">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-primary)',
        }}
      >
        <div class="flex">
          <div class="w-[3px] shrink-0" style={{ background: color() }} />
          <div class="flex-1 min-w-0">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => setExpanded((p) => !p)}
              aria-expanded={expanded()}
            >
              <Switch>
                <Match when={data().outcome === 'allowed'}>
                  <CheckCircle size={12} color={color()} />
                </Match>
                <Match when={data().outcome === 'denied'}>
                  <XCircle size={12} color={color()} />
                </Match>
                <Match when={data().outcome === 'yolo'}>
                  <Zap size={12} color={color()} />
                </Match>
              </Switch>
              <span class="text-xs font-mono" style={{ color: color() }}>
                {data().tool}
              </span>
              <span class="text-[11px] text-text-tertiary truncate flex-1">
                {outcomeLabel(data().outcome)}
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

            <Show when={expanded()}>
              <div
                class="px-3 pb-2 border-t"
                style={{ 'border-color': 'var(--color-border-secondary)' }}
              >
                <pre
                  class="mt-1.5 rounded overflow-x-auto text-xs leading-5"
                  style={{
                    'font-family': 'var(--font-mono)',
                    background: 'var(--color-bg-inset)',
                    padding: '8px 12px',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <code>{data().command}</code>
                </pre>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
