import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRecentCommands,
  getRecentCommands,
  recordCommand,
  recentCommandState,
} from './recentCommandStore';

describe('recentCommandStore', () => {
  afterEach(() => {
    clearRecentCommands();
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(getRecentCommands()).toEqual([]);
  });

  it('records commands', () => {
    recordCommand('new-session', 'New Session');
    expect(getRecentCommands()).toHaveLength(1);
    expect(recentCommandState.commands[0]?.id).toBe('new-session');
  });

  it('moves duplicates to top', () => {
    recordCommand('a', 'A');
    recordCommand('b', 'B');
    recordCommand('a', 'A');
    expect(getRecentCommands().map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('caps stored list at 20 items', () => {
    for (let i = 0; i < 25; i++) {
      recordCommand(`cmd-${i}`, `Command ${i}`);
    }
    expect(getRecentCommands()).toHaveLength(20);
    expect(getRecentCommands()[0]?.id).toBe('cmd-24');
  });

  it('supports display limiting', () => {
    for (let i = 0; i < 10; i++) {
      recordCommand(`cmd-${i}`, `Command ${i}`);
    }
    expect(getRecentCommands(5)).toHaveLength(5);
  });

  it('persists to localStorage', () => {
    recordCommand('persist', 'Persist');
    const raw = localStorage.getItem('cw:recentCommands');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '[]') as { id: string }[];
    expect(parsed[0]?.id).toBe('persist');
  });
});
