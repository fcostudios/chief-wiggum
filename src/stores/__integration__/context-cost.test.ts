import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIpcMocks } from '@/test/mockIPC';
import type { FileReference } from '@/lib/types';

function makeRef(overrides?: Partial<FileReference>): FileReference {
  return {
    relative_path: 'src/a.ts',
    name: 'a.ts',
    extension: 'ts',
    estimated_tokens: 200,
    is_directory: false,
    ...overrides,
  };
}

describe('Integration: context -> cost estimate', () => {
  beforeEach(() => {
    clearIpcMocks();
    vi.resetModules();
  });

  it('addFileReference increases total estimated tokens', async () => {
    const mod = await import('@/stores/contextStore');
    mod.clearAttachments();

    mod.addFileReference(makeRef({ estimated_tokens: 500 }));

    expect(mod.getTotalEstimatedTokens()).toBe(500);
    expect(mod.contextState.attachments).toHaveLength(1);
  });

  it('token hard cap prevents adding attachments beyond the limit', async () => {
    const mod = await import('@/stores/contextStore');
    mod.clearAttachments();

    mod.addFileReference(
      makeRef({ relative_path: 'big.ts', name: 'big.ts', estimated_tokens: 90_000 }),
    );
    mod.addFileReference(
      makeRef({ relative_path: 'huge.ts', name: 'huge.ts', estimated_tokens: 20_000 }),
    );

    expect(mod.contextState.attachments).toHaveLength(1);
    expect(mod.getTotalEstimatedTokens()).toBe(90_000);
  });

  it('removeAttachment decreases total estimated tokens', async () => {
    const mod = await import('@/stores/contextStore');
    mod.clearAttachments();

    mod.addFileReference(makeRef({ estimated_tokens: 300 }));
    const id = mod.contextState.attachments[0]?.id;
    expect(mod.getTotalEstimatedTokens()).toBe(300);
    mod.removeAttachment(id!);

    expect(mod.getTotalEstimatedTokens()).toBe(0);
    expect(mod.contextState.attachments).toHaveLength(0);
  });
});
