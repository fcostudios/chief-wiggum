// src/components/terminal/TerminalContainer.tsx
// Multi-tab terminal shell composed of tabs + persistent panes (CHI-336/338).

import type { Component } from 'solid-js';
import { createEffect, For, onMount, Show } from 'solid-js';
import { addToast } from '@/stores/toastStore';
import {
  initTerminalListeners,
  killTerminal,
  loadAvailableShells,
  reorderSessions,
  setActiveTerminal,
  setSessionTitle,
  spawnTerminal,
  terminalState,
} from '@/stores/terminalStore';
import { uiState } from '@/stores/uiStore';
import TerminalPane from './TerminalPane';
import TerminalTabs from './TerminalTabs';

const TerminalContainer: Component = () => {
  let autoSpawnInFlight = false;

  onMount(() => {
    void initTerminalListeners().catch((error) => {
      addToast(`Terminal init failed: ${String(error)}`, 'error');
    });
    void loadAvailableShells().catch(() => {
      // Shell picker is not rendered yet; ignore load failures for now.
    });
  });

  async function handleNewTerminal() {
    try {
      await spawnTerminal();
    } catch (error) {
      addToast(`Failed to open terminal: ${String(error)}`, 'error');
    }
  }

  async function handleCloseTerminal(terminalId: string) {
    try {
      await killTerminal(terminalId);
    } catch (error) {
      addToast(`Failed to close terminal: ${String(error)}`, 'error');
    }
  }

  createEffect(() => {
    const shouldAutoSpawn =
      uiState.activeView === 'terminal' && terminalState.sessions.length === 0;
    if (!shouldAutoSpawn) {
      autoSpawnInFlight = false;
      return;
    }
    if (autoSpawnInFlight) return;
    autoSpawnInFlight = true;
    void handleNewTerminal().finally(() => {
      autoSpawnInFlight = false;
    });
  });

  return (
    <div class="flex h-full w-full flex-col min-h-0">
      <Show when={terminalState.sessions.length > 0}>
        <TerminalTabs
          sessions={terminalState.sessions}
          activeId={terminalState.activeTerminalId}
          onSelect={setActiveTerminal}
          onClose={(terminalId) => void handleCloseTerminal(terminalId)}
          onNew={() => void handleNewTerminal()}
          onRename={(terminalId, title) => setSessionTitle(terminalId, title)}
          onReorder={(fromId, toId) => reorderSessions(fromId, toId)}
        />
      </Show>

      <Show
        when={terminalState.sessions.length > 0}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-3">
            <p class="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              No terminal sessions open
            </p>
            <button
              type="button"
              class="rounded px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--color-accent)', color: 'white' }}
              onClick={() => void handleNewTerminal()}
            >
              Open Terminal
            </button>
            <p class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              or press Cmd+Shift+T
            </p>
          </div>
        }
      >
        <For each={terminalState.sessions}>
          {(session) => (
            <div
              class="flex flex-1 flex-col min-h-0"
              style={{
                display: terminalState.activeTerminalId === session.terminal_id ? 'flex' : 'none',
              }}
            >
              <TerminalPane terminalId={session.terminal_id} />
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default TerminalContainer;
