// src/stores/fileStore.ts
// Manages file tree state: lazy-loaded directory tree, selection, search, preview.
// Backed by list_project_files / search_project_files / read_project_file IPC.

import { createStore } from 'solid-js/store';
import { untrack } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileNode, FileContent, FileSearchResult, GitFileStatus } from '@/lib/types';
import { projectState } from '@/stores/projectStore';
import { createLogger } from '@/lib/logger';
import { addToast } from '@/stores/toastStore';

const log = createLogger('ui/files');
const SHOW_IGNORED_KEY_PREFIX = 'cw:showIgnoredFiles:';

function showIgnoredStorageKey(projectId: string): string {
  return `${SHOW_IGNORED_KEY_PREFIX}${projectId}`;
}

function loadPersistedShowIgnored(projectId: string): boolean {
  try {
    return localStorage.getItem(showIgnoredStorageKey(projectId)) === '1';
  } catch {
    return false;
  }
}

function persistShowIgnored(projectId: string, value: boolean): void {
  try {
    localStorage.setItem(showIgnoredStorageKey(projectId), value ? '1' : '0');
  } catch {
    // localStorage may be unavailable in test/browser mode.
  }
}

interface FileState {
  /** Cached tree nodes per relative path (path -> children). */
  tree: Record<string, FileNode[]>;
  /** Set of expanded directory paths. */
  expandedPaths: string[];
  /** Currently selected file path (for preview). */
  selectedPath: string | null;
  /** File search query. */
  searchQuery: string;
  /** Search results. */
  searchResults: FileSearchResult[];
  /** Whether a search is in flight. */
  isSearching: boolean;
  /** Whether the file tree root is loading. */
  isLoading: boolean;
  /** Last root file-tree load error, if any. */
  loadError: string | null;
  /** Preview content for the selected file. */
  previewContent: FileContent | null;
  /** Whether preview is loading. */
  isPreviewLoading: boolean;
  /** Git status per relative path. */
  gitStatuses: Record<string, GitFileStatus>;
  /** Whether git statuses are loading. */
  isGitLoading: boolean;
  /** Whether the files section is visible. */
  isVisible: boolean;
  /** Whether .gitignored files are shown in the explorer. */
  showIgnoredFiles: boolean;
  /** Selected line range for code range selection. */
  selectedRange: { start: number; end: number } | null;
  /** Attachment currently being edited from ContextChip click, if any. */
  editingAttachmentId: string | null;
  // ── Inline editing (CHI-217) ──────────────────────
  /** Whether the file is currently open in the inline editor. */
  isEditing: boolean;
  /** Whether the editor buffer differs from the saved file. */
  isDirty: boolean;
  /** Current editor save lifecycle status. */
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** Full file content loaded for editing (may be larger than the 50-line preview). */
  fullContent: string | null;
  /** Path of the file currently being edited. */
  editingFilePath: string | null;
  /** Whether the file on disk changed while editing (conflict detected). */
  conflictDetected: boolean;
  /** Whether the file is read-only on disk. */
  isReadonly: boolean;
}

const [state, setState] = createStore<FileState>({
  tree: {},
  expandedPaths: [],
  selectedPath: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  isLoading: false,
  loadError: null,
  previewContent: null,
  isPreviewLoading: false,
  gitStatuses: {},
  isGitLoading: false,
  isVisible: true,
  showIgnoredFiles: false,
  selectedRange: null,
  editingAttachmentId: null,
  isEditing: false,
  isDirty: false,
  saveStatus: 'idle',
  fullContent: null,
  editingFilePath: null,
  conflictDetected: false,
  isReadonly: false,
});

export { state as fileState };

interface FilesChangedEvent {
  project_id: string;
  paths: string[];
}

let filesChangedListenerReady: Promise<void> | null = null;
let filesChangedUnlisten: UnlistenFn | null = null;
let filesChangedDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let queuedFilesChangedProjectId: string | null = null;
let queuedFilesChangedPaths = new Set<string>();
let filesChangedRefreshChain: Promise<void> = Promise.resolve();

function collectAffectedTreeKeys(paths: string[], includeRoot = true): Set<string> {
  const keys = new Set<string>();
  if (includeRoot) keys.add('');
  for (const path of paths) {
    if (!path) continue;
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      keys.add(current);
    }
  }
  return keys;
}

function invalidateTreeCache(paths: string[], includeRoot = true): void {
  if (paths.length === 0) return;
  const keys = collectAffectedTreeKeys(paths, includeRoot);
  const nextTree = { ...state.tree };
  for (const key of keys) {
    delete nextTree[key];
  }
  setState('tree', nextTree);
}

function isRootTreeAffected(paths: string[]): boolean {
  return paths.some((path) => path.split('/').filter(Boolean).length <= 1);
}

