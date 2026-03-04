// src/stores/contextStore.ts
// Manages file references attached to the current prompt.
// Files are loaded on send (not on attach) to minimize IPC calls.

import { createStore, reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type {
  ContextAttachment,
  ContextSource,
  ContextQualityScore,
  FileBundleSuggestion,
  FileReference,
  FileContent,
  FileSuggestion,
  ImageAttachment,
  PromptImageInput,
  SymbolSearchResult,
  SymbolOptimizationSuggestion,
} from '@/lib/types';
import { extractConversationKeywords, scoreAllAttachments } from '@/lib/contextScoring';
import { buildSymbolSnippet, extractSymbols, pickRelevantSymbols } from '@/lib/symbolExtractor';
import { getActiveProject, projectState } from '@/stores/projectStore';
import { conversationState } from '@/stores/conversationStore';
import { addToast } from '@/stores/toastStore';
import { t } from '@/stores/i18nStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/context');

/** Maximum total estimated tokens before warning. */
const TOKEN_WARNING_THRESHOLD = 50_000;
/** Hard cap on total tokens. */
const TOKEN_HARD_CAP = 100_000;
/** Max image size accepted from clipboard paste. */
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const SOFT_REMOVE_DELAY_MS = 5_000;

interface ContextState {
  attachments: ContextAttachment[];
  images: ImageAttachment[];
  scores: Record<string, ContextQualityScore>;
  suggestions: FileSuggestion[];
  symbolSuggestions: Record<string, SymbolOptimizationSuggestion>;
  isAssembling: boolean;
}

const [state, setState] = createStore<ContextState>({
  attachments: [],
  images: [],
  scores: {},
  suggestions: [],
  symbolSuggestions: {},
  isAssembling: false,
});

export { state as contextState };
const pendingRemoveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function updateSymbolSuggestions(
  updater: (
    draft: Record<string, SymbolOptimizationSuggestion>,
  ) => Record<string, SymbolOptimizationSuggestion>,
): void {
  const next = updater({ ...state.symbolSuggestions });
  setState('symbolSuggestions', reconcile(next, { merge: false }));
}

function setSymbolSuggestion(attachmentId: string, suggestion: SymbolOptimizationSuggestion): void {
  updateSymbolSuggestions((draft) => {
    draft[attachmentId] = suggestion;
    return draft;
  });
}

function clearSymbolSuggestion(attachmentId: string): void {
  updateSymbolSuggestions((draft) => {
    if (attachmentId in draft) {
      delete draft[attachmentId];
    }
    return draft;
  });
}

/** Add a file reference to the prompt context. */
export function addFileReference(ref: FileReference, source: ContextSource = 'mention'): void {
  // Dedup by path + line range
  const exists = state.attachments.some(
    (a) =>
      a.reference.relative_path === ref.relative_path &&
      a.reference.start_line === ref.start_line &&
      a.reference.end_line === ref.end_line,
  );
  if (exists) return;

  const newTotal = getTotalEstimatedTokens() + ref.estimated_tokens;
  if (newTotal > TOKEN_HARD_CAP) {
    addToast(
      `Cannot attach: would exceed ${(TOKEN_HARD_CAP / 1000).toFixed(0)}K token limit`,
      'error',
    );
    return;
  }

  const attachment: ContextAttachment = {
    id: crypto.randomUUID(),
    reference: ref,
    source,
  };
  setState('attachments', (prev) => [...prev, attachment]);
  recalculateScores();
  void refreshSuggestions();
  void refreshSymbolSuggestionForAttachment(attachment.id);

  if (newTotal > TOKEN_WARNING_THRESHOLD) {
    addToast(`Context is large: ~${(newTotal / 1000).toFixed(1)}K tokens attached`, 'warning');
  }
}

