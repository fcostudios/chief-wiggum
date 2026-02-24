// src/lib/keybindings.ts
// Global keyboard shortcuts per SPEC-003 §2.
// Cmd+B: toggle sidebar. Cmd+Shift+B: toggle details panel.
// Cmd+1/2/3/4: switch active view.

import {
  toggleSidebar,
  toggleDetailsPanel,
  setActiveView,
  uiState,
  toggleYoloMode,
  enableDeveloperMode,
  disableDeveloperMode,
  toggleCommandPalette,
  openCommandPalette,
  openSessionSwitcher,
  openSettings,
  type ActiveView,
} from '@/stores/uiStore';
import { getRunningActionIds, stopAllRunningActions } from '@/stores/actionStore';
import { conversationState } from '@/stores/conversationStore';
import { cycleModel } from '@/stores/sessionStore';
import { copyDebugInfo } from '@/stores/diagnosticsStore';
import { addToast } from '@/stores/toastStore';

const viewMap: Record<string, ActiveView> = {
  Digit1: 'conversation',
  Digit2: 'agents',
  Digit3: 'diff',
  Digit4: 'terminal',
};

export function handleGlobalKeyDown(e: KeyboardEvent): void {
  // Use metaKey on macOS, ctrlKey elsewhere
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  // Cmd+K — toggle command palette
  if (e.code === 'KeyK' && !e.shiftKey) {
    e.preventDefault();
    toggleCommandPalette();
    return;
  }

  // Cmd+, — open settings
  if (e.code === 'Comma' && !e.shiftKey) {
    e.preventDefault();
    openSettings();
    return;
  }

  // Cmd+Shift+P — session quick-switcher
  if (e.code === 'KeyP' && e.shiftKey) {
    e.preventDefault();
    openSessionSwitcher();
    return;
  }

  // Cmd+Shift+R — action runner palette
  if (e.code === 'KeyR' && e.shiftKey) {
    e.preventDefault();
    openCommandPalette('actions');
    return;
  }

  // Cmd+Shift+. — stop all running actions
  if (e.code === 'Period' && e.shiftKey) {
    e.preventDefault();
    const running = getRunningActionIds();
    if (running.length === 0) {
      addToast('No running actions', 'info');
      return;
    }
    void stopAllRunningActions().then(() => {
      addToast(`Stopping ${running.length} action${running.length === 1 ? '' : 's'}`, 'warning');
    });
    return;
  }

  // Cmd+B — toggle sidebar
  if (e.code === 'KeyB' && !e.shiftKey) {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // Cmd+Shift+B — toggle details panel
  if (e.code === 'KeyB' && e.shiftKey) {
    e.preventDefault();
    toggleDetailsPanel();
    return;
  }

  // Cmd+` — toggle terminal view
  if (e.code === 'Backquote' && !e.shiftKey) {
    e.preventDefault();
    setActiveView(uiState.activeView === 'terminal' ? 'conversation' : 'terminal');
    return;
  }

  // Cmd+Shift+Y — toggle YOLO mode (blocked while agent is responding)
  if (e.code === 'KeyY' && e.shiftKey) {
    e.preventDefault();
    if (conversationState.processStatus !== 'running' && !conversationState.isStreaming) {
      toggleYoloMode();
    }
    return;
  }

  // Cmd+Shift+D — copy debug info to clipboard (quick diagnostics)
  if (e.code === 'KeyD' && e.shiftKey) {
    e.preventDefault();
    void copyDebugInfo().then((info) => {
      addToast(`Copied: ${info}`, 'success');
    });
    return;
  }

  // Cmd+Shift+F12 — toggle Developer mode (blocked while agent is responding)
  if (e.code === 'F12' && e.shiftKey) {
    e.preventDefault();
    if (conversationState.processStatus !== 'running' && !conversationState.isStreaming) {
      if (uiState.developerMode) {
        disableDeveloperMode();
      } else {
        enableDeveloperMode();
      }
    }
    return;
  }

  // Cmd+M — cycle model (Sonnet → Opus → Haiku → Sonnet)
  if (e.code === 'KeyM' && !e.shiftKey) {
    e.preventDefault();
    cycleModel();
    return;
  }

  // Cmd+1/2/3/4 — switch view
  if (viewMap[e.code]) {
    e.preventDefault();
    setActiveView(viewMap[e.code]);
  }
}
