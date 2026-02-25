import { describe, expect, it } from 'vitest';
import {
  setActiveView,
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
});
