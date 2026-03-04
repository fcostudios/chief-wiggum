// src/stores/errorLogStore.ts
// Session-scoped error log with human-readable mapping for common failures.

import { createStore } from 'solid-js/store';

const MAX_ENTRIES = 100;
export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  humanMessage?: string;
  suggestion?: string;
}

interface ErrorLogState {
  entries: ErrorLogEntry[];
  unseenCount: number;
}

const ERROR_MAP: { pattern: string; humanMessage: string; suggestion: string }[] = [
  {
    pattern: 'ECONNREFUSED',
    humanMessage: "Can't connect to Claude CLI. Is it running?",
    suggestion: 'Check that the CLI process is started and listening.',
  },
  {
    pattern: 'EPERM',
    humanMessage: 'Permission denied.',
    suggestion: 'Check file access settings.',
  },
  {
    pattern: 'ENOENT',
    humanMessage: 'File or command not found.',
    suggestion: 'Verify the path exists and the CLI is installed.',
  },
  {
    pattern: 'TIMEOUT',
    humanMessage: 'Request timed out.',
    suggestion: 'Check your network connection and try again.',
  },
  {
    pattern: 'rate limit',
    humanMessage: 'Rate limited by the API.',
    suggestion: 'Wait a moment before retrying.',
  },
  {
    pattern: 'Resource limit',
    humanMessage: 'Maximum concurrent sessions reached.',
    suggestion: 'Stop another session first.',
  },
];

function matchError(details?: string): { humanMessage?: string; suggestion?: string } {
  if (!details) return {};
  const lower = details.toLowerCase();
  for (const candidate of ERROR_MAP) {
    if (lower.includes(candidate.pattern.toLowerCase())) {
      return { humanMessage: candidate.humanMessage, suggestion: candidate.suggestion };
    }
  }
  return {};
}

const [state, setState] = createStore<ErrorLogState>({
  entries: [],
  unseenCount: 0,
});

export function logError(
  message: string,
  details?: string,
  severity: ErrorSeverity = 'error',
): void {
  const { humanMessage, suggestion } = matchError(details);
  const entry: ErrorLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    severity,
    message,
    details,
    humanMessage,
    suggestion,
  };

  setState('entries', (prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  setState('unseenCount', (prev) => prev + 1);
}

export function clearErrorLog(): void {
  setState('entries', []);
  setState('unseenCount', 0);
}

export function getErrorCount(): number {
  return state.entries.length;
}

export function getUnseenErrorCount(): number {
  return state.unseenCount;
}

export function markErrorsSeen(): void {
  setState('unseenCount', 0);
}

export { state as errorLogState };
