import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import { setActiveProject } from './projectStore';
import { clearMessages } from './conversationStore';
import {
  addFileBundle,
  addImageAttachment,
  addFileReference,
  addExternalFileAttachment,
  applyAttachmentOptimization,
  assembleContext,
  clearAttachments,
  contextState,
  getAttachmentCount,
  getImageCount,
  getImageTokenEstimate,
  getPromptImages,
  getTotalEstimatedTokens,
  refreshSymbolSuggestionForAttachment,
  refreshSuggestions,
  removeAttachment,
  removeImageAttachment,
  revertAttachmentOptimization,
  updateAttachmentRange,
} from './contextStore';
import type { FileReference } from '@/lib/types';

function makeRef(overrides?: Partial<FileReference>): FileReference {
  return {
    relative_path: 'src/main.ts',
    name: 'main.ts',
    extension: 'ts',
    estimated_tokens: 500,
    is_directory: false,
    ...overrides,
  };
}

describe('contextStore', () => {
  beforeEach(() => {
    clearAttachments();
    clearMessages();
    setActiveProject(null);
    mockIpcCommand('get_file_suggestions', () => []);
    mockIpcCommand('get_file_bundles', () => []);
    mockIpcCommand('read_project_file', () => ({
      relative_path: 'src/main.ts',
      content:
        'export function parseStream(input: string) { return input.trim(); }\nexport function formatOutput(value: string) { return value.toUpperCase(); }\n',
      line_count: 2,
      size_bytes: 17,
      language: 'typescript',
      estimated_tokens: 120,
      truncated: false,
    }));
    mockIpcCommand('read_claude_md', () => null);
    mockIpcCommand('start_project_file_watcher', () => undefined);
    mockIpcCommand('stop_project_file_watcher', () => undefined);
  });

  afterEach(() => {
    clearAttachments();
    clearMessages();
    setActiveProject(null);
  });

  it('starts with empty attachments', () => {
    expect(contextState.attachments).toEqual([]);
    expect(contextState.scores).toEqual({});
    expect(contextState.suggestions).toEqual([]);
    expect(contextState.symbolSuggestions).toEqual({});
  });

  it('addFileReference adds attachment', () => {
    addFileReference(makeRef());
    expect(getAttachmentCount()).toBe(1);
    expect(contextState.attachments[0].reference.relative_path).toBe('src/main.ts');
  });

  it('addFileReference deduplicates by path + range', () => {
    addFileReference(makeRef());
    addFileReference(makeRef());
    expect(getAttachmentCount()).toBe(1);
  });

  it('addFileReference allows same file with different range', () => {
    addFileReference(makeRef({ start_line: 1, end_line: 10 }));
    addFileReference(makeRef({ start_line: 20, end_line: 30 }));
    expect(getAttachmentCount()).toBe(2);
  });

  it('addFileReference blocks when exceeding token hard cap', () => {
    addFileReference(makeRef({ estimated_tokens: 90_000 }));
    addFileReference(
      makeRef({ relative_path: 'huge.ts', name: 'huge.ts', estimated_tokens: 20_000 }),
    );
    expect(getAttachmentCount()).toBe(1);
  });

  it('removeAttachment removes by ID', () => {
    addFileReference(makeRef());
    const id = contextState.attachments[0].id;
    removeAttachment(id);
    expect(getAttachmentCount()).toBe(0);
  });

  it('getTotalEstimatedTokens sums all attachments', () => {
    addFileReference(makeRef({ estimated_tokens: 200 }));
    addFileReference(
      makeRef({ relative_path: 'other.ts', name: 'other.ts', estimated_tokens: 300 }),
    );
    expect(getTotalEstimatedTokens()).toBe(500);
  });

  it('updateAttachmentRange recalculates token estimate', () => {
    addFileReference(makeRef({ estimated_tokens: 500 }));
    const id = contextState.attachments[0].id;
    updateAttachmentRange(id, 10, 20);
    expect(contextState.attachments[0].reference.estimated_tokens).toBe(110);
    expect(contextState.attachments[0].reference.start_line).toBe(10);
    expect(contextState.attachments[0].reference.end_line).toBe(20);
  });

  it('updateAttachmentRange normalizes invalid ranges', () => {
    addFileReference(makeRef({ estimated_tokens: 500 }));
    const id = contextState.attachments[0].id;
    updateAttachmentRange(id, 20, 10);
    expect(contextState.attachments[0].reference.start_line).toBe(20);
    expect(contextState.attachments[0].reference.end_line).toBeUndefined();
    expect(contextState.attachments[0].reference.estimated_tokens).toBe(500);
  });

  it('updateAttachmentRange ignores unknown attachment ID', () => {
    addFileReference(makeRef());
    updateAttachmentRange('missing', 1, 10);
    expect(contextState.attachments[0].reference.start_line).toBeUndefined();
  });

  it('clearAttachments resets state', () => {
    addFileReference(makeRef());
    clearAttachments();
    expect(getAttachmentCount()).toBe(0);
    expect(contextState.scores).toEqual({});
    expect(contextState.suggestions).toEqual([]);
    expect(contextState.symbolSuggestions).toEqual({});
  });

  it('assembleContext returns empty string when no attachments', async () => {
    const result = await assembleContext();
    expect(result).toBe('');
  });

  it('assembleContext returns empty string when no active project', async () => {
    addFileReference(makeRef());
    const result = await assembleContext();
    expect(result).toBe('');
  });

  it('assembleContext includes external dropped text without active project', async () => {
    addExternalFileAttachment('notes.ts', 'const x = 1;', '.ts');

    const result = await assembleContext();
    expect(result).toContain('<file path="[external] notes.ts"');
    expect(result).toContain('const x = 1;');
  });

  it('assembleContext builds XML context when active project exists', async () => {
    setActiveProject('proj-1');
    addFileReference(makeRef({ start_line: 2, end_line: 4 }));
    const result = await assembleContext();
    expect(result).toContain('<context>');
    expect(result).toContain('<file path="src/main.ts"');
    expect(result).toContain('parseStream');
    expect(result).toContain('</context>');
  });

  it('refreshSuggestions returns empty when no project', async () => {
    addFileReference(makeRef());
    await refreshSuggestions();
    expect(contextState.suggestions).toEqual([]);
  });

  it('computes and applies symbol optimization suggestion', async () => {
    setActiveProject('proj-1');
    addFileReference(makeRef({ estimated_tokens: 500 }));
    const id = contextState.attachments[0].id;

    await refreshSymbolSuggestionForAttachment(id);
    expect(contextState.symbolSuggestions[id]).toBeDefined();

    const applied = applyAttachmentOptimization(id);
    expect(applied).toBe(true);
    expect(contextState.attachments[0].reference.symbol_names?.length).toBeGreaterThan(0);
    expect(contextState.attachments[0].reference.full_file_tokens).toBe(500);
    expect(contextState.attachments[0].reference.estimated_tokens).toBeLessThan(500);

    const reverted = revertAttachmentOptimization(id);
    expect(reverted).toBe(true);
    expect(contextState.attachments[0].reference.symbol_names).toBeUndefined();
    expect(contextState.attachments[0].reference.estimated_tokens).toBe(500);
  });

  it('assembleContext includes symbols attribute for optimized attachments', async () => {
    setActiveProject('proj-1');
    addFileReference(makeRef({ estimated_tokens: 600 }));
    const id = contextState.attachments[0].id;

    await refreshSymbolSuggestionForAttachment(id);
    applyAttachmentOptimization(id);

    const result = await assembleContext();
    expect(result).toContain('symbols="');
    expect(result).toContain('parseStream');
  });

  it('addFileBundle attaches all entries', () => {
    const added = addFileBundle({
      id: 'component:src/main.ts',
      kind: 'component',
      label: 'Add with test file',
      reason: 'test',
      estimated_tokens: 200,
      entries: [
        {
          relative_path: 'src/main.ts',
          name: 'main.ts',
          extension: 'ts',
          estimated_tokens: 100,
        },
        {
          relative_path: 'src/main.test.ts',
          name: 'main.test.ts',
          extension: 'ts',
          estimated_tokens: 100,
        },
      ],
    });

    expect(added).toBe(2);
    expect(getAttachmentCount()).toBe(2);
  });

  describe('image attachments', () => {
    it('addImageAttachment stores image and returns id', () => {
      const id = addImageAttachment('data:image/png;base64,abc', 'image/png', 1024, 200, 200);
      expect(id).toBeTruthy();
      expect(getImageCount()).toBe(1);
      expect(contextState.images[0].file_name).toBe('paste-1.png');
      expect(getImageTokenEstimate()).toBeGreaterThan(0);
    });

    it('rejects images over 5MB', () => {
      const id = addImageAttachment('data:image/png;base64,abc', 'image/png', 6 * 1024 * 1024);
      expect(id).toBeNull();
      expect(getImageCount()).toBe(0);
    });

    it('removeImageAttachment removes image by id', () => {
      const id = addImageAttachment('data:image/png;base64,abc', 'image/png', 1024, 100, 100);
      expect(getImageCount()).toBe(1);
      removeImageAttachment(id!);
      expect(getImageCount()).toBe(0);
    });

    it('clearAttachments also clears images', () => {
      addImageAttachment('data:image/png;base64,abc', 'image/png', 1024);
      expect(getImageCount()).toBe(1);
      clearAttachments();
      expect(getImageCount()).toBe(0);
    });

    it('getTotalEstimatedTokens includes image tokens', () => {
      addImageAttachment('data:image/png;base64,YWJj', 'image/png', 1024, 512, 512);
      expect(getTotalEstimatedTokens()).toBeGreaterThan(0);
    });

    it('getPromptImages strips data URL prefix', () => {
      addImageAttachment('data:image/png;base64,YWJj', 'image/png', 3, 1, 1);
      const images = getPromptImages();
      expect(images).toHaveLength(1);
      expect(images[0].mime_type).toBe('image/png');
      expect(images[0].data_base64).toBe('YWJj');
    });

    it('assembleContext keeps file context and excludes image payload blocks', async () => {
      setActiveProject('proj-1');
      addFileReference(makeRef());
      addImageAttachment('data:image/png;base64,YWJj', 'image/png', 3, 1, 1);

      const result = await assembleContext();

      expect(result).toContain('<file path="src/main.ts"');
      expect(result).not.toContain('<image');
      expect(result).not.toContain('YWJj');
    });
  });

  describe('external attachments', () => {
    it('adds external dropped text attachment', () => {
      addExternalFileAttachment('scratch.py', 'print("hello")', '.py');
      expect(getAttachmentCount()).toBe(1);
      expect(contextState.attachments[0].reference.relative_path).toBe('[external] scratch.py');
    });

    it('deduplicates external files by generated external path', () => {
      addExternalFileAttachment('scratch.py', 'print("one")', '.py');
      addExternalFileAttachment('scratch.py', 'print("two")', '.py');
      expect(getAttachmentCount()).toBe(1);
    });
  });
});
