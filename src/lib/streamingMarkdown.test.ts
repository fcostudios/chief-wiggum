import { describe, expect, it } from 'vitest';
import { stabilizeStreamingMarkdown } from './streamingMarkdown';

describe('stabilizeStreamingMarkdown', () => {
  it('returns complete markdown unchanged', () => {
    const md = '# Hello\n\n```ts\nconst x = 1;\n```\n\nDone.';
    expect(stabilizeStreamingMarkdown(md)).toBe(md);
  });

  it('closes an unterminated code fence', () => {
    const md = 'Some text\n\n```ts\nconst x = 1;';
    const result = stabilizeStreamingMarkdown(md);
    expect(result).toContain('```ts\nconst x = 1;\n```');
  });

  it('handles unterminated fence without language', () => {
    const md = '```\nsome code';
    const result = stabilizeStreamingMarkdown(md);
    expect(result).toContain('```\nsome code\n```');
  });

  it('does not double-close already-closed fences', () => {
    const md = '```ts\ncode\n```';
    const result = stabilizeStreamingMarkdown(md);
    const fenceCount = (result.match(/```/g) || []).length;
    expect(fenceCount).toBe(2);
  });

  it('handles multiple code blocks where only last is unterminated', () => {
    const md = '```js\nalert(1);\n```\n\nNow:\n```py\nprint("hi")';
    const result = stabilizeStreamingMarkdown(md);
    expect(result).toContain('```py\nprint("hi")\n```');
    expect(result).toContain('```js\nalert(1);\n```');
  });

  it('handles tilde fences', () => {
    const md = '~~~\ncode here';
    const result = stabilizeStreamingMarkdown(md);
    expect(result).toContain('~~~\ncode here\n~~~');
  });

  it('returns modified content when final fence is unterminated', () => {
    const md = '```ts\npartial code';
    const result = stabilizeStreamingMarkdown(md);
    expect(result).not.toBe(md);
  });

  it('handles content that is just an opening fence', () => {
    const md = '```ts';
    const result = stabilizeStreamingMarkdown(md);
    expect(result).toContain('```ts\n\n```');
  });

  it('inserts a newline before streamed step labels after punctuation', () => {
    const md = 'Implement all layers.Step 1 - DB migration';
    expect(stabilizeStreamingMarkdown(md)).toBe('Implement all layers.\nStep 1 - DB migration');
  });

  it('adds a space between punctuation and the next streamed sentence', () => {
    const md = 'Now update types:Step 4 - Service layer.Then verify output';
    expect(stabilizeStreamingMarkdown(md)).toBe(
      'Now update types:\nStep 4 - Service layer. Then verify output',
    );
  });

  it('does not rewrite content inside fenced code blocks', () => {
    const md = '```ts\nconst example={value:Step2};\n```';
    expect(stabilizeStreamingMarkdown(md)).toBe(md);
  });
});
