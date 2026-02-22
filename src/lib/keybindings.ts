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
  type ActiveView,
} from '@/stores/uiStore';
import { cycleModel } from '@/stores/sessionStore';

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

  // Cmd+Shift+Y — toggle YOLO mode
  if (e.code === 'KeyY' && e.shiftKey) {
    e.preventDefault();
    toggleYoloMode();
    return;
  }

  // Cmd+Shift+D — toggle Developer mode (CHI-102)
  if (e.code === 'KeyD' && e.shiftKey) {
    e.preventDefault();
    if (uiState.developerMode) {
      disableDeveloperMode();
    } else {
      enableDeveloperMode();
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
