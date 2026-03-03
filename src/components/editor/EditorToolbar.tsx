import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { File, Save, GitCompare, Maximize2, X } from 'lucide-solid';
import { fileState, saveFileEdit } from '@/stores/fileStore';
import { uiState, toggleZenMode } from '@/stores/uiStore';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import { addToast } from '@/stores/toastStore';

interface EditorToolbarProps {
  onClose: () => void;
}

const EditorToolbar: Component<EditorToolbarProps> = (props) => {
  const fileName = () => {
    const path = fileState.editingFilePath;
    if (!path) return '';
    return path.split('/').pop() ?? path;
  };

  const languageBadge = () => {
    const path = fileState.editingFilePath ?? '';
    const ext = path.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript',
      js: 'JavaScript',
      jsx: 'JavaScript',
      rs: 'Rust',
      py: 'Python',
      css: 'CSS',
      html: 'HTML',
      json: 'JSON',
      md: 'Markdown',
    };
    return map[ext ?? ''] ?? ext?.toUpperCase() ?? '';
  };

  async function handleSave() {
    const projectId = projectState.activeProjectId;
    const path = fileState.editingFilePath;
    if (projectId && path) {
      await saveFileEdit(projectId, path);
    }
  }

  return (
    <div
      class="flex items-center justify-between px-3 shrink-0 animate-editor-toolbar-slide"
      style={{
        height: '40px',
        background: 'var(--color-bg-secondary)',
        'border-bottom': '1px solid var(--color-border-secondary)',
      }}
    >
      <div class="flex items-center gap-2 min-w-0">
        <File size={14} style={{ color: 'var(--color-accent)' }} />
        <span
          class="font-mono text-sm font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {fileName()}
        </span>
        <Show when={languageBadge()}>
          <span
            class="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border-secondary)',
            }}
          >
            {languageBadge()}
          </span>
        </Show>
        <span
          class="text-[10px] font-mono shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('editor.line')} {fileState.editorCursorLine}, {t('editor.column')}{' '}
          {fileState.editorCursorCol}
        </span>
      </div>

      <div class="flex items-center gap-1">
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
          style={{
            background: fileState.isDirty ? 'var(--color-accent)' : 'transparent',
            color: fileState.isDirty ? 'white' : 'var(--color-text-secondary)',
            border: fileState.isDirty ? 'none' : '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={() => void handleSave()}
          title="Save (⌘S)"
        >
          <Save size={12} />
          {t('editor.save')}
        </button>

        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={() => addToast('Diff view is not available yet (single-file v1)', 'info')}
          title={t('editor.diff')}
        >
          <GitCompare size={12} />
          {t('editor.diff')}
        </button>

        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{
            color: uiState.zenModeActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={toggleZenMode}
          title="Zen Mode (⌘⇧Z)"
        >
          <Maximize2 size={12} />
          {t('editor.zen')}
        </button>

        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={() => props.onClose()}
          title="Close (Esc)"
        >
          <X size={12} />
          {t('editor.close')}
        </button>
      </div>
    </div>
  );
};

export default EditorToolbar;
