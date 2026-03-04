import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { Lightbulb, Plus } from 'lucide-solid';
import type { FileReference, FileSuggestion } from '@/lib/types';
import { addFileReference, contextState } from '@/stores/contextStore';

const ContextSuggestions: Component = () => {
  function handleAdd(suggestion: FileSuggestion): void {
    const parts = suggestion.path.split('/');
    const name = parts[parts.length - 1] ?? suggestion.path;
    const extension = name.includes('.') ? (name.split('.').pop() ?? null) : null;

    const ref: FileReference = {
      relative_path: suggestion.path,
      name,
      extension,
      estimated_tokens: suggestion.estimated_tokens,
      is_directory: false,
    };

    addFileReference(ref, 'referenced');
  }

  return (
    <Show when={contextState.suggestions.length > 0}>
      <div class="flex items-center gap-1.5 mb-2 max-w-4xl mx-auto overflow-x-auto">
        <Lightbulb size={10} style={{ color: 'var(--color-warning)' }} class="shrink-0" />
        <span class="text-[10px] text-text-tertiary shrink-0">Suggested:</span>
        <For each={contextState.suggestions}>
          {(suggestion) => (
            <button
              type="button"
              class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 transition-colors"
              style={{
                background: 'var(--color-bg-inset)',
                color: 'var(--color-text-secondary)',
                border: '1px dashed var(--color-border-secondary)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onClick={() => handleAdd(suggestion)}
              title={`${suggestion.path} — ${suggestion.reason} (~${suggestion.estimated_tokens} tokens)`}
            >
              <span class="truncate max-w-[120px]">
                {suggestion.path.split('/').pop() ?? suggestion.path}
              </span>
              <Plus size={9} />
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

export default ContextSuggestions;
