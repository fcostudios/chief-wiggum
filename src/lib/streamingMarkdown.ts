// Stabilizes streaming markdown by auto-closing unterminated fenced code blocks.
// This prevents temporary parse/layout breakage while tokens are still arriving.

interface FenceState {
  insideFence: boolean;
  fenceChar: '`' | '~';
  fenceLength: number;
}

const OPEN_FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

export function stabilizeStreamingMarkdown(content: string): string {
  if (!content) return content;

  const lines = content.split('\n');
  const state: FenceState = {
    insideFence: false,
    fenceChar: '`',
    fenceLength: 3,
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!state.insideFence) {
      const openMatch = trimmed.match(OPEN_FENCE_PATTERN);
      if (!openMatch) continue;

      state.insideFence = true;
      state.fenceChar = openMatch[1][0] as '`' | '~';
      state.fenceLength = openMatch[1].length;
      continue;
    }

    const closePattern = new RegExp(`^${state.fenceChar}{${state.fenceLength},}\\s*$`);
    if (closePattern.test(trimmed)) {
      state.insideFence = false;
    }
  }

  if (!state.insideFence) {
    return content;
  }

  const closingFence = state.fenceChar.repeat(state.fenceLength);
  if (!content.includes('\n')) {
    return `${content}\n\n${closingFence}`;
  }
  if (content.endsWith('\n')) {
    return `${content}${closingFence}`;
  }
  return `${content}\n${closingFence}`;
}
