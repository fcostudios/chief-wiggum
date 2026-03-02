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
  openMessageSearch,
  toggleContextBreakdown,
  toggleKeyboardHelp,
  type ActiveView,
} from '@/stores/uiStore';
import { getRunningActionIds, stopAllRunningActions } from '@/stores/actionStore';
import { conversationState } from '@/stores/conversationStore';
import { cycleModel } from '@/stores/sessionStore';
import { copyDebugInfo } from '@/stores/diagnosticsStore';
import { toggleShowIgnoredFiles } from '@/stores/fileStore';
import { addToast } from '@/stores/toastStore';
import { closePane, splitView, unsplit, viewState } from '@/stores/viewStore';

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

  // Cmd+/ — keyboard shortcuts help
  if (e.code === 'Slash' && !e.shiftKey) {
    e.preventDefault();
    toggleKeyboardHelp();
    return;
  }

  // Cmd+, — open settings
  if (e.code === 'Comma' && !e.shiftKey) {
    e.preventDefault();
    openSettings();
    return;
  }

  // Cmd+F — open in-session message search
  if (e.code === 'KeyF' && !e.shiftKey) {
    e.preventDefault();
    openMessageSearch();
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

  // Cmd+Shift+T — toggle context breakdown modal
  if (e.code === 'KeyT' && e.shiftKey) {
    e.preventDefault();
    toggleContextBreakdown();
    return;
  }

  // Cmd+Shift+I — toggle gitignored file visibility in explorer
  if (e.code === 'KeyI' && e.shiftKey) {
    e.preventDefault();
    toggleShowIgnoredFiles();
    return;
  }

  // Cmd+Shift+A — open Actions Center view
  if (e.code === 'KeyA' && e.shiftKey) {
    e.preventDefault();
    if (uiState.activeView === 'actions_center') {
      document.getElementById('launch-action-fab')?.focus();
    } else {
      setActiveView('actions_center');
      // Let ActionsCenter mount before requesting modal open.
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cw:open-quick-launch'));
      }, 0);
    }
    return;
  }

  // Cmd+Shift+U — open file attachment picker
  if (e.code === 'KeyU' && e.shiftKey) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('cw:open-file-picker'));
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

  // Cmd+\ — split/unsplit conversation view (CHI-110)
  if (e.code === 'Backslash' && !e.shiftKey) {
    e.preventDefault();
    if (viewState.layoutMode === 'single') {
      splitView('horizontal');
    } else {
      unsplit();
    }
    return;
  }

  // Cmd+W — close active split pane (when split layout is active)
  if (e.code === 'KeyW' && !e.shiftKey && viewState.layoutMode !== 'single') {
    e.preventDefault();
    closePane(viewState.activePaneId);
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
