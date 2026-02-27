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
});
