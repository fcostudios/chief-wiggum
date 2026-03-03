import { afterEach, describe, expect, it } from 'vitest';
import { clearErrorLog, errorLogState, getErrorCount, logError } from './errorLogStore';

describe('errorLogStore', () => {
  afterEach(() => {
    clearErrorLog();
  });

  it('starts with empty log', () => {
    expect(errorLogState.entries).toEqual([]);
    expect(getErrorCount()).toBe(0);
  });

  it('logs an error entry', () => {
    logError('CLI failed', 'Process exited with code 137');
    expect(errorLogState.entries.length).toBe(1);
    expect(errorLogState.entries[0]?.message).toBe('CLI failed');
    expect(errorLogState.entries[0]?.details).toBe('Process exited with code 137');
    expect(getErrorCount()).toBe(1);
  });

  it('logs without details', () => {
    logError('Something broke');
    expect(errorLogState.entries[0]?.details).toBeUndefined();
  });

  it('prepends new entries (newest first)', () => {
    logError('First');
    logError('Second');
    expect(errorLogState.entries[0]?.message).toBe('Second');
    expect(errorLogState.entries[1]?.message).toBe('First');
  });

  it('enforces max 100 entries (FIFO)', () => {
    for (let i = 0; i < 105; i++) {
      logError(`Error ${i}`);
    }
    expect(errorLogState.entries.length).toBe(100);
    expect(errorLogState.entries[0]?.message).toBe('Error 104');
  });

  it('clears all entries', () => {
    logError('A');
    logError('B');
    clearErrorLog();
    expect(errorLogState.entries).toEqual([]);
    expect(getErrorCount()).toBe(0);
  });

  it('entries have timestamps', () => {
    logError('Timestamped');
    expect(errorLogState.entries[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('maps known error codes to human-readable messages', () => {
    logError('Connection refused', 'ECONNREFUSED');
    expect(errorLogState.entries[0]?.humanMessage).toBe(
      "Can't connect to Claude CLI. Is it running?",
    );
  });

  it('suggests actions for known errors', () => {
    logError('Permission denied', 'EPERM');
    expect(errorLogState.entries[0]?.suggestion).toBe('Check file access settings.');
  });

  it('returns null humanMessage for unknown errors', () => {
    logError('Random error', 'UNKNOWN_CODE_XYZ');
    expect(errorLogState.entries[0]?.humanMessage).toBeUndefined();
  });
});
