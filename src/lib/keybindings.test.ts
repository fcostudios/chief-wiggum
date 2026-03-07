import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const uiState = {
    activeView: 'conversation',
    developerMode: false,
  };
  const viewState = {
    layoutMode: 'single',
    activePaneId: 'main',
  };

  return {
    uiState,
    viewState,
    ui: {
      toggleSidebar: vi.fn(),
      toggleDetailsPanel: vi.fn(),
      setActiveView: vi.fn(),
      toggleYoloMode: vi.fn(),
      enableDeveloperMode: vi.fn(),
      disableDeveloperMode: vi.fn(),
      toggleCommandPalette: vi.fn(),
      openCommandPalette: vi.fn(),
      openSessionSwitcher: vi.fn(),
      openSettings: vi.fn(),
      openMessageSearch: vi.fn(),
      toggleContextBreakdown: vi.fn(),
      toggleKeyboardHelp: vi.fn(),
      openQuickSwitcher: vi.fn(),
    },
    actions: {
      getRunningActionIds: vi.fn(() => []),
      stopAllRunningActions: vi.fn(() => Promise.resolve()),
    },
    conversationState: {
      processStatus: 'not_started',
      isStreaming: false,
    },
    session: {
      cycleModel: vi.fn(),
    },
    diagnostics: {
      copyDebugInfo: vi.fn(() => Promise.resolve('debug info')),
    },
    fileStore: {
      fileState: {
        selectedPath: null as string | null,
        editingFilePath: null as string | null,
        editorTakeoverActive: false,
      },
      startCreating: vi.fn(),
      saveFileAs: vi.fn(),
      openEditorTakeover: vi.fn(() => Promise.resolve()),
      closeEditorTakeover: vi.fn(),
      toggleShowIgnoredFiles: vi.fn(),
    },
    project: {
      projectState: {
        activeProjectId: null as string | null,
      },
    },
    toast: {
      addToast: vi.fn(),
    },
    viewFns: {
      closePane: vi.fn(),
      splitView: vi.fn(),
      unsplit: vi.fn(),
    },
  };
});

vi.mock('@/stores/uiStore', () => ({
  ...mocks.ui,
  uiState: mocks.uiState,
}));

vi.mock('@/stores/actionStore', () => ({
  ...mocks.actions,
}));

vi.mock('@/stores/conversationStore', () => ({
  conversationState: mocks.conversationState,
}));

vi.mock('@/stores/sessionStore', () => ({
  ...mocks.session,
}));

vi.mock('@/stores/diagnosticsStore', () => ({
  ...mocks.diagnostics,
}));

vi.mock('@/stores/fileStore', () => ({
  ...mocks.fileStore,
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: mocks.project.projectState,
}));

vi.mock('@/stores/toastStore', () => ({
  ...mocks.toast,
}));

vi.mock('@/stores/viewStore', () => ({
  ...mocks.viewFns,
  viewState: mocks.viewState,
}));

import { handleGlobalKeyDown } from './keybindings';

