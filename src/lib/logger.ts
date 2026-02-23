// src/lib/logger.ts
// Frontend log forwarding to backend tracing pipeline (CHI-97).
// All calls are fire-and-forget — never block UI for logging.

import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Forward a log message to the Rust tracing pipeline via IPC.
 * In dev mode, also logs to the browser console for convenience.
 */
function forwardLog(
  level: LogLevel,
  target: string,
  message: string,
  fields?: Record<string, string>,
): void {
  // Dev mode: also log to browser console
  if (import.meta.env.DEV) {
    const prefix = `[${target}]`;
    const extras = fields ? JSON.stringify(fields) : '';
    switch (level) {
      case 'error':
        console.error(prefix, message, extras);
        break;
      case 'warn':
        console.warn(prefix, message, extras);
        break;
      case 'info':
        console.info(prefix, message, extras);
        break;
      case 'debug':
        console.debug(prefix, message, extras);
        break;
      case 'trace':
        console.debug(prefix, '(trace)', message, extras);
        break;
    }
  }

  // Fire-and-forget IPC — never await, never block UI
  invoke('log_from_frontend', {
    level,
    target,
    message,
    fields: fields ?? null,
  }).catch(() => {
    // Silently ignore — logging failures must not affect the app
  });
}

/** Create a scoped logger for a specific target (e.g., 'ui/conversation'). */
export function createLogger(target: string) {
  return {
    error: (message: string, fields?: Record<string, string>) =>
      forwardLog('error', target, message, fields),
    warn: (message: string, fields?: Record<string, string>) =>
      forwardLog('warn', target, message, fields),
    info: (message: string, fields?: Record<string, string>) =>
      forwardLog('info', target, message, fields),
    debug: (message: string, fields?: Record<string, string>) =>
      forwardLog('debug', target, message, fields),
    trace: (message: string, fields?: Record<string, string>) =>
      forwardLog('trace', target, message, fields),
  };
}

/** Convenience: log an error with the error message extracted. */
export function logError(target: string, message: string, err: unknown): void {
  const errMsg = err instanceof Error ? err.message : String(err);
  forwardLog('error', target, `${message}: ${errMsg}`);
}
