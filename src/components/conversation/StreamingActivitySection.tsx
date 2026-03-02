// src/components/conversation/StreamingActivitySection.tsx
// Collapsible "Activity" section shown during an active streaming turn.
// Wraps tool_use/tool_result messages so response text remains the dominant element.

import { Component, createSignal, For, Show } from 'solid-js';
import { ChevronDown, ChevronRight, Zap } from 'lucide-solid';
import type { Message } from '@/lib/types';
import { ToolUseBlock } from '@/components/conversation/ToolUseBlock';
import { ToolResultBlock } from '@/components/conversation/ToolResultBlock';

interface StreamingActivitySectionProps {
  messages: Message[];
}

export const StreamingActivitySection: Component<StreamingActivitySectionProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <Show when={props.messages.length > 0}>
      <div class="flex justify-start mt-3 animate-fade-in">
        <div
          class="max-w-[85%] w-full rounded-md overflow-hidden"
          style={{
            background: 'rgba(22, 27, 34, 0.35)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          {/* Header */}
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded()}
            aria-label={`${expanded() ? 'Collapse' : 'Expand'} activity`}
          >
            <Zap size={13} class="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
            <span class="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              Activity
            </span>
            <span
              class="text-[10px] font-mono ml-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
            >
              {props.messages.filter((m) => m.role === 'tool_use').length} calls
            </span>
            <span class="flex-1" />
            <Show
              when={expanded()}
              fallback={<ChevronRight size={13} style={{ color: 'var(--color-text-tertiary)' }} />}
            >
              <ChevronDown size={13} style={{ color: 'var(--color-text-tertiary)' }} />
            </Show>
          </button>

          {/* Tool blocks */}
          <Show when={expanded()}>
            <div
              class="px-3 pb-3 space-y-1 border-t"
              style={{ 'border-color': 'var(--color-border-secondary)' }}
            >
              <For each={props.messages}>
                {(msg) => (
                  <div class="mt-2">
                    <Show when={msg.role === 'tool_use'}>
                      <ToolUseBlock message={msg} />
                    </Show>
                    <Show when={msg.role === 'tool_result'}>
                      <ToolResultBlock message={msg} />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};
