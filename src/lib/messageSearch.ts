import type { Message } from '@/lib/types';

export interface MatchRange {
  start: number;
  end: number;
}

export interface SearchMatch {
  messageIndex: number;
  messageId: string;
  ranges: MatchRange[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchMessages(
  query: string,
  messages: Message[],
  options?: SearchOptions,
): SearchMatch[] {
  if (!query) return [];

  const flags = options?.caseSensitive ? 'g' : 'gi';
  const matcher = new RegExp(escapeRegex(query), flags);
  const results: SearchMatch[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === 'tool_use' || message.role === 'tool_result' || message.role === 'permission') {
      continue;
    }

    const ranges: MatchRange[] = [];
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(message.content)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) {
        matcher.lastIndex += 1;
      }
    }

    if (ranges.length > 0) {
      results.push({
        messageIndex: index,
        messageId: message.id,
        ranges,
      });
    }
  }

  return results;
}