function createKeyEvent(
  code: string,
  opts: { metaKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean } = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    code,
    metaKey: opts.metaKey ?? true,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

describe('keybindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uiState.activeView = 'conversation';
    mocks.uiState.developerMode = false;
    mocks.viewState.layoutMode = 'single';
    mocks.viewState.activePaneId = 'main';
    mocks.conversationState.processStatus = 'not_started';
    mocks.conversationState.isStreaming = false;
    mocks.actions.getRunningActionIds.mockReturnValue([]);
    mocks.project.projectState.activeProjectId = null;
    mocks.fileStore.fileState.selectedPath = null;
    mocks.fileStore.fileState.editingFilePath = null;
    mocks.fileStore.fileState.editorTakeoverActive = false;
  });

  it('Cmd+K toggles command palette', () => {
    handleGlobalKeyDown(createKeyEvent('KeyK'));
    expect(mocks.ui.toggleCommandPalette).toHaveBeenCalled();
  });

  it('Cmd+B toggles sidebar', () => {
    handleGlobalKeyDown(createKeyEvent('KeyB'));
    expect(mocks.ui.toggleSidebar).toHaveBeenCalled();
  });

  it('Cmd+Shift+B toggles details panel', () => {
    handleGlobalKeyDown(createKeyEvent('KeyB', { shiftKey: true }));
    expect(mocks.ui.toggleDetailsPanel).toHaveBeenCalled();
  });

  it('Cmd+/ toggles keyboard help', () => {
    handleGlobalKeyDown(createKeyEvent('Slash'));
    expect(mocks.ui.toggleKeyboardHelp).toHaveBeenCalled();
  });

  it('Cmd+, opens settings', () => {
    handleGlobalKeyDown(createKeyEvent('Comma'));
    expect(mocks.ui.openSettings).toHaveBeenCalled();
  });

  it('Cmd+F opens in-session message search', () => {
    handleGlobalKeyDown(createKeyEvent('KeyF'));
    expect(mocks.ui.openMessageSearch).toHaveBeenCalled();
  });

  it('Cmd+Shift+P opens session switcher', () => {
    handleGlobalKeyDown(createKeyEvent('KeyP', { shiftKey: true }));
    expect(mocks.ui.openSessionSwitcher).toHaveBeenCalled();
  });

  it('Cmd+Shift+R opens action palette', () => {
    handleGlobalKeyDown(createKeyEvent('KeyR', { shiftKey: true }));
    expect(mocks.ui.openCommandPalette).toHaveBeenCalledWith('actions');
  });

  it('Cmd+Shift+T toggles context breakdown', () => {
    handleGlobalKeyDown(createKeyEvent('KeyT', { shiftKey: true }));
    expect(mocks.ui.toggleContextBreakdown).toHaveBeenCalled();
  });

  it('Cmd+Shift+I toggles ignored-file visibility', () => {
    handleGlobalKeyDown(createKeyEvent('KeyI', { shiftKey: true }));
    expect(mocks.fileStore.toggleShowIgnoredFiles).toHaveBeenCalled();
  });

  it('Cmd+Shift+A opens Actions Center', () => {
    handleGlobalKeyDown(createKeyEvent('KeyA', { shiftKey: true }));
    expect(mocks.ui.setActiveView).toHaveBeenCalledWith('actions_center');
  });

  it('Cmd+N starts creating a file when a project is active', () => {
    mocks.project.projectState.activeProjectId = 'proj-1';
    mocks.fileStore.fileState.selectedPath = 'src/app.ts';
    handleGlobalKeyDown(createKeyEvent('KeyN'));
    expect(mocks.fileStore.startCreating).toHaveBeenCalledWith('src', 'file');
  });

  it('Cmd+Shift+N starts creating a folder when a project is active', () => {
    mocks.project.projectState.activeProjectId = 'proj-1';
    mocks.fileStore.fileState.selectedPath = 'src';
    handleGlobalKeyDown(createKeyEvent('KeyN', { shiftKey: true }));
    expect(mocks.fileStore.startCreating).toHaveBeenCalledWith('src', 'folder');
  });

  it('Cmd+Shift+S triggers Save As when editor takeover is active', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('src/new.ts');
    mocks.project.projectState.activeProjectId = 'proj-1';
    mocks.fileStore.fileState.editorTakeoverActive = true;
    mocks.fileStore.fileState.editingFilePath = 'src/current.ts';

    handleGlobalKeyDown(createKeyEvent('KeyS', { shiftKey: true }));

    expect(promptSpy).toHaveBeenCalledWith('Save As — enter new file path:', 'src/current.ts');
    expect(mocks.fileStore.saveFileAs).toHaveBeenCalledWith('proj-1', 'src/new.ts');
    promptSpy.mockRestore();
  });

  it('Cmd+N does not intercept when no project is active', () => {
    const event = createKeyEvent('KeyN');
    handleGlobalKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(mocks.fileStore.startCreating).not.toHaveBeenCalled();
  });

  it('Cmd+M cycles model', () => {
    handleGlobalKeyDown(createKeyEvent('KeyM'));
    expect(mocks.session.cycleModel).toHaveBeenCalled();
  });

  it('Cmd+1 and Cmd+4 switch views', () => {
    handleGlobalKeyDown(createKeyEvent('Digit1'));
    handleGlobalKeyDown(createKeyEvent('Digit4'));
    expect(mocks.ui.setActiveView).toHaveBeenCalledWith('conversation');
    expect(mocks.ui.setActiveView).toHaveBeenCalledWith('terminal');
  });

  it('Cmd+\\\\ splits when single and unsplits when already split', () => {
    handleGlobalKeyDown(createKeyEvent('Backslash'));
    expect(mocks.viewFns.splitView).toHaveBeenCalledWith('horizontal');

    mocks.viewState.layoutMode = 'split-horizontal';
    handleGlobalKeyDown(createKeyEvent('Backslash'));
    expect(mocks.viewFns.unsplit).toHaveBeenCalled();
  });

  it('Cmd+W closes active pane when split', () => {
    mocks.viewState.layoutMode = 'split-horizontal';
    mocks.viewState.activePaneId = 'pane-2';
    handleGlobalKeyDown(createKeyEvent('KeyW'));
    expect(mocks.viewFns.closePane).toHaveBeenCalledWith('pane-2');
  });

  it('Cmd+Shift+Y toggles YOLO only when not streaming', () => {
    handleGlobalKeyDown(createKeyEvent('KeyY', { shiftKey: true }));
    expect(mocks.ui.toggleYoloMode).toHaveBeenCalledTimes(1);

    mocks.conversationState.isStreaming = true;
    handleGlobalKeyDown(createKeyEvent('KeyY', { shiftKey: true }));
    expect(mocks.ui.toggleYoloMode).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Shift+. shows no-running-actions toast when none are running', () => {
    mocks.actions.getRunningActionIds.mockReturnValue([]);
    handleGlobalKeyDown(createKeyEvent('Period', { shiftKey: true }));
    expect(mocks.toast.addToast).toHaveBeenCalledWith('No running actions', 'info');
  });

  it('Ctrl+Tab opens quick session switcher', () => {
    handleGlobalKeyDown(createKeyEvent('Tab', { metaKey: false, ctrlKey: true }));
    expect(mocks.ui.openQuickSwitcher).toHaveBeenCalled();
  });

  it('supports Ctrl as modifier on non-mac keyboards', () => {
    handleGlobalKeyDown(createKeyEvent('KeyK', { metaKey: false, ctrlKey: true }));
    expect(mocks.ui.toggleCommandPalette).toHaveBeenCalled();
  });

  it('ignores keydown without modifier', () => {
    handleGlobalKeyDown(new KeyboardEvent('keydown', { code: 'KeyK' }));
    expect(mocks.ui.toggleCommandPalette).not.toHaveBeenCalled();
  });
});