/** Add a symbol snippet as a context attachment without requiring file IPC reads. */
export function addSymbolAttachment(
  symbol: SymbolSearchResult,
  source: ContextSource = 'mention',
): void {
  const exists = state.attachments.some(
    (attachment) =>
      attachment.reference.relative_path === symbol.file_path &&
      attachment.reference.start_line === symbol.line_number,
  );
  if (exists) return;

  const currentTotal = getTotalEstimatedTokens();
  const newTotal = currentTotal + symbol.estimated_tokens;
  if (newTotal > TOKEN_HARD_CAP) {
    addToast('Symbol would exceed the context token limit', 'warning');
    return;
  }

  const extension = symbol.file_path.split('.').pop() ?? null;
  const kindPrefix = symbol.kind === 'function' ? 'fn' : symbol.kind === 'class' ? 'class' : 'var';
  const lineCount = symbol.snippet.split('\n').length;

  const reference: FileReference = {
    relative_path: symbol.file_path,
    name: `@${kindPrefix}:${symbol.name}`,
    extension,
    estimated_tokens: Math.max(1, symbol.estimated_tokens),
    start_line: symbol.line_number,
    end_line: symbol.line_number + lineCount - 1,
    symbol_names: [symbol.name],
    is_directory: false,
  };

  const attachment: ContextAttachment = {
    id: crypto.randomUUID(),
    reference,
    content: symbol.snippet,
    actual_tokens: Math.max(1, symbol.estimated_tokens),
    source,
  };

  setState('attachments', (prev) => [...prev, attachment]);
  recalculateScores();
  void refreshSuggestions();
  void refreshSymbolSuggestionForAttachment(attachment.id);

  if (newTotal > TOKEN_WARNING_THRESHOLD) {
    addToast(`Context is large: ~${(newTotal / 1000).toFixed(1)}K tokens attached`, 'warning');
  }
}

/** Add an external text file dropped from the OS into prompt context memory. */
export function addExternalFileAttachment(
  fileName: string,
  content: string,
  extension: string | null,
): void {
  const normalizedName = fileName.trim();
  if (!normalizedName) return;

  const relativePath = `[external] ${normalizedName}`;
  const estimatedTokens = Math.max(1, Math.round(content.length / 4));
  const ref: FileReference = {
    relative_path: relativePath,
    name: normalizedName,
    extension,
    estimated_tokens: estimatedTokens,
    is_directory: false,
  };

  const exists = state.attachments.some(
    (a) =>
      a.reference.relative_path === ref.relative_path &&
      a.reference.start_line === ref.start_line &&
      a.reference.end_line === ref.end_line,
  );
  if (exists) return;

  const newTotal = getTotalEstimatedTokens() + estimatedTokens;
  if (newTotal > TOKEN_HARD_CAP) {
    addToast(
      `Cannot attach: would exceed ${(TOKEN_HARD_CAP / 1000).toFixed(0)}K token limit`,
      'error',
    );
    return;
  }

  const attachment: ContextAttachment = {
    id: crypto.randomUUID(),
    reference: ref,
    content,
    actual_tokens: estimatedTokens,
    source: 'auto',
  };
  setState('attachments', (prev) => [...prev, attachment]);
  recalculateScores();
  void refreshSymbolSuggestionForAttachment(attachment.id);

  if (newTotal > TOKEN_WARNING_THRESHOLD) {
    addToast(`Context is large: ~${(newTotal / 1000).toFixed(1)}K tokens attached`, 'warning');
  }
}

/** Remove an attachment by ID. */
export function removeAttachment(id: string): void {
  const timer = pendingRemoveTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingRemoveTimers.delete(id);
  }
  setState(
    'attachments',
    state.attachments.filter((a) => a.id !== id),
  );
  clearSymbolSuggestion(id);
  recalculateScores();
  void refreshSuggestions();
}

/** Remove an attachment with a 5s undo grace period. */
export function softRemoveAttachment(id: string): void {
  const index = state.attachments.findIndex((attachment) => attachment.id === id);
  if (index < 0) return;

  const removed = state.attachments[index];
  removeAttachment(id);

  addToast(t('softUndo.contextRemoved'), 'undo', {
    label: t('softUndo.undo'),
    onClick: () => {
      const timer = pendingRemoveTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        pendingRemoveTimers.delete(id);
      }
      setState('attachments', (prev) => {
        const next = [...prev];
        const insertionIndex = Math.min(index, next.length);
        next.splice(insertionIndex, 0, removed);
        return next;
      });
      recalculateScores();
      void refreshSuggestions();
      void refreshSymbolSuggestionForAttachment(removed.id);
    },
  });

  const timer = setTimeout(() => {
    pendingRemoveTimers.delete(id);
  }, SOFT_REMOVE_DELAY_MS);
  pendingRemoveTimers.set(id, timer);
}

