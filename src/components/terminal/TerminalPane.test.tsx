import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';

let mockTheme: 'dark' | 'light' | 'system' = 'dark';

const mocks = vi.hoisted(() => {
  class MockTerminal {
    options: Record<string, unknown>;
    loadAddon = vi.fn();
    open = vi.fn();
    writeln = vi.fn();
    dispose = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      store.terminals.push(this);
    }
  }

  class MockFitAddon {
    fit = vi.fn();
    constructor() {
      store.fitAddons.push(this);
    }
  }

  class MockWebglAddon {
    onContextLoss = vi.fn();
    dispose = vi.fn();
    constructor() {
      store.webglAddons.push(this);
    }
  }

  class MockResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(_cb: ResizeObserverCallback) {
      store.resizeObservers.push(this);
    }
  }

  const store = {
    terminals: [] as MockTerminal[],
    fitAddons: [] as MockFitAddon[],
    webglAddons: [] as MockWebglAddon[],
    resizeObservers: [] as MockResizeObserver[],
    MockTerminal,
    MockFitAddon,
    MockWebglAddon,
    MockResizeObserver,
  };

  return store;
});

vi.mock('@xterm/xterm', () => ({ Terminal: mocks.MockTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: mocks.MockFitAddon }));
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: mocks.MockWebglAddon }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('@/stores/settingsStore', () => ({
  settingsState: {
    get settings() {
      return { appearance: { theme: mockTheme } };
    },
  },
}));

import TerminalPane from './TerminalPane';

describe('TerminalPane', () => {
  beforeEach(() => {
    mockTheme = 'dark';
    mocks.terminals.length = 0;
    mocks.fitAddons.length = 0;
    mocks.webglAddons.length = 0;
    mocks.resizeObservers.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', mocks.MockResizeObserver);
  });

  it('renders a terminal container without crashing', () => {
    const { container } = render(() => <TerminalPane />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it('initializes xterm and opens it in the container', () => {
    const { container } = render(() => <TerminalPane />);
    const root = container.firstElementChild as HTMLDivElement;
    expect(mocks.terminals).toHaveLength(1);
    expect(mocks.terminals[0].open).toHaveBeenCalledWith(root);
    expect(mocks.fitAddons[0]?.fit).toHaveBeenCalled();
    expect(mocks.resizeObservers[0]?.observe).toHaveBeenCalledWith(root);
  });

  it('writes the terminal welcome message on mount', () => {
    render(() => <TerminalPane />);
    const writes = mocks.terminals[0]?.writeln.mock.calls.map(([line]) => String(line)) ?? [];
    expect(writes.some((line) => line.includes('Chief Wiggum Terminal'))).toBe(true);
    expect(writes.some((line) => line.includes('Terminal ready'))).toBe(true);
  });

  it('applies theme and disposes resources on unmount', () => {
    mockTheme = 'light';
    const { container, unmount } = render(() => <TerminalPane />);
    const root = container.firstElementChild as HTMLDivElement;
    expect((mocks.terminals[0]?.options.theme as { background?: string })?.background).toBe(
      '#ffffff',
    );
    expect(root.style.backgroundColor).toBe('rgb(255, 255, 255)');
    unmount();
    expect(mocks.resizeObservers[0]?.disconnect).toHaveBeenCalled();
    expect(mocks.terminals[0]?.dispose).toHaveBeenCalled();
  });
});
