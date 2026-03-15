import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportReviewItem } from '@/lib/types';
import {
  closeImportDialog,
  getSelectedImportFilePaths,
  getVisibleImportReviewItems,
  importState,
  mergePickedReviewItems,
  openImportDialog,
  setFocusedImportItem,
  setImportReviewItems,
  setImportSearchQuery,
  toggleImportSelection,
} from './importStore';

function makeItem(
  overrides: Partial<ImportReviewItem> & Pick<ImportReviewItem, 'file_path' | 'project_path'>,
): ImportReviewItem {
  return {
    source: overrides.source ?? 'scanned',
    file_path: overrides.file_path,
    project_path: overrides.project_path,
    cli_session_id: overrides.cli_session_id ?? overrides.file_path.split('/').at(-1) ?? 'session',
    file_size_bytes: overrides.file_size_bytes ?? 128,
    line_count: overrides.line_count ?? 4,
    model: overrides.model ?? 'claude-sonnet-4-6',
    first_timestamp: overrides.first_timestamp ?? '2026-03-14T10:00:00Z',
    last_modified_timestamp: overrides.last_modified_timestamp ?? '2026-03-14T10:10:00Z',
    first_user_preview: overrides.first_user_preview ?? 'Import this transcript',
    already_imported: overrides.already_imported ?? false,
    is_valid_jsonl: overrides.is_valid_jsonl ?? true,
    warning: overrides.warning ?? null,
  };
}

describe('importStore', () => {
  beforeEach(() => {
    closeImportDialog();
    openImportDialog();
  });

  it('merges picked items above scanned items', () => {
    setImportReviewItems([
      makeItem({ file_path: '/scan/one.jsonl', project_path: '/scan/project' }),
      makeItem({ file_path: '/scan/two.jsonl', project_path: '/scan/project' }),
    ]);

    mergePickedReviewItems([
      makeItem({
        source: 'picked',
        file_path: '/picked/one.jsonl',
        project_path: '/picked/project',
      }),
    ]);

    expect(importState.reviewItems.map((item) => item.file_path)).toEqual([
      '/picked/one.jsonl',
      '/scan/one.jsonl',
      '/scan/two.jsonl',
    ]);
    expect(importState.focusedPath).toBe('/picked/one.jsonl');
  });

  it('dedupes by file_path and upgrades source to picked', () => {
    setImportReviewItems([
      makeItem({
        file_path: '/shared/session.jsonl',
        project_path: '/scan/project',
        source: 'scanned',
      }),
    ]);

    mergePickedReviewItems([
      makeItem({
        file_path: '/shared/session.jsonl',
        project_path: '/scan/project',
        source: 'picked',
        first_user_preview: 'Picked version',
      }),
    ]);

    expect(importState.reviewItems).toHaveLength(1);
    expect(importState.reviewItems[0].source).toBe('picked');
    expect(importState.reviewItems[0].first_user_preview).toBe('Picked version');
  });

  it('tracks focused row independently from selected rows', () => {
    setImportReviewItems([
      makeItem({ file_path: '/scan/one.jsonl', project_path: '/scan/project' }),
      makeItem({ file_path: '/scan/two.jsonl', project_path: '/scan/project' }),
    ]);

    toggleImportSelection('/scan/one.jsonl');
    setFocusedImportItem('/scan/two.jsonl');

    expect(getSelectedImportFilePaths()).toEqual(['/scan/one.jsonl']);
    expect(importState.focusedPath).toBe('/scan/two.jsonl');
  });

  it('disables invalid or already-imported rows from selection', () => {
    setImportReviewItems([
      makeItem({
        file_path: '/scan/invalid.jsonl',
        project_path: '/scan/project',
        is_valid_jsonl: false,
      }),
      makeItem({
        file_path: '/scan/imported.jsonl',
        project_path: '/scan/project',
        already_imported: true,
      }),
      makeItem({ file_path: '/scan/valid.jsonl', project_path: '/scan/project' }),
    ]);

    toggleImportSelection('/scan/invalid.jsonl');
    toggleImportSelection('/scan/imported.jsonl');
    toggleImportSelection('/scan/valid.jsonl');

    expect(getSelectedImportFilePaths()).toEqual(['/scan/valid.jsonl']);
  });

  it('filters by path tail, project path, model, and session id', () => {
    setImportReviewItems([
      makeItem({
        file_path: '/workspace/observer/alpha-session.jsonl',
        project_path: '/workspace/observer',
        cli_session_id: 'alpha-123',
        model: 'claude-opus-4-6',
      }),
      makeItem({
        file_path: '/workspace/beta/notes.jsonl',
        project_path: '/workspace/beta',
        cli_session_id: 'beta-555',
        model: 'claude-haiku-4-5',
      }),
    ]);

    setImportSearchQuery('alpha-session');
    expect(getVisibleImportReviewItems().map((item) => item.file_path)).toEqual([
      '/workspace/observer/alpha-session.jsonl',
    ]);

    setImportSearchQuery('/workspace/beta');
    expect(getVisibleImportReviewItems().map((item) => item.file_path)).toEqual([
      '/workspace/beta/notes.jsonl',
    ]);

    setImportSearchQuery('haiku');
    expect(getVisibleImportReviewItems().map((item) => item.file_path)).toEqual([
      '/workspace/beta/notes.jsonl',
    ]);

    setImportSearchQuery('alpha-123');
    expect(getVisibleImportReviewItems().map((item) => item.file_path)).toEqual([
      '/workspace/observer/alpha-session.jsonl',
    ]);
  });
});
