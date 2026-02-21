// src/components/common/ModelSelector.tsx
// Model selector dropdown per SPEC-003 §2.1 (TitleBar center area).
// Shows current model with badge, dropdown with 3 options.

import type { Component } from 'solid-js';
import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { sessionState, changeSessionModel, getActiveSession } from '@/stores/sessionStore';

interface ModelOption {
  id: string;
  label: string;
  colorClass: string;
}

const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', colorClass: 'text-model-sonnet' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', colorClass: 'text-model-opus' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', colorClass: 'text-model-haiku' },
];

const ModelSelector: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false);
  let dropdownRef: HTMLDivElement | undefined;

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
  });
  onCleanup(() => {
    document.removeEventListener('mousedown', handleClickOutside);
  });

  function currentModel(): ModelOption {
    const session = getActiveSession();
    return MODELS.find((m) => m.id === session?.model) ?? MODELS[0];
  }

  function handleSelect(modelId: string) {
    changeSessionModel(modelId);
    setIsOpen(false);
  }

  return (
    <div ref={dropdownRef} class="relative">
      <button
        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors hover:bg-bg-elevated"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen());
        }}
        disabled={!sessionState.activeSessionId}
        aria-label="Select model"
        aria-expanded={isOpen()}
      >
        <span
          class={`inline-block w-2 h-2 rounded-full ${currentModel().colorClass}`}
          style={{ 'background-color': 'currentColor' }}
        />
        <span class="text-text-primary font-medium">{currentModel().label}</span>
        <ChevronDown size={12} class="text-text-tertiary" />
      </button>

      <Show when={isOpen()}>
        <div class="absolute top-full left-0 mt-1 w-44 bg-bg-elevated border border-border-primary rounded-lg shadow-lg overflow-hidden z-50">
          <For each={MODELS}>
            {(model) => (
              <button
                class={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${
                  model.id === currentModel().id
                    ? 'bg-accent-muted text-text-primary'
                    : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                }`}
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={() => handleSelect(model.id)}
              >
                <span
                  class={`inline-block w-2 h-2 rounded-full ${model.colorClass}`}
                  style={{ 'background-color': 'currentColor' }}
                />
                <span>{model.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ModelSelector;
