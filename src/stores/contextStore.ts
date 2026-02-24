// src/stores/contextStore.ts
// Manages file references attached to the current prompt.
// Files are loaded on send (not on attach) to minimize IPC calls.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { ContextAttachment, FileReference, FileContent } from '@/lib/types';
import { projectState } from '@/stores/projectStore';
import { addToast } from '@/stores/toastStore';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/context');

/** Maximum total estimated tokens before warning. */
const TOKEN_WARNING_THRESHOLD = 50_000;
/** Hard cap on total tokens. */
const TOKEN_HARD_CAP = 100_000;

interface ContextState {
  attachments: ContextAttachment[];
  isAssembling: boolean;
}

const [state, setState] = createStore<ContextState>({
  attachments: [],
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
    lineCount > 0
      ? Math.ceil((lineCount * 40) / 4)
      : attachment.reference.estimated_tokens;

  setState('attachments', idx, 'reference', {
    ...attachment.reference,
    start_line: normalizedStart,
    end_line: normalizedEnd,
    estimated_tokens: estimatedTokens,
  });
}

/** Clear all attachments. */
export function clearAttachments(): void {
  setState('attachments', []);
}

/** Get total estimated tokens across all attachments. */
export function getTotalEstimatedTokens(): number {
  return state.attachments.reduce((sum, a) => sum + a.reference.estimated_tokens, 0);
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
  if (state.attachments.length === 0) return '';

  const projectId = projectState.activeProjectId;
  if (!projectId) return '';

  setState('isAssembling', true);

  try {
    const parts: string[] = [];
    parts.push('<context>');

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

    parts.push('</context>');
    parts.push('');
    return parts.join('\n');
  } finally {
    setState('isAssembling', false);
  }
}