function estimateImageTokens(width: number, height: number): number {
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return Math.max(85, tiles * 85);
}

/** Add a pasted image attachment held in frontend memory. */
export function addImageAttachment(
  dataUrl: string,
  mimeType: string,
  sizeBytes: number,
  width?: number,
  height?: number,
): string | null {
  if (sizeBytes > IMAGE_MAX_SIZE) {
    addToast(`Image too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max is 5MB.`, 'error');
    return null;
  }

  const index = state.images.length + 1;
  const extension = mimeType.split('/')[1] || 'png';
  const id = crypto.randomUUID();

  setState('images', (prev) => [
    ...prev,
    {
      id,
      data_url: dataUrl,
      mime_type: mimeType,
      file_name: `paste-${index}.${extension}`,
      size_bytes: sizeBytes,
      estimated_tokens: estimateImageTokens(width ?? 512, height ?? 512),
      width,
      height,
    },
  ]);

  return id;
}

export function removeImageAttachment(id: string): void {
  setState('images', (prev) => prev.filter((img) => img.id !== id));
}

export function getImageTokenEstimate(): number {
  return state.images.reduce((sum, image) => sum + image.estimated_tokens, 0);
}

export function getImageCount(): number {
  return state.images.length;
}

/** Total size of all image attachments in bytes. */
export function getTotalImageSizeBytes(): number {
  return state.images.reduce((sum, image) => sum + image.size_bytes, 0);
}

/** Return image attachments as SDK-ready prompt payload blocks. */
export function getPromptImages(): PromptImageInput[] {
  return state.images.map((image) => ({
    file_name: image.file_name,
    mime_type: image.mime_type,
    data_base64: image.data_url.replace(/^data:[^;]+;base64,/, ''),
    size_bytes: image.size_bytes,
    width: image.width,
    height: image.height,
  }));
}

/** Update the line range of an existing attachment and recalculate token estimate. */
export function updateAttachmentRange(
  attachmentId: string,
  startLine: number | undefined,
  endLine: number | undefined,
): void {
  const idx = state.attachments.findIndex((a) => a.id === attachmentId);
  if (idx === -1) return;

  const attachment = state.attachments[idx];
  const normalizedStart = startLine && startLine > 0 ? startLine : undefined;
  const normalizedEnd =
    normalizedStart && endLine && endLine >= normalizedStart ? endLine : undefined;

  const lineCount =
    normalizedStart != null && normalizedEnd != null ? normalizedEnd - normalizedStart + 1 : 0;
  // Rough estimate (~40 chars/line, ~4 chars/token). Preserves previous estimate if no range.
  const estimatedTokens =
    lineCount > 0 ? Math.ceil((lineCount * 40) / 4) : attachment.reference.estimated_tokens;

  setState('attachments', idx, 'reference', {
    ...attachment.reference,
    start_line: normalizedStart,
    end_line: normalizedEnd,
    estimated_tokens: estimatedTokens,
    symbol_names: undefined,
    full_file_tokens: undefined,
  });
  clearSymbolSuggestion(attachmentId);
  recalculateScores();
}

/** Clear all attachments. */
export function clearAttachments(): void {
  for (const timer of pendingRemoveTimers.values()) {
    clearTimeout(timer);
  }
  pendingRemoveTimers.clear();
  setState('attachments', []);
  setState('images', []);
  setState('scores', reconcile({}, { merge: false }));
  setState('suggestions', []);
  setState('symbolSuggestions', reconcile({}, { merge: false }));
}

/** Recalculate quality scores for all attachments. */
export function recalculateScores(): void {
  const scoresMap = scoreAllAttachments(state.attachments, conversationState.messages);
  const scoresRecord: Record<string, ContextQualityScore> = {};
  for (const [id, score] of scoresMap) {
    scoresRecord[id] = score;
  }
  setState('scores', reconcile(scoresRecord, { merge: false }));
}

