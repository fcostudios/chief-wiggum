import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIpcMocks, mockIpcCommand } from '@/test/mockIPC';
import type { PermissionRequest } from '@/lib/types';

function makePermissionRequest(overrides?: Partial<PermissionRequest>): PermissionRequest {
  return {
    request_id: 'req-1',
    tool: 'Read',
    command: 'cat src/main.ts',
    file_path: 'src/main.ts',
    risk_level: 'low',
    ...overrides,
  };
}

describe('Integration: permission dialog -> record outcome', () => {
  beforeEach(() => {
    clearIpcMocks();
    vi.resetModules();
  });

  it('showPermissionDialog stores the permission request in uiStore', async () => {
    const uiMod = await import('@/stores/uiStore');
    const req = makePermissionRequest();

    uiMod.showPermissionDialog(req);

    expect(uiMod.uiState.permissionRequest).toEqual(req);
  });

  it('dismissPermissionDialog clears the request', async () => {
    const uiMod = await import('@/stores/uiStore');
    uiMod.showPermissionDialog(makePermissionRequest());

    uiMod.dismissPermissionDialog();

    expect(uiMod.uiState.permissionRequest).toBeNull();
  });

  it('recordPermissionOutcome appends a permission message and persists it', async () => {
    const saveSpy = vi.fn(() => undefined);
    mockIpcCommand('save_message', saveSpy);

    const convMod = await import('@/stores/conversationStore');
    convMod.clearMessages();
    convMod.recordPermissionOutcome('s1', 'Read', 'cat src/main.ts', 'allowed', 'low');

    const messages = convMod.conversationState.messages;
    const last = messages[messages.length - 1];
    expect(last?.role).toBe('permission');
    expect(last?.session_id).toBe('s1');
    expect(last?.content).toContain('"outcome":"allowed"');
    expect(saveSpy).toHaveBeenCalled();
  });
});
