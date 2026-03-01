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
  color: string;
}

interface ModelSelectorProps {
  statusText?: string | null;
  statusColor?: string;
  statusPulse?: boolean;
  showModelWhenStatus?: boolean;
}

const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', color: 'var(--color-model-sonnet)' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', color: 'var(--color-model-opus)' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', color: 'var(--color-model-haiku)' },
];

const ModelSelector: Component<ModelSelectorProps> = (props) => {
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
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors hover:bg-bg-elevated/50"
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
          class="inline-block w-2 h-2 rounded-full"
          style={{
            'background-color': props.statusColor ?? currentModel().color,
            'box-shadow': props.statusPulse
              ? '0 0 6px rgba(63, 185, 80, 0.45)'
              : `0 0 4px ${currentModel().color}40`,
          }}
          classList={{ 'animate-pulse': !!props.statusPulse }}
        />
        <span class="text-text-primary font-medium tracking-tight">
          {props.statusText ?? currentModel().label}
        </span>
        <Show when={props.statusText && props.showModelWhenStatus}>
          <span class="text-text-tertiary" style={{ 'font-size': '11px' }}>
            — {currentModel().label}
          </span>
        </Show>
        <ChevronDown size={11} class="text-text-tertiary" />
      </button>

      <Show when={isOpen()}>
        <div
          class="absolute top-full left-1/2 mt-1.5 w-44 rounded-lg overflow-hidden z-50 animate-fade-in"
          style={{
            transform: 'translateX(-50%)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            'box-shadow': 'var(--shadow-lg), 0 0 0 1px rgba(0,0,0,0.1)',
            'backdrop-filter': 'blur(var(--glass-blur))',
            'animation-duration': '100ms',
          }}
        >
          <For each={MODELS}>
            {(model) => {
              const isSelected = () => model.id === currentModel().id;
              return (
                <button
                  class="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs transition-colors"
                  style={{
                    'transition-duration': 'var(--duration-fast)',
                    background: isSelected() ? 'rgba(232, 130, 90, 0.08)' : 'transparent',
                    color: isSelected()
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected()) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected()) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                    }
                  }}
                  onClick={() => handleSelect(model.id)}
                >
                  <span
                    class="inline-block w-2 h-2 rounded-full"
                    style={{
                      'background-color': model.color,
                      'box-shadow': isSelected() ? `0 0 6px ${model.color}60` : 'none',
                    }}
                  />
                  <span class="font-medium tracking-tight">{model.label}</span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ModelSelector;
