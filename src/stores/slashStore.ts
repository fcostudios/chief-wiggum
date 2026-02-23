// src/stores/slashStore.ts
// Manages slash command state: command list, menu visibility, fuzzy filtering, keyboard selection.
// Backed by `list_slash_commands` IPC from CHI-106.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CliInitEvent, SlashCommand } from '@/lib/types';
import { getActiveProject } from '@/stores/projectStore';

interface SlashState {
  /** All discovered commands (built-in + project + user). */
  commands: SlashCommand[];
  /** Whether the autocomplete menu is open. */
  isOpen: boolean;
  /** Current filter text (everything after the `/`). */
  filter: string;
  /** Index of the highlighted item in filteredCommands. */
  highlightedIndex: number;
}

const [state, setState] = createStore<SlashState>({
  commands: [],
  isOpen: false,
  filter: '',
  highlightedIndex: 0,
});

export { state as slashState };

let sdkInitUnlisten: UnlistenFn | null = null;

/** Fuzzy-match a filter string against a command name and description. */
function fuzzyMatch(command: SlashCommand, filter: string): boolean {
  if (!filter) return true;
  const lower = filter.toLowerCase();
  return (
    command.name.toLowerCase().includes(lower) || command.description.toLowerCase().includes(lower)
  );
}

/** Get the filtered list of commands based on current filter text. */
export function filteredCommands(): SlashCommand[] {
  return state.commands.filter((cmd) => fuzzyMatch(cmd, state.filter));
}

/** Load commands from backend. Called on app mount and project change. */
export async function loadCommands(projectPath?: string): Promise<void> {
  try {
    const commands = await invoke<SlashCommand[]>('list_slash_commands', {
      project_path: projectPath ?? null,
    });
    setState('commands', commands);
  } catch (err) {
    console.error('[slashStore] Failed to load slash commands:', err);
  }
}

/** Refresh commands from backend (force rescan). */
export async function refreshCommands(projectPath?: string): Promise<void> {
  try {
    const commands = await invoke<SlashCommand[]>('refresh_slash_commands', {
      project_path: projectPath ?? null,
    });
    setState('commands', commands);
  } catch (err) {
    console.error('[slashStore] Failed to refresh slash commands:', err);
  }
}

/** Refresh slash commands after SDK `cli:init` data arrives. */
export async function handleSdkInit(projectPath?: string): Promise<void> {
  await refreshCommands(projectPath);
}

/** Listen for CLI init events to refresh slash commands with SDK-discovered tools. */
export async function startSdkCommandListener(): Promise<void> {
  if (sdkInitUnlisten) return;
  try {
    sdkInitUnlisten = await listen<CliInitEvent>('cli:init', (event) => {
      if (event.payload.tools.length === 0 && event.payload.mcp_servers.length === 0) {
        return;
      }
      const projectPath = getActiveProject()?.path;
      void handleSdkInit(projectPath);
    });
  } catch (err) {
    console.warn('[slashStore] Failed to listen for cli:init:', err);
  }
}

/** Stop listening for SDK init events (used by tests / teardown paths). */
export function stopSdkCommandListener(): void {
  if (!sdkInitUnlisten) return;
  void sdkInitUnlisten();
  sdkInitUnlisten = null;
}

/** Open the slash command menu with an optional initial filter. */
export function openMenu(filter: string = ''): void {
  setState({ isOpen: true, filter, highlightedIndex: 0 });
}

/** Close the slash command menu. */
export function closeMenu(): void {
  setState({ isOpen: false, filter: '', highlightedIndex: 0 });
}

/** Update the filter text (called as user types after `/`). */
export function setFilter(filter: string): void {
  setState({ filter, highlightedIndex: 0 });
}

/** Move highlight up. */
export function highlightPrev(): void {
  const max = filteredCommands().length;
  if (max === 0) return;
  setState('highlightedIndex', (i) => (i - 1 + max) % max);
}

/** Move highlight down. */
export function highlightNext(): void {
  const max = filteredCommands().length;
  if (max === 0) return;
  setState('highlightedIndex', (i) => (i + 1) % max);
}

/** Get the currently highlighted command. */
export function getHighlightedCommand(): SlashCommand | undefined {
  return filteredCommands()[state.highlightedIndex];
}
