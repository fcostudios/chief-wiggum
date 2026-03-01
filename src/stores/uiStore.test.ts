import { describe, expect, it } from 'vitest';
import {
  closeStatusCostPopover,
  setDetailsPanelWidth,
  setSidebarWidth,
  openStatusCostPopover,
  setActiveView,
  toggleStatusCostPopover,
  toggleDetailsPanel,
  toggleKeyboardHelp,
  toggleSidebar,
  uiState,
} from './uiStore';

describe('uiStore', () => {
  it('initializes with conversation as active view', () => {
    expect(uiState.activeView).toBe('conversation');
  });

  it('switches active view', () => {
    const previous = uiState.activeView;
    setActiveView('terminal');
    expect(uiState.activeView).toBe('terminal');
    setActiveView(previous);
  });

  it('toggles sidebar state', () => {
    const initial = uiState.sidebarState;
    toggleSidebar();
    expect(uiState.sidebarState).not.toBe(initial);
    while (uiState.sidebarState !== initial) {
      toggleSidebar();
    }
  });

  it('toggles details panel', () => {
    const initial = uiState.detailsPanelVisible;
    toggleDetailsPanel();
    expect(uiState.detailsPanelVisible).toBe(!initial);
    toggleDetailsPanel();
  });

  it('toggles keyboard help overlay', () => {
    const initial = uiState.keyboardHelpVisible;
    toggleKeyboardHelp();
    expect(uiState.keyboardHelpVisible).toBe(!initial);
    toggleKeyboardHelp();
  });

  it('opens, closes, and toggles status cost popover', () => {
    closeStatusCostPopover();
    expect(uiState.statusCostPopoverVisible).toBe(false);

    openStatusCostPopover();
    expect(uiState.statusCostPopoverVisible).toBe(true);

    toggleStatusCostPopover();
    expect(uiState.statusCostPopoverVisible).toBe(false);
  });

  it('clamps and stores sidebar width', () => {
    setSidebarWidth(120);
    expect(uiState.sidebarWidth).toBe(200);
    setSidebarWidth(999);
    expect(uiState.sidebarWidth).toBe(420);
    setSidebarWidth(310);
    expect(uiState.sidebarWidth).toBe(310);
  });

  it('clamps and stores details panel width', () => {
    setDetailsPanelWidth(150);
    expect(uiState.detailsPanelWidth).toBe(220);
    setDetailsPanelWidth(900);
    expect(uiState.detailsPanelWidth).toBe(520);
    setDetailsPanelWidth(340);
    expect(uiState.detailsPanelWidth).toBe(340);
  });
});
