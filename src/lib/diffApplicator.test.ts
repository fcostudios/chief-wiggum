import { describe, expect, it } from 'vitest';
import { applyDiff, extractFilePath, isDiffBlock } from './diffApplicator';

const UNIFIED_DIFF = `--- a/src/auth/service.ts
+++ b/src/auth/service.ts
@@ -1,3 +1,4 @@
 import { sessions } from './store';
-const token = sessions.get(userId);
+import jwt from 'jsonwebtoken';
+const token = await jwt.sign({ userId }, secret);
 export { token };`;

describe('isDiffBlock', () => {
  it('detects unified diff by --- a/ pattern', () => {
    expect(isDiffBlock('text', UNIFIED_DIFF)).toBe(true);
  });

  it('detects diff blocks by language tag', () => {
    expect(isDiffBlock('diff', 'anything')).toBe(true);
  });

  it('returns false for non-diff content', () => {
    expect(isDiffBlock('typescript', 'const x = 1;')).toBe(false);
  });
});

describe('extractFilePath', () => {
  it('extracts file path from --- a/ line', () => {
    expect(extractFilePath(UNIFIED_DIFF)).toBe('src/auth/service.ts');
  });

  it('returns null if no path found', () => {
    expect(extractFilePath('not a diff')).toBeNull();
  });
});

describe('applyDiff', () => {
  it('applies a unified diff to original content', () => {
    const original = `import { sessions } from './store';
const token = sessions.get(userId);
export { token };`;
    const result = applyDiff(original, UNIFIED_DIFF);
    expect(result).toContain("import jwt from 'jsonwebtoken'");
    expect(result).not.toContain('sessions.get(userId)');
  });

  it('returns null when patch cannot be applied', () => {
    const incompatibleOriginal = 'completely different content';
    const result = applyDiff(incompatibleOriginal, UNIFIED_DIFF);
    expect(result).toBeNull();
  });
});
