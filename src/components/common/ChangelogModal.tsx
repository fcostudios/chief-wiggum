// src/components/common/ChangelogModal.tsx
// "What's New" modal content (CHI-254).

import type { Component } from 'solid-js';
import { Show, createSignal, onMount } from 'solid-js';
import { X } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import { t } from '@/stores/i18nStore';

interface ChangelogModalProps {
  onClose: () => void;
}

const ChangelogModal: Component<ChangelogModalProps> = (props) => {
  const [content, setContent] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const text = await invoke<string>('read_changelog');
      setContent(text.trim().length > 0 ? text : null);
    } catch {
      setContent(null);
    }
  });

  return (
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.55)', 'backdrop-filter': 'blur(4px)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        class="w-full max-w-[640px] max-h-[75vh] rounded-xl overflow-hidden animate-fade-in"
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-xl)',
        }}
      >
        <header
          class="flex items-center justify-between px-4 py-3"
          style={{
            background: 'var(--color-bg-secondary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          <h2 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('help.changelogTitle')}
          </h2>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onClose()}
            aria-label={t('common.close')}
          >
            <X size={14} />
          </button>
        </header>

        <div class="px-4 py-3 overflow-auto text-xs leading-relaxed max-h-[calc(75vh-52px)]">
          <Show
            when={content()}
            fallback={
              <p class="text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('help.changelogEmpty')}
              </p>
            }
          >
            <pre
              class="whitespace-pre-wrap font-mono text-[11px]"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {content()}
            </pre>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;
