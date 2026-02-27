import type { Component } from 'solid-js';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { CheckCircle, ChevronDown, ChevronRight, Circle } from 'lucide-solid';
import { t } from '@/stores/i18nStore';
import type { Message, TodoItem, TodoWriteData, ToolUseData } from '@/lib/types';

function parseTodos(toolInput: string): TodoItem[] {
  try {
    const parsed = JSON.parse(toolInput) as TodoWriteData;
    if (Array.isArray(parsed.todos)) {
      return parsed.todos;
    }
  } catch {
    // malformed payloads should not break rendering
  }
  return [];
}

function todoCounts(todos: TodoItem[]): { done: number; inProgress: number } {
  return {
    done: todos.filter((item) => item.status === 'completed').length,
    inProgress: todos.filter((item) => item.status === 'in_progress').length,
  };
}

function statusColor(status: TodoItem['status']): string {
  switch (status) {
    case 'completed':
      return 'var(--color-success)';
    case 'in_progress':
      return 'var(--color-warning)';
    case 'pending':
      return 'var(--color-text-tertiary)';
  }
}

const StatusIcon: Component<{ status: TodoItem['status'] }> = (props) => (
  <Switch>
    <Match when={props.status === 'completed'}>
      <CheckCircle size={12} color="var(--color-success)" />
    </Match>
    <Match when={props.status === 'in_progress'}>
      <div
        class="w-3 h-3 rounded-full border-2 animate-spin shrink-0"
        style={{
          'border-color': 'var(--color-warning)',
          'border-top-color': 'transparent',
        }}
        role="img"
        aria-label="in progress"
      />
    </Match>
    <Match when={props.status === 'pending'}>
      <Circle size={12} color="var(--color-text-tertiary)" />
    </Match>
  </Switch>
);

export const TodoWriteBlock: Component<{ message: Message }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const todos = (): TodoItem[] => {
    try {
      const parsed = JSON.parse(props.message.content) as ToolUseData;
      return parseTodos(parsed.tool_input ?? '');
    } catch {
      return [];
    }
  };

  const counts = () => todoCounts(todos());
  const total = () => todos().length;

  const progressLabel = () => {
    if (total() === 0) return '';
    if (counts().done === total()) return t('todoBlock.allDone', { n: total() });
    return t('todoBlock.progress', { done: counts().done, total: total() });
  };

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
          <div class="w-[3px] shrink-0" style={{ background: 'var(--color-accent)' }} />

          <div class="flex-1 min-w-0">
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded()}
              aria-label={`${expanded() ? 'Collapse' : 'Expand'} task list`}
            >
              <span
                style={{ color: 'var(--color-accent)', 'font-size': '10px', 'flex-shrink': '0' }}
              >
                ✦
              </span>

              <span
                class="text-xs font-semibold shrink-0"
                style={{ color: 'var(--color-accent)', 'font-family': 'var(--font-ui)' }}
              >
                {t('todoBlock.header')}
              </span>

              <Show when={progressLabel()}>
                <span
                  class="text-xs flex-1 truncate"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {progressLabel()}
                </span>
              </Show>
              <Show when={!progressLabel()}>
                <span class="flex-1" />
              </Show>

              <Show when={!expanded() && counts().inProgress > 0}>
                <span
                  class="text-[10px] px-1 py-0.5 rounded shrink-0"
                  style={{
                    color: 'var(--color-warning)',
                    background: 'var(--color-warning-muted)',
                    'font-family': 'var(--font-mono)',
                  }}
                >
                  {`⟳ ${counts().inProgress}`}
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

            <Show when={expanded()}>
              <div
                class="px-3 pb-2 pt-1 border-t"
                style={{ 'border-color': 'var(--color-border-secondary)' }}
                role="list"
                aria-label="Task list"
              >
                <For each={todos()}>
                  {(item) => (
                    <div
                      class="flex items-start gap-2.5 py-1.5"
                      role="listitem"
                      data-status={item.status}
                    >
                      <div class="mt-0.5 shrink-0">
                        <StatusIcon status={item.status} />
                      </div>
                      <span
                        class="text-xs leading-relaxed"
                        style={{ color: statusColor(item.status) }}
                      >
                        {item.content}
                      </span>
                    </div>
                  )}
                </For>

                <Show when={todos().length === 0}>
                  <p class="text-xs py-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('todoBlock.empty')}
                  </p>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
