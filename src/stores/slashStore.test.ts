import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockIpcCommand } from '@/test/mockIPC';
import type { SlashCommand } from '@/lib/types';

type SlashStoreModule = typeof import('./slashStore');

const mockCommands: SlashCommand[] = [
  {
    name: 'help',
    description: 'Show help information',
    category: 'Builtin',
    args_hint: null,
    source_path: null,
    from_sdk: false,
  },
  {
    name: 'clear',
    description: 'Clear conversation history',
    category: 'Builtin',
    args_hint: null,
    source_path: null,
    from_sdk: false,
  },
  {
    name: 'test-runner',
    description: 'Run project tests',
    category: 'Project',
    args_hint: '[suite]',
    source_path: '/project/.claude/commands/test-runner.md',
    from_sdk: false,
  },
  {
    name: 'mcp__playwright__browser_click',
    description: 'Click an element on the page',
    category: 'Sdk',
    args_hint: null,
    source_path: null,
    from_sdk: true,
  },
];

describe('slashStore', () => {
  let mod: SlashStoreModule;

  beforeEach(async () => {
    vi.resetModules();
    mockIpcCommand('list_slash_commands', () => mockCommands);
    mockIpcCommand('refresh_slash_commands', () => mockCommands);
    mod = await import('./slashStore');
    mod.closeMenu();
  });

  it('starts with empty commands and closed menu', () => {
    expect(mod.slashState.commands).toEqual([]);
    expect(mod.slashState.isOpen).toBe(false);
    expect(mod.slashState.filter).toBe('');
    expect(mod.slashState.highlightedIndex).toBe(0);
  });

  it('loadCommands fetches from backend', async () => {
    await mod.loadCommands();
    expect(mod.slashState.commands).toHaveLength(4);
    expect(mod.slashState.loadError).toBeNull();
  });

  it('loadCommands handles IPC error', async () => {
    mockIpcCommand('list_slash_commands', () => {
      throw new Error('fail');
    });
    await mod.loadCommands();
    expect(mod.slashState.loadError).toBe('Failed to load slash commands');
  });

  it('openMenu sets isOpen and resets highlight', () => {
    mod.openMenu('he');
    expect(mod.slashState.isOpen).toBe(true);
    expect(mod.slashState.filter).toBe('he');
    expect(mod.slashState.highlightedIndex).toBe(0);
  });

  it('closeMenu resets state', () => {
    mod.openMenu('test');
    mod.closeMenu();
    expect(mod.slashState.isOpen).toBe(false);
    expect(mod.slashState.filter).toBe('');
    expect(mod.slashState.highlightedIndex).toBe(0);
  });

  it('setFilter updates filter and resets highlight', () => {
    mod.openMenu();
    mod.highlightNext();
    mod.setFilter('cl');
    expect(mod.slashState.filter).toBe('cl');
    expect(mod.slashState.highlightedIndex).toBe(0);
  });

  it('filteredCommands returns all when no filter', async () => {
    await mod.loadCommands();
    mod.setFilter('');
    expect(mod.filteredCommands()).toHaveLength(4);
  });

  it('filteredCommands filters by name substring', async () => {
    await mod.loadCommands();
    mod.setFilter('help');
    const results = mod.filteredCommands();
    expect(results.some((c) => c.name === 'help')).toBe(true);
  });

  it('filteredCommands filters by description for non-sdk commands', async () => {
    await mod.loadCommands();
    mod.setFilter('conversation');
    const results = mod.filteredCommands();
    expect(results.some((c) => c.name === 'clear')).toBe(true);
  });

  it('filteredCommands ranks built-in above SDK with empty filter', async () => {
    await mod.loadCommands();
    mod.setFilter('');
    const results = mod.filteredCommands();
    const builtinIdx = results.findIndex((c) => c.category === 'Builtin');
    const sdkIdx = results.findIndex((c) => c.category === 'Sdk');
    expect(builtinIdx).toBeGreaterThanOrEqual(0);
    expect(sdkIdx).toBeGreaterThanOrEqual(0);
    expect(builtinIdx).toBeLessThan(sdkIdx);
  });

  it('highlightNext wraps around', async () => {
    await mod.loadCommands();
    mod.setFilter('');
    const count = mod.filteredCommands().length;
    for (let i = 0; i < count; i += 1) mod.highlightNext();
    expect(mod.slashState.highlightedIndex).toBe(0);
  });

  it('highlightPrev wraps around', async () => {
    await mod.loadCommands();
    mod.setFilter('');
    mod.highlightPrev();
    expect(mod.slashState.highlightedIndex).toBe(mod.filteredCommands().length - 1);
  });

  it('getHighlightedCommand returns current selection', async () => {
    await mod.loadCommands();
    mod.setFilter('');
    const cmd = mod.getHighlightedCommand();
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe(mod.filteredCommands()[0].name);
  });
});
