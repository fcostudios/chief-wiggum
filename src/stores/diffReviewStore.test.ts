import { beforeEach, describe, expect, it } from 'vitest';
import { clearActiveInlineDiff, diffReviewState, setActiveInlineDiff } from './diffReviewStore';

describe('diffReviewStore', () => {
  beforeEach(() => {
    clearActiveInlineDiff();
  });

  it('starts with no active diff', () => {
    expect(diffReviewState.activeInlineDiff).toBeNull();
  });

  it('sets active inline diff', () => {
    const preview = {
      filePath: 'src/main.ts',
      diffText: '@@ -1 +1 @@\n-old\n+new',
      addedLines: 1,
      removedLines: 1,
    };
    setActiveInlineDiff(preview);
    expect(diffReviewState.activeInlineDiff).toEqual(preview);
  });

  it('clears active inline diff', () => {
    setActiveInlineDiff({
      filePath: 'test.ts',
      diffText: '@@ -1 +1 @@',
      addedLines: 0,
      removedLines: 0,
    });
    clearActiveInlineDiff();
    expect(diffReviewState.activeInlineDiff).toBeNull();
  });

  it('setActiveInlineDiff clones the preview (no shared reference)', () => {
    const preview = {
      filePath: 'test.ts',
      diffText: '@@ -1 +1 @@',
      addedLines: 2,
      removedLines: 1,
    };
    setActiveInlineDiff(preview);
    preview.filePath = 'mutated.ts';
    expect(diffReviewState.activeInlineDiff?.filePath).toBe('test.ts');
  });
});
