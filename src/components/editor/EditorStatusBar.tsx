import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Check } from 'lucide-solid';
import { fileState } from '@/stores/fileStore';
import { t } from '@/stores/i18nStore';

const EditorStatusBar: Component = () => {
  const saveStatusText = () => {
    switch (fileState.saveStatus) {
      case 'saving':
        return t('editor.saving');
      case 'saved':
        return t('editor.saved');
      case 'error':
        return t('editor.saveFailed');
      default:
        return fileState.isDirty ? t('editor.unsaved') : '';
    }
  };

  const saveStatusColor = () => {
    switch (fileState.saveStatus) {
      case 'saving':
        return 'var(--color-text-tertiary)';
      case 'saved':
        return 'var(--color-success)';
      case 'error':
        return 'var(--color-error)';
      default:
        return fileState.isDirty ? 'var(--color-warning)' : 'transparent';
    }
  };

  return (
    <div
      class="flex items-center justify-between px-3 shrink-0 font-mono select-none"
      style={{
        height: '24px',
        background: 'var(--color-bg-inset)',
        'font-size': '11px',
        color: 'var(--color-text-tertiary)',
      }}
    >
      <div class="flex items-center gap-2">
        <span>
          {t('editor.line')} {fileState.editorCursorLine}, {t('editor.column')}{' '}
          {fileState.editorCursorCol}
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{t('editor.utf8')}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>2 {t('editor.spaces')}</span>
      </div>

      <div class="flex items-center gap-1" style={{ color: saveStatusColor() }}>
        <Show when={fileState.saveStatus === 'saved'}>
          <Check size={10} />
        </Show>
        <Show when={fileState.isDirty && fileState.saveStatus === 'idle'}>
          <span>●</span>
        </Show>
        <span>{saveStatusText()}</span>
      </div>
    </div>
  );
};

export default EditorStatusBar;
