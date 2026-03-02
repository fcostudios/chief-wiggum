// src/lib/symbolExtractor.ts
// Lightweight symbol extraction for token-optimized snippets (CHI-131).

import type { ExtractedSymbol } from '@/lib/types';

const TS_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const RUST_EXTENSIONS = new Set(['rs']);

function normalizedExtension(extension: string | null | undefined): string {
  return (extension ?? '').toLowerCase().replace(/^\./, '');
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.round(content.length / 4));
}

function findBlockEnd(lines: string[], startIndex: number): number {
  let depth = 0;
  let sawOpening = false;

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    for (const char of line) {
      if (char === '{') {
        depth += 1;
        sawOpening = true;
      } else if (char === '}') {
        if (sawOpening) {
          depth -= 1;
          if (depth <= 0) {
            return i + 1;
          }
        }
      }
    }

    if (!sawOpening && line.trimEnd().endsWith(';')) {
      return i + 1;
    }
  }

  return Math.min(lines.length, startIndex + 30);
}

function createSymbol(
  lines: string[],
  name: string,
  kind: ExtractedSymbol['kind'],
  startIndex: number,
): ExtractedSymbol | null {
  const start_line = startIndex + 1;
  const end_line = Math.max(start_line, findBlockEnd(lines, startIndex));
  const snippet = lines
    .slice(start_line - 1, end_line)
    .join('\n')
    .trim();
  if (!snippet) return null;
  return {
    name,
    kind,
    start_line,
    end_line,
    estimated_tokens: estimateTokens(snippet),
  };
}

function extractTsSymbols(lines: string[]): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const seen = new Set<string>();
  const patterns: Array<{ kind: ExtractedSymbol['kind']; regex: RegExp }> = [
    { kind: 'function', regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\b/ },
    {
      kind: 'function',
      regex:
        /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
    },
    { kind: 'class', regex: /^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)\b/ },
    { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_]\w*)\b/ },
    { kind: 'type', regex: /^\s*(?:export\s+)?type\s+([A-Za-z_]\w*)\s*=/ },
    { kind: 'enum', regex: /^\s*(?:export\s+)?enum\s+([A-Za-z_]\w*)\b/ },
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      const name = match[1];
      if (!name || seen.has(name)) break;
      const symbol = createSymbol(lines, name, pattern.kind, i);
      if (symbol) {
        symbols.push(symbol);
        seen.add(name);
      }
      break;
    }
  }

  return symbols;
}

function extractRustSymbols(lines: string[]): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const seen = new Set<string>();
  const patterns: Array<{ kind: ExtractedSymbol['kind']; regex: RegExp }> = [
    {
      kind: 'function',
      regex: /^\s*(?:pub(?:\([^)]*\))?\s+)?fn\s+([A-Za-z_]\w*)\b/,
    },
    {
      kind: 'struct',
      regex: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)\b/,
    },
    {
      kind: 'enum',
      regex: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)\b/,
    },
    {
      kind: 'trait',
      regex: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)\b/,
    },
    {
      kind: 'impl',
      regex: /^\s*impl(?:<[^>]+>)?\s+([A-Za-z_]\w*)\b/,
    },
    {
      kind: 'type',
      regex: /^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)\s*=/,
    },
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      const name = match[1];
      if (!name || seen.has(name)) break;
      const symbol = createSymbol(lines, name, pattern.kind, i);
      if (symbol) {
        symbols.push(symbol);
        seen.add(name);
      }
      break;
    }
  }

  return symbols;
}

function extractPrelude(lines: string[], extension: string | null | undefined): string[] {
  const ext = normalizedExtension(extension);
  const prelude: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (prelude.length > 0) prelude.push('');
      continue;
    }

    const include =
      (TS_EXTENSIONS.has(ext) &&
        (trimmed.startsWith('import ') ||
          trimmed.startsWith('export type ') ||
          trimmed.startsWith('export interface '))) ||
      (RUST_EXTENSIONS.has(ext) &&
        (trimmed.startsWith('use ') ||
          trimmed.startsWith('mod ') ||
          trimmed.startsWith('#![') ||
          trimmed.startsWith('//')));

    if (!include) break;
    prelude.push(line);
    if (prelude.length >= 30) break;
  }
  return prelude;
}

/** Extract source symbols from a file for TS/JS and Rust. */
export function extractSymbols(
  content: string,
  extension: string | null | undefined,
): ExtractedSymbol[] {
  const ext = normalizedExtension(extension);
  if (!content.trim()) return [];
  const lines = content.split('\n');

  if (TS_EXTENSIONS.has(ext)) {
    return extractTsSymbols(lines);
  }
  if (RUST_EXTENSIONS.has(ext)) {
    return extractRustSymbols(lines);
  }
  return [];
}

/** Select up to `maxSymbols` symbols based on keyword overlap. */
export function pickRelevantSymbols(
  symbols: ExtractedSymbol[],
  keywords: string[],
  maxSymbols = 3,
): string[] {
  if (symbols.length === 0) return [];
  const loweredKeywords = keywords.map((k) => k.toLowerCase());

  const ranked = symbols
    .map((symbol, index) => {
      const name = symbol.name.toLowerCase();
      const relevance = loweredKeywords.reduce(
        (score, keyword) => (keyword && name.includes(keyword) ? score + 3 : score),
        0,
      );
      const kindBoost = symbol.kind === 'function' || symbol.kind === 'class' ? 1 : 0;
      return {
        symbol,
        index,
        score: relevance + kindBoost,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const top = ranked.slice(0, Math.max(1, maxSymbols));
  if (top.every((entry) => entry.score === 0)) {
    return symbols.slice(0, Math.max(1, maxSymbols)).map((s) => s.name);
  }
  return top.map((entry) => entry.symbol.name);
}

/**
 * Build a compact snippet containing only selected symbols (plus import/use prelude).
 * Returns `null` when symbols cannot be resolved.
 */
export function buildSymbolSnippet(
  content: string,
  symbols: ExtractedSymbol[],
  selectedNames: string[],
  extension: string | null | undefined,
): { content: string; estimated_tokens: number } | null {
  const selected = new Set(selectedNames);
  if (selected.size === 0 || symbols.length === 0) return null;

  const lines = content.split('\n');
  const prelude = extractPrelude(lines, extension);
  const chunks: string[] = [];

  for (const symbol of symbols) {
    if (!selected.has(symbol.name)) continue;
    const snippet = lines
      .slice(symbol.start_line - 1, symbol.end_line)
      .join('\n')
      .trim();
    if (!snippet) continue;
    chunks.push(snippet);
  }

  if (chunks.length === 0) return null;

  const assembled = [...prelude, ...(prelude.length > 0 ? [''] : []), ...chunks].join('\n').trim();
  if (!assembled) return null;

  return {
    content: assembled,
    estimated_tokens: estimateTokens(assembled),
  };
}
