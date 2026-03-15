import { createStore } from 'solid-js/store';
import type { ImportResult, ImportReviewItem } from '@/lib/types';

interface ImportState {
  dialogOpen: boolean;
  phase: 'idle' | 'discovering' | 'importing' | 'done' | 'error';
  error: string | null;
  reviewItems: ImportReviewItem[];
  selectedPaths: string[];
  focusedPath: string | null;
  searchQuery: string;
  results: ImportResult[];
}

function createInitialState(): ImportState {
  return {
    dialogOpen: false,
    phase: 'idle',
    error: null,
    reviewItems: [],
    selectedPaths: [],
    focusedPath: null,
    searchQuery: '',
    results: [],
  };
}

const [importState, setImportState] = createStore<ImportState>(createInitialState());

function compareReviewItems(left: ImportReviewItem, right: ImportReviewItem): number {
  const leftPriority = left.source === 'picked' ? 0 : 1;
  const rightPriority = right.source === 'picked' ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return left.file_path.localeCompare(right.file_path);
}

function mergeReviewItems(
  currentItems: ImportReviewItem[],
  incomingItems: ImportReviewItem[],
): ImportReviewItem[] {
  const byPath = new Map<string, ImportReviewItem>();

  for (const item of currentItems) {
    byPath.set(item.file_path, item);
  }

  for (const item of incomingItems) {
    const existing = byPath.get(item.file_path);
    if (!existing) {
      byPath.set(item.file_path, item);
      continue;
    }
    byPath.set(item.file_path, {
      ...existing,
      ...item,
      source: existing.source === 'picked' || item.source === 'picked' ? 'picked' : 'scanned',
    });
  }

  return [...byPath.values()].sort(compareReviewItems);
}

function matchesSearch(item: ImportReviewItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const haystacks = [
    item.file_path.split('/').at(-1) ?? '',
    item.file_path,
    item.project_path,
    item.cli_session_id,
    item.model ?? '',
  ];
  return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function canSelectImportItem(item: ImportReviewItem): boolean {
  return item.is_valid_jsonl && !item.already_imported;
}

function applyReviewItems(items: ImportReviewItem[], preferredFocusPath?: string | null): void {
  const existingPaths = new Set(items.map((item) => item.file_path));
  const nextSelectedPaths = importState.selectedPaths.filter((path) => {
    if (!existingPaths.has(path)) {
      return false;
    }
    const item = items.find((candidate) => candidate.file_path === path);
    return item ? canSelectImportItem(item) : false;
  });

  const nextFocusedPath =
    (preferredFocusPath && existingPaths.has(preferredFocusPath) && preferredFocusPath) ||
    (importState.focusedPath &&
      existingPaths.has(importState.focusedPath) &&
      importState.focusedPath) ||
    items[0]?.file_path ||
    null;

  setImportState({
    reviewItems: items,
    selectedPaths: nextSelectedPaths,
    focusedPath: nextFocusedPath,
  });
}

export { importState };

export function getVisibleImportReviewItems(): ImportReviewItem[] {
  return importState.reviewItems.filter((item) => matchesSearch(item, importState.searchQuery));
}

export function getSelectedImportReviewItems(): ImportReviewItem[] {
  const selected = new Set(importState.selectedPaths);
  return importState.reviewItems.filter(
    (item) => selected.has(item.file_path) && canSelectImportItem(item),
  );
}

export function getSelectedImportFilePaths(): string[] {
  return getSelectedImportReviewItems().map((item) => item.file_path);
}

export function openImportDialog(): void {
  setImportState({ ...createInitialState(), dialogOpen: true });
}

export function closeImportDialog(): void {
  setImportState(createInitialState());
}

export function setImportPhase(phase: ImportState['phase'], error?: string): void {
  setImportState({ phase, error: error ?? null });
}

export function setImportResults(results: ImportResult[]): void {
  setImportState('results', results);
}

export function setImportReviewItems(items: ImportReviewItem[]): void {
  const preservedPickedItems = importState.reviewItems.filter((item) => item.source === 'picked');
  const mergedItems = mergeReviewItems(preservedPickedItems, items);
  applyReviewItems(mergedItems);
}

export function mergePickedReviewItems(items: ImportReviewItem[]): void {
  const mergedItems = mergeReviewItems(importState.reviewItems, items);
  const preferredFocusPath = items.find((item) => item.source === 'picked')?.file_path ?? null;
  applyReviewItems(mergedItems, preferredFocusPath);
}

export function toggleImportSelection(filePath: string): void {
  const item = importState.reviewItems.find((candidate) => candidate.file_path === filePath);
  if (!item || !canSelectImportItem(item)) {
    return;
  }

  setImportState('selectedPaths', (previous) =>
    previous.includes(filePath)
      ? previous.filter((path) => path !== filePath)
      : [...previous, filePath],
  );
}

export function setFocusedImportItem(filePath: string | null): void {
  if (!filePath) {
    setImportState('focusedPath', null);
    return;
  }

  const exists = importState.reviewItems.some((item) => item.file_path === filePath);
  if (exists) {
    setImportState('focusedPath', filePath);
  }
}

export function setImportSearchQuery(query: string): void {
  setImportState('searchQuery', query);
}
