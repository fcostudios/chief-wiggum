// src/components/terminal/TerminalPane.tsx
// xterm.js terminal pane wired to a backend PTY session (CHI-334/336).

import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { settingsState } from '@/stores/settingsStore';
import { onTerminalOutput, resizeTerminal, writeToTerminal } from '@/stores/terminalStore';

const darkTerminalTheme = {
  background: '#010409',
  foreground: '#e6edf3',
  cursor: '#e8825a',
  cursorAccent: '#010409',
  selectionBackground: '#30363d80',
  selectionForeground: '#e6edf3',
  black: '#0d1117',
  red: '#f85149',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#a371f7',
  cyan: '#56d4dd',
  white: '#e6edf3',
  brightBlack: '#6e7681',
  brightRed: '#f85149',
  brightGreen: '#3fb950',
  brightYellow: '#d29922',
  brightBlue: '#58a6ff',
  brightMagenta: '#a371f7',
  brightCyan: '#56d4dd',
  brightWhite: '#ffffff',
};

const lightTerminalTheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#cf6e3e',
  cursorAccent: '#ffffff',
  selectionBackground: '#cf6e3e30',
  selectionForeground: '#1f2328',
  black: '#1f2328',
  red: '#cf222e',
  green: '#1a7f37',
  yellow: '#9a6700',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#f6f8fa',
  brightBlack: '#656d76',
  brightRed: '#cf222e',
  brightGreen: '#1a7f37',
  brightYellow: '#9a6700',
  brightBlue: '#0969da',
  brightMagenta: '#8250df',
  brightCyan: '#1b7c83',
  brightWhite: '#ffffff',
};

interface Props {
  terminalId: string;
}

const TerminalPane: Component<Props> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let terminal: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let systemThemeMediaQuery: MediaQueryList | undefined;
  const [prefersDarkSystem, setPrefersDarkSystem] = createSignal(true);

  const resolvedThemeMode = () => {
    const configuredTheme = settingsState.settings.appearance.theme ?? 'dark';
    if (configuredTheme === 'system') {
      return prefersDarkSystem() ? 'dark' : 'light';
    }
    return configuredTheme === 'light' ? 'light' : 'dark';
  };

  const activeTerminalTheme = () =>
    resolvedThemeMode() === 'light' ? lightTerminalTheme : darkTerminalTheme;

  onMount(() => {
    if (!containerRef) return;
    const mountedTerminalId = untrack(() => props.terminalId);

    systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDarkSystem(systemThemeMediaQuery.matches);
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setPrefersDarkSystem(event.matches);
    };
    systemThemeMediaQuery.addEventListener('change', handleSystemThemeChange);

    terminal = new Terminal({
      fontSize: 14,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
      theme: activeTerminalTheme(),
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: false,
      scrollback: 10000,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // Canvas renderer fallback is acceptable.
    }

    fitAddon.fit();

    const inputDisposable = terminal.onData((data) => {
      void writeToTerminal(mountedTerminalId, data).catch(() => {});
    });

    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void resizeTerminal(mountedTerminalId, cols, rows).catch(() => {});
    });

    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
      const cols = terminal?.cols ?? 0;
      const rows = terminal?.rows ?? 0;
      if (cols > 0 && rows > 0) {
        void resizeTerminal(mountedTerminalId, cols, rows).catch(() => {});
      }
    });
    resizeObserver.observe(containerRef);

    const unsubscribeOutput = onTerminalOutput(mountedTerminalId, (data) => {
      terminal?.write(data);
    });

    onCleanup(() => {
      unsubscribeOutput();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver?.disconnect();
      systemThemeMediaQuery?.removeEventListener('change', handleSystemThemeChange);
      terminal?.dispose();
    });
  });

  createEffect(() => {
    const theme = activeTerminalTheme();
    if (terminal) {
      terminal.options.theme = theme;
    }
    if (containerRef) {
      containerRef.style.backgroundColor = theme.background ?? 'transparent';
    }
  });

  return <div ref={containerRef} class="flex-1 h-full w-full min-h-0" />;
};

export default TerminalPane;
