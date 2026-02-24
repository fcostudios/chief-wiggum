// src/lib/contextScoring.ts
// Context quality scoring engine for attached files (CHI-125).
// Computes relevance and token efficiency using conversation keywords.

import type { ContextAttachment, ContextQualityScore, Message } from '@/lib/types';

/** Extract keywords from conversation messages. */
export function extractConversationKeywords(messages: Message[]): string[] {
  const text = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();

  const STOP_WORDS = new Set([
    'the',
    'and',
    'for',
    'that',
    'this',
    'with',
    'from',
    'have',
    'been',
    'will',
    'would',
    'could',
    'should',
    'about',
    'there',
    'their',
    'what',
    'when',
    'where',
    'which',
    'while',
    'into',
    'some',
    'than',
    'then',
    'them',
    'these',
    'they',
    'also',
    'just',
    'more',
    'other',
    'only',
    'can',
    'may',
    'not',
    'but',
    'how',
    'all',
    'any',
    'was',
    'are',
  ]);

  const words = text.match(/[a-z_][a-z0-9_]{2,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))];
}

/** Score a single attachment against conversation keywords. */
export function scoreAttachment(
  attachment: ContextAttachment,
  conversationKeywords: string[],
): ContextQualityScore {
  const ref = attachment.reference;
  const fileName = ref.name.toLowerCase().replace(/\.[^.]+$/, '');
  const filePath = ref.relative_path.toLowerCase();

  let relevanceHits = 0;
  for (const keyword of conversationKeywords) {
    if (filePath.includes(keyword) || fileName.includes(keyword)) {
      relevanceHits++;
    }
  }

  const relevance =
    conversationKeywords.length > 0
      ? Math.min(
          100,
          Math.round((relevanceHits / Math.min(conversationKeywords.length, 10)) * 100),
        )
      : 50;

  const tokens = ref.estimated_tokens;
  let tokenEfficiency: number;
  if (tokens <= 2000) tokenEfficiency = 100;
  else if (tokens <= 5000) tokenEfficiency = 80;
  else if (tokens <= 10000) tokenEfficiency = 50;
  else if (tokens <= 30000) tokenEfficiency = 25;
  else tokenEfficiency = 10;

  const overall = Math.round(relevance * 0.6 + tokenEfficiency * 0.4);
  const label = overall >= 60 ? 'high' : overall >= 30 ? 'medium' : 'low';

  return {
    overall,
    relevance,
    tokenEfficiency,
    isStale: false,
    label,
  };
}

/** Score all attachments at once. Returns a Map keyed by attachment ID. */
export function scoreAllAttachments(
  attachments: ContextAttachment[],
  messages: Message[],
): Map<string, ContextQualityScore> {
  const keywords = extractConversationKeywords(messages);
  const scores = new Map<string, ContextQualityScore>();
  for (const attachment of attachments) {
    scores.set(attachment.id, scoreAttachment(attachment, keywords));
  }
  return scores;
}

/** Get CSS color token for a quality label. */
export function qualityColor(label: ContextQualityScore['label']): string {
  switch (label) {
    case 'high':
      return 'var(--color-success)';
    case 'medium':
      return 'var(--color-warning)';
    case 'low':
      return 'var(--color-error)';
  }
}
