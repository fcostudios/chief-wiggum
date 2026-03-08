import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import type { ImportResult } from '@/lib/types';

interface ImportProgressProps {
  results: ImportResult[];
  isRunning: boolean;
  onClose: () => void;
}

const ImportProgress: Component<ImportProgressProps> = (props) => {
  const total = () => props.results.length;
  const imported = () => props.results.reduce((sum, item) => sum + item.messages_imported, 0);
  const skipped = () => props.results.filter((item) => item.outcome === 'skipped').length;
  const warnings = () => props.results.flatMap((item) => item.warnings);

  return (
    <div class="flex flex-col gap-3 p-4">
      <Show when={props.isRunning}>
        <div class="flex items-center gap-2 text-sm text-text-secondary">
          <div
            class="h-3 w-3 animate-spin rounded-full border-2"
            style={{
              'border-color': 'var(--color-accent)',
              'border-top-color': 'transparent',
            }}
          />
          Importing sessions...
        </div>
      </Show>

      <Show when={!props.isRunning && total() > 0}>
        <div class="text-sm font-medium text-text-primary">Import complete</div>
        <div class="grid grid-cols-3 gap-2 rounded-md bg-bg-inset p-3 text-center text-xs">
          <div>
            <div class="text-lg font-semibold text-accent">{total()}</div>
            <div class="text-text-tertiary">Sessions</div>
          </div>
          <div>
            <div class="text-lg font-semibold text-accent">{imported()}</div>
            <div class="text-text-tertiary">Messages</div>
          </div>
          <div>
            <div class="text-lg font-semibold text-text-secondary">{skipped()}</div>
            <div class="text-text-tertiary">Skipped</div>
          </div>
        </div>

        <Show when={warnings().length > 0}>
          <details class="rounded-md bg-bg-inset p-2 text-xs text-text-secondary">
            <summary class="cursor-pointer font-medium">
              {warnings().length} warning{warnings().length !== 1 ? 's' : ''}
            </summary>
            <ul class="mt-2 list-disc space-y-1 pl-4">
              <For each={warnings()}>{(warning) => <li>{warning}</li>}</For>
            </ul>
          </details>
        </Show>

        <button
          onClick={() => props.onClose()}
          class="mt-2 rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
        >
          Done
        </button>
      </Show>
    </div>
  );
};

export default ImportProgress;
