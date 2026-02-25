// src/components/terminal/TerminalPane.tsx
// xterm.js terminal per SPEC-003 §3.4 and SPEC-001 §6.5.
// WebGL addon for GPU-accelerated rendering, fit addon for auto-resize.
// Theme follows the current appearance setting (dark/light/system).
// TODO: Connect to PTY via IPC when backend commands are wired.

import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { settingsState } from '@/stores/settingsStore';

/** xterm.js theme mapped to SPEC-002 dark tokens */
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

/** xterm.js theme mapped to SPEC-002 light tokens */
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

const TerminalPane: Component = () => {
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

    // Try WebGL addon — falls back to canvas if unavailable
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not supported — canvas renderer works fine
    }

    fitAddon.fit();

    // Auto-resize on container size change
    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
    });
    resizeObserver.observe(containerRef);

    // Write welcome message
    // TODO: Replace with actual PTY output when IPC is connected
    terminal.writeln('\x1b[1;38;2;232;130;90m Chief Wiggum Terminal \x1b[0m');
    terminal.writeln('');
    terminal.writeln('\x1b[38;2;110;118;129mTerminal ready. Connect a session to begin.\x1b[0m');
    terminal.writeln('');

    onCleanup(() => {
      systemThemeMediaQuery?.removeEventListener('change', handleSystemThemeChange);
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

  onCleanup(() => {
    resizeObserver?.disconnect();
    terminal?.dispose();
  });

  return <div ref={containerRef} class="flex-1 w-full h-full" />;
};

export default TerminalPane;
