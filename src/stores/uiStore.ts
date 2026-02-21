// src/stores/uiStore.ts
// UI state: panel visibility, active view, modal stack.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { PermissionRequest } from '@/lib/types';

export type ActiveView = 'conversation' | 'agents' | 'diff' | 'terminal';

interface UIState {
  sidebarVisible: boolean;
  detailsPanelVisible: boolean;
  activeView: ActiveView;
  permissionRequest: PermissionRequest | null;
  yoloMode: boolean;
  yoloDialogVisible: boolean;
}

const [state, setState] = createStore<UIState>({
  sidebarVisible: true,
  detailsPanelVisible: true,
  activeView: 'conversation',
  permissionRequest: null,
  yoloMode: false,
  yoloDialogVisible: false,
});

export function toggleSidebar() {
  setState('sidebarVisible', (prev) => !prev);
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
  invoke('toggle_yolo_mode', { enable: true }).catch((err) => {
    if (import.meta.env.DEV) {
      console.warn('[uiStore] Failed to enable YOLO mode:', err);
    }
  });
}

/** Disable YOLO mode. */
export function disableYoloMode() {
  setState('yoloMode', false);
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

export { state as uiState };
