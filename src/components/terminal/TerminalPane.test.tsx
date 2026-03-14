import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { onTerminalOutput, resizeTerminal, writeToTerminal } from '@/stores/terminalStore';

let mockTheme: 'dark' | 'light' | 'system' = 'dark';

const mocks = vi.hoisted(() => {
  class MockTerminal {
    options: Record<string, unknown>;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    onData = vi.fn((callback: (data: string) => void) => {
      store.onDataCallbacks.push(callback);
      return { dispose: vi.fn() };
    });
    onResize = vi.fn((callback: (size: { cols: number; rows: number }) => void) => {
      store.onResizeCallbacks.push(callback);
      return { dispose: vi.fn() };
    });
    cols = 80;
    rows = 24;

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
    constructor(cb: ResizeObserverCallback) {
      store.resizeObservers.push({ instance: this, cb });
    }
  }

  const store = {
    terminals: [] as MockTerminal[],
    fitAddons: [] as MockFitAddon[],
    webglAddons: [] as MockWebglAddon[],
    resizeObservers: [] as { instance: MockResizeObserver; cb: ResizeObserverCallback }[],
    onDataCallbacks: [] as Array<(data: string) => void>,
    onResizeCallbacks: [] as Array<(size: { cols: number; rows: number }) => void>,
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

vi.mock('@/stores/terminalStore', () => ({
  onTerminalOutput: vi.fn(() => vi.fn()),
  writeToTerminal: vi.fn(() => Promise.resolve()),
  resizeTerminal: vi.fn(() => Promise.resolve()),
}));

import TerminalPane from './TerminalPane';

describe('TerminalPane', () => {
  beforeEach(() => {
    mockTheme = 'dark';
    mocks.terminals.length = 0;
    mocks.fitAddons.length = 0;
    mocks.webglAddons.length = 0;
    mocks.resizeObservers.length = 0;
    mocks.onDataCallbacks.length = 0;
    mocks.onResizeCallbacks.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', mocks.MockResizeObserver);
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it('renders a terminal container without crashing', () => {
    const { container } = render(() => <TerminalPane terminalId="test-id" />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it('initializes xterm and opens it in the container', () => {
    const { container } = render(() => <TerminalPane terminalId="test-id" />);
    const root = container.firstElementChild as HTMLDivElement;
    expect(mocks.terminals).toHaveLength(1);
    expect(mocks.terminals[0].open).toHaveBeenCalledWith(root);
    expect(mocks.fitAddons[0]?.fit).toHaveBeenCalled();
    expect(mocks.resizeObservers[0]?.instance.observe).toHaveBeenCalledWith(root);
  });

  it('subscribes to terminal output for the given terminalId', () => {
    render(() => <TerminalPane terminalId="my-term" />);
    expect(onTerminalOutput).toHaveBeenCalledWith('my-term', expect.any(Function));
  });

  it('forwards keyboard input and resize events to the backend', () => {
    render(() => <TerminalPane terminalId="my-term" />);

    mocks.onDataCallbacks[0]?.('ls\r');
    mocks.onResizeCallbacks[0]?.({ cols: 120, rows: 40 });

    expect(writeToTerminal).toHaveBeenCalledWith('my-term', 'ls\r');
    expect(resizeTerminal).toHaveBeenCalledWith('my-term', 120, 40);
  });

  it('applies theme and disposes resources on unmount', () => {
    mockTheme = 'light';
    const { container, unmount } = render(() => <TerminalPane terminalId="test-id" />);
    const root = container.firstElementChild as HTMLDivElement;

    expect((mocks.terminals[0]?.options.theme as { background?: string })?.background).toBe(
      '#ffffff',
    );
    expect(root.style.backgroundColor).toBe('rgb(255, 255, 255)');

    unmount();

    expect(mocks.resizeObservers[0]?.instance.disconnect).toHaveBeenCalled();
    expect(mocks.terminals[0]?.dispose).toHaveBeenCalled();
  });
});