/** Fetch smart file suggestions based on currently attached files. */
export async function refreshSuggestions(): Promise<void> {
  const project = getActiveProject();
  if (!project || state.attachments.length === 0) {
    setState('suggestions', []);
    return;
  }

  try {
    const attachedPaths = state.attachments.map((a) => a.reference.relative_path);
    const keywords = extractConversationKeywords(conversationState.messages);
    const suggestions = await invoke<FileSuggestion[]>('get_file_suggestions', {
      project_id: project.id,
      attached_paths: attachedPaths,
      conversation_keywords: keywords,
      limit: 5,
    });
    setState('suggestions', suggestions);
  } catch {
    setState('suggestions', []);
  }
}

function isSymbolOptimizable(reference: FileReference): boolean {
  const extension = (reference.extension ?? '').toLowerCase();
  if (reference.is_directory) return false;
  if (reference.start_line != null || reference.end_line != null) return false;
  return ['ts', 'tsx', 'js', 'jsx', 'rs'].includes(extension);
}

/** Compute or refresh symbol optimization hint for one attachment (CHI-131). */
export async function refreshSymbolSuggestionForAttachment(attachmentId: string): Promise<void> {
  const attachment = state.attachments.find((item) => item.id === attachmentId);
  if (!attachment) {
    clearSymbolSuggestion(attachmentId);
    return;
  }
  if (!isSymbolOptimizable(attachment.reference)) {
    clearSymbolSuggestion(attachmentId);
    return;
  }

  let sourceContent: string | null = attachment.content ?? null;
  if (!sourceContent) {
    const projectId = projectState.activeProjectId;
    if (!projectId) {
      clearSymbolSuggestion(attachmentId);
      return;
    }
    try {
      const file = await invoke<FileContent>('read_project_file', {
        project_id: projectId,
        relative_path: attachment.reference.relative_path,
        start_line: null,
        end_line: null,
      });
      sourceContent = file.content;
    } catch {
      clearSymbolSuggestion(attachmentId);
      return;
    }
  }

  const symbols = extractSymbols(sourceContent, attachment.reference.extension);
  if (symbols.length < 2) {
    clearSymbolSuggestion(attachmentId);
    return;
  }

  const keywords = extractConversationKeywords(conversationState.messages);
  const suggested = pickRelevantSymbols(symbols, keywords, 3);
  const snippet = buildSymbolSnippet(
    sourceContent,
    symbols,
    suggested,
    attachment.reference.extension,
  );
  if (!snippet) {
    clearSymbolSuggestion(attachmentId);
    return;
  }

  const fullTokens = attachment.reference.full_file_tokens ?? attachment.reference.estimated_tokens;
  if (snippet.estimated_tokens >= fullTokens) {
    clearSymbolSuggestion(attachmentId);
    return;
  }

  setSymbolSuggestion(attachmentId, {
    symbols,
    suggested_symbols: suggested,
    optimized_tokens: snippet.estimated_tokens,
    full_tokens: fullTokens,
  });
}

/** Apply symbol-level optimization to an attachment (CHI-131). */
export function applyAttachmentOptimization(attachmentId: string): boolean {
  const index = state.attachments.findIndex((item) => item.id === attachmentId);
  if (index === -1) return false;
  const suggestion = state.symbolSuggestions[attachmentId];
  if (!suggestion || suggestion.suggested_symbols.length === 0) return false;

  const current = state.attachments[index];
  const fullTokens = current.reference.full_file_tokens ?? current.reference.estimated_tokens;
  setState('attachments', index, 'reference', {
    ...current.reference,
    symbol_names: suggestion.suggested_symbols,
    full_file_tokens: fullTokens,
    estimated_tokens: suggestion.optimized_tokens,
  });
  recalculateScores();
  return true;
}

/** Revert an optimized symbol-level attachment back to full-file mode. */
export function revertAttachmentOptimization(attachmentId: string): boolean {
  const index = state.attachments.findIndex((item) => item.id === attachmentId);
  if (index === -1) return false;
  const current = state.attachments[index];
  if (!current.reference.symbol_names || current.reference.symbol_names.length === 0) return false;

  setState('attachments', index, 'reference', {
    ...current.reference,
    symbol_names: undefined,
    estimated_tokens: current.reference.full_file_tokens ?? current.reference.estimated_tokens,
    full_file_tokens: undefined,
  });
  recalculateScores();
  void refreshSymbolSuggestionForAttachment(attachmentId);
  return true;
}

