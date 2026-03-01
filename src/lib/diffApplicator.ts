// src/lib/diffApplicator.ts
// Utilities for identifying and applying unified diff blocks (CHI-230).

import { applyPatch } from 'diff';

/** Return true when a code block is a unified diff (by language tag or content markers). */
export function isDiffBlock(lang: string, code: string): boolean {
  if (lang.toLowerCase() === 'diff') return true;
  return /^--- a\/.+\n\+\+\+ b\/.+/m.test(code);
}

/** Extract target path from a unified diff `--- a/<path>` header. */
export function extractFilePath(diffText: string): string | null {
  const match = /^--- a\/(.+)$/m.exec(diffText);
  return match?.[1]?.trim() || null;
}

/** Apply unified diff against original content, returning null when patching fails. */
export function applyDiff(original: string, diffText: string): string | null {
  try {
    const result = applyPatch(original, diffText);
    return result === false ? null : result;
  } catch {
    return null;
  }
}
