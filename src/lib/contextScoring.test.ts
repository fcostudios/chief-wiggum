import { describe, expect, it } from 'vitest';
import {
  extractConversationKeywords,
  qualityColor,
  scoreAllAttachments,
  scoreAttachment,
} from './contextScoring';
import type { ContextAttachment, Message } from '@/lib/types';

function makeMessage(content: string, role: Message['role'] = 'user'): Message {
  return {
    id: crypto.randomUUID(),
    session_id: 'test',
    role,
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

function makeAttachment(relativePath: string, estimatedTokens = 500): ContextAttachment {
  return {
    id: crypto.randomUUID(),
    reference: {
      relative_path: relativePath,
      name: relativePath.split('/').pop() ?? relativePath,
      extension: relativePath.includes('.') ? (relativePath.split('.').pop() ?? null) : null,
      estimated_tokens: estimatedTokens,
      is_directory: false,
    },
  };
}

describe('extractConversationKeywords', () => {
  it('returns empty array for no messages', () => {
    expect(extractConversationKeywords([])).toEqual([]);
  });

  it('extracts words from user and assistant messages', () => {
    const messages = [
      makeMessage('fix the authentication bug'),
      makeMessage('The auth module needs updating', 'assistant'),
    ];
    const keywords = extractConversationKeywords(messages);
    expect(keywords).toContain('fix');
    expect(keywords).toContain('authentication');
    expect(keywords).toContain('auth');
  });

  it('filters out stop words', () => {
    const keywords = extractConversationKeywords([
      makeMessage('the function should handle this correctly'),
    ]);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('this');
    expect(keywords).not.toContain('should');
    expect(keywords).toContain('function');
    expect(keywords).toContain('handle');
    expect(keywords).toContain('correctly');
  });

  it('filters out words shorter than 3 chars', () => {
    const keywords = extractConversationKeywords([makeMessage('go to the api db call')]);
    expect(keywords).not.toContain('go');
    expect(keywords).not.toContain('to');
    expect(keywords).toContain('api');
    expect(keywords).toContain('call');
  });

  it('deduplicates keywords', () => {
    const keywords = extractConversationKeywords([makeMessage('auth auth auth module module')]);
    expect(keywords.filter((k) => k === 'auth')).toHaveLength(1);
  });

  it('ignores non-user/assistant messages', () => {
    const keywords = extractConversationKeywords([
      makeMessage('system init', 'system'),
      makeMessage('tool output', 'tool_result'),
      makeMessage('internal thought', 'thinking'),
    ]);
    expect(keywords).toEqual([]);
  });
});

describe('scoreAttachment', () => {
  it('scores high relevance when filename/path matches keywords', () => {
    const score = scoreAttachment(makeAttachment('src/auth/login.ts', 500), ['auth', 'login']);
    expect(score.relevance).toBeGreaterThanOrEqual(50);
    expect(score.label).toBe('high');
  });

  it('scores low relevance when no keyword matches', () => {
    const score = scoreAttachment(makeAttachment('src/utils/random.ts', 500), [
      'auth',
      'login',
      'session',
    ]);
    expect(score.relevance).toBeLessThan(50);
  });

  it('scores 50 relevance with no conversation keywords', () => {
    const score = scoreAttachment(makeAttachment('src/main.ts', 500), []);
    expect(score.relevance).toBe(50);
  });

  it('scores token efficiency by token tiers', () => {
    expect(scoreAttachment(makeAttachment('small.ts', 100), []).tokenEfficiency).toBe(100);
    expect(scoreAttachment(makeAttachment('med.ts', 7000), []).tokenEfficiency).toBe(50);
    expect(scoreAttachment(makeAttachment('huge.ts', 50000), []).tokenEfficiency).toBe(10);
  });

  it('computes weighted overall score and stale=false', () => {
    const score = scoreAttachment(makeAttachment('src/auth.ts', 500), ['auth']);
    expect(score.overall).toBe(Math.round(score.relevance * 0.6 + score.tokenEfficiency * 0.4));
    expect(score.isStale).toBe(false);
  });

  it('labels low for huge irrelevant files', () => {
    const score = scoreAttachment(makeAttachment('vendor/bundle.min.js', 80000), ['auth']);
    expect(score.label).toBe('low');
  });
});

describe('scoreAllAttachments', () => {
  it('returns scores keyed by attachment ID', () => {
    const a1 = makeAttachment('a.ts');
    const a2 = makeAttachment('b.ts');
    const scores = scoreAllAttachments([a1, a2], [makeMessage('test message')]);
    expect(scores.size).toBe(2);
    expect(scores.has(a1.id)).toBe(true);
    expect(scores.has(a2.id)).toBe(true);
  });

  it('returns empty map for empty attachments', () => {
    expect(scoreAllAttachments([], [])).toEqual(new Map());
  });
});

describe('qualityColor', () => {
  it('returns token colors for each quality label', () => {
    expect(qualityColor('high')).toBe('var(--color-success)');
    expect(qualityColor('medium')).toBe('var(--color-warning)');
    expect(qualityColor('low')).toBe('var(--color-error)');
  });
});
