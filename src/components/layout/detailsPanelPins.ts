export const PINNED_KEY_PREFIX = 'cw:details:pinned:';

function pinnedStorageKey(projectId: string): string {
  return `${PINNED_KEY_PREFIX}${projectId}`;
}

export function loadPinnedSections(projectId: string | null): Set<string> {
  if (!projectId) return new Set();
  try {
    const raw = localStorage.getItem(pinnedStorageKey(projectId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const values = parsed.filter((value): value is string => typeof value === 'string');
    return new Set(values);
  } catch {
    return new Set();
  }
}

export function savePinnedSections(projectId: string | null, pinned: Set<string>): void {
  if (!projectId) return;
  try {
    localStorage.setItem(pinnedStorageKey(projectId), JSON.stringify([...pinned]));
  } catch {
    // localStorage may be unavailable in tests/browser restrictions.
  }
}
