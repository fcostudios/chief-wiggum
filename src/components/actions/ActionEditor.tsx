// src/components/actions/ActionEditor.tsx
// Inline editor for creating/editing custom actions (CHI-145).

import type { Component } from 'solid-js';
import { For, createMemo, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';
import type { ActionCategory, CustomActionDraft } from '@/lib/types';

interface ActionEditorProps {
  initialDraft?: Partial<CustomActionDraft>;
  isSaving?: boolean;
  onSave: (draft: CustomActionDraft) => void | Promise<void>;
  onCancel: () => void;
}

const CATEGORY_OPTIONS: ActionCategory[] = ['dev', 'build', 'test', 'lint', 'deploy', 'custom'];

const ActionEditor: Component<ActionEditorProps> = (props) => {
  const [name, setName] = createSignal(props.initialDraft?.name ?? '');
  const [command, setCommand] = createSignal(props.initialDraft?.command ?? '');
  const [workingDir, setWorkingDir] = createSignal(props.initialDraft?.working_dir ?? '');
  const [category, setCategory] = createSignal<ActionCategory>(
    props.initialDraft?.category ?? 'custom',
  );
  const [description, setDescription] = createSignal(props.initialDraft?.description ?? '');
  const [isLongRunning, setIsLongRunning] = createSignal(
    props.initialDraft?.is_long_running ?? false,
  );
  const [showAdvanced, setShowAdvanced] = createSignal(
    Boolean(
      props.initialDraft?.before_commands?.length ||
        props.initialDraft?.after_commands?.length ||
        (props.initialDraft?.env_vars && Object.keys(props.initialDraft.env_vars).length > 0),
    ),
  );
  const [beforeCommandsText, setBeforeCommandsText] = createSignal(
    (props.initialDraft?.before_commands ?? []).join('\n'),
  );
  const [afterCommandsText, setAfterCommandsText] = createSignal(
    (props.initialDraft?.after_commands ?? []).join('\n'),
  );
  const [envVarsText, setEnvVarsText] = createSignal(
    props.initialDraft?.env_vars
      ? Object.entries(props.initialDraft.env_vars)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      : '',
  );

  const nameError = createMemo(() => (name().trim().length === 0 ? 'Name is required' : null));
  const commandError = createMemo(() =>
    command().trim().length === 0 ? 'Command is required' : null,
  );
  const envVarsParse = createMemo(() => parseEnvVars(envVarsText()));
  const envError = createMemo(() => envVarsParse().error ?? null);

  function handleSave() {
    if (nameError() || commandError() || envError()) return;

    const beforeCommands = parseCommandLines(beforeCommandsText());
    const afterCommands = parseCommandLines(afterCommandsText());

    void props.onSave({
      name: name().trim(),
      command: command().trim(),
      working_dir: workingDir().trim(),
      category: category(),
      description: description().trim() === '' ? null : description().trim(),
      is_long_running: isLongRunning(),
      before_commands: beforeCommands.length > 0 ? beforeCommands : undefined,
      after_commands: afterCommands.length > 0 ? afterCommands : undefined,
      env_vars: envVarsParse().envVars,
      args: props.initialDraft?.args,
    });
  }

  return (
    <div
      class="mx-1 mb-2 rounded-lg p-2.5 space-y-2"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-secondary)',
      }}
    >
      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 col-span-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-tertiary)' }}>
            Name
          </span>
          <input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="seed-db"
            class="w-full rounded-md px-2 py-1.5 text-xs outline-none"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
              'font-family': 'var(--font-mono)',
            }}
          />
          {nameError() && (
            <span class="text-[10px]" style={{ color: 'var(--color-error)' }}>
              {nameError()}
            </span>
          )}
        </label>

        <label class="flex flex-col gap-1 col-span-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-tertiary)' }}>
            Command
          </span>
          <input
            type="text"
            value={command()}
            onInput={(e) => setCommand(e.currentTarget.value)}
            placeholder="npm run seed"
            class="w-full rounded-md px-2 py-1.5 text-xs outline-none"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
              'font-family': 'var(--font-mono)',
            }}
          />
          {commandError() && (
            <span class="text-[10px]" style={{ color: 'var(--color-error)' }}>
              {commandError()}
            </span>
          )}
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-tertiary)' }}>
            Category
          </span>
          <select
            value={category()}
            onChange={(e) => setCategory(e.currentTarget.value as ActionCategory)}
            class="rounded-md px-2 py-1.5 text-xs outline-none"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
            }}
          >
            <For each={CATEGORY_OPTIONS}>{(opt) => <option value={opt}>{opt}</option>}</For>
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-tertiary)' }}>
            Working Dir
          </span>
          <input
            type="text"
            value={workingDir()}
            onInput={(e) => setWorkingDir(e.currentTarget.value)}
            placeholder="Project root"
            class="rounded-md px-2 py-1.5 text-xs outline-none"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
              'font-family': 'var(--font-mono)',
            }}
          />
        </label>

        <label class="flex flex-col gap-1 col-span-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-tertiary)' }}>
            Description
          </span>
          <input
            type="text"
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="Optional description"
            class="w-full rounded-md px-2 py-1.5 text-xs outline-none"
            style={{
              background: 'var(--color-bg-inset)',
              border: '1px solid var(--color-border-secondary)',
              color: 'var(--color-text-primary)',
            }}
          />
        </label>
      </div>

      <label class="flex items-center gap-2 px-0.5">
        <input
          type="checkbox"
          checked={isLongRunning()}
          onChange={(e) => setIsLongRunning(e.currentTarget.checked)}
        />
        <span class="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Long-running action (dev server, watch task)
        </span>
      </label>

      <div
        class="rounded-md"
        style={{ border: '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="w-full flex items-center gap-2 px-2 py-1.5 text-left"
          style={{ 'background-color': 'var(--color-bg-elevated)' }}
          onClick={() => setShowAdvanced((prev) => !prev)}
          type="button"
        >
          {showAdvanced() ? (
            <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'var(--color-text-tertiary)' }} />
          )}
          <span
            class="text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Advanced
          </span>
        </button>

        {showAdvanced() && (
          <div class="p-2.5 space-y-2" style={{ background: 'var(--color-bg-secondary)' }}>
            <label class="flex flex-col gap-1">
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Before Commands (one per line)
              </span>
              <textarea
                rows={2}
                value={beforeCommandsText()}
                onInput={(e) => setBeforeCommandsText(e.currentTarget.value)}
                class="w-full rounded-md px-2 py-1.5 text-xs outline-none resize-y"
                style={{
                  background: 'var(--color-bg-inset)',
                  border: '1px solid var(--color-border-secondary)',
                  color: 'var(--color-text-primary)',
                  'font-family': 'var(--font-mono)',
                }}
              />
            </label>

            <label class="flex flex-col gap-1">
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                After Commands (one per line)
              </span>
              <textarea
                rows={2}
                value={afterCommandsText()}
                onInput={(e) => setAfterCommandsText(e.currentTarget.value)}
                class="w-full rounded-md px-2 py-1.5 text-xs outline-none resize-y"
                style={{
                  background: 'var(--color-bg-inset)',
                  border: '1px solid var(--color-border-secondary)',
                  color: 'var(--color-text-primary)',
                  'font-family': 'var(--font-mono)',
                }}
              />
            </label>

            <label class="flex flex-col gap-1">
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Env Vars (KEY=VALUE per line)
              </span>
              <textarea
                rows={3}
                value={envVarsText()}
                onInput={(e) => setEnvVarsText(e.currentTarget.value)}
                class="w-full rounded-md px-2 py-1.5 text-xs outline-none resize-y"
                style={{
                  background: 'var(--color-bg-inset)',
                  border: '1px solid var(--color-border-secondary)',
                  color: 'var(--color-text-primary)',
                  'font-family': 'var(--font-mono)',
                }}
              />
              {envError() && (
                <span class="text-[10px]" style={{ color: 'var(--color-error)' }}>
                  {envError()}
                </span>
              )}
            </label>
          </div>
        )}
      </div>

      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          class="px-2 py-1 rounded text-xs"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={() => props.onCancel()}
          disabled={props.isSaving}
        >
          Cancel
        </button>
        <button
          class="px-2.5 py-1 rounded text-xs font-medium"
          style={{
            color: 'white',
            background: 'var(--color-accent)',
            opacity: props.isSaving ? '0.7' : '1',
          }}
          onClick={handleSave}
          disabled={props.isSaving}
        >
          {props.isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

function parseCommandLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseEnvVars(
  text: string,
): { envVars: Record<string, string> | undefined; error?: string } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { envVars: undefined };

  const envVars: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx <= 0) {
      return { envVars: undefined, error: `Invalid env var entry: ${line}` };
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (!key) {
      return { envVars: undefined, error: `Invalid env var entry: ${line}` };
    }
    envVars[key] = value;
  }

  return { envVars };
}

export default ActionEditor;
