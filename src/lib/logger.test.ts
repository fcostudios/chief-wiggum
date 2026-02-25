import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import { createLogger, logError } from './logger';

describe('logger', () => {
  const ipcCalls: Record<string, unknown>[] = [];
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ipcCalls.length = 0;
    mockIpcCommand('log_from_frontend', (args) => {
      ipcCalls.push(args);
      return undefined;
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await Promise.resolve();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  it('forwards scoped logger calls to backend IPC', async () => {
    const log = createLogger('ui/test');

    log.info('hello');
    log.warn('careful', { code: '123' });
    log.trace('step', { phase: 'A' });

    await Promise.resolve();

    expect(ipcCalls).toHaveLength(3);
    expect(ipcCalls[0]).toEqual({
      level: 'info',
      target: 'ui/test',
      message: 'hello',
      fields: null,
    });
    expect(ipcCalls[1]).toEqual({
      level: 'warn',
      target: 'ui/test',
      message: 'careful',
      fields: { code: '123' },
    });
    expect(ipcCalls[2]).toEqual({
      level: 'trace',
      target: 'ui/test',
      message: 'step',
      fields: { phase: 'A' },
    });
  });

  it('logError extracts Error.message', async () => {
    logError('ui/test', 'Failed to load', new Error('disk full'));
    await Promise.resolve();
    expect(ipcCalls).toHaveLength(1);
    expect(ipcCalls[0]).toEqual({
      level: 'error',
      target: 'ui/test',
      message: 'Failed to load: disk full',
      fields: null,
    });
  });

  it('logError stringifies non-Error values', async () => {
    logError('ui/test', 'Oops', 42);
    await Promise.resolve();
    expect(ipcCalls[0]).toEqual({
      level: 'error',
      target: 'ui/test',
      message: 'Oops: 42',
      fields: null,
    });
  });

  it('swallows IPC failures without throwing', async () => {
    mockIpcCommand('log_from_frontend', () => {
      throw new Error('backend unavailable');
    });
    const log = createLogger('ui/test');
    expect(() => log.error('still works')).not.toThrow();
    await Promise.resolve();
  });

  it('routes console logging by level in dev mode', () => {
    const log = createLogger('ui/test');

    log.error('err');
    log.warn('warn');
    log.info('info');
    log.debug('debug');
    log.trace('trace');

    if (import.meta.env.DEV) {
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleDebugSpy).toHaveBeenCalled();
    } else {
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    }
  });
});
