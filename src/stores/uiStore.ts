// src/stores/uiStore.ts
// UI state: panel visibility, active view, modal stack.
// Per GUIDE-001 §3.3: createStore singleton, mutations via exported functions.

import { createStore } from 'solid-js/store';
import { invoke } from '@tauri-apps/api/core';
import type { PermissionRequest, QuestionRequest } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('ui/state');

export type ActiveView = 'conversation' | 'agents' | 'diff' | 'terminal' | 'actions_center' | 'git';
export type CommandPaletteMode = 'all' | 'sessions' | 'actions';

/** Sidebar tri-state: expanded (240px) → collapsed (48px icon-rail) → hidden (0px). */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden';

/** Three-tier permission model (CHI-102):
 * - Safe (default): No Bash. Only read-only + edit tools allowed.
 * - Developer: Bash with pattern restrictions for common dev tools.
 * - YOLO: Auto-approve everything.
 */
export type PermissionTier = 'safe' | 'developer' | 'yolo';

const SIDEBAR_WIDTH_KEY = 'cw:sidebarWidth';
const DETAILS_PANEL_WIDTH_KEY = 'cw:detailsPanelWidth';
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 420;
const DETAILS_PANEL_WIDTH_MIN = 220;
const DETAILS_PANEL_WIDTH_MAX = 520;

interface UIState {
  sidebarState: SidebarState;
  sidebarWidth: number;
  detailsPanelVisible: boolean;
  detailsPanelWidth: number;
  zenModeActive: boolean;
  zenPreviousSidebarState: SidebarState | null;
  zenPreviousDetailsPanelVisible: boolean | null;
  settingsVisible: boolean;
  contextBreakdownVisible: boolean;
  activeView: ActiveView;
  viewBadges: Record<ActiveView, number>;
  permissionRequest: PermissionRequest | null;
  questionRequest: QuestionRequest | null;
  yoloMode: boolean;
  yoloDialogVisible: boolean;
  developerMode: boolean;
  commandPaletteVisible: boolean;
  commandPaletteMode: CommandPaletteMode;
  sessionSwitcherVisible: boolean;
  quickSwitcherVisible: boolean;
  keyboardHelpVisible: boolean;
  messageSearchVisible: boolean;
  statusCostPopoverVisible: boolean;
  actionTechnicalMode: boolean;
  changelogVisible: boolean;
  aboutVisible: boolean;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadPersistedWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
  } catch {
    return fallback;
  }
}

function persistWidth(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage may be unavailable
  }
}

const persisted = loadPersistedTier();
const persistedSidebarWidth = loadPersistedWidth(
  SIDEBAR_WIDTH_KEY,
  240,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
);
const persistedDetailsPanelWidth = loadPersistedWidth(
  DETAILS_PANEL_WIDTH_KEY,
  280,
  DETAILS_PANEL_WIDTH_MIN,
  DETAILS_PANEL_WIDTH_MAX,
);

