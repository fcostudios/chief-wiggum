import { vi } from 'vitest';

type IpcArgs = Record<string, unknown>;
type IpcHandler = (args: IpcArgs) => unknown;

const handlers = new Map<string, IpcHandler>();
let defaultHandler: IpcHandler | null = null;

export function mockIpcCommand(command: string, handler: IpcHandler): void {
  handlers.set(command, handler);
}

export function mockIpcDefault(handler: IpcHandler): void {
  defaultHandler = handler;
}

export function clearIpcMocks(): void {
  handlers.clear();
  defaultHandler = null;
}

export async function mockInvoke(cmd: string, args?: IpcArgs): Promise<unknown> {
  const handler = handlers.get(cmd);
  if (handler) {
    return handler(args ?? {});
  }
  if (defaultHandler) {
    return defaultHandler(args ?? {});
  }
  return undefined;
}

export const mockEmit = vi.fn();
export const mockListen = vi.fn(async () => () => {});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: mockEmit,
  listen: mockListen,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => Promise.resolve('macos'),
}));
