// src/stores/uiStore.ts
// UI state: panel visibility, active view, modal stack.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { PermissionRequest } from '@/lib/types';

export type ActiveView = 'conversation' | 'agents' | 'diff' | 'terminal';

/** Sidebar tri-state: expanded (240px) → collapsed (48px icon-rail) → hidden (0px). */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden';

/** Three-tier permission model (CHI-102):
 * - Safe (default): No Bash. Only read-only + edit tools allowed.
 * - Developer: Bash with pattern restrictions for common dev tools.
 * - YOLO: Auto-approve everything.
 */
export type PermissionTier = 'safe' | 'developer' | 'yolo';

interface UIState {
  sidebarState: SidebarState;
  detailsPanelVisible: boolean;
  activeView: ActiveView;
  permissionRequest: PermissionRequest | null;
  yoloMode: boolean;
  yoloDialogVisible: boolean;
  developerMode: boolean;
  commandPaletteVisible: boolean;
  sessionSwitcherVisible: boolean;
}

/** Restore persisted permission tier from localStorage. */
function loadPersistedTier(): { developerMode: boolean; yoloMode: boolean } {
  try {
    const tier = localStorage.getItem('cw:permissionTier');
    if (tier === 'developer') return { developerMode: true, yoloMode: false };
    if (tier === 'yolo') return { developerMode: false, yoloMode: true };
  } catch {
    // localStorage may be unavailable
  }
  return { developerMode: false, yoloMode: false };
}

/** Persist permission tier to localStorage. */
function persistTier(tier: PermissionTier): void {
  try {
    localStorage.setItem('cw:permissionTier', tier);
  } catch {
    // localStorage may be unavailable
  }
}

const persisted = loadPersistedTier();

const [state, setState] = createStore<UIState>({
  sidebarState: 'expanded',
  detailsPanelVisible: true,
  activeView: 'conversation',
  permissionRequest: null,
  yoloMode: persisted.yoloMode,
  yoloDialogVisible: false,
  developerMode: persisted.developerMode,
  commandPaletteVisible: false,
  sessionSwitcherVisible: false,
});

// Sync persisted tier to backend on startup
if (persisted.yoloMode) {
  invoke('toggle_yolo_mode', { enable: true }).catch(() => {});
} else if (persisted.developerMode) {
  invoke('toggle_developer_mode', { enable: true }).catch(() => {});
}

/** Cycle sidebar state: expanded → collapsed → hidden → expanded. */
export function toggleSidebar() {
  const transitions: Record<SidebarState, SidebarState> = {
    expanded: 'collapsed',
    collapsed: 'hidden',
    hidden: 'expanded',
  };
  setState('sidebarState', transitions[state.sidebarState]);
}

/** Whether the sidebar occupies any screen space (expanded or collapsed). */
export function isSidebarVisible(): boolean {
  return state.sidebarState !== 'hidden';
}

export function toggleDetailsPanel() {
  setState('detailsPanelVisible', (prev) => !prev);
}

export function setActiveView(view: ActiveView) {
  setState('activeView', view);
}

export function showPermissionDialog(request: PermissionRequest) {
  setState('permissionRequest', request);
}

export function dismissPermissionDialog() {
  setState('permissionRequest', null);
}

/** Show the YOLO mode warning dialog. */
export function showYoloDialog() {
  setState('yoloDialogVisible', true);
}

/** Dismiss the YOLO warning dialog without enabling. */
export function dismissYoloDialog() {
  setState('yoloDialogVisible', false);
}

/** Enable YOLO mode (called after user confirms warning). */
export function enableYoloMode() {
  setState('yoloMode', true);
  setState('yoloDialogVisible', false);
  persistTier('yolo');
  invoke('toggle_yolo_mode', { enable: true }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to enable YOLO mode:', err);
    }
  });
}

/** Disable YOLO mode. */
export function disableYoloMode() {
  setState('yoloMode', false);
  persistTier(state.developerMode ? 'developer' : 'safe');
  invoke('toggle_yolo_mode', { enable: false }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to disable YOLO mode:', err);
    }
  });
}

/** Toggle YOLO mode — shows warning dialog if enabling, disables immediately if on. */
export function toggleYoloMode() {
  if (state.yoloMode) {
    disableYoloMode();
  } else {
    showYoloDialog();
  }
}

/** Enable Developer mode (CHI-102) — pre-authorize common Bash patterns. */
export function enableDeveloperMode() {
  setState('developerMode', true);
  persistTier('developer');
  invoke('toggle_developer_mode', { enable: true }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to enable developer mode:', err);
    }
  });
}

/** Disable Developer mode — return to safe mode (no Bash). */
export function disableDeveloperMode() {
  setState('developerMode', false);
  persistTier(state.yoloMode ? 'yolo' : 'safe');
  invoke('toggle_developer_mode', { enable: false }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to disable developer mode:', err);
    }
  });
}

/** Cycle through permission tiers: Safe → Developer → YOLO → Safe.
 * YOLO shows the warning dialog, others apply immediately. */
export function cyclePermissionTier() {
  const current = getPermissionTier();
  if (current === 'safe') {
    enableDeveloperMode();
  } else if (current === 'developer') {
    disableDeveloperMode();
    showYoloDialog();
  } else {
    // YOLO → Safe
    disableYoloMode();
    disableDeveloperMode();
  }
}

/** Get the current permission tier based on flags. YOLO takes priority. */
export function getPermissionTier(): PermissionTier {
  if (state.yoloMode) return 'yolo';
  if (state.developerMode) return 'developer';
  return 'safe';
}

/** Open the command palette (Cmd+K). */
export function openCommandPalette() {
  setState('commandPaletteVisible', true);
}

/** Close the command palette. */
export function closeCommandPalette() {
  setState('commandPaletteVisible', false);
}

/** Toggle the command palette visibility. */
export function toggleCommandPalette() {
  setState('commandPaletteVisible', (prev) => !prev);
}

/** Open the session quick-switcher (Cmd+Shift+P). */
export function openSessionSwitcher() {
  setState('sessionSwitcherVisible', true);
}

/** Close the session quick-switcher. */
export function closeSessionSwitcher() {
  setState('sessionSwitcherVisible', false);
}

export { state as uiState };
