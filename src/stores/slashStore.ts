// src/stores/slashStore.ts
// Manages slash command state: command list, menu visibility, fuzzy filtering, keyboard selection.
// Backed by `list_slash_commands` IPC from CHI-106.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CliInitEvent, SlashCommand } from '@/lib/types';
import { getActiveProject } from '@/stores/projectStore';
import { createLogger } from '@/lib/logger';
import { addToast } from '@/stores/toastStore';

const log = createLogger('ui/slash');

interface SlashState {
  /** All discovered commands (built-in + project + user). */
  commands: SlashCommand[];
  /** Last slash command catalog load error, if any. */
  loadError: string | null;
  /** Whether the autocomplete menu is open. */
  isOpen: boolean;
  /** Current filter text (everything after the `/`). */
  filter: string;
  /** Index of the highlighted item in filteredCommands. */
  highlightedIndex: number;
}

const [state, setState] = createStore<SlashState>({
  commands: [],
  loadError: null,
  isOpen: false,
  filter: '',
  highlightedIndex: 0,
});

export { state as slashState };

let sdkInitUnlisten: UnlistenFn | null = null;

function normalizeFilter(filter: string): string {
  return filter.trim().replace(/^\//, '').toLowerCase();
}

function sdkNameMatches(name: string, filter: string): boolean {
  if (!filter) return true;
  const lowerName = name.toLowerCase();
  if (lowerName === filter) return true;

  const tokens = lowerName.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => token.startsWith(filter));
}

/** Fuzzy-match a filter string against a command name and description. */
function fuzzyMatch(command: SlashCommand, filter: string): boolean {
  const lower = normalizeFilter(filter);
  if (!lower) return true;

  const name = command.name.toLowerCase();
  if (command.category === 'Sdk') {
    return sdkNameMatches(name, lower);
  }

  if (name.includes(lower)) return true;

  // SDK/MCP descriptions are often boilerplate and can flood results for short
  // filters (e.g. "wr" matching "browser"/"playwright" descriptions). For SDK
  // commands, filter by command name only.
  return command.description.toLowerCase().includes(lower);
}

function matchScore(command: SlashCommand, filter: string): number {
  const lower = normalizeFilter(filter);
  if (!lower) {
    // Prefer local/built-in/action commands before SDK noise when no filter.
    const categoryBias =
      command.category === 'Builtin'
        ? 0
        : command.category === 'Action'
          ? 1
          : command.category === 'Project'
            ? 2
            : command.category === 'User'
              ? 3
              : 4;
    return categoryBias * 1000 + command.name.localeCompare(command.name);
  }

  const name = command.name.toLowerCase();
  const desc = command.description.toLowerCase();

  let score = 1000;
  if (command.category === 'Sdk') {
    const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
    const exactToken = tokens.find((token) => token === lower);
    const prefixToken = tokens.find((token) => token.startsWith(lower));
    if (name === lower || exactToken) score = 5;
    else if (prefixToken) score = 25;
  } else if (name === lower) score = 0;
  else if (name.startsWith(lower)) score = 10;
  else if (name.includes(lower)) score = 30;
  else if (desc.startsWith(lower)) score = 60;
  else if (desc.includes(lower)) score = 80;

  // Keep SDK/MCP entries below built-in/project/user/action matches for similar scores.
  if (command.category === 'Sdk') score += 200;
  return score;
}

/** Get the filtered list of commands based on current filter text. */
export function filteredCommands(): SlashCommand[] {
  const filter = state.filter;
  return state.commands
    .filter((cmd) => fuzzyMatch(cmd, filter))
    .slice()
    .sort((a, b) => {
      const scoreDiff = matchScore(a, filter) - matchScore(b, filter);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name);
    });
}

/** Load commands from backend. Called on app mount and project change. */
export async function loadCommands(projectPath?: string): Promise<void> {
  setState('loadError', null);
  try {
    const commands = await invoke<SlashCommand[]>('list_slash_commands', {
      project_path: projectPath ?? null,
    });
    setState('commands', commands);
  } catch (err) {
    setState('loadError', 'Failed to load slash commands');
    addToast('Could not load slash commands', 'error');
    log.error(
      'Failed to load slash commands: ' + (err instanceof Error ? err.message : String(err)),
    );
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
    log.error(
      'Failed to refresh slash commands: ' + (err instanceof Error ? err.message : String(err)),
    );
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
    log.warn(
      'Failed to listen for cli:init: ' + (err instanceof Error ? err.message : String(err)),
    );
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
