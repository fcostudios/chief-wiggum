// src/components/actions/ActionArgPrompt.tsx
// Inline argument prompt for templated custom actions (CHI-145 Phase 2).

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { ActionArgTemplate, ActionDefinition } from '@/lib/types';

interface ActionArgPromptProps {
  action: ActionDefinition;
  onRun: (values: Record<string, string>) => void | Promise<void>;
  onCancel: () => void;
}

const ActionArgPrompt: Component<ActionArgPromptProps> = (props) => {
  const templates = () => props.action.args ?? [];
  const [values, setValues] = createSignal<Record<string, string>>(buildInitialValues(templates()));
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const validationError = createMemo(() => validateArgs(templates(), values()));

  function setArgValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleRun() {
    const error = validationError();
    if (error) return;

    setIsSubmitting(true);
    try {
      await props.onRun(values());
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      class="mx-2 mb-2 rounded-md p-2 space-y-2"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-secondary)',
      }}
    >
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Run <span class="font-mono">{props.action.name}</span> with arguments
          </p>
          <p class="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            Fill required placeholders before starting the action.
          </p>
        </div>
      </div>

      <div class="space-y-2">
        <For each={templates()}>
          {(arg) => (
            <label class="flex flex-col gap-1">
              <div class="flex items-center gap-1.5">
                <span
                  class="text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {arg.name}
                </span>
                <Show when={arg.required}>
                  <span class="text-[9px]" style={{ color: 'var(--color-warning)' }}>
                    required
                  </span>
                </Show>
                <Show when={arg.description}>
                  <span class="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {arg.description}
                  </span>
                </Show>
              </div>

              <Show
                when={arg.type === 'enum' && (arg.options?.length ?? 0) > 0}
                fallback={
                  <input
                    type="text"
                    value={values()[arg.name] ?? ''}
                    onInput={(e) => setArgValue(arg.name, e.currentTarget.value)}
                    placeholder={arg.default ?? `Enter ${arg.name}`}
                    class="w-full rounded-md px-2 py-1.5 text-xs outline-none"
                    style={{
                      background: 'var(--color-bg-inset)',
                      border: '1px solid var(--color-border-secondary)',
                      color: 'var(--color-text-primary)',
                      'font-family': 'var(--font-mono)',
                    }}
                  />
                }
              >
                <select
                  value={values()[arg.name] ?? ''}
                  onChange={(e) => setArgValue(arg.name, e.currentTarget.value)}
                  class="rounded-md px-2 py-1.5 text-xs outline-none"
                  style={{
                    background: 'var(--color-bg-inset)',
                    border: '1px solid var(--color-border-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <For each={arg.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
                </select>
              </Show>
            </label>
          )}
        </For>
      </div>

      <Show when={validationError()}>
        {(error) => (
          <p class="text-[10px]" style={{ color: 'var(--color-error)' }}>
            {error()}
          </p>
        )}
      </Show>

      <div class="flex items-center justify-end gap-2">
        <button
          class="px-2 py-0.5 rounded text-[10px]"
          style={{
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-secondary)',
            background: 'var(--color-bg-elevated)',
          }}
          onClick={() => props.onCancel()}
          disabled={isSubmitting()}
        >
          Cancel
        </button>
        <button
          class="px-2 py-0.5 rounded text-[10px] font-medium"
          style={{
            color: 'white',
            background: 'var(--color-accent)',
            opacity: isSubmitting() ? '0.7' : '1',
          }}
          onClick={() => void handleRun()}
          disabled={isSubmitting()}
        >
          {isSubmitting() ? 'Starting…' : 'Run'}
        </button>
      </div>
    </div>
  );
};

function buildInitialValues(args: ActionArgTemplate[]): Record<string, string> {
  const entries = args.map((arg) => {
    let value = arg.default ?? '';
    if (!value && arg.type === 'enum' && (arg.options?.length ?? 0) > 0) {
      value = arg.options?.[0] ?? '';
    }
    return [arg.name, value] as const;
  });
  return Object.fromEntries(entries);
}

function validateArgs(args: ActionArgTemplate[], values: Record<string, string>): string | null {
  for (const arg of args) {
    const value = (values[arg.name] ?? '').trim();
    if (arg.required && value.length === 0) {
      return `Argument "${arg.name}" is required`;
    }
    if (value.length > 0 && arg.type === 'enum' && arg.options && !arg.options.includes(value)) {
      return `Argument "${arg.name}" must be one of: ${arg.options.join(', ')}`;
    }
  }
  return null;
}

export default ActionArgPrompt;
