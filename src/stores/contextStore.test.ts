import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import { setActiveProject } from './projectStore';
import { clearMessages } from './conversationStore';
import {
  addFileReference,
  assembleContext,
  clearAttachments,
  contextState,
  getAttachmentCount,
  getTotalEstimatedTokens,
  refreshSuggestions,
  removeAttachment,
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
    mockIpcCommand('read_project_file', () => ({
      relative_path: 'src/main.ts',
      content: 'file content here',
      line_count: 3,
      size_bytes: 17,
      language: 'typescript',
      estimated_tokens: 100,
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

  it('assembleContext builds XML context when active project exists', async () => {
    setActiveProject('proj-1');
    addFileReference(makeRef({ start_line: 2, end_line: 4 }));
    const result = await assembleContext();
    expect(result).toContain('<context>');
    expect(result).toContain('<file path="src/main.ts"');
    expect(result).toContain('file content here');
    expect(result).toContain('</context>');
  });

  it('refreshSuggestions returns empty when no project', async () => {
    addFileReference(makeRef());
    await refreshSuggestions();
    expect(contextState.suggestions).toEqual([]);
  });
});
