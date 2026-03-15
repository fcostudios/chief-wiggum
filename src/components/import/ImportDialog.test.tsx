import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { clearIpcMocks, mockIpcCommand } from '@/test/mockIPC';
import type { ImportReviewItem, Project } from '@/lib/types';

const { mockLoadSessions, mockAddToast, mockProjectState } = vi.hoisted(() => ({
  mockLoadSessions: vi.fn(async () => {}),
  mockAddToast: vi.fn(),
  mockProjectState: {
    activeProjectId: 'project-1',
    projects: [
      {
        id: 'project-1',
        name: 'Observer',
        path: '/Users/fcolomas/workspace/observer',
        default_model: null,
        default_effort: null,
        created_at: null,
        last_opened_at: null,
      },
    ] as Project[],
  },
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: mockProjectState,
}));

vi.mock('@/stores/sessionStore', () => ({
  loadSessions: () => mockLoadSessions(),
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: (...args: unknown[]) => mockAddToast(...args),
}));

import ImportDialog from './ImportDialog';
import {
  closeImportDialog,
  importState,
  openImportDialog,
  setImportReviewItems,
} from '@/stores/importStore';

function makeItem(
  overrides: Partial<ImportReviewItem> & Pick<ImportReviewItem, 'file_path' | 'project_path'>,
): ImportReviewItem {
  return {
    source: overrides.source ?? 'scanned',
    file_path: overrides.file_path,
    project_path: overrides.project_path,
    cli_session_id: overrides.cli_session_id ?? 'session-1',
    file_size_bytes: overrides.file_size_bytes ?? 512,
    line_count: overrides.line_count ?? 12,
    model: overrides.model ?? 'claude-sonnet-4-6',
    first_timestamp: overrides.first_timestamp ?? '2026-03-14T10:00:00Z',
    last_modified_timestamp: overrides.last_modified_timestamp ?? '2026-03-14T10:10:00Z',
    first_user_preview: overrides.first_user_preview ?? 'Investigate the import redesign',
    already_imported: overrides.already_imported ?? false,
    is_valid_jsonl: overrides.is_valid_jsonl ?? true,
    warning: overrides.warning ?? null,
  };
}

function installMockFilePicker(paths: string[]) {
  const originalCreateElement = document.createElement.bind(document);
  const picker = originalCreateElement('input') as HTMLInputElement & {
    files: Array<{ path: string }>;
  };
  Object.defineProperty(picker, 'files', {
    configurable: true,
    value: paths.map((path) => ({ path })),
  });
  picker.click = () => {
    picker.onchange?.(new Event('change'));
  };

  return vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'input') {
      return picker;
    }
    return originalCreateElement(tagName);
  }) as typeof document.createElement);
}

