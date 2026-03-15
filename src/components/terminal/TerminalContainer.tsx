// src/components/terminal/TerminalContainer.tsx
// Multi-tab terminal shell composed of tabs + persistent panes (CHI-336/338).

import type { Component } from 'solid-js';
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { getActiveProject } from '@/stores/projectStore';
import { settingsState } from '@/stores/settingsStore';
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
  let unlistenExit: (() => void) | null = null;
  const [exitNotification, setExitNotification] = createSignal('');

  onMount(() => {
    void initTerminalListeners().catch((error) => {
      addToast(`Terminal init failed: ${String(error)}`, 'error');
    });
    void loadAvailableShells().catch(() => {
      // Shell picker is not rendered yet; ignore load failures for now.
    });
    void listen<{ terminal_id: string; exit_code: number | null }>(
      'terminal:exit',
      ({ payload }) => {
        const session = terminalState.sessions.find(
          (item) => item.terminal_id === payload.terminal_id,
        );
        const label = session?.title ?? session?.shell.split('/').pop() ?? 'Terminal';
        const code = payload.exit_code ?? 0;
        setExitNotification(`Terminal process "${label}" exited with code ${code}.`);
        window.setTimeout(() => setExitNotification(''), 3000);
      },
    ).then((unlisten) => {
      unlistenExit = unlisten;
    });

    onCleanup(() => {
      unlistenExit?.();
      unlistenExit = null;
    });
  });

  async function handleNewTerminal() {
    try {
      const configuredShell = settingsState.settings.terminal.default_shell.trim();
      const cwd = getActiveProject()?.path;
      await spawnTerminal(configuredShell || undefined, cwd);
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

  onMount(() => {
    function handleTerminalKeydown(event: KeyboardEvent): void {
      if (uiState.activeView !== 'terminal') return;
      const cmd = event.metaKey || event.ctrlKey;

      if (cmd && event.shiftKey && event.code === 'KeyT') {
        event.preventDefault();
        event.stopImmediatePropagation();
        void handleNewTerminal();
        return;
      }

      if (cmd && event.shiftKey && event.code === 'KeyW') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (terminalState.activeTerminalId) {
          void handleCloseTerminal(terminalState.activeTerminalId);
        }
        return;
      }

      if (cmd && event.shiftKey && event.code === 'BracketLeft') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const sessions = terminalState.sessions;
        const index = sessions.findIndex(
          (session) => session.terminal_id === terminalState.activeTerminalId,
        );
        if (index > 0) {
          setActiveTerminal(sessions[index - 1]!.terminal_id);
        } else if (sessions.length > 0) {
          setActiveTerminal(sessions[sessions.length - 1]!.terminal_id);
        }
        return;
      }

      if (cmd && event.shiftKey && event.code === 'BracketRight') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const sessions = terminalState.sessions;
        const index = sessions.findIndex(
          (session) => session.terminal_id === terminalState.activeTerminalId,
        );
        if (index >= 0 && index < sessions.length - 1) {
          setActiveTerminal(sessions[index + 1]!.terminal_id);
        } else if (sessions.length > 0) {
          setActiveTerminal(sessions[0]!.terminal_id);
        }
      }
    }

    document.addEventListener('keydown', handleTerminalKeydown, true);
    onCleanup(() => document.removeEventListener('keydown', handleTerminalKeydown, true));
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
              role="tabpanel"
              aria-labelledby={`terminal-tab-${session.terminal_id}`}
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

      <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
        {exitNotification()}
      </div>
    </div>
  );
};

export default TerminalContainer;