interface LoadRootFilesOptions {
  showLoading?: boolean;
  refreshGitStatuses?: boolean;
}

async function loadRootFilesInternal(
  projectId: string,
  options: LoadRootFilesOptions = {},
): Promise<void> {
  const showIgnored = loadPersistedShowIgnored(projectId);
  if (state.showIgnoredFiles !== showIgnored) {
    setState('showIgnoredFiles', showIgnored);
  }
  const { showLoading = true, refreshGitStatuses = true } = options;
  if (showLoading) setState('isLoading', true);
  setState('loadError', null);
  try {
    const nodes = await invoke<FileNode[]>('list_project_files', {
      project_id: projectId,
      relative_path: null,
      max_depth: 1,
      show_ignored: showIgnored,
    });
    setState('tree', '', nodes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load files';
    log.error('Failed to load root files: ' + msg);
    setState('loadError', msg);
  } finally {
    if (showLoading) setState('isLoading', false);
  }

  if (refreshGitStatuses) {
    void loadGitStatuses(projectId);
  }
}

async function handleFilesChanged(
  payload: FilesChangedEvent,
  activeProjectId: string | null,
): Promise<void> {
  if (!activeProjectId || payload.project_id !== activeProjectId) {
    return;
  }

  const changedPaths = payload.paths.filter(Boolean);
  if (changedPaths.length === 0) return;

  const rootAffected = isRootTreeAffected(changedPaths);
  invalidateTreeCache(changedPaths, rootAffected);

  // Refresh root and any visible expanded folders impacted by the change.
  if (rootAffected) {
    await loadRootFilesInternal(payload.project_id, {
      showLoading: false,
      refreshGitStatuses: false,
    });
  }
  const affectedKeys = collectAffectedTreeKeys(changedPaths, false);
  const dirsToRefresh = state.expandedPaths.filter((path) => affectedKeys.has(path));
  for (const dir of dirsToRefresh) {
    await loadDirectoryChildren(payload.project_id, dir);
  }

  // Refresh the selected preview if its file changed.
  if (state.selectedPath && changedPaths.includes(state.selectedPath)) {
    if (state.isEditing) {
      setState('conflictDetected', true);
    } else {
      await selectFile(payload.project_id, state.selectedPath);
    }
  }

  // Keep search results fresh while searching.
  if (state.searchQuery.trim()) {
    searchFiles(payload.project_id, state.searchQuery);
  }

  // Refresh git statuses on file changes
  void loadGitStatuses(payload.project_id);
}

function queueFilesChangedRefresh(payload: FilesChangedEvent): void {
  const activeProjectId = projectState.activeProjectId;
  if (!activeProjectId || payload.project_id !== activeProjectId) {
    return;
  }

  const changedPaths = payload.paths.filter(Boolean);
  if (changedPaths.length === 0) return;

  if (queuedFilesChangedProjectId && queuedFilesChangedProjectId !== payload.project_id) {
    queuedFilesChangedPaths.clear();
  }

  queuedFilesChangedProjectId = payload.project_id;
  for (const path of changedPaths) {
    queuedFilesChangedPaths.add(path);
  }

  if (filesChangedDebounceTimer) clearTimeout(filesChangedDebounceTimer);
  filesChangedDebounceTimer = setTimeout(() => {
    filesChangedDebounceTimer = null;
    const projectId = queuedFilesChangedProjectId;
    const paths = [...queuedFilesChangedPaths];
    queuedFilesChangedProjectId = null;
    queuedFilesChangedPaths.clear();

    if (!projectId || paths.length === 0) return;
    const activeProjectId = untrack(() => projectState.activeProjectId);

    filesChangedRefreshChain = filesChangedRefreshChain
      // eslint-disable-next-line solid/reactivity -- queued watcher refresh intentionally snapshots store state outside tracked scope
      .then(() =>
        handleFilesChanged(
          {
            project_id: projectId,
            paths,
          },
          activeProjectId,
        ),
      )
      .catch((err) => {
        log.error(
          'Failed to handle coalesced files:changed event: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      });
  }, 120);
}

async function ensureFilesChangedListener(): Promise<void> {
  if (filesChangedUnlisten) return;
  if (filesChangedListenerReady) return filesChangedListenerReady;

  filesChangedListenerReady = (async () => {
    try {
      filesChangedUnlisten = await listen<FilesChangedEvent>('files:changed', (event) => {
        queueFilesChangedRefresh(event.payload);
      });
    } catch (err) {
      log.warn(
        'Failed to register files:changed listener: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      filesChangedListenerReady = null;
    }
  })();

  await filesChangedListenerReady;
}

/** Load root-level files for a project. */
export async function loadRootFiles(projectId: string): Promise<void> {
  void ensureFilesChangedListener();
  await loadRootFilesInternal(projectId);
}

/** Retry loading root files after a failure. */
export async function retryLoadFiles(): Promise<void> {
  const projectId = projectState.activeProjectId;
  if (!projectId) return;
  setState('loadError', null);
  await loadRootFilesInternal(projectId);
}

/** Load children for a directory (lazy expand). */
export async function loadDirectoryChildren(
  projectId: string,
  relativePath: string,
): Promise<void> {
  try {
    const nodes = await invoke<FileNode[]>('list_project_files', {
      project_id: projectId,
      relative_path: relativePath,
      max_depth: 1,
      show_ignored: state.showIgnoredFiles,
    });
    setState('tree', relativePath, nodes);
  } catch (err) {
    log.error('Failed to load directory: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Toggle a directory expanded/collapsed. Loads children on first expand. */
export async function toggleFolder(projectId: string, relativePath: string): Promise<void> {
  const isExpanded = state.expandedPaths.includes(relativePath);
  if (isExpanded) {
    setState(
      'expandedPaths',
      state.expandedPaths.filter((p) => p !== relativePath),
    );
  } else {
    setState('expandedPaths', [...state.expandedPaths, relativePath]);
    if (!state.tree[relativePath]) {
      await loadDirectoryChildren(projectId, relativePath);
    }
  }
}

/** Select a file for preview. */
export async function selectFile(projectId: string, relativePath: string): Promise<void> {
  void ensureFilesChangedListener();
  setState('selectedPath', relativePath);
  setState('isPreviewLoading', true);
  setState('selectedRange', null);
  setState('editingAttachmentId', null);
  try {
    const content = await invoke<FileContent>('read_project_file', {
      project_id: projectId,
      relative_path: relativePath,
      start_line: null,
      end_line: 50,
    });
    // Exit any active edit session when switching files
    setState({
      isEditing: false,
      isDirty: false,
      saveStatus: 'idle',
      fullContent: null,
      editingFilePath: null,
      conflictDetected: false,
    });
    // Set read-only flag from file metadata
    setState('isReadonly', content.is_readonly ?? false);
    setState('previewContent', content);
  } catch (err) {
    log.error('Failed to load preview: ' + (err instanceof Error ? err.message : String(err)));
    setState('previewContent', null);
    setState('isReadonly', false);
  } finally {
    setState('isPreviewLoading', false);
  }
}

/** Open a file for range editing (from ContextChip click) and preselect a line range. */
export async function selectFileForEditing(
  relativePath: string,
  startLine?: number,
  endLine?: number,
  attachmentId?: string,
): Promise<void> {
  const projectId = projectState.activeProjectId;
  if (!projectId) return;

  await selectFile(projectId, relativePath);

  const normalizedStart = startLine && startLine > 0 ? startLine : undefined;
  const normalizedEnd =
    normalizedStart && endLine && endLine >= normalizedStart ? endLine : undefined;

  if (normalizedEnd && normalizedEnd > 50) {
    try {
      const content = await invoke<FileContent>('read_project_file', {
        project_id: projectId,
        relative_path: relativePath,
        start_line: null,
        end_line: normalizedEnd,
      });
      setState('previewContent', content);
    } catch (err) {
      log.warn(
        'Failed to preload full edit range preview: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  if (normalizedStart != null && normalizedEnd != null) {
    setState('selectedRange', { start: normalizedStart, end: normalizedEnd });
  }
  setState('editingAttachmentId', attachmentId ?? null);
}

/** Search files by name. */
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

export function searchFiles(projectId: string, query: string): void {
  void ensureFilesChangedListener();
  setState('searchQuery', query);
  if (!query.trim()) {
    setState('searchResults', []);
    setState('isSearching', false);
    return;
  }
  setState('isSearching', true);

  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const results = await invoke<FileSearchResult[]>('search_project_files', {
        project_id: projectId,
        query: query.trim(),
        max_results: 20,
      });
      setState('searchResults', results);
    } catch (err) {
      log.error('Failed to search files: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setState('isSearching', false);
    }
  }, 150);
}

/** Clear search state. */
export function clearSearch(): void {
  setState({ searchQuery: '', searchResults: [], isSearching: false });
}

/** Navigate to a directory in the file tree by expanding all ancestors. */
export async function navigateToFolder(projectId: string, folderPath: string): Promise<void> {
  const parts = folderPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!state.expandedPaths.includes(current)) {
      setState('expandedPaths', (prev) => [...prev, current]);
      if (!state.tree[current]) {
        await loadDirectoryChildren(projectId, current);
      }
    }
  }
}

/** Toggle files section visibility. */
export function toggleFilesVisible(): void {
  setState('isVisible', (v) => !v);
}

/** Toggle whether .gitignored files are visible in the explorer. */
export function toggleShowIgnoredFiles(): void {
  const projectId = projectState.activeProjectId;
  const next = !state.showIgnoredFiles;
  setState('showIgnoredFiles', next);

  if (!projectId) return;

  persistShowIgnored(projectId, next);
  setState('tree', {});
  void (async () => {
    await loadRootFilesInternal(projectId);
    for (const path of state.expandedPaths) {
      await loadDirectoryChildren(projectId, path);
    }
  })();
}

/** Clear all file state (e.g., on project switch). */
export function clearFileState(): void {
  if (filesChangedDebounceTimer) {
    clearTimeout(filesChangedDebounceTimer);
    filesChangedDebounceTimer = null;
  }
  queuedFilesChangedProjectId = null;
  queuedFilesChangedPaths.clear();
  setState({
    tree: {},
    expandedPaths: [],
    selectedPath: null,
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    isLoading: false,
    loadError: null,
    previewContent: null,
    isPreviewLoading: false,
    gitStatuses: {},
    isGitLoading: false,
    showIgnoredFiles: false,
    selectedRange: null,
    editingAttachmentId: null,
    isEditing: false,
    isDirty: false,
    saveStatus: 'idle',
    fullContent: null,
    editingFilePath: null,
    conflictDetected: false,
    isReadonly: false,
  });
}

/** Check if a directory is expanded. */
export function isExpanded(relativePath: string): boolean {
  return state.expandedPaths.includes(relativePath);
}

/** Get children for a directory path from cache. */
export function getChildren(relativePath: string): FileNode[] {
  return state.tree[relativePath] ?? [];
}

/** Get root nodes. */
export function getRootNodes(): FileNode[] {
  return state.tree[''] ?? [];
}

/** Set the selected line range. */
export function setSelectedRange(range: { start: number; end: number } | null): void {
  setState('selectedRange', range);
}

/** Enter inline edit mode for the currently previewed file. Loads full content first. */
export async function enterEditMode(content: string, relativePath: string): Promise<void> {
  setState({
    isEditing: true,
    isDirty: false,
    saveStatus: 'idle',
    fullContent: content,
    editingFilePath: relativePath,
    conflictDetected: false,
  });
}

/** Exit inline edit mode, discarding any unsaved buffer reference. */
export function exitEditMode(): void {
  setState({
    isEditing: false,
    isDirty: false,
    saveStatus: 'idle',
    fullContent: null,
    editingFilePath: null,
    conflictDetected: false,
  });
}

/** Dismiss the on-disk conflict banner (user chose "Keep my edits"). */
export function clearConflict(): void {
  setState('conflictDetected', false);
}

/** Update the editor buffer (called on every CodeMirror doc change). */
export function setEditBuffer(content: string): void {
  setState({ fullContent: content, isDirty: true });
}

/** Persist the current edit buffer to disk. Shows toast on completion. */
export async function saveFileEdit(projectId: string, relativePath: string): Promise<void> {
  const content = state.fullContent;
  if (content == null) return;
  setState('saveStatus', 'saving');
  try {
    await invoke('write_file_content', {
      project_id: projectId,
      relative_path: relativePath,
      content,
    });
    setState({ saveStatus: 'saved', isDirty: false });
    addToast('File saved', 'success');
    // Reset to idle after 2s so the status label clears
    setTimeout(() => setState('saveStatus', 'idle'), 2000);
  } catch (err) {
    setState('saveStatus', 'error');
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Failed to save file: ' + msg);
    addToast('Failed to save: ' + msg, 'error');
  }
}

/** Get estimated tokens for the selected range. */
export function getSelectedRangeTokens(): number {
  if (!state.selectedRange || !state.previewContent) return 0;
  const lines = state.previewContent.content.split('\n');
  const start = state.selectedRange.start - 1;
  const end = Math.min(state.selectedRange.end, lines.length);
  const selectedText = lines.slice(start, end).join('\n');
  return Math.round(selectedText.length / 4);
}

/** Load git file statuses for the active project. */
export async function loadGitStatuses(projectId: string): Promise<void> {
  setState('isGitLoading', true);
  try {
    const statuses = await invoke<Record<string, GitFileStatus>>('get_git_file_statuses', {
      project_id: projectId,
    });
    setState('gitStatuses', statuses);
  } catch (err) {
    log.warn('Failed to load git statuses: ' + (err instanceof Error ? err.message : String(err)));
    setState('gitStatuses', {});
  } finally {
    setState('isGitLoading', false);
  }
}

/** Get git status for a specific file path. */
export function getGitStatus(relativePath: string): GitFileStatus | null {
  return state.gitStatuses[relativePath] ?? null;
}
