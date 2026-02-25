import { beforeEach, describe, expect, it } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';

describe('cliStore', () => {
  beforeEach(() => {
    mockIpcCommand('get_cli_info', () => ({
      path_override: null,
      resolved_path: '/usr/local/bin/claude',
      version: '2.1.0',
      supports_sdk: true,
    }));
  });

  it('exports cliState with detection fields', async () => {
    const { cliState } = await import('./cliStore');
    expect(cliState).toHaveProperty('isDetected');
    expect(cliState).toHaveProperty('location');
    expect(cliState).toHaveProperty('isLoading');
  });

  it('detects CLI via mocked IPC', async () => {
    const { cliState, detectCli } = await import('./cliStore');
    await detectCli();
    expect(cliState.isDetected).toBe(true);
    expect(cliState.location?.resolved_path).toBe('/usr/local/bin/claude');
    expect(cliState.isLoading).toBe(false);
  });
});
