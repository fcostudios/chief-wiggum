export interface InlineDiffPreview {
  filePath: string;
  diffText: string;
  addedLines: number;
  removedLines: number;
}

function stripCodeFence(content: string): string {
  const fenced = content.match(/```(?:diff|patch)?\n([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trimEnd();
  return content.trimEnd();
}

function looksLikeUnifiedDiff(text: string): boolean {
  return /^diff --git /m.test(text) || (/^@@ /m.test(text) && /^(?:\+\+\+|---) /m.test(text));
}

function extractPathFromDiffText(diffText: string): string | null {
  const diffGit = diffText.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (diffGit) return diffGit[2];

  const plusHeader = diffText.match(/^\+\+\+ (?:b\/)?(.+)$/m);
  if (plusHeader && plusHeader[1] !== '/dev/null') return plusHeader[1];

  const minusHeader = diffText.match(/^--- (?:a\/)?(.+)$/m);
  if (minusHeader && minusHeader[1] !== '/dev/null') return minusHeader[1];

  return null;
}

function extractPathFromToolInput(toolInput?: string): string | null {
  if (!toolInput) return null;
  try {
    const parsed = JSON.parse(toolInput) as Record<string, unknown>;
    const candidates = ['file_path', 'path', 'relative_path', 'filename'];
    for (const key of candidates) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
  } catch {
    // tool_input is best-effort JSON from bridge, ignore parse failures
  }
  return null;
}

function countChangedLines(diffText: string): { addedLines: number; removedLines: number } {
  let addedLines = 0;
  let removedLines = 0;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      addedLines += 1;
      continue;
    }
    if (line.startsWith('-')) {
      removedLines += 1;
    }
  }

  return { addedLines, removedLines };
}

/**
 * Best-effort parser for diff-like tool results.
 * Real fixtures vary by tool, so this remains heuristic by design.
 */
export function extractInlineDiffPreview(
  resultContent: string,
  toolName?: string,
  toolInput?: string,
): InlineDiffPreview | null {
  const diffText = stripCodeFence(resultContent);
  const lowerTool = toolName?.toLowerCase() ?? '';
  const likelyFileTool =
    lowerTool.includes('edit') || lowerTool.includes('write') || lowerTool.includes('patch');

  if (!looksLikeUnifiedDiff(diffText)) {
    // Permit hunk-only snippets for known file-edit tools.
    if (!(likelyFileTool && /^@@ /m.test(diffText))) return null;
  }

  const { addedLines, removedLines } = countChangedLines(diffText);
  if (addedLines === 0 && removedLines === 0 && !/^@@ /m.test(diffText)) return null;

  const filePath =
    extractPathFromDiffText(diffText) ?? extractPathFromToolInput(toolInput) ?? 'Modified file';

  return {
    filePath,
    diffText,
    addedLines,
    removedLines,
  };
}
