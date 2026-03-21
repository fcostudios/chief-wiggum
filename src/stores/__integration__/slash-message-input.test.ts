import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIpcMocks, mockIpcCommand } from '@/test/mockIPC';
import type { SlashCommand } from '@/lib/types';

function makeCommand(overrides?: Partial<SlashCommand>): SlashCommand {
  return {
    name: 'help',
    description: 'Show help',
    category: 'Builtin',
    args_hint: null,
    source_path: null,
    from_sdk: false,
    ...overrides,
  };
}

describe('Integration: slash -> message input state flow', () => {
  beforeEach(() => {
    clearIpcMocks();
    vi.resetModules();
  });

  it('loadCommands fetches slash commands via IPC', async () => {
    mockIpcCommand('list_slash_commands', () => [makeCommand()]);

    const mod = await import('@/stores/slashStore');
    await mod.loadCommands('/repo');

    expect(mod.slashState.commands).toHaveLength(3);
    expect(mod.slashState.commands.map((command) => command.name)).toEqual([
      'create',
      'claude-session-id',
      'help',
    ]);
  });

  it('filteredCommands returns matches after setting a filter', async () => {
    mockIpcCommand('list_slash_commands', () => [
      makeCommand({ name: 'help', description: 'Show help' }),
      makeCommand({ name: 'clear', description: 'Clear conversation' }),
    ]);

    const mod = await import('@/stores/slashStore');
    await mod.loadCommands();
    mod.setFilter('help');

    expect(mod.filteredCommands().map((c) => c.name)).toEqual(['help']);
  });

  it('openMenu and closeMenu toggle slash menu state', async () => {
    const mod = await import('@/stores/slashStore');

    mod.openMenu('he');
    expect(mod.slashState.isOpen).toBe(true);
    expect(mod.slashState.filter).toBe('he');

    mod.closeMenu();
    expect(mod.slashState.isOpen).toBe(false);
    expect(mod.slashState.filter).toBe('');
  });
});
