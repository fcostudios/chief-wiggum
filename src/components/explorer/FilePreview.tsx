// src/components/explorer/FilePreview.tsx
// Read-only preview panel with syntax highlighting, line-range selection,
// and explicit entry point into Editor Takeover.

import type { Component } from 'solid-js';
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Check, Copy, ExternalLink, Eye, File, Lock, Pencil, Plus } from 'lucide-solid';
import {
  canAddToPrompt as canAddByPreviewType,
  canEdit as canEditByPreviewType,
} from '@/lib/types';
import type { FileContent, PreviewType } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import {
  addFileReference,
  applyAttachmentOptimization,
  contextState,
  revertAttachmentOptimization,
  updateAttachmentRange,
} from '@/stores/contextStore';
import {
  fileState,
  navigateToFolder,
  openEditorTakeover,
  setSelectedRange,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';
import { t } from '@/stores/i18nStore';
import AudioPreview from './previews/AudioPreview';
import BinaryFallback from './previews/BinaryFallback';
import ImagePreview from './previews/ImagePreview';
import PdfPreview from './previews/PdfPreview';
import SvgPreview from './previews/SvgPreview';

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
  let rootRef: HTMLDivElement | undefined;
  let codeViewportRef: HTMLDivElement | undefined;
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

  if (typeof window !== 'undefined') {
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('mousedown', handleOutsideMouseDown);
  }

  onCleanup(() => {
    if (copyTimeout) clearTimeout(copyTimeout);
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
    return match ? match[1].toLowerCase() : null;
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
  const previewType = (): PreviewType => {
    const extension = fileExtension();
    if (!extension) return isBinaryFile() ? 'binary' : 'text';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(extension)) return 'image';
    if (extension === 'svg') return 'svg';
    if (extension === 'pdf') return 'pdf';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension)) return 'audio';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) return 'video';
    return isBinaryFile() ? 'binary' : 'text';
  };
  const canEditCurrent = () => !props.content.is_readonly && canEditByPreviewType(previewType());
  const canAddCurrent = () => canAddByPreviewType(previewType());
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
    if (!canAddCurrent()) return;
    const content = activeContent();
    addFileReference(
      {
        relative_path: content.relative_path,
        name: fileName(),
        extension: fileExtension(),
        estimated_tokens: content.estimated_tokens,
        is_directory: false,
      },
      'auto',
    );
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
    addFileReference(
      {
        relative_path: props.content.relative_path,
        name: fileName(),
        extension: fileExtension(),
        estimated_tokens: selectionTokenEstimate(),
        start_line: range.start,
        end_line: range.end,
        is_directory: false,
      },
      'auto',
    );
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
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 min-w-0">
          <File size={12} style={{ color: 'var(--color-accent)' }} />
          <span
            class="font-mono text-xs font-medium truncate"
            style={{ color: 'var(--color-text-primary)' }}
            title={props.content.relative_path}
          >
            {fileName()}
          </span>
          <Show when={props.content.is_readonly}>
            <span title="File is read-only">
              <Lock size={10} style={{ color: 'var(--color-text-tertiary)' }} />
            </span>
          </Show>
          <span
            class="text-[9px] font-mono ml-auto shrink-0"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            ~{(activeContent().estimated_tokens / 1000).toFixed(1)}K
          </span>
        </div>

        <div
          class="text-[9px] font-mono flex items-center gap-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <Show when={activeContent().language}>
            <span>{activeContent().language}</span>
            <span style={{ opacity: 0.4 }}>·</span>
          </Show>
          <span>
            {props.content.line_count} {t('editor.lines')}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{(props.content.size_bytes / 1024).toFixed(1)}KB</span>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              'transition-duration': 'var(--duration-fast)',
            }}
          >
            <Eye size={9} />
            {t('editor.preview')}
          </button>
          <Show when={canEditCurrent()}>
            <button
              class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
              style={{
                color: 'var(--color-accent)',
                background: 'var(--color-accent-muted)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onClick={() => void openEditorTakeover(props.content.relative_path)}
            >
              <Pencil size={9} />
              {t('editor.openInEditor')}
            </button>
          </Show>
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'transparent',
              border: '1px solid var(--color-border-secondary)',
              'transition-duration': 'var(--duration-fast)',
            }}
            onClick={() => void handleCopyPath()}
          >
            <Show when={copied()} fallback={<Copy size={9} />}>
              <Check size={9} style={{ color: 'var(--color-success)' }} />
            </Show>
            {t('editor.copyPath')}
          </button>
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
            style={{
              color: canAddCurrent() ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              background: canAddCurrent() ? 'var(--color-accent-muted)' : 'transparent',
              border: canAddCurrent() ? 'none' : '1px solid var(--color-border-secondary)',
              'transition-duration': 'var(--duration-fast)',
            }}
            onClick={handleAddToPrompt}
            disabled={!canAddCurrent()}
          >
            <Plus size={9} />
            {t('editor.addToContext')}
          </button>
        </div>
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
        <Switch
          fallback={
            <BinaryFallback
              relativePath={props.content.relative_path}
              sizeBytes={activeContent().size_bytes}
              extension={fileExtension()}
              onOpenExternal={() => void handleOpenInSystem()}
            />
          }
        >
          <Match when={previewType() === 'image'}>
            <ImagePreview
              relativePath={props.content.relative_path}
              sizeBytes={activeContent().size_bytes}
              extension={fileExtension()}
              onOpenExternal={() => void handleOpenInSystem()}
            />
          </Match>
          <Match when={previewType() === 'pdf'}>
            <PdfPreview
              relativePath={props.content.relative_path}
              sizeBytes={activeContent().size_bytes}
              onOpenExternal={() => void handleOpenInSystem()}
            />
          </Match>
          <Match when={previewType() === 'audio'}>
            <AudioPreview
              relativePath={props.content.relative_path}
              sizeBytes={activeContent().size_bytes}
              extension={fileExtension()}
              onOpenExternal={() => void handleOpenInSystem()}
            />
          </Match>
        </Switch>
      </Show>

      <Show when={isEmptyTextFile()}>
        <div class="py-4 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Empty file
        </div>
      </Show>

      <Show
        when={!props.isLoading && !isBinaryFile() && previewType() === 'svg' && displayContent()}
      >
        <SvgPreview
          relativePath={props.content.relative_path}
          sizeBytes={activeContent().size_bytes}
          content={displayContent()}
          onOpenExternal={() => void handleOpenInSystem()}
          onOpenEditor={() => void openEditorTakeover(props.content.relative_path)}
        />
      </Show>

      <Show
        when={
          !props.isLoading &&
          !isBinaryFile() &&
          !isEmptyTextFile() &&
          displayContent() &&
          previewType() !== 'svg'
        }
      >
        <div
          ref={codeViewportRef}
          class="overflow-auto rounded focus-ring"
          classList={{
            'flex-1': props.fillHeight,
            'min-h-[180px]': props.fillHeight,
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
          onDblClick={(event) => {
            if (!canEditCurrent()) return;
            const row = (event.target as HTMLElement).closest('tr');
            const lineCell = row?.querySelector('td');
            const line = Number.parseInt(lineCell?.textContent ?? '1', 10);
            void openEditorTakeover(
              props.content.relative_path,
              Number.isFinite(line) && line > 0 ? line : 1,
            );
          }}
          aria-label="File preview"
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
            background: isResizing() ? 'var(--color-accent)' : 'var(--color-border-secondary)',
          }}
          onMouseDown={handleResizeStart}
          onMouseEnter={(e) => {
            if (!isResizing()) e.currentTarget.style.background = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            if (!isResizing()) e.currentTarget.style.background = 'var(--color-border-secondary)';
          }}
          onDblClick={() => setPreviewHeight(300)}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize file preview"
        />
      </Show>
    </div>
  );
};

export default FilePreview;
