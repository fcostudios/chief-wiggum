// src/components/editor/EditorTakeover.tsx
// Full-width editor rendered in Z3 center stage (CHI-244).

import type { Component } from 'solid-js';
import { Show, createEffect, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  clearConflict,
  closeEditorTakeover,
  fileState,
  openEditorTakeover,
  saveFileEdit,
  setConflictDetected,
  setEditBuffer,
  setEditorCursorPosition,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { uiState, exitZenMode } from '@/stores/uiStore';
import { addToast } from '@/stores/toastStore';
import { createLogger } from '@/lib/logger';
import { t } from '@/stores/i18nStore';
import EditorToolbar from './EditorToolbar';
import EditorStatusBar from './EditorStatusBar';

const log = createLogger('ui/editor-takeover');
const MTIME_POLL_INTERVAL = 2000;

/** Lazy-load a CodeMirror language extension from file extension. */
async function loadLanguageExtension(filePath: string): Promise<Extension | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({
        typescript: ext === 'ts' || ext === 'tsx',
        jsx: ext === 'tsx' || ext === 'jsx',
      });
    }
    case 'rs': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'py': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'md': {
      const { markdown } = await import('@codemirror/lang-markdown');
      return markdown();
    }
    default:
      return null;
  }
}

const EditorTakeover: Component = () => {
  let editorContainerRef: HTMLDivElement | undefined;
  let editorView: EditorView | undefined;
  let mtimePoller: ReturnType<typeof setInterval> | null = null;
  let mountedPath: string | null = null;

  function destroyEditor() {
    if (editorView) {
      editorView.destroy();
      editorView = undefined;
    }
  }

  async function handleSave(): Promise<void> {
    const projectId = projectState.activeProjectId;
    const path = fileState.editingFilePath;
    if (projectId && path) {
      await saveFileEdit(projectId, path);
    }
  }

  function handleClose() {
    if (fileState.isDirty) {
      const confirmed = window.confirm(t('editor.unsavedPromptMessage'));
      if (!confirmed) return;
    }
    if (uiState.zenModeActive) {
      exitZenMode();
    }
    closeEditorTakeover();
  }

  async function mountEditorForPath(path: string): Promise<void> {
    if (!editorContainerRef) return;
    const doc = fileState.fullContent ?? '';
    destroyEditor();
    mountedPath = path;

    const langExt = await loadLanguageExtension(path);
    const extensions: Extension[] = [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      indentOnInput(),
      search(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...foldKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: 'Mod-s',
          run: () => {
            void handleSave();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          setEditorCursorPosition(line.number, pos - line.from + 1);
        }
        if (update.docChanged) {
          setEditBuffer(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': {
          fontSize: '14px',
          fontFamily: 'var(--font-mono)',
        },
        '.cm-content': {
          lineHeight: '1.6',
        },
        '.cm-gutters': {
          background: 'var(--color-bg-inset)',
          borderRight: '1px solid var(--color-border-secondary)',
        },
      }),
      EditorView.editable.of(!fileState.isReadonly),
    ];
    if (langExt) extensions.push(langExt);

    const startState = EditorState.create({
      doc,
      extensions,
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainerRef,
    });

    if (fileState.editorCursorLine > 1) {
      const line = editorView.state.doc.line(
        Math.min(fileState.editorCursorLine, editorView.state.doc.lines),
      );
      editorView.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      });
    }

    editorView.focus();
  }

  // Mount / remount editor when the active editing file changes.
  createEffect(() => {
    const path = fileState.editingFilePath;
    const active = fileState.editorTakeoverActive;
    if (!active || !path || !editorContainerRef) return;
    if (mountedPath === path && editorView) return;
    void mountEditorForPath(path);
  });

  // Poll mtime every 2 seconds for external changes.
  createEffect(() => {
    const active = fileState.editorTakeoverActive;
    if (!active) {
      if (mtimePoller) {
        clearInterval(mtimePoller);
        mtimePoller = null;
      }
      return;
    }
    if (mtimePoller) return;

    mtimePoller = setInterval(async () => {
      const projectId = projectState.activeProjectId;
      const path = fileState.editingFilePath;
      const recordedMtime = fileState.editorFileMtime;
      if (!projectId || !path || recordedMtime == null) return;

      try {
        const currentMtime = await invoke<number | null>('get_file_mtime', {
          project_id: projectId,
          relative_path: path,
        });
        if (currentMtime != null && currentMtime !== recordedMtime && !fileState.conflictDetected) {
          setConflictDetected(true);
          addToast(t('editor.conflictTitle'), 'warning');
          log.warn(`Conflict detected for ${path}: ${recordedMtime} -> ${currentMtime}`);
        }
      } catch {
        // polling errors are non-critical
      }
    }, MTIME_POLL_INTERVAL);
  });

  onCleanup(() => {
    destroyEditor();
    if (mtimePoller) {
      clearInterval(mtimePoller);
      mtimePoller = null;
    }
    mountedPath = null;
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (uiState.zenModeActive) {
        exitZenMode();
      } else {
        handleClose();
      }
    }
  }

  return (
    <div
      class="flex flex-col h-full animate-fade-in"
      style={{ 'animation-duration': '150ms' }}
      on:keydown={handleKeyDown}
    >
      <EditorToolbar onClose={handleClose} />

      <Show when={fileState.conflictDetected}>
        <div
          class="flex items-center justify-between gap-2 px-3 py-2 text-xs"
          style={{
            background: 'rgba(210, 153, 34, 0.1)',
            border: '1px solid rgba(210, 153, 34, 0.3)',
            color: 'var(--color-warning)',
          }}
        >
          <span>{t('editor.conflictTitle')}</span>
          <div class="flex items-center gap-2">
            <button
              class="underline text-xs"
              onClick={() => {
                const path = fileState.editingFilePath;
                if (path) {
                  void openEditorTakeover(path, fileState.editorCursorLine);
                }
              }}
            >
              {t('editor.conflictReload')}
            </button>
            <button class="underline text-xs" onClick={clearConflict}>
              {t('editor.conflictKeep')}
            </button>
            <button
              class="underline text-xs"
              onClick={() => addToast('Diff view is not available yet (single-file v1)', 'info')}
            >
              {t('editor.conflictShowDiff')}
            </button>
          </div>
        </div>
      </Show>

      <div
        ref={editorContainerRef}
        class="flex-1 min-h-0 overflow-hidden"
        aria-label="Code editor"
      />

      <EditorStatusBar />

      <Show when={uiState.zenModeActive}>
        <button
          class="fixed top-3 right-3 px-2 py-1 rounded text-[10px] opacity-0 hover:opacity-100 transition-opacity z-50"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-normal)',
          }}
          onClick={() => exitZenMode()}
        >
          {t('editor.exitZen')}
        </button>
      </Show>
    </div>
  );
};

export default EditorTakeover;
