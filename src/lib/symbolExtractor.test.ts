import { describe, expect, it } from 'vitest';
import { buildSymbolSnippet, extractSymbols, pickRelevantSymbols } from './symbolExtractor';
import type { ExtractedSymbol } from '@/lib/types';

describe('symbolExtractor', () => {
  it('extracts TypeScript function/class/interface symbols', () => {
    const content = `
import { z } from 'zod';

export interface ParserConfig {
  strict: boolean;
}

export function parseStream(input: string) {
  return input.trim();
}

class BridgeEvent {
  constructor(public name: string) {}
}
`;

    const symbols = extractSymbols(content, 'ts');
    expect(symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(['ParserConfig', 'parseStream', 'BridgeEvent']),
    );
  });

  it('extracts Rust symbols', () => {
    const content = `
pub struct BridgeEvent {
    pub id: String,
}

pub fn parse_stream(input: &str) -> String {
    input.trim().to_string()
}
`;

    const symbols = extractSymbols(content, 'rs');
    expect(symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(['BridgeEvent', 'parse_stream']),
    );
  });

  it('picks relevant symbols using keyword overlap', () => {
    const symbols: ExtractedSymbol[] = [
      { name: 'parse_stream', kind: 'function', start_line: 1, end_line: 2, estimated_tokens: 20 },
      { name: 'BridgeEvent', kind: 'struct', start_line: 4, end_line: 8, estimated_tokens: 30 },
      {
        name: 'formatOutput',
        kind: 'function',
        start_line: 10,
        end_line: 12,
        estimated_tokens: 15,
      },
    ];

    const picked = pickRelevantSymbols(symbols, ['bridge', 'parse'], 2);
    expect(picked).toContain('parse_stream');
    expect(picked).toContain('BridgeEvent');
  });

  it('builds compact snippet for selected symbols', () => {
    const content = `
import { helper } from './helper';

export function parseStream(input: string) {
  return helper(input);
}

export function formatOutput(value: string) {
  return value.toUpperCase();
}
`;
    const symbols = extractSymbols(content, 'ts');
    const snippet = buildSymbolSnippet(content, symbols, ['parseStream'], 'ts');

    expect(snippet).not.toBeNull();
    expect(snippet!.content).toContain('parseStream');
    expect(snippet!.content).not.toContain('formatOutput');
    expect(snippet!.estimated_tokens).toBeGreaterThan(0);
  });
});
