import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindActiveSessionToFocusedPane,
  closePane,
  ensureMainPaneSession,
  focusPane,
  getActivePaneSessionId,
  setPaneSession,
  splitView,
  unsplit,
  viewState,
} from './viewStore';

describe('viewStore', () => {
  beforeEach(() => {
    unsplit();
    setPaneSession('main', null);
    focusPane('main');
  });

  afterEach(() => {
    unsplit();
    setPaneSession('main', null);
    focusPane('main');
  });

  it('starts in single-pane layout with main pane', () => {
    expect(viewState.layoutMode).toBe('single');
    expect(viewState.panes).toHaveLength(1);
    expect(viewState.panes[0].id).toBe('main');
    expect(viewState.activePaneId).toBe('main');
  });

  it('splits into horizontal layout', () => {
    splitView('horizontal');
    expect(viewState.layoutMode).toBe('split-horizontal');
    expect(viewState.panes).toHaveLength(2);
  });

  it('splits into vertical layout', () => {
    splitView('vertical');
    expect(viewState.layoutMode).toBe('split-vertical');
    expect(viewState.panes).toHaveLength(2);
  });

  it('split is no-op when already split', () => {
    splitView('horizontal');
    const paneCount = viewState.panes.length;
    splitView('vertical');
    expect(viewState.panes).toHaveLength(paneCount);
    expect(viewState.layoutMode).toBe('split-horizontal');
  });

  it('unsplit preserves first pane session', () => {
    setPaneSession('main', 'session-1');
    splitView('horizontal');
    const secondPaneId = viewState.panes[1].id;
    setPaneSession(secondPaneId, 'session-2');

    unsplit();
    expect(viewState.layoutMode).toBe('single');
    expect(viewState.panes).toHaveLength(1);
    expect(viewState.panes[0].sessionId).toBe('session-1');
  });

  it('closePane removes pane and returns to single mode', () => {
    splitView('horizontal');
    const secondPaneId = viewState.panes[1].id;
    focusPane(secondPaneId);

    closePane(secondPaneId);
    expect(viewState.panes).toHaveLength(1);
    expect(viewState.layoutMode).toBe('single');
    expect(viewState.activePaneId).toBe('main');
  });

  it('closePane is no-op when only one pane', () => {
    closePane('main');
    expect(viewState.panes).toHaveLength(1);
  });

  it('closePane is no-op for non-existent pane ID', () => {
    splitView('horizontal');
    closePane('nonexistent');
    expect(viewState.panes).toHaveLength(2);
  });

  it('focusPane validates pane exists', () => {
    focusPane('nonexistent');
    expect(viewState.activePaneId).toBe('main');
  });

  it('focusPane switches active pane', () => {
    splitView('horizontal');
    const secondPaneId = viewState.panes[1].id;
    focusPane(secondPaneId);
    expect(viewState.activePaneId).toBe(secondPaneId);
  });

  it('setPaneSession assigns session to specific pane', () => {
    setPaneSession('main', 'session-abc');
    expect(viewState.panes[0].sessionId).toBe('session-abc');
  });

  it('ensureMainPaneSession only sets if main pane has no session', () => {
    setPaneSession('main', 'existing');
    ensureMainPaneSession('new-session');
    expect(viewState.panes[0].sessionId).toBe('existing');
  });

  it('ensureMainPaneSession sets empty main pane', () => {
    setPaneSession('main', null);
    ensureMainPaneSession('session-1');
    expect(viewState.panes[0].sessionId).toBe('session-1');
  });

  it('bindActiveSessionToFocusedPane updates focused pane session', () => {
    splitView('horizontal');
    const secondPaneId = viewState.panes[1].id;
    focusPane(secondPaneId);
    bindActiveSessionToFocusedPane('session-xyz');
    expect(viewState.panes.find((p) => p.id === secondPaneId)?.sessionId).toBe('session-xyz');
  });

  it('getActivePaneSessionId returns session of active pane', () => {
    setPaneSession('main', 'session-1');
    expect(getActivePaneSessionId()).toBe('session-1');
  });

  it('getActivePaneSessionId returns null when no session assigned', () => {
    setPaneSession('main', null);
    expect(getActivePaneSessionId()).toBeNull();
  });
});
