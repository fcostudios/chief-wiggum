import { describe, expect, it } from 'vitest';
import { getSymbolPrefix, parseMentionQuery, pickBestMentionResult } from './MessageInput';
import type { FileSearchResult } from '@/lib/types';

describe('parseMentionQuery', () => {
  it('parses simple file query', () => {
    expect(parseMentionQuery('main.ts')).toEqual({ fileQuery: 'main.ts', range: null });
  });

  it('parses file with line range', () => {
    expect(parseMentionQuery('main.ts:10-20')).toEqual({
      fileQuery: 'main.ts',
      range: { start: 10, end: 20 },
    });
  });

  it('parses path with line range', () => {
    expect(parseMentionQuery('src/lib/utils.ts:5-15')).toEqual({
      fileQuery: 'src/lib/utils.ts',
      range: { start: 5, end: 15 },
    });
  });

  it('rejects invalid range end < start', () => {
    expect(parseMentionQuery('file.ts:20-10')).toEqual({
      fileQuery: 'file.ts:20-10',
      range: null,
    });
  });

  it('rejects zero start line', () => {
    expect(parseMentionQuery('file.ts:0-10')).toEqual({
      fileQuery: 'file.ts:0-10',
      range: null,
    });
  });

  it('handles invalid colon syntax', () => {
    expect(parseMentionQuery('file.ts:abc-def')).toEqual({
      fileQuery: 'file.ts:abc-def',
      range: null,
    });
  });

  it('accepts single-line ranges', () => {
    expect(parseMentionQuery('file.ts:5-5')).toEqual({
      fileQuery: 'file.ts',
      range: { start: 5, end: 5 },
    });
  });
});

describe('pickBestMentionResult', () => {
  const results: FileSearchResult[] = [
    { relative_path: 'src/lib/utils.ts', name: 'utils.ts', extension: 'ts', score: 0.8 },
    { relative_path: 'src/utils.ts', name: 'utils.ts', extension: 'ts', score: 0.6 },
    {
      relative_path: 'tests/utils.test.ts',
      name: 'utils.test.ts',
      extension: 'ts',
      score: 0.5,
    },
  ];

  it('returns null for empty results', () => {
    expect(pickBestMentionResult('anything', [])).toBeNull();
  });

  it('prefers exact path match', () => {
    expect(pickBestMentionResult('src/lib/utils.ts', results)?.relative_path).toBe(
      'src/lib/utils.ts',
    );
  });

  it('prefers exact name match when no exact path match', () => {
    expect(pickBestMentionResult('utils.ts', results)?.name).toBe('utils.ts');
  });

  it('prefers suffix path match', () => {
    expect(pickBestMentionResult('lib/utils.ts', results)?.relative_path).toBe('src/lib/utils.ts');
  });

  it('falls back to first result', () => {
    expect(pickBestMentionResult('nonexistent', results)).toBe(results[0]);
  });

  it('matches case-insensitively', () => {
    expect(pickBestMentionResult('SRC/LIB/UTILS.TS', results)?.relative_path).toBe(
      'src/lib/utils.ts',
    );
  });
});

describe('getSymbolPrefix', () => {
  it('maps @fn: query to function kind', () => {
    expect(getSymbolPrefix('fn:greet')).toEqual({ kind: 'function', subQuery: 'greet' });
  });

  it('maps @class: query to class kind', () => {
    expect(getSymbolPrefix('class:UserService')).toEqual({
      kind: 'class',
      subQuery: 'UserService',
    });
  });

  it('maps @var: query to variable kind', () => {
    expect(getSymbolPrefix('var:token')).toEqual({ kind: 'variable', subQuery: 'token' });
  });

  it('returns null for non-symbol prefixes', () => {
    expect(getSymbolPrefix('utils.ts')).toBeNull();
  });
});
