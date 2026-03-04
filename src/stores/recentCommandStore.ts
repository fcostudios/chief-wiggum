// src/stores/recentCommandStore.ts
// Tracks recently executed command-palette actions (CHI-257).

import { createStore } from 'solid-js/store';

const STORAGE_KEY = 'cw:recentCommands';
const MAX_ENTRIES = 20;

export interface RecentCommand {
  id: string;
  label: string;
  shortcut?: string;
  timestamp: number;
}

interface RecentCommandState {
  commands: RecentCommand[];
}

function sanitize(entries: unknown): RecentCommand[] {
  if (!Array.isArray(entries)) return [];
  const normalized: RecentCommand[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<RecentCommand>;
    if (typeof item.id !== 'string' || typeof item.label !== 'string') continue;
    normalized.push({
      id: item.id,
      label: item.label,
      shortcut: typeof item.shortcut === 'string' ? item.shortcut : undefined,
      timestamp: Number.isFinite(item.timestamp) ? Number(item.timestamp) : Date.now(),
    });
  }
  return normalized.slice(0, MAX_ENTRIES);
}

function loadFromStorage(): RecentCommand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist(commands: RecentCommand[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
  } catch {
    // localStorage unavailable (SSR/tests)
  }
}

const [state, setState] = createStore<RecentCommandState>({
  commands: loadFromStorage(),
});

export function recordCommand(id: string, label: string, shortcut?: string): void {
  const normalizedId = id.trim();
  const normalizedLabel = label.trim();
  if (!normalizedId || !normalizedLabel) return;

  setState('commands', (prev) => {
    const filtered = prev.filter((cmd) => cmd.id !== normalizedId);
    const next: RecentCommand = {
      id: normalizedId,
      label: normalizedLabel,
      shortcut,
      timestamp: Date.now(),
    };
    const updated = [next, ...filtered].slice(0, MAX_ENTRIES);
    persist(updated);
    return updated;
  });
}

export function getRecentCommands(limit = MAX_ENTRIES): RecentCommand[] {
  return state.commands.slice(0, Math.max(0, limit));
}

export function clearRecentCommands(): void {
  setState('commands', []);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (SSR/tests)
  }
}

export { state as recentCommandState };
