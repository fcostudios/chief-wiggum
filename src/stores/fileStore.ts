// src/stores/fileStore.ts
// Manages file tree state: lazy-loaded directory tree, selection, search, preview.
// Backed by list_project_files / search_project_files / read_project_file IPC.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { FileNode, FileContent, FileSearchResult } from '@/lib/types';

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
  /** Preview content for the selected file. */
  previewContent: FileContent | null;
  /** Whether preview is loading. */
  isPreviewLoading: boolean;
  /** Whether the files section is visible. */
  isVisible: boolean;
  /** Selected line range for code range selection. */
  selectedRange: { start: number; end: number } | null;
}

const [state, setState] = createStore<FileState>({
  tree: {},
  expandedPaths: [],
  selectedPath: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  isLoading: false,
  previewContent: null,
  isPreviewLoading: false,
  isVisible: true,
  selectedRange: null,
});

export { state as fileState };

/** Load root-level files for a project. */
export async function loadRootFiles(projectId: string): Promise<void> {
  setState('isLoading', true);
  try {
    const nodes = await invoke<FileNode[]>('list_project_files', {
      project_id: projectId,
      relative_path: null,
      max_depth: 1,
    });
    setState('tree', '', nodes);
  } catch (err) {
    console.error('[fileStore] Failed to load root files:', err);
  } finally {
    setState('isLoading', false);
  }
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
    });
    setState('tree', relativePath, nodes);
  } catch (err) {
    console.error('[fileStore] Failed to load directory:', err);
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
  setState('selectedPath', relativePath);
  setState('isPreviewLoading', true);
  setState('selectedRange', null);
  try {
    const content = await invoke<FileContent>('read_project_file', {
      project_id: projectId,
      relative_path: relativePath,
      start_line: null,
      end_line: 50,
    });
    setState('previewContent', content);
  } catch (err) {
    console.error('[fileStore] Failed to load preview:', err);
    setState('previewContent', null);
  } finally {
    setState('isPreviewLoading', false);
  }
}

/** Search files by name. */
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

export function searchFiles(projectId: string, query: string): void {
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
      console.error('[fileStore] Failed to search files:', err);
    } finally {
      setState('isSearching', false);
    }
  }, 150);
}

/** Clear search state. */
export function clearSearch(): void {
  setState({ searchQuery: '', searchResults: [], isSearching: false });
}

/** Toggle files section visibility. */
export function toggleFilesVisible(): void {
  setState('isVisible', (v) => !v);
}

/** Clear all file state (e.g., on project switch). */
export function clearFileState(): void {
  setState({
    tree: {},
    expandedPaths: [],
    selectedPath: null,
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    isLoading: false,
    previewContent: null,
    isPreviewLoading: false,
    selectedRange: null,
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

/** Get estimated tokens for the selected range. */
export function getSelectedRangeTokens(): number {
  if (!state.selectedRange || !state.previewContent) return 0;
  const lines = state.previewContent.content.split('\n');
  const start = state.selectedRange.start - 1;
  const end = Math.min(state.selectedRange.end, lines.length);
  const selectedText = lines.slice(start, end).join('\n');
  return Math.round(selectedText.length / 4);
}
