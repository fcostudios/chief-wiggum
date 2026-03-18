// Stabilizes streaming markdown by auto-closing unterminated fenced code blocks.
// This prevents temporary parse/layout breakage while tokens are still arriving.

interface FenceState {
  insideFence: boolean;
  fenceChar: '`' | '~';
  fenceLength: number;
}

const OPEN_FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

function normalizeStreamingProseSegment(segment: string): string {
  return segment
    .replace(/([.:!?])\s*(Step\s+\d+\b)/g, '$1\n$2')
    .replace(/([;:!?])([A-Z])/g, '$1 $2')
    .replace(/([.])([A-Z])/g, '$1 $2');
}

export function stabilizeStreamingMarkdown(content: string): string {
  if (!content) return content;

  const lines = content.split('\n');
  const normalizedLines: string[] = [];
  const state: FenceState = {
    insideFence: false,
    fenceChar: '`',
    fenceLength: 3,
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!state.insideFence) {
      const openMatch = trimmed.match(OPEN_FENCE_PATTERN);
      if (openMatch) {
        state.insideFence = true;
        state.fenceChar = openMatch[1][0] as '`' | '~';
        state.fenceLength = openMatch[1].length;
        normalizedLines.push(line);
        continue;
      }

      normalizedLines.push(normalizeStreamingProseSegment(line));
      continue;
    }

    const closePattern = new RegExp(`^${state.fenceChar}{${state.fenceLength},}\\s*$`);
    if (closePattern.test(trimmed)) {
      state.insideFence = false;
    }

    normalizedLines.push(line);
  }

  const normalizedContent = normalizedLines.join('\n');

  if (!state.insideFence) {
    return normalizedContent;
  }

  const closingFence = state.fenceChar.repeat(state.fenceLength);
  if (!normalizedContent.includes('\n')) {
    return `${normalizedContent}\n\n${closingFence}`;
  }
  if (normalizedContent.endsWith('\n')) {
    return `${normalizedContent}${closingFence}`;
  }
  return `${normalizedContent}\n${closingFence}`;
}
