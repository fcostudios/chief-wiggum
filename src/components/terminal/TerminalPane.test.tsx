import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import {
  onTerminalOutput,
  resizeTerminal,
  writeToTerminal,
} from '@/stores/terminalStore';

const mocks = vi.hoisted(() => {
  class MockTerminal {
    options: Record<string, unknown>;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    registerLinkProvider = vi.fn(() => ({ dispose: vi.fn() }));
    parser = {
      registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })),
    };
    onSelectionChange = vi.fn((callback: () => void) => {
      store.onSelectionCallbacks.push(callback);
      return { dispose: vi.fn() };
    });
    onBell = vi.fn((callback: () => void) => {
      store.onBellCallbacks.push(callback);
      return { dispose: vi.fn() };
    });
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
    getSelection = vi.fn(() => store.selectionText);

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
    onSelectionCallbacks: [] as Array<() => void>,
    onBellCallbacks: [] as Array<() => void>,
    selectionText: '',
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

vi.mock('@/stores/settingsStore', async () => {
  const { createStore } = await import('solid-js/store');
  const [settings, setSettings] = createStore({
    appearance: { theme: 'dark' as const },
    terminal: {
      default_shell: '',
      font_size: 14,
      font_family:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
      cursor_style: 'block' as const,
      cursor_blink: true,
      scrollback_lines: 10000,
      copy_on_select: false,
      paste_on_right_click: false,
      bell: 'none' as const,
    },
  });

  return {
    settingsState: {
      get settings() {
        return settings;
      },
    },
    __setMockSettings(patch: Partial<typeof settings>) {
      setSettings(patch as never);
    },
  };
});

vi.mock('@/stores/terminalStore', () => ({
  onTerminalOutput: vi.fn(() => vi.fn()),
  writeToTerminal: vi.fn(() => Promise.resolve()),
  resizeTerminal: vi.fn(() => Promise.resolve()),
  updateSessionCwd: vi.fn(),
}));

import TerminalPane from './TerminalPane';

type MockSettingsPatch = Partial<{
  appearance: { theme: 'dark' | 'light' | 'system' };
  terminal: {
    default_shell: string;
    font_size: number;
    font_family: string;
    cursor_style: 'block' | 'underline' | 'bar';
    cursor_blink: boolean;
    scrollback_lines: number;
    copy_on_select: boolean;
    paste_on_right_click: boolean;
    bell: 'none' | 'sound' | 'visual';
  };
}>;

async function setMockSettings(
  patch: MockSettingsPatch,
) {
  const mod = (await import('@/stores/settingsStore')) as typeof import('@/stores/settingsStore') & {
    __setMockSettings: (patch: MockSettingsPatch) => void;
  };
  mod.__setMockSettings(patch);
}

function getMockTerminal() {
  const terminal = mocks.terminals[mocks.terminals.length - 1];
  if (!terminal) {
    throw new Error('Expected a mock terminal to be created');
  }
  return terminal;
}

describe('TerminalPane', () => {
  beforeEach(async () => {
    mocks.terminals.length = 0;
    mocks.fitAddons.length = 0;
    mocks.webglAddons.length = 0;
    mocks.resizeObservers.length = 0;
    mocks.onDataCallbacks.length = 0;
    mocks.onResizeCallbacks.length = 0;
    mocks.onSelectionCallbacks.length = 0;
    mocks.onBellCallbacks.length = 0;
    mocks.selectionText = '';
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
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('pwd\n'),
      },
    });
    await setMockSettings({
      appearance: { theme: 'dark' },
      terminal: {
        default_shell: '',
        font_size: 14,
        font_family:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
        cursor_style: 'block',
        cursor_blink: true,
        scrollback_lines: 10000,
        copy_on_select: false,
        paste_on_right_click: false,
        bell: 'none',
      },
    });
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

  it('applies theme and disposes resources on unmount', async () => {
    await setMockSettings({ appearance: { theme: 'light' } });
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

  it('registers a file path link provider on mount', () => {
    render(() => <TerminalPane terminalId="link-test" />);
    const mockTerminal = getMockTerminal();
    expect(mockTerminal.registerLinkProvider).toHaveBeenCalledOnce();
  });

  it('registers an OSC 7 handler on mount', () => {
    render(() => <TerminalPane terminalId="osc-test" />);
    const mockTerminal = getMockTerminal();
    expect(mockTerminal.parser.registerOscHandler).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it('initializes terminal with font settings from user settings', async () => {
    await setMockSettings({
      terminal: {
        default_shell: '',
        font_size: 16,
        font_family: 'Fira Code',
        cursor_style: 'underline',
        cursor_blink: false,
        scrollback_lines: 20000,
        copy_on_select: false,
        paste_on_right_click: false,
        bell: 'none',
      },
    });

    render(() => <TerminalPane terminalId="settings-init" />);

    expect(getMockTerminal().options).toMatchObject({
      fontSize: 16,
      fontFamily: 'Fira Code',
      cursorStyle: 'underline',
      cursorBlink: false,
      scrollback: 20000,
      screenReaderMode: true,
    });
  });

  it('updates terminal options when settings change', async () => {
    render(() => <TerminalPane terminalId="settings-reactive" />);

    await setMockSettings({
      terminal: {
        default_shell: '',
        font_size: 18,
        font_family: 'Cascadia Code',
        cursor_style: 'bar',
        cursor_blink: false,
        scrollback_lines: 30000,
        copy_on_select: false,
        paste_on_right_click: false,
        bell: 'none',
      },
    });

    await vi.waitFor(() => {
      expect(getMockTerminal().options.fontSize).toBe(18);
      expect(getMockTerminal().options.fontFamily).toBe('Cascadia Code');
      expect(getMockTerminal().options.cursorStyle).toBe('bar');
      expect(getMockTerminal().options.cursorBlink).toBe(false);
      expect(getMockTerminal().options.scrollback).toBe(30000);
    });
  });

  it('copies selection to clipboard when copy-on-select is enabled', async () => {
    await setMockSettings({
      terminal: {
        default_shell: '',
        font_size: 14,
        font_family:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
        cursor_style: 'block',
        cursor_blink: true,
        scrollback_lines: 10000,
        copy_on_select: true,
        paste_on_right_click: false,
        bell: 'none',
      },
    });
    mocks.selectionText = 'selected output';

    render(() => <TerminalPane terminalId="copy-select" />);
    mocks.onSelectionCallbacks[0]?.();

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected output');
    });
  });

  it('pastes clipboard contents on right click when enabled', async () => {
    await setMockSettings({
      terminal: {
        default_shell: '',
        font_size: 14,
        font_family:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
        cursor_style: 'block',
        cursor_blink: true,
        scrollback_lines: 10000,
        copy_on_select: false,
        paste_on_right_click: true,
        bell: 'none',
      },
    });

    const { container } = render(() => <TerminalPane terminalId="paste-right-click" />);
    const root = container.firstElementChild as HTMLDivElement;
    root.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(navigator.clipboard.readText).toHaveBeenCalledOnce();
      expect(writeToTerminal).toHaveBeenCalledWith('paste-right-click', 'pwd\n');
    });
  });
});
