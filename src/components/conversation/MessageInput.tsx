// src/components/conversation/MessageInput.tsx
// Message input per SPEC-003 §3.1.
// Auto-expanding textarea (80–300px). Enter sends, Shift+Enter newline.
// Send button with loading state. Cancel button while responding.
// Character count indicator. Disabled when no CLI bridge connected.
// @-mention file references (CHI-117) with context assembly on send.

import type { Component } from 'solid-js';
import { createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import { Send, Square, Paperclip, Image as ImageIcon, X } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import type { SlashCommand, FileSearchResult, FileReference, PromptImageInput } from '@/lib/types';
import {
  SUPPORTED_IMAGE_MIMES,
  SUPPORTED_TEXT_EXTENSIONS,
  SUPPORTED_TEXT_MIMES,
} from '@/lib/types';
import SlashCommandMenu from './SlashCommandMenu';
import FileMentionMenu from './FileMentionMenu';
import ContextChip from './ContextChip';
import ContextSuggestions from './ContextSuggestions';
import {
  slashState,
  filteredCommands,
  openMenu,
  closeMenu,
  setFilter,
  highlightPrev,
  highlightNext,
  getHighlightedCommand,
} from '@/stores/slashStore';
import {
  contextState,
  addFileReference,
  addExternalFileAttachment,
  removeAttachment,
  addImageAttachment,
  removeImageAttachment,
  clearAttachments,
  getAttachmentCount,
  getImageCount,
  getTotalEstimatedTokens,
  assembleContext,
  getPromptImages,
} from '@/stores/contextStore';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';
import { actionState, startAction } from '@/stores/actionStore';
import { selectFileForEditing } from '@/stores/fileStore';
import { t } from '@/stores/i18nStore';

interface MessageInputProps {
  onSend: (content: string, images?: PromptImageInput[]) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}

interface MentionRange {
  start: number;
  end: number;
}

interface ParsedMentionQuery {
  fileQuery: string;
  range: MentionRange | null;
}

function getFileExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return null;
  return fileName.slice(dotIndex).toLowerCase();
}

