// src/components/common/AboutModal.tsx
// Lightweight app metadata dialog (CHI-254).

import type { Component } from 'solid-js';
import { X } from 'lucide-solid';
import { t } from '@/stores/i18nStore';

interface AboutModalProps {
  onClose: () => void;
}

const AboutModal: Component<AboutModalProps> = (props) => {
  const env = import.meta.env as Record<string, string | undefined>;
  const version = env.PACKAGE_VERSION ?? env.VITE_APP_VERSION ?? 'dev';
  const build = env.MODE ?? 'development';

  return (
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.55)', 'backdrop-filter': 'blur(4px)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        class="w-full max-w-[420px] rounded-xl overflow-hidden animate-fade-in"
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
            {t('help.about')}
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

        <div class="px-4 py-4 space-y-2 text-xs">
          <div class="flex items-center justify-between gap-3">
            <span style={{ color: 'var(--color-text-tertiary)' }}>{t('help.version')}</span>
            <code style={{ color: 'var(--color-text-primary)' }}>{version}</code>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span style={{ color: 'var(--color-text-tertiary)' }}>{t('help.build')}</span>
            <code style={{ color: 'var(--color-text-primary)' }}>{build}</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
