// src/components/explorer/FilePreview.tsx
// File preview panel with syntax highlighting, line numbers, range selection, and inline editing.

import type { Component } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, ExternalLink, File, Lock, Plus } from 'lucide-solid';
import type { FileContent } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import {
  addFileReference,
  applyAttachmentOptimization,
  contextState,
  revertAttachmentOptimization,
  updateAttachmentRange,
} from '@/stores/contextStore';
import {
  clearConflict,
  enterEditMode,
  exitEditMode,
  fileState,
  navigateToFolder,
  saveFileEdit,
  selectFile,
  setEditBuffer,
  setSelectedRange,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';

interface FilePreviewProps {
  content: FileContent;
  isLoading: boolean;
  fillHeight?: boolean;
}

const LOAD_MORE_LINES = 100;
const log = createLogger('ui/file-preview');

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function highlightLine(line: string, language: string | null): string {
  if (!line) return '&nbsp;';

  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(line, { language, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(line).value;
  } catch {
    return escapeHtml(line);
  }
}

/** Lazy-load a CodeMirror language extension. Returns null for unknown languages. */
async function loadLanguageExtension(language: string | null): Promise<Extension | null> {
  switch (language) {
    case 'typescript':
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: language === 'typescript' });
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'python': {
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
    case 'markdown': {
      const { markdown } = await import('@codemirror/lang-markdown');
      return markdown();
    }
    default:
      return null;
  }
}

const FilePreview: Component<FilePreviewProps> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const [loadedContent, setLoadedContent] = createSignal<FileContent | null>(null);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [previewHeight, setPreviewHeight] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectionStart, setSelectionStart] = createSignal<number | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;
  let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let rootRef: HTMLDivElement | undefined;
  let codeViewportRef: HTMLDivElement | undefined;
  let editorContainerRef: HTMLDivElement | undefined;
  let editorView: EditorView | undefined;
  let resizeMoveHandler: ((event: MouseEvent) => void) | null = null;
  let resizeUpHandler: (() => void) | null = null;

  const stopDragging = () => setIsDragging(false);

  function clearSelection() {
    setSelectedRange(null);
    setSelectionStart(null);
    setIsDragging(false);
  }

  function handleOutsideMouseDown(event: MouseEvent) {
    const target = event.target;
    if (!rootRef || !target || !(target instanceof Node)) return;
    if (!fileState.selectedRange) return;
    if (!rootRef.contains(target)) {
      clearSelection();
    }
  }

  function cleanupResizeListeners() {
    if (typeof document === 'undefined') return;
    if (resizeMoveHandler) {
      document.removeEventListener('mousemove', resizeMoveHandler);
      resizeMoveHandler = null;
    }
    if (resizeUpHandler) {
      document.removeEventListener('mouseup', resizeUpHandler);
      resizeUpHandler = null;
    }
  }

  // Reset local state when switching to a different selected file.
  createEffect(() => {
    if (!props.content.relative_path) return;
    setLoadedContent(null);
    setIsLoadingMore(false);
    setLoadError(null);
    setCopied(false);
    setSelectionStart(null);
    setIsDragging(false);
  });

  // Mount CodeMirror when entering edit mode; destroy when exiting.
  createEffect(() => {
    const editing = fileState.isEditing;
    const filePath = fileState.editingFilePath;
    const readonly = fileState.isReadonly;
    void readonly;

    if (editing && filePath === props.content.relative_path) {
      void (async () => {
        await Promise.resolve();
        if (!editorContainerRef || editorView) return;

        const langExt = await loadLanguageExtension(props.content.language);
        const extensions: Extension[] = [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          oneDark,
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setEditBuffer(update.state.doc.toString());
              // Reset auto-save debounce
              if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
              saveDebounceTimer = setTimeout(() => {
                const pid = projectState.activeProjectId;
                if (pid && filePath) void saveFileEdit(pid, filePath);
              }, 500);
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              // Trigger save on blur if dirty
              const pid = projectState.activeProjectId;
              if (fileState.isDirty && pid && filePath) {
                if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
                saveDebounceTimer = setTimeout(() => {
                  void saveFileEdit(pid, filePath);
                }, 500);
              }
            },
            keydown: (e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                // Blur editor; edits retained in history
                (document.activeElement as HTMLElement | null)?.blur();
              }
            },
          }),
          EditorView.editable.of(!fileState.isReadonly),
        ];
        if (langExt) extensions.push(langExt);

        const startState = EditorState.create({
          doc: fileState.fullContent ?? activeContent().content,
          extensions,
        });

        editorView = new EditorView({
          state: startState,
          parent: editorContainerRef,
        });
      })();
    } else if (!editing) {
      if (editorView) {
        editorView.destroy();
        editorView = undefined;
      }
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('mousedown', handleOutsideMouseDown);
  }

  onCleanup(() => {
    if (copyTimeout) clearTimeout(copyTimeout);
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    if (editorView) {
      editorView.destroy();
      editorView = undefined;
    }
    cleanupResizeListeners();
    if (typeof window !== 'undefined') {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('mousedown', handleOutsideMouseDown);
    }
  });

  const activeContent = () => loadedContent() ?? props.content;
  const displayContent = () => activeContent().content;
  const lines = () => {
    const content = displayContent();
    if (!content) return [];
    const parts = content.split('\n');
    if (content.endsWith('\n')) {
      parts.pop();
    }
    return parts;
  };
  const highlightedLines = createMemo(() => {
    const language = activeContent().language;
    return lines().map((line) => highlightLine(line, language));
  });
  const fileName = () =>
    props.content.relative_path.split('/').pop() ?? props.content.relative_path;
  const fileExtension = () => {
    const match = /\.([^.\/]+)$/.exec(props.content.relative_path);
    return match ? match[1] : null;
  };
  const selectedRange = () => fileState.selectedRange;
  const visibleLineCount = () => lines().length;
  const remainingLines = () => Math.max(0, props.content.line_count - visibleLineCount());
  const showLoadMore = () =>
    !isLoadingMore() && !props.isLoading && remainingLines() > 0 && !isBinaryFile();
  const isBinaryFile = () =>
    !props.isLoading &&
    activeContent().size_bytes > 0 &&
    activeContent().content.length === 0 &&
    activeContent().line_count === 0;
  const isEmptyTextFile = () =>
    !props.isLoading &&
    !isBinaryFile() &&
    activeContent().content.length === 0 &&
    activeContent().size_bytes === 0;
  const isLargeFile = () =>
    props.content.size_bytes > 100 * 1024 || props.content.line_count > 5000;
  const canEdit = () => !isBinaryFile() && !props.content.is_readonly;
  const saveStatusLabel = () => {
    switch (fileState.saveStatus) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Save failed';
      default:
        return fileState.isDirty ? 'Unsaved' : '';
    }
  };
  const saveStatusColor = () => {
    switch (fileState.saveStatus) {
      case 'saving':
        return 'var(--color-text-tertiary)';
      case 'saved':
        return 'var(--color-success)';
      case 'error':
        return 'var(--color-tool-permission-deny)';
      default:
        return fileState.isDirty ? 'var(--color-warning)' : 'transparent';
    }
  };
  const existingAttachment = () => {
    const editingId = fileState.editingAttachmentId;
    if (editingId) {
      const byId = contextState.attachments.find((a) => a.id === editingId);
      if (byId && byId.reference.relative_path === props.content.relative_path) return byId;
    }
    return contextState.attachments.find(
      (a) => a.reference.relative_path === props.content.relative_path,
    );
  };
  const optimizationSuggestion = () => {
    const attachment = existingAttachment();
    if (!attachment) return null;
    return contextState.symbolSuggestions[attachment.id] ?? null;
  };
  const isOptimizedAttachment = () => {
    const attachment = existingAttachment();
    return !!(attachment?.reference.symbol_names && attachment.reference.symbol_names.length > 0);
  };

  function selectionTokenEstimate(): number {
    const range = selectedRange();
    if (!range) return 0;
    const contentLines = lines();
    const start = Math.max(0, range.start - 1);
    const end = Math.min(range.end, contentLines.length);
    const selectedText = contentLines.slice(start, end).join('\n');
    return Math.round(selectedText.length / 4);
  }

  function isLineSelected(lineNum: number): boolean {
    const range = selectedRange();
    if (!range) return false;
    return lineNum >= range.start && lineNum <= range.end;
  }

  async function handleLoadMore() {
    const projectId = projectState.activeProjectId;
    if (!projectId || isLoadingMore()) return;

    const targetLineCount = Math.min(
      visibleLineCount() + LOAD_MORE_LINES,
      props.content.line_count,
    );

    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const content = await invoke<FileContent>('read_project_file', {
        project_id: projectId,
        relative_path: props.content.relative_path,
        start_line: null,
        end_line: targetLineCount,
      });
      setLoadedContent(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      log.error('Failed to load more preview lines: ' + message);
      setLoadError(message);
      addToast('Failed to load more preview lines', 'error');
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleAddToPrompt() {
    const content = activeContent();
    addFileReference({
      relative_path: content.relative_path,
      name: fileName(),
      extension: fileExtension(),
      estimated_tokens: content.estimated_tokens,
      is_directory: false,
    });
    addToast(`Added ${fileName()} to prompt`, 'success');
  }

  async function handleCopyPath() {
    try {
      await navigator.clipboard.writeText(props.content.relative_path);
      setCopied(true);
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => setCopied(false), 2000);
      addToast('Copied file path', 'success');
    } catch (err) {
      console.error('[FilePreview] Failed to copy path:', err);
      addToast('Failed to copy file path', 'error');
    }
  }

  async function handleOpenInSystem() {
    const projectId = projectState.activeProjectId;
    if (!projectId) return;

    try {
      await invoke('open_project_file_in_system', {
        project_id: projectId,
        relative_path: props.content.relative_path,
      });
    } catch (err) {
      console.error('[FilePreview] Failed to open file in system app:', err);
      addToast('Failed to open file in system app', 'error');
    }
  }

  async function handleCodeViewportClick() {
    if (fileState.isEditing) return;
    if (!canEdit()) return;

    const pid = projectState.activeProjectId;
    if (!pid) return;

    // Load full content for editing (current preview may only have 50 lines).
    let fullContent = activeContent().content;
    if (props.content.truncated || activeContent().line_count < props.content.line_count) {
      try {
        const full = await invoke<FileContent>('read_project_file', {
          project_id: pid,
          relative_path: props.content.relative_path,
          start_line: null,
          end_line: null,
        });
        fullContent = full.content;
      } catch (err) {
        log.error('Failed to load full content for editing: ' + String(err));
        // Fall through with partial content.
      }
    }

    await enterEditMode(fullContent, props.content.relative_path);
  }

  function handleLineMouseDown(lineNum: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    codeViewportRef?.focus();
    setSelectionStart(lineNum);
    setIsDragging(true);
    setSelectedRange({ start: lineNum, end: lineNum });
  }

  function handleLineMouseEnter(lineNum: number) {
    if (!isDragging()) return;
    const start = selectionStart();
    if (start == null) return;
    setSelectedRange({
      start: Math.min(start, lineNum),
      end: Math.max(start, lineNum),
    });
  }

  function handleLineClick(lineNum: number, e: MouseEvent) {
    e.stopPropagation();
    const range = selectedRange();
    if (!e.shiftKey || !range) return;
    setSelectedRange({
      start: Math.min(range.start, lineNum),
      end: Math.max(range.end, lineNum),
    });
  }

  function selectAllVisibleLines() {
    const totalVisible = visibleLineCount();
    if (totalVisible === 0) return;
    setSelectedRange({ start: 1, end: totalVisible });
    codeViewportRef?.focus();
  }

  function handlePreviewKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAllVisibleLines();
    }
  }

  function handleAddSelectionToPrompt() {
    const range = selectedRange();
    if (!range) return;
    addFileReference({
      relative_path: props.content.relative_path,
      name: fileName(),
      extension: fileExtension(),
      estimated_tokens: selectionTokenEstimate(),
      start_line: range.start,
      end_line: range.end,
      is_directory: false,
    });
    addToast(`Added ${fileName()}:${range.start}-${range.end} to prompt`, 'success');
    clearSelection();
  }

  function handleResizeStart(e: MouseEvent) {
    if (props.fillHeight || typeof document === 'undefined') return;
    e.preventDefault();

    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = previewHeight();

    cleanupResizeListeners();

    resizeMoveHandler = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      setPreviewHeight(Math.max(200, Math.min(startHeight + delta, 600)));
    };

    resizeUpHandler = () => {
      setIsResizing(false);
      cleanupResizeListeners();
    };

    document.addEventListener('mousemove', resizeMoveHandler);
    document.addEventListener('mouseup', resizeUpHandler);
  }

  return (
    <div
      ref={rootRef}
      class="flex flex-col gap-2"
      classList={{
        'h-full': props.fillHeight,
        'min-h-0': props.fillHeight,
        'overflow-y-auto': props.fillHeight,
      }}
      style={{
        'scrollbar-gutter': props.fillHeight ? 'stable' : undefined,
        'overscroll-behavior': props.fillHeight ? 'contain' : undefined,
      }}
    >
      <div class="flex items-center gap-2 min-w-0">
        <File size={12} style={{ color: 'var(--color-accent)' }} />
        <span
          class="font-mono text-xs font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
          title={fileName()}
        >
          {fileName()}
        </span>

        {/* Read-only lock icon */}
        <Show when={props.content.is_readonly}>
          <span title="File is read-only">
            <Lock size={10} style={{ color: 'var(--color-text-tertiary)' }} />
          </span>
        </Show>

        {/* Dirty/save status indicator */}
        <Show
          when={fileState.isEditing && fileState.editingFilePath === props.content.relative_path}
        >
          <span class="text-[10px] font-mono ml-1 shrink-0" style={{ color: saveStatusColor() }}>
            {saveStatusLabel() || (fileState.isDirty ? '●' : '')}
          </span>
        </Show>

        <span
          class="text-[9px] font-mono ml-auto shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          ~{(activeContent().estimated_tokens / 1000).toFixed(1)}K
        </span>
      </div>

      {/* Breadcrumb path bar */}
      <div
        class="flex items-center gap-0.5 text-[9px] font-mono min-w-0 overflow-x-auto"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <For each={props.content.relative_path.split('/')}>
          {(segment, index) => {
            const pathSegments = props.content.relative_path.split('/');
            const isLast = () => index() === pathSegments.length - 1;
            const folderPath = () => pathSegments.slice(0, index() + 1).join('/');

            return (
              <>
                <Show when={index() > 0}>
                  <span class="opacity-40 shrink-0">/</span>
                </Show>
                <Show
                  when={!isLast()}
                  fallback={<span style={{ color: 'var(--color-text-primary)' }}>{segment}</span>}
                >
                  <button
                    class="hover:underline transition-colors shrink-0"
                    style={{
                      color: 'var(--color-accent)',
                      'transition-duration': 'var(--duration-fast)',
                    }}
                    onClick={() => {
                      const pid = projectState.activeProjectId;
                      if (pid) void navigateToFolder(pid, folderPath());
                    }}
                    title={`Navigate to ${folderPath()}`}
                  >
                    {segment}
                  </button>
                </Show>
              </>
            );
          }}
        </For>
      </div>

      <Show when={props.isLoading}>
        <div
          class="animate-pulse py-4 text-center text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Loading preview...
        </div>
      </Show>

      <Show when={loadError()}>
        <div
          class="flex flex-col items-center gap-2 px-3 py-3 text-center rounded-md"
          style={{
            border: '1px solid var(--color-error)',
            background: 'var(--color-error-muted)',
          }}
          role="alert"
        >
          <p class="text-xs text-error font-medium">Could not read file</p>
          <p class="text-[10px] text-text-tertiary break-all">{loadError()}</p>
          <button
            class="text-[10px] text-accent hover:underline"
            onClick={() => {
              setLoadError(null);
              void handleLoadMore();
            }}
          >
            Retry
          </button>
        </div>
      </Show>

      <Show when={isBinaryFile()}>
        <div class="py-4 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Binary file — cannot preview ({(activeContent().size_bytes / 1024).toFixed(0)}KB)
        </div>
      </Show>

      <Show when={isEmptyTextFile()}>
        <div class="py-4 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Empty file
        </div>
      </Show>

      {/* Conflict banner — file changed on disk while editing */}
      <Show when={fileState.conflictDetected && fileState.isEditing}>
        <div
          class="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[10px]"
          style={{
            background: 'rgba(248, 81, 73, 0.08)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            color: 'var(--color-tool-permission-deny)',
          }}
        >
          <span>File changed on disk.</span>
          <div class="flex items-center gap-2">
            <button
              class="underline"
              onClick={async () => {
                // Reload from disk — discard local edits.
                const pid = projectState.activeProjectId;
                if (!pid) return;
                exitEditMode();
                clearConflict();
                await selectFile(pid, props.content.relative_path);
              }}
            >
              Reload
            </button>
            <button class="underline" onClick={clearConflict}>
              Keep my edits
            </button>
          </div>
        </div>
      </Show>

      {/* Large file warning */}
      <Show when={isLargeFile() && fileState.isEditing}>
        <div
          class="px-2 py-1 rounded text-[10px]"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          Large file — use Cmd+Z to undo bulk changes
        </div>
      </Show>

      {/* ── EDIT MODE: CodeMirror editor ── */}
      <Show when={fileState.isEditing && fileState.editingFilePath === props.content.relative_path}>
        <div
          ref={editorContainerRef}
          class="rounded overflow-hidden"
          classList={{
            'flex-1': props.fillHeight,
            'min-h-0': props.fillHeight,
          }}
          style={{
            height: props.fillHeight ? '100%' : `${previewHeight()}px`,
            'min-height': props.fillHeight ? undefined : '200px',
            border: fileState.isDirty
              ? '1px solid var(--color-accent)'
              : '1px solid var(--color-border-secondary)',
            'font-size': '12px',
          }}
          aria-label="File editor"
        />
        <button
          class="text-[10px] px-1.5 py-0.5 rounded self-start"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={exitEditMode}
        >
          Stop editing
        </button>
      </Show>

      {/* ── READ-ONLY MODE: existing static table view ── */}
      <Show
        when={
          !fileState.isEditing &&
          !props.isLoading &&
          !isBinaryFile() &&
          !isEmptyTextFile() &&
          displayContent()
        }
      >
        <div
          ref={codeViewportRef}
          class="overflow-auto rounded focus-ring"
          classList={{
            'flex-1': props.fillHeight,
            'min-h-[180px]': props.fillHeight,
            'cursor-text': canEdit(),
          }}
          style={{
            height: props.fillHeight ? '100%' : `${previewHeight()}px`,
            'min-height': props.fillHeight ? undefined : '200px',
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
            'scrollbar-gutter': 'stable',
            'overscroll-behavior': 'contain',
          }}
          tabindex={0}
          onMouseUp={stopDragging}
          onKeyDown={handlePreviewKeyDown}
          onClick={() => {
            if (!isDragging()) void handleCodeViewportClick();
          }}
          aria-label="File preview — click to edit"
        >
          <table
            class="w-full text-[10px] font-mono leading-relaxed"
            style={{ 'border-spacing': '0' }}
          >
            <tbody>
              <For each={lines()}>
                {(line, index) => {
                  const lineNum = () => index() + 1;
                  const highlighted = () => highlightedLines()[index()] ?? '&nbsp;';
                  return (
                    <tr>
                      <td
                        class="select-none text-right px-2 align-top shrink-0 cursor-pointer"
                        style={{
                          color: isLineSelected(lineNum())
                            ? 'var(--color-accent)'
                            : 'var(--color-text-tertiary)',
                          opacity: isLineSelected(lineNum()) ? '1' : '0.4',
                          width: '36px',
                          'min-width': '36px',
                          'user-select': 'none',
                          position: 'sticky',
                          left: '0',
                          'z-index': '1',
                          background: isLineSelected(lineNum())
                            ? 'rgba(232, 130, 90, 0.15)'
                            : 'var(--color-bg-inset)',
                          'border-right': '1px solid rgba(255, 255, 255, 0.04)',
                        }}
                        onMouseDown={(e) => handleLineMouseDown(lineNum(), e)}
                        onMouseEnter={() => handleLineMouseEnter(lineNum())}
                        onClick={(e) => handleLineClick(lineNum(), e)}
                      >
                        {lineNum()}
                      </td>
                      <td
                        class="px-2 whitespace-pre-wrap break-all"
                        style={{
                          color: 'var(--color-text-secondary)',
                          background: isLineSelected(lineNum())
                            ? 'rgba(232, 130, 90, 0.08)'
                            : 'transparent',
                        }}
                      >
                        {/* eslint-disable-next-line solid/no-innerhtml -- highlight.js escapes output */}
                        <span class="hljs bg-transparent p-0" innerHTML={highlighted()} />
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>

        <Show when={isLoadingMore()}>
          <div
            class="text-[10px] font-mono px-2 py-1 rounded animate-pulse"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'var(--color-bg-elevated)',
            }}
          >
            Loading more lines...
          </div>
        </Show>

        <Show when={showLoadMore()}>
          <button
            class="text-[10px] font-mono px-2 py-1 rounded transition-colors text-left"
            style={{
              color: 'var(--color-accent)',
              background: 'transparent',
              'transition-duration': 'var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-accent-muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={handleLoadMore}
          >
            Load more (+{Math.min(LOAD_MORE_LINES, remainingLines())} lines)
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              {' '}
              ({visibleLineCount()}/{props.content.line_count})
            </span>
          </button>
        </Show>

        <Show when={selectedRange()}>
          <div
            class="flex items-center justify-between gap-2 px-2 py-1.5 rounded"
            style={{
              background: 'var(--color-accent-muted)',
              border: '1px solid rgba(232, 130, 90, 0.2)',
            }}
          >
            <span
              class="text-[10px] font-mono min-w-0"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Lines {selectedRange()!.start}-{selectedRange()!.end} selected (~
              {selectionTokenEstimate()} tokens)
            </span>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                style={{
                  color: 'var(--color-text-secondary)',
                  background: 'rgba(255,255,255,0.04)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onClick={selectAllVisibleLines}
              >
                Select all
              </button>
              <button
                class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{
                  color: 'white',
                  background: 'var(--color-accent)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onClick={handleAddSelectionToPrompt}
              >
                <Plus size={9} />
                Add selection
              </button>
              <Show when={existingAttachment() && selectedRange()}>
                <button
                  class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                  style={{
                    color: 'var(--color-bg-primary)',
                    background: 'var(--color-accent)',
                    'transition-duration': 'var(--duration-fast)',
                  }}
                  onClick={() => {
                    const attachment = existingAttachment();
                    const range = selectedRange();
                    if (!attachment || !range) return;
                    updateAttachmentRange(attachment.id, range.start, range.end);
                    addToast('Range updated', 'info');
                  }}
                >
                  Update range
                </button>
              </Show>
              <button
                class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                style={{
                  color: 'var(--color-text-tertiary)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onClick={clearSelection}
              >
                Clear
              </button>
            </div>
          </div>
        </Show>
      </Show>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            color: 'var(--color-accent)',
            background: 'var(--color-accent-muted)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={handleAddToPrompt}
        >
          <Plus size={10} />
          Add to prompt
        </button>

        <Show when={optimizationSuggestion() && !isOptimizedAttachment()}>
          <button
            class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              color: 'var(--color-accent)',
              background: 'rgba(232, 130, 90, 0.12)',
              border: '1px solid rgba(232, 130, 90, 0.35)',
              'transition-duration': 'var(--duration-fast)',
            }}
            onClick={() => {
              const attachment = existingAttachment();
              if (!attachment) return;
              if (applyAttachmentOptimization(attachment.id)) {
                addToast('Applied token-optimized snippet', 'success');
              }
            }}
          >
            Optimize context (~{optimizationSuggestion()!.optimized_tokens} vs ~
            {optimizationSuggestion()!.full_tokens})
          </button>
        </Show>

        <Show when={isOptimizedAttachment()}>
          <button
            class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--color-border-secondary)',
              'transition-duration': 'var(--duration-fast)',
            }}
            onClick={() => {
              const attachment = existingAttachment();
              if (!attachment) return;
              if (revertAttachmentOptimization(attachment.id)) {
                addToast('Switched back to full-file context', 'info');
              }
            }}
          >
            Use full file
          </button>
        </Show>

        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={() => void handleCopyPath()}
        >
          <Show when={copied()} fallback={<Copy size={10} />}>
            <Check size={10} style={{ color: 'var(--color-success)' }} />
          </Show>
          Copy path
        </button>

        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'transparent',
            border: '1px solid var(--color-border-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={() => void handleOpenInSystem()}
        >
          <ExternalLink size={10} />
          Open in system
        </button>
      </div>

      <Show when={!props.fillHeight}>
        <div
          class="h-1 rounded cursor-row-resize transition-colors"
          style={{
            'transition-duration': 'var(--duration-fast)',
            background: isResizing() ? 'rgba(232, 130, 90, 0.2)' : 'transparent',
          }}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize file preview"
        />
      </Show>
    </div>
  );
};

export default FilePreview;