const [state, setState] = createStore<UIState>({
  sidebarState: 'expanded',
  sidebarWidth: persistedSidebarWidth,
  detailsPanelVisible: true,
  detailsPanelWidth: persistedDetailsPanelWidth,
  zenModeActive: false,
  zenPreviousSidebarState: null,
  zenPreviousDetailsPanelVisible: null,
  settingsVisible: false,
  contextBreakdownVisible: false,
  activeView: 'conversation',
  viewBadges: { conversation: 0, agents: 0, diff: 0, terminal: 0, actions_center: 0, git: 0 },
  permissionRequest: null,
  questionRequest: null,
  yoloMode: persisted.yoloMode,
  yoloDialogVisible: false,
  developerMode: persisted.developerMode,
  commandPaletteVisible: false,
  commandPaletteMode: 'all',
  sessionSwitcherVisible: false,
  quickSwitcherVisible: false,
  keyboardHelpVisible: false,
  messageSearchVisible: false,
  statusCostPopoverVisible: false,
  actionTechnicalMode: false,
  changelogVisible: false,
  aboutVisible: false,
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

/** Set custom sidebar width (expanded mode only), persisted locally. */
export function setSidebarWidth(width: number): void {
  const next = clamp(width, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
  setState('sidebarWidth', next);
  persistWidth(SIDEBAR_WIDTH_KEY, next);
}

export function toggleDetailsPanel() {
  setState('detailsPanelVisible', (prev) => !prev);
}

/** Enter zen mode: collapse side panels and keep previous state for restore. */
export function enterZenMode(): void {
  if (state.zenModeActive) return;
  setState({
    zenPreviousSidebarState: state.sidebarState,
    zenPreviousDetailsPanelVisible: state.detailsPanelVisible,
    zenModeActive: true,
    sidebarState: 'hidden',
    detailsPanelVisible: false,
  });
}

/** Exit zen mode and restore panel visibility from the saved snapshot. */
export function exitZenMode(): void {
  if (!state.zenModeActive) return;
  setState({
    sidebarState: state.zenPreviousSidebarState ?? 'expanded',
    detailsPanelVisible: state.zenPreviousDetailsPanelVisible ?? true,
    zenModeActive: false,
    zenPreviousSidebarState: null,
    zenPreviousDetailsPanelVisible: null,
  });
}

/** Toggle zen mode state. */
export function toggleZenMode(): void {
  if (state.zenModeActive) {
    exitZenMode();
    return;
  }
  enterZenMode();
}

/** Set custom details panel width, persisted locally. */
export function setDetailsPanelWidth(width: number): void {
  const next = clamp(width, DETAILS_PANEL_WIDTH_MIN, DETAILS_PANEL_WIDTH_MAX);
  setState('detailsPanelWidth', next);
  persistWidth(DETAILS_PANEL_WIDTH_KEY, next);
}

/** Open the full-screen settings overlay (Cmd+,). */
export function openSettings() {
  setState('settingsVisible', true);
}

/** Close the full-screen settings overlay. */
export function closeSettings() {
  setState('settingsVisible', false);
}

/** Open the context budget breakdown modal (Cmd+Shift+T). */
export function openContextBreakdown() {
  setState('contextBreakdownVisible', true);
}

/** Close the context budget breakdown modal. */
export function closeContextBreakdown() {
  setState('contextBreakdownVisible', false);
}

/** Toggle the context budget breakdown modal. */
export function toggleContextBreakdown() {
  setState('contextBreakdownVisible', (prev) => !prev);
}

export function setActiveView(view: ActiveView) {
  setState('activeView', view);
}

export function toggleActionTechnicalMode() {
  setState('actionTechnicalMode', (prev) => !prev);
}

/** Set the badge count for a view tab. 0 hides the badge. */
export function setViewBadge(view: ActiveView, count: number) {
  setState('viewBadges', view, Math.max(0, count));
}

export function showPermissionDialog(request: PermissionRequest) {
  setState('permissionRequest', request);
}

export function dismissPermissionDialog() {
  setState('permissionRequest', null);
}

export function showQuestionDialog(request: QuestionRequest) {
  setState('questionRequest', request);
}

export function dismissQuestionDialog() {
  setState('questionRequest', null);
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
    log.warn('Failed to enable YOLO mode: ' + (err instanceof Error ? err.message : String(err)));
  });
}

/** Disable YOLO mode. */
export function disableYoloMode() {
  setState('yoloMode', false);
  persistTier(state.developerMode ? 'developer' : 'safe');
  invoke('toggle_yolo_mode', { enable: false }).catch((err) => {
    log.warn('Failed to disable YOLO mode: ' + (err instanceof Error ? err.message : String(err)));
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
    log.warn(
      'Failed to enable developer mode: ' + (err instanceof Error ? err.message : String(err)),
    );
  });
}

/** Disable Developer mode — return to safe mode (no Bash). */
export function disableDeveloperMode() {
  setState('developerMode', false);
  persistTier(state.yoloMode ? 'yolo' : 'safe');
  invoke('toggle_developer_mode', { enable: false }).catch((err) => {
    log.warn(
      'Failed to disable developer mode: ' + (err instanceof Error ? err.message : String(err)),
    );
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
export function openCommandPalette(mode: CommandPaletteMode = 'all') {
  setState('commandPaletteMode', mode);
  setState('commandPaletteVisible', true);
}

/** Close the command palette. */
export function closeCommandPalette() {
  setState('commandPaletteVisible', false);
  setState('commandPaletteMode', 'all');
}

/** Toggle the command palette visibility. */
export function toggleCommandPalette() {
  setState((prev) => ({
    ...prev,
    commandPaletteVisible: !prev.commandPaletteVisible,
    commandPaletteMode: prev.commandPaletteVisible ? 'all' : prev.commandPaletteMode,
  }));
}

/** Open the session quick-switcher (Cmd+Shift+P). */
export function openSessionSwitcher() {
  setState('sessionSwitcherVisible', true);
}

/** Close the session quick-switcher. */
export function closeSessionSwitcher() {
  setState('sessionSwitcherVisible', false);
}

/** Open the Ctrl+Tab quick switcher overlay. */
export function openQuickSwitcher() {
  setState('quickSwitcherVisible', true);
}

/** Close the Ctrl+Tab quick switcher overlay. */
export function closeQuickSwitcher() {
  setState('quickSwitcherVisible', false);
}

/** Open the "What's New" changelog modal. */
export function openChangelog() {
  setState('changelogVisible', true);
}

/** Close the "What's New" changelog modal. */
export function closeChangelog() {
  setState('changelogVisible', false);
}

/** Open the About modal. */
export function openAbout() {
  setState('aboutVisible', true);
}

/** Close the About modal. */
export function closeAbout() {
  setState('aboutVisible', false);
}

/** Toggle the keyboard shortcuts help overlay (Cmd+/). */
export function toggleKeyboardHelp() {
  setState('keyboardHelpVisible', (prev) => !prev);
}

/** Open in-session conversation search overlay (Cmd+F). */
export function openMessageSearch() {
  setState('messageSearchVisible', true);
}

/** Close in-session conversation search overlay. */
export function closeMessageSearch() {
  setState('messageSearchVisible', false);
}

/** Toggle the status-bar cost popover. */
export function toggleStatusCostPopover() {
  setState('statusCostPopoverVisible', (prev) => !prev);
}

/** Open the status-bar cost popover. */
export function openStatusCostPopover() {
  setState('statusCostPopoverVisible', true);
}

/** Close the status-bar cost popover. */
export function closeStatusCostPopover() {
  setState('statusCostPopoverVisible', false);
}

/** Close the keyboard shortcuts help overlay. */
export function closeKeyboardHelp() {
  setState('keyboardHelpVisible', false);
}

export { state as uiState };
