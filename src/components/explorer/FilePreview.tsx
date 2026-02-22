// src/components/explorer/FilePreview.tsx
// File preview panel with syntax highlighting, line numbers, and range selection.

import type { Component } from 'solid-js';
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Check, Copy, ExternalLink, File, Plus } from 'lucide-solid';
import type { FileContent } from '@/lib/types';
import { addFileReference } from '@/stores/contextStore';
import { fileState, setSelectedRange } from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';

interface FilePreviewProps {
  content: FileContent;
  isLoading: boolean;
}

const LOAD_MORE_LINES = 100;

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
  const [selectionStart, setSelectionStart] = createSignal<number | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;
  let rootRef: HTMLDivElement | undefined;
  let codeViewportRef: HTMLDivElement | undefined;

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

  // Reset local state when switching to a different selected file.
  createEffect(() => {
    if (!props.content.relative_path) return;
    setLoadedContent(null);
    setIsLoadingMore(false);
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
    try {
      const content = await invoke<FileContent>('read_project_file', {
        project_id: projectId,
        relative_path: props.content.relative_path,
        start_line: null,
        end_line: targetLineCount,
      });
      setLoadedContent(content);
    } catch (err) {
      console.error('[FilePreview] Failed to load more preview lines:', err);
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

  function handleLineMouseDown(lineNum: number, e: MouseEvent) {
    e.preventDefault();
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

  return (
    <div ref={rootRef} class="flex flex-col gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <File size={12} style={{ color: 'var(--color-accent)' }} />
        <span
          class="font-mono text-xs font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
          title={fileName()}
        >
          {fileName()}
        </span>
        <span
          class="text-[9px] font-mono ml-auto shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          ~{(activeContent().estimated_tokens / 1000).toFixed(1)}K
        </span>
      </div>

      <div
        class="text-[9px] font-mono truncate"
        style={{ color: 'var(--color-text-tertiary)' }}
        title={props.content.relative_path}
      >
        {props.content.relative_path}
      </div>

      <Show when={props.isLoading}>
        <div
          class="animate-pulse py-4 text-center text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Loading preview...
        </div>
      </Show>

      <Show when={isBinaryFile()}>
        <div
          class="py-4 text-center text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Binary file — cannot preview ({(activeContent().size_bytes / 1024).toFixed(0)}KB)
        </div>
      </Show>

      <Show when={isEmptyTextFile()}>
        <div
          class="py-4 text-center text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Empty file
        </div>
      </Show>

      <Show when={!props.isLoading && !isBinaryFile() && !isEmptyTextFile() && displayContent()}>
        <div
          ref={codeViewportRef}
          class="overflow-auto rounded focus-ring"
          style={{
            'max-height': '240px',
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border-secondary)',
          }}
          tabindex={0}
          onMouseUp={stopDragging}
          onKeyDown={handlePreviewKeyDown}
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
                          background: isLineSelected(lineNum())
                            ? 'rgba(232, 130, 90, 0.15)'
                            : 'transparent',
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
    </div>
  );
};

export default FilePreview;