describe('ImportDialog', () => {
  beforeEach(() => {
    clearIpcMocks();
    mockLoadSessions.mockClear();
    mockAddToast.mockClear();
    mockProjectState.activeProjectId = 'project-1';
    mockProjectState.projects = [
      {
        id: 'project-1',
        name: 'Observer',
        path: '/Users/fcolomas/workspace/observer',
        default_model: null,
        default_effort: null,
        created_at: null,
        last_opened_at: null,
      },
    ];
    closeImportDialog();
    openImportDialog();
  });

  it('renders a review list and details pane when review items exist', () => {
    setImportReviewItems([
      makeItem({
        file_path:
          '/Users/fcolomas/.claude/projects/-Users-fcolomas-workspace-observer/session-1.jsonl',
        project_path: '/Users/fcolomas/workspace/observer',
      }),
    ]);

    render(() => <ImportDialog />);

    expect(screen.getByPlaceholderText(/search sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/session details/i)).toBeInTheDocument();
  });

  it('shows compressed row titles but full path in the details pane', () => {
    const filePath =
      '/Users/fcolomas/.claude/projects/-Users-fcolomas-workspace-observer-subfolder/session-1.jsonl';
    setImportReviewItems([
      makeItem({
        file_path: filePath,
        project_path: '/Users/fcolomas/workspace/observer/subfolder',
      }),
    ]);

    render(() => <ImportDialog />);

    expect(screen.getAllByText('observer / subfolder').length).toBeGreaterThan(0);
    expect(screen.getByText(filePath)).toBeInTheDocument();
  });

  it('updates the details pane when a row is focused', () => {
    const firstPath =
      '/Users/fcolomas/.claude/projects/-Users-fcolomas-workspace-observer/first.jsonl';
    const secondPath =
      '/Users/fcolomas/.claude/projects/-Users-fcolomas-workspace-observer/second.jsonl';
    setImportReviewItems([
      makeItem({ file_path: firstPath, project_path: '/Users/fcolomas/workspace/observer' }),
      makeItem({ file_path: secondPath, project_path: '/Users/fcolomas/workspace/observer' }),
    ]);

    render(() => <ImportDialog />);
    fireEvent.click(screen.getByRole('button', { name: secondPath }));

    expect(screen.getByText(secondPath)).toBeInTheDocument();
  });

  it('shows Picked, Already imported, and Active project match badges', () => {
    setImportReviewItems([
      makeItem({
        source: 'picked',
        file_path: '/picked/session-1.jsonl',
        project_path: '/Users/fcolomas/workspace/observer',
        already_imported: true,
      }),
    ]);

    render(() => <ImportDialog />);

    expect(screen.getByText('Picked')).toBeInTheDocument();
    expect(screen.getAllByText('Already imported').length).toBeGreaterThan(0);
    expect(screen.getByText('Active project')).toBeInTheDocument();
  });

  it('merges picked items into the same list, sorts them first, and focuses the first picked item', async () => {
    const scannedPath =
      '/Users/fcolomas/.claude/projects/-Users-fcolomas-workspace-observer/scanned.jsonl';
    const pickedPath = '/Users/fcolomas/imports/picked.jsonl';
    setImportReviewItems([
      makeItem({
        file_path: scannedPath,
        project_path: '/Users/fcolomas/workspace/observer',
        cli_session_id: 'scanned',
      }),
    ]);
    mockIpcCommand('inspect_importable_files', () => [
      makeItem({
        source: 'picked',
        file_path: pickedPath,
        project_path: '/Users/fcolomas/workspace/observer/imports',
        cli_session_id: 'picked',
      }),
    ]);
    const createElementSpy = installMockFilePicker([pickedPath]);

    render(() => <ImportDialog />);
    fireEvent.click(screen.getByRole('button', { name: /pick file/i }));

    await waitFor(() => expect(importState.reviewItems[0].file_path).toBe(pickedPath));
    expect(importState.focusedPath).toBe(pickedPath);
    expect(screen.getByText(pickedPath)).toBeInTheDocument();

    createElementSpy.mockRestore();
  });

  it('dedupes duplicate picked and scanned paths and keeps import disabled until a valid row is selected', async () => {
    const sharedPath =
      '/Users/fcolomas/.claude/projects/-Users-fcolomas-workspace-observer/shared.jsonl';
    setImportReviewItems([
      makeItem({
        file_path: sharedPath,
        project_path: '/Users/fcolomas/workspace/observer',
        cli_session_id: 'shared',
      }),
    ]);
    mockIpcCommand('inspect_importable_files', () => [
      makeItem({
        source: 'picked',
        file_path: sharedPath,
        project_path: '/Users/fcolomas/workspace/observer',
        cli_session_id: 'shared',
      }),
    ]);
    const createElementSpy = installMockFilePicker([sharedPath]);

    render(() => <ImportDialog />);

    const importButton = screen.getByRole('button', { name: /import sessions/i });
    expect(importButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /pick file/i }));

    await waitFor(() => expect(importState.reviewItems).toHaveLength(1));
    expect(importState.reviewItems[0].source).toBe('picked');
    expect(importButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(`Select ${sharedPath}`));
    await waitFor(() => expect(importButton).not.toBeDisabled());

    createElementSpy.mockRestore();
  });
});
