// src/stores/contextStore.ts
// Manages file references attached to the current prompt.
// Files are loaded on send (not on attach) to minimize IPC calls.

import { createStore, reconcile } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type {
  ContextAttachment,
  ContextQualityScore,
  FileReference,
  FileContent,
  FileSuggestion,
  ImageAttachment,
} from '@/lib/types';
import { extractConversationKeywords, scoreAllAttachments } from '@/lib/contextScoring';
import { getActiveProject, projectState } from '@/stores/projectStore';
import { conversationState } from '@/stores/conversationStore';
import { addToast } from '@/stores/toastStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/context');

/** Maximum total estimated tokens before warning. */
const TOKEN_WARNING_THRESHOLD = 50_000;
/** Hard cap on total tokens. */
const TOKEN_HARD_CAP = 100_000;
/** Max image size accepted from clipboard paste. */
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;

interface ContextState {
  attachments: ContextAttachment[];
  images: ImageAttachment[];
  scores: Record<string, ContextQualityScore>;
  suggestions: FileSuggestion[];
  isAssembling: boolean;
}

const [state, setState] = createStore<ContextState>({
  attachments: [],
  images: [],
  scores: {},
  suggestions: [],
  isAssembling: false,
});

export { state as contextState };

/** Add a file reference to the prompt context. */
export function addFileReference(ref: FileReference): void {
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
  };
  setState('attachments', (prev) => [...prev, attachment]);
  recalculateScores();
  void refreshSuggestions();

  if (newTotal > TOKEN_WARNING_THRESHOLD) {
    addToast(`Context is large: ~${(newTotal / 1000).toFixed(1)}K tokens attached`, 'warning');
  }
}

/** Remove an attachment by ID. */
export function removeAttachment(id: string): void {
  setState(
    'attachments',
    state.attachments.filter((a) => a.id !== id),
  );
  recalculateScores();
  void refreshSuggestions();
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
  });
  recalculateScores();
}

/** Clear all attachments. */
export function clearAttachments(): void {
  setState('attachments', []);
  setState('images', []);
  setState('scores', reconcile({}, { merge: false }));
  setState('suggestions', []);
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
  if (state.attachments.length === 0 && state.images.length === 0) return '';

  const projectId = projectState.activeProjectId;
  if (state.attachments.length > 0 && !projectId) return '';

  setState('isAssembling', true);

  try {
    const parts: string[] = [];
    parts.push('<context>');

    if (state.attachments.length > 0) {
      for (const attachment of state.attachments) {
        const ref = attachment.reference;
        try {
          const content = await invoke<FileContent>('read_project_file', {
            project_id: projectId,
            relative_path: ref.relative_path,
            start_line: ref.start_line ?? null,
            // Backend scanner uses end-exclusive ranges; chips store inclusive ranges.
            end_line: ref.end_line ? ref.end_line + 1 : null,
          });

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

    for (const image of state.images) {
      const base64Data = image.data_url.replace(/^data:[^;]+;base64,/, '');
      parts.push(
        `<image name="${image.file_name}" type="${image.mime_type}" tokens="~${image.estimated_tokens}">`,
      );
      parts.push(base64Data);
      parts.push('</image>');
    }

    parts.push('</context>');
    parts.push('');
    return parts.join('\n');
  } finally {
    setState('isAssembling', false);
  }
}