export function parseMentionQuery(rawQuery: string): ParsedMentionQuery {
  const match = rawQuery.match(/^(.*?):(\d+)-(\d+)$/);
  if (!match) {
    return { fileQuery: rawQuery, range: null };
  }

  const start = Number.parseInt(match[2], 10);
  const end = Number.parseInt(match[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
    return { fileQuery: rawQuery, range: null };
  }

  return {
    fileQuery: match[1],
    range: { start, end },
  };
}

export function pickBestMentionResult(
  query: string,
  results: FileSearchResult[],
): FileSearchResult | null {
  if (results.length === 0) return null;
  const q = query.toLowerCase();

  const exactPath = results.find((r) => r.relative_path.toLowerCase() === q);
  if (exactPath) return exactPath;

  const exactName = results.find((r) => r.name.toLowerCase() === q);
  if (exactName) return exactName;

  const suffixPath = results.find((r) => r.relative_path.toLowerCase().endsWith(`/${q}`));
  if (suffixPath) return suffixPath;

  return results[0] ?? null;
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [content, setContent] = createSignal('');
  const [isFocused, setIsFocused] = createSignal(false);
  const [isDragOver, setIsDragOver] = createSignal(false);
  const [mentionOpen, setMentionOpen] = createSignal(false);
  const [mentionResults, setMentionResults] = createSignal<FileSearchResult[]>([]);
  const [mentionHighlight, setMentionHighlight] = createSignal(0);
  let textareaRef: HTMLTextAreaElement | undefined;

  // Local booleans synced with stores — avoids store proxy issues in event handlers
  let slashMenuOpen = false;
  let mentionMenuOpen = false;
  createEffect(() => {
    slashMenuOpen = slashState.isOpen;
  });
  createEffect(() => {
    mentionMenuOpen = mentionOpen();
  });

  // Debounce timer for mention search
  let mentionSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Auto-resize textarea between min and max height
  function adjustHeight() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    const scrollHeight = textareaRef.scrollHeight;
    textareaRef.style.height = `${Math.min(Math.max(scrollHeight, 80), 300)}px`;
  }

  async function buildFileReference(
    result: FileSearchResult,
    range: MentionRange | null,
  ): Promise<FileReference> {
    const projectId = projectState.activeProjectId;
    const ref: FileReference = {
      relative_path: result.relative_path,
      name: result.name,
      extension: result.extension,
      estimated_tokens: Math.round((result.score || 1) * 250),
      is_directory: false,
    };

    if (!projectId) return ref;

    if (range) {
      ref.start_line = range.start;
      ref.end_line = range.end;
      try {
        const rangeContent = await invoke<{ estimated_tokens: number }>('read_project_file', {
          project_id: projectId,
          relative_path: result.relative_path,
          start_line: range.start,
          // Backend scanner treats `end_line` as exclusive.
          end_line: range.end + 1,
        });
        ref.estimated_tokens = rangeContent.estimated_tokens;
      } catch {
        ref.estimated_tokens = Math.max(1, Math.round((range.end - range.start + 1) * 12));
      }
      return ref;
    }

    try {
      const tokens = await invoke<number>('get_file_token_estimate', {
        project_id: projectId,
        relative_path: result.relative_path,
      });
      ref.estimated_tokens = tokens;
    } catch {
      // Keep rough estimate fallback.
    }

    return ref;
  }

  async function resolveInlineRangeMentions(text: string): Promise<string> {
    const projectId = projectState.activeProjectId;
    if (!projectId) return text;

    const pattern = /(^|[\s])@([^\s@]+):(\d+)-(\d+)(?=$|[\s])/g;
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length === 0) return text;

    let rebuilt = '';
    let lastIndex = 0;
    let unresolvedCount = 0;

    for (const match of matches) {
      const fullMatch = match[0];
      const prefix = match[1] ?? '';
      const fileQuery = match[2] ?? '';
      const start = Number.parseInt(match[3] ?? '', 10);
      const end = Number.parseInt(match[4] ?? '', 10);
      const startIndex = match.index ?? 0;

      rebuilt += text.slice(lastIndex, startIndex);
      lastIndex = startIndex + fullMatch.length;

      if (
        !fileQuery ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start <= 0 ||
        end < start
      ) {
        rebuilt += fullMatch;
        unresolvedCount += 1;
        continue;
      }

      try {
        const results = await invoke<FileSearchResult[]>('search_project_files', {
          project_id: projectId,
          query: fileQuery,
          max_results: 10,
        });
        const resolved = pickBestMentionResult(fileQuery, results);
        if (!resolved) {
          rebuilt += fullMatch;
          unresolvedCount += 1;
          continue;
        }

        const ref = await buildFileReference(resolved, { start, end });
        addFileReference(ref);
        rebuilt += prefix;
      } catch {
        rebuilt += fullMatch;
        unresolvedCount += 1;
      }
    }

    rebuilt += text.slice(lastIndex);

    if (unresolvedCount > 0) {
      addToast(
        `Could not resolve ${unresolvedCount} inline file range mention${unresolvedCount > 1 ? 's' : ''}`,
        'warning',
      );
    }

    return rebuilt;
  }

  function handleInput(e: InputEvent) {
    const target = e.target as HTMLTextAreaElement;
    const value = target.value;
    setContent(value);
    adjustHeight();

    const cursorPos = target.selectionStart ?? 0;
    const textBeforeCursor = value.slice(0, cursorPos);

    // @-mention detection: `@` after whitespace or at start
    const mentionMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
    if (mentionMatch) {
      const parsedMention = parseMentionQuery(mentionMatch[1]);
      const query = parsedMention.fileQuery;
      if (query.length > 0 && projectState.activeProjectId) {
        setMentionOpen(true);
        setMentionHighlight(0);
        // Debounced search
        if (mentionSearchTimeout) clearTimeout(mentionSearchTimeout);
        mentionSearchTimeout = setTimeout(async () => {
          try {
            const results = await invoke<FileSearchResult[]>('search_project_files', {
              project_id: projectState.activeProjectId,
              query,
              max_results: 10,
            });
            setMentionResults(results);
          } catch {
            setMentionResults([]);
          }
        }, 100);
      } else {
        setMentionOpen(false);
        setMentionResults([]);
      }
    } else {
      if (mentionOpen()) {
        setMentionOpen(false);
        setMentionResults([]);
      }
    }

    // Slash command detection: `/` after a space, newline, or at the start of text.
    if (!mentionMatch) {
      const slashMatch = textBeforeCursor.match(/(?:^|[\s])\/([^\s/]*)$/);
      if (slashMatch) {
        const afterSlash = slashMatch[1];
        openMenu(afterSlash);
        setFilter(afterSlash);
      } else {
        if (slashState.isOpen) closeMenu();
      }
    }
  }

  async function handleSend() {
    const text = content().trim();
    if (!text || props.isLoading || props.isDisabled) return;

    const cleanedText = (await resolveInlineRangeMentions(text)).trim();
    const finalText = cleanedText || text;

    const runMatch = finalText.match(/^\/run\s+(.+)$/);
    if (runMatch) {
      const requested = runMatch[1].trim();
      const action = actionState.actions.find((a) => a.name === requested || a.id === requested);

      if (action) {
        void startAction(action);
        setContent('');
        clearAttachments();
        if (textareaRef) {
          textareaRef.value = '';
          textareaRef.style.height = '80px';
        }
      } else {
        addToast(`Action not found: ${requested}`, 'warning');
      }
      return;
    }

    // Assemble context from attached files
    const contextPrefix = await assembleContext();
    const fullMessage = contextPrefix ? contextPrefix + finalText : finalText;

    const promptImages = getPromptImages();
    props.onSend(fullMessage, promptImages.length > 0 ? promptImages : undefined);
    setContent('');
    clearAttachments();
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = '80px';
    }
  }

  function handleCancel() {
    props.onCancel?.();
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    const types = e.dataTransfer?.types ?? [];
    if (
      types.includes('application/x-chief-wiggum-file') ||
      types.includes('Files') ||
      types.includes('files')
    ) {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Node | null;
    const container = e.currentTarget as HTMLElement;
    if (related && container.contains(related)) return;
    setIsDragOver(false);
  }

  async function handleInternalFileDrop(data: string): Promise<void> {
    try {
      const fileData = JSON.parse(data) as {
        relative_path: string;
        name: string;
        extension: string | null;
        size_bytes: number | null;
        node_type: string;
        is_binary: boolean;
      };

      if (fileData.is_binary) {
        addToast('Cannot attach binary files', 'warning');
        return;
      }

      const projectId = projectState.activeProjectId;
      let estimatedTokens = fileData.size_bytes ? Math.round(fileData.size_bytes / 4) : 250;

      if (projectId) {
        try {
          estimatedTokens = await invoke<number>('get_file_token_estimate', {
            project_id: projectId,
            relative_path: fileData.relative_path,
          });
        } catch {
          // Use rough estimate
        }
      }

      addFileReference({
        relative_path: fileData.relative_path,
        name: fileData.name,
        extension: fileData.extension,
        estimated_tokens: estimatedTokens,
        is_directory: fileData.node_type === 'Directory',
      });
      addToast(`Added ${fileData.name} to prompt`, 'success');
    } catch {
      addToast('Failed to attach file', 'error');
    }
  }

  async function handleExternalFileDrop(files: FileList): Promise<void> {
    const dropped = Array.from(files);
    if (dropped.length === 0) return;

    let addedCount = 0;
    let unsupportedCount = 0;
    let imageCount = 0;
    let failedCount = 0;

    for (const file of dropped) {
      const mimeType = (file.type || '').toLowerCase();
      const extension = getFileExtension(file.name);
      const isTextMime = SUPPORTED_TEXT_MIMES.has(mimeType);
      const isTextExt = extension ? SUPPORTED_TEXT_EXTENSIONS.has(extension) : false;
      const isImage = SUPPORTED_IMAGE_MIMES.has(mimeType);

      if (isImage) {
        imageCount += 1;
        continue;
      }

      if (!isTextMime && !isTextExt) {
        unsupportedCount += 1;
        continue;
      }

      try {
        const content = await file.text();
        addExternalFileAttachment(file.name, content, extension);
        addedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    if (addedCount > 0) {
      addToast(`Added ${addedCount} file${addedCount > 1 ? 's' : ''} to prompt`, 'success');
    }
    if (unsupportedCount > 0) {
      addToast(
        `Unsupported file type${unsupportedCount > 1 ? 's' : ''} skipped (${unsupportedCount})`,
        'warning',
      );
    }
    if (imageCount > 0) {
      addToast(
        `Image drop is not supported yet (${imageCount}). Use clipboard paste (Cmd/Ctrl+V).`,
        'info',
      );
    }
    if (failedCount > 0) {
      addToast(`Failed to read ${failedCount} dropped file${failedCount > 1 ? 's' : ''}`, 'error');
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return;

    const internalData = dataTransfer.getData('application/x-chief-wiggum-file');
    if (internalData) {
      await handleInternalFileDrop(internalData);
      return;
    }

    if (dataTransfer.files.length > 0) {
      await handleExternalFileDrop(dataTransfer.files);
    }
  }

  function handlePaste(e: ClipboardEvent & { currentTarget: HTMLTextAreaElement }): void {
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasImage = false;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;
      hasImage = true;

      const blob = item.getAsFile();
      if (!blob) continue;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const sizeBytes = blob.size;
        const mimeType = blob.type;

        const image = new window.Image();
        image.onload = () => {
          addImageAttachment(dataUrl, mimeType, sizeBytes, image.width, image.height);
        };
        image.onerror = () => {
          addImageAttachment(dataUrl, mimeType, sizeBytes);
        };
        image.src = dataUrl;
      };
      reader.readAsDataURL(blob);
    }

    if (hasImage) {
      e.preventDefault();
    }
  }

  function handleSlashSelect(cmd: SlashCommand) {
    if (!textareaRef) return;
    const value = textareaRef.value;
    const cursorPos = textareaRef.selectionStart ?? 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|[\s])(\/[^\s/]*)$/);
    if (!match) return;
    const slashStart = textBeforeCursor.length - match[1].length;
    const replacement = `/${cmd.name}${cmd.args_hint ? ' ' : ' '}`;
    const newValue = value.slice(0, slashStart) + replacement + value.slice(cursorPos);
    setContent(newValue);
    textareaRef.value = newValue;
    const newCursorPos = slashStart + replacement.length;
    textareaRef.focus();
    textareaRef.setSelectionRange(newCursorPos, newCursorPos);
    closeMenu();
    adjustHeight();
  }

  async function handleMentionSelect(result: FileSearchResult) {
    if (!textareaRef) return;

    const value = textareaRef.value;
    const cursorPos = textareaRef.selectionStart ?? 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionToken = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
    const parsedMention = parseMentionQuery(mentionToken?.[1] ?? '');

    const ref = await buildFileReference(result, parsedMention.range);
    addFileReference(ref);

    // Remove the @query from the textarea
    const match = textBeforeCursor.match(/(?:^|[\s])(@[^\s@]*)$/);
    if (match) {
      const mentionStart = textBeforeCursor.length - match[1].length;
      const newValue = value.slice(0, mentionStart) + value.slice(cursorPos);
      setContent(newValue);
      textareaRef.value = newValue;
      textareaRef.focus();
      textareaRef.setSelectionRange(mentionStart, mentionStart);
    }

    setMentionOpen(false);
    setMentionResults([]);
    adjustHeight();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // When mention menu is open, intercept navigation keys
    if (mentionMenuOpen) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setMentionHighlight((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setMentionHighlight((i) => Math.min(mentionResults().length - 1, i + 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const results = mentionResults();
        const idx = mentionHighlight();
        if (results[idx]) {
          void handleMentionSelect(results[idx]);
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const results = mentionResults();
        const idx = mentionHighlight();
        if (results[idx]) {
          void handleMentionSelect(results[idx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMentionOpen(false);
        setMentionResults([]);
        return;
      }
    }

    // When slash menu is open, intercept navigation keys
    if (slashMenuOpen) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        highlightPrev();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        highlightNext();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const cmd = getHighlightedCommand();
        if (cmd) {
          handleSlashSelect(cmd);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const cmd = getHighlightedCommand();
        if (cmd) {
          handleSlashSelect(cmd);
        }
        return;
      }
    }

    // Enter (without Shift) sends the message
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Cmd/Ctrl+Enter always sends (force send)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Focus textarea when component mounts
  const focusTimeout = setTimeout(() => textareaRef?.focus(), 0);
  onCleanup(() => clearTimeout(focusTimeout));

  const charCount = () => content().length;
  const canSend = () => content().trim().length > 0 && !props.isLoading && !props.isDisabled;
  const tokenDisplay = () => {
    const t = getTotalEstimatedTokens();
    if (t === 0) return null;
    if (t < 1000) return `~${t} tokens`;
    return `~${(t / 1000).toFixed(1)}K tokens`;
  };

  return (
    <div
      class={`px-4 py-3 ${props.isDisabled ? 'opacity-50' : ''}`}
      style={{
        background:
          'linear-gradient(180deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%)',
        'border-top': isDragOver()
          ? '2px solid var(--color-accent)'
          : '1px solid var(--color-border-secondary)',
        transition: 'border-color 150ms ease',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Context chips bar */}
      <Show when={getAttachmentCount() > 0}>
        <div class="flex flex-wrap items-center gap-1.5 mb-2 max-w-4xl mx-auto">
          <Paperclip size={10} style={{ color: 'var(--color-text-tertiary)' }} />
          <For each={contextState.attachments}>
            {(attachment) => (
              <ContextChip
                attachment={attachment}
                onRemove={removeAttachment}
                onEdit={(att) => {
                  void selectFileForEditing(
                    att.reference.relative_path,
                    att.reference.start_line,
                    att.reference.end_line,
                    att.id,
                  );
                }}
              />
            )}
          </For>
          <Show when={tokenDisplay()}>
            <span class="text-[9px] font-mono text-text-tertiary/40 ml-1">{tokenDisplay()}</span>
          </Show>
        </div>
      </Show>

      {/* Image attachment thumbnails (CHI-190) */}
      <Show when={getImageCount() > 0}>
        <div class="flex flex-wrap items-center gap-2 mb-2 max-w-4xl mx-auto">
          <ImageIcon size={10} style={{ color: 'var(--color-text-tertiary)' }} />
          <For each={contextState.images}>
            {(image) => (
              <div
                class="relative group rounded-md overflow-hidden"
                style={{
                  border: '1px solid var(--color-border-secondary)',
                  background: 'var(--color-bg-inset)',
                }}
              >
                <img
                  src={image.data_url}
                  alt={image.file_name}
                  class="h-12 w-auto max-w-[80px] object-cover"
                />
                <button
                  class="absolute -top-1 -right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-primary)',
                  }}
                  onClick={() => removeImageAttachment(image.id)}
                  aria-label={`Remove ${image.file_name}`}
                >
                  <X size={8} />
                </button>
                <div
                  class="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] font-mono"
                  style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  ~{image.estimated_tokens} tok
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Suggested related files (CHI-127) */}
      <ContextSuggestions />

      {/* Textarea with ambient glow on focus */}
      <div class="relative max-w-4xl mx-auto">
        <SlashCommandMenu
          isOpen={slashState.isOpen}
          commands={filteredCommands()}
          highlightedIndex={slashState.highlightedIndex}
          onSelect={handleSlashSelect}
          onClose={closeMenu}
        />
        <FileMentionMenu
          isOpen={mentionOpen()}
          results={mentionResults()}
          highlightedIndex={mentionHighlight()}
          onSelect={handleMentionSelect}
          onClose={() => {
            setMentionOpen(false);
            setMentionResults([]);
          }}
        />
        <textarea
          ref={textareaRef}
          class="w-full resize-none rounded-lg px-3 py-2.5 text-md text-text-primary placeholder:text-text-tertiary/50 font-ui focus:outline-none transition-all"
          style={{
            'min-height': '80px',
            'max-height': '300px',
            background: 'var(--color-bg-inset)',
            border: isFocused()
              ? '1px solid rgba(232, 130, 90, 0.3)'
              : '1px solid var(--color-border-secondary)',
            'box-shadow': isFocused() ? 'var(--glow-accent-subtle)' : 'none',
            'transition-duration': 'var(--duration-normal)',
          }}
          placeholder={props.isDisabled ? t('input.noBridge') : t('input.placeholder')}
          disabled={props.isDisabled}
          onInput={handleInput}
          onPaste={handlePaste}
          on:keydown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            // Delay close to allow click on menu items
            setTimeout(() => {
              if (slashState.isOpen) closeMenu();
              if (mentionOpen()) {
                setMentionOpen(false);
                setMentionResults([]);
              }
            }, 200);
          }}
          rows={1}
          aria-label="Message input"
        />
      </div>

      {/* Footer: character count + buttons */}
      <div class="flex items-center justify-between mt-2 max-w-4xl mx-auto">
        {/* Left: character count */}
        <span class="text-[10px] text-text-tertiary/40 font-mono tracking-wide">
          <Show when={charCount() > 0}>{charCount()}</Show>
        </span>

        {/* Right: action buttons */}
        <div class="flex items-center gap-2">
          <Show when={props.isLoading}>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                'transition-duration': 'var(--duration-fast)',
                color: 'var(--color-error)',
                background: 'rgba(248, 81, 73, 0.1)',
                border: '1px solid rgba(248, 81, 73, 0.2)',
              }}
              onClick={handleCancel}
              aria-label="Cancel response"
            >
              <Square size={11} />
              <span>{t('common.stop')}</span>
            </button>
          </Show>

          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              'transition-duration': 'var(--duration-fast)',
              background: canSend() ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: canSend() ? 'white' : 'var(--color-text-tertiary)',
              'box-shadow': canSend() ? '0 0 12px rgba(232, 130, 90, 0.2)' : 'none',
              cursor: canSend() ? 'pointer' : 'not-allowed',
            }}
            onClick={handleSend}
            disabled={!canSend()}
            aria-label="Send message"
          >
            <Send size={11} />
            <span class="tracking-wide">{t('common.send')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