/** Attach all files from a backend-provided multi-file bundle suggestion (CHI-134). */
export function addFileBundle(bundle: FileBundleSuggestion): number {
  const before = state.attachments.length;
  for (const entry of bundle.entries) {
    addFileReference({
      relative_path: entry.relative_path,
      name: entry.name,
      extension: entry.extension,
      estimated_tokens: Math.max(1, entry.estimated_tokens),
      is_directory: false,
    });
  }

  const added = state.attachments.length - before;
  if (added > 0) {
    addToast(`Added ${added} file${added > 1 ? 's' : ''} from ${bundle.label}`, 'success');
  } else {
    addToast('All bundle files are already attached', 'info');
  }
  return added;
}

/** Get total estimated tokens across all attachments. */
export function getTotalEstimatedTokens(): number {
  return (
    state.attachments.reduce((sum, a) => sum + a.reference.estimated_tokens, 0) +
    state.images.reduce((sum, image) => sum + image.estimated_tokens, 0)
  );
}

/** Get attachment count. */
export function getAttachmentCount(): number {
  return state.attachments.length;
}

/**
 * Assemble context: load all file contents and build the XML-wrapped context string.
 * Called right before sending a message. Returns the context prefix to prepend.
 */
export async function assembleContext(): Promise<string> {
  // Image attachments are sent as structured SDK image blocks, not inline base64 text.
  if (state.attachments.length === 0) return '';

  const projectId = projectState.activeProjectId;
  const hasInMemoryAttachment = state.attachments.some((attachment) => !!attachment.content);
  if (state.attachments.length > 0 && !projectId && !hasInMemoryAttachment) return '';

  setState('isAssembling', true);

  try {
    const parts: string[] = [];
    parts.push('<context>');

    if (state.attachments.length > 0) {
      for (const attachment of state.attachments) {
        const ref = attachment.reference;
        if (attachment.content != null) {
          const symbolSelection = ref.symbol_names ?? [];
          if (symbolSelection.length > 0) {
            const symbols = extractSymbols(attachment.content, ref.extension);
            const snippet = buildSymbolSnippet(
              attachment.content,
              symbols,
              symbolSelection,
              ref.extension,
            );
            if (snippet) {
              parts.push(
                `<file path="${ref.relative_path}" symbols="${symbolSelection.join(',')}" tokens="~${snippet.estimated_tokens}">`,
              );
              parts.push(snippet.content);
              parts.push('</file>');
              continue;
            }
          }

          const fallbackTokens = attachment.actual_tokens ?? ref.estimated_tokens;
          parts.push(`<file path="${ref.relative_path}" tokens="~${fallbackTokens}">`);
          parts.push(attachment.content);
          parts.push('</file>');
          continue;
        }

        try {
          if (!projectId) {
            throw new Error('No active project');
          }
          const content = await invoke<FileContent>('read_project_file', {
            project_id: projectId,
            relative_path: ref.relative_path,
            start_line: ref.start_line ?? null,
            // Backend scanner uses end-exclusive ranges; chips store inclusive ranges.
            end_line: ref.end_line ? ref.end_line + 1 : null,
          });

          const symbolSelection = ref.symbol_names ?? [];
          if (symbolSelection.length > 0) {
            const symbols = extractSymbols(content.content, ref.extension);
            const snippet = buildSymbolSnippet(
              content.content,
              symbols,
              symbolSelection,
              ref.extension,
            );
            if (snippet) {
              parts.push(
                `<file path="${ref.relative_path}" symbols="${symbolSelection.join(',')}" tokens="~${snippet.estimated_tokens}">`,
              );
              parts.push(snippet.content);
              parts.push('</file>');
              continue;
            }
          }

          const lineAttr = ref.start_line ? ` lines="${ref.start_line}-${ref.end_line ?? ''}"` : '';
          parts.push(
            `<file path="${ref.relative_path}"${lineAttr} tokens="~${content.estimated_tokens}">`,
          );
          parts.push(content.content);
          parts.push('</file>');
        } catch (err) {
          log.error(
            'Failed to read ' +
              ref.relative_path +
              ': ' +
              (err instanceof Error ? err.message : String(err)),
          );
          parts.push(`<file path="${ref.relative_path}" error="failed to read" />`);
        }
      }
    }

    parts.push('</context>');
    parts.push('');
    return parts.join('\n');
  } finally {
    setState('isAssembling', false);
  }
}
