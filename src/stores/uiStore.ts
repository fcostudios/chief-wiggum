// src/stores/uiStore.ts
// UI state: panel visibility, active view, modal stack.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import type { PermissionRequest } from '@/lib/types';

export type ActiveView = 'conversation' | 'agents' | 'diff' | 'terminal';

interface UIState {
  sidebarVisible: boolean;
  detailsPanelVisible: boolean;
  activeView: ActiveView;
  permissionRequest: PermissionRequest | null;
}

const [state, setState] = createStore<UIState>({
  sidebarVisible: true,
  detailsPanelVisible: true,
  activeView: 'conversation',
  permissionRequest: null,
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

export { state as uiState };
