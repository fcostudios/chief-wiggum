// src/components/terminal/TerminalPane.tsx
// xterm.js terminal pane wired to a backend PTY session (CHI-334/336).

import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { Terminal, type ILink, type ILinkProvider } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { settingsState } from '@/stores/settingsStore';
import {
  onTerminalOutput,
  resizeTerminal,
  updateSessionCwd,
  writeToTerminal,
} from '@/stores/terminalStore';

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

const FILE_PATH_RE = /((?:\/|~\/|\.\/|\.\.\/)[\w./\-@]+(?::\d+(?::\d+)?)?)/g;

function stripLineCol(path: string): string {
  return path.replace(/:\d+(?::\d+)?$/, '');
}

function makeFileLinkProvider(terminal: Terminal): ILinkProvider {
  return {
    provideLinks(lineIndex: number, callback: (links: ILink[] | undefined) => void): void {
      const line = terminal.buffer.active.getLine(lineIndex);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      const links: ILink[] = [];
      FILE_PATH_RE.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = FILE_PATH_RE.exec(text)) !== null) {
        const matchText = match[0];
        const startX = match.index + 1;
        const endX = startX + matchText.length;
        const path = stripLineCol(matchText);

        links.push({
          range: {
            start: { x: startX, y: lineIndex + 1 },
            end: { x: endX, y: lineIndex + 1 },
          },
          text: matchText,
          decorations: { underline: true, pointerCursor: true },
          activate(_event: MouseEvent, _text: string): void {
            void invoke('open_project_file_in_system', { path }).catch(() => {});
          },
        });
      }

      callback(links.length > 0 ? links : undefined);
    },
  };
}

function playBellSound(): void {
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.value = 0.03;

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + 0.08);
  oscillator.onended = () => {
    void context.close().catch(() => {});
  };
}

const TerminalPane: Component<Props> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let terminal: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let systemThemeMediaQuery: MediaQueryList | undefined;
  const [prefersDarkSystem, setPrefersDarkSystem] = createSignal(true);
  const [bellFlash, setBellFlash] = createSignal(false);

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

    const ts = settingsState.settings.terminal;
    terminal = new Terminal({
      fontSize: ts.font_size,
      fontFamily: ts.font_family,
      theme: activeTerminalTheme(),
      cursorBlink: ts.cursor_blink,
      cursorStyle: ts.cursor_style,
      allowTransparency: false,
      scrollback: ts.scrollback_lines,
      screenReaderMode: true,
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

    const selectionDisposable = terminal.onSelectionChange(() => {
      if (!settingsState.settings.terminal.copy_on_select) return;
      const selection = terminal?.getSelection();
      if (!selection) return;
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      void clipboard.writeText(selection).catch(() => {});
    });

    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void resizeTerminal(mountedTerminalId, cols, rows).catch(() => {});
    });

    const bellDisposable = terminal.onBell(() => {
      const mode = settingsState.settings.terminal.bell;
      if (mode === 'sound') {
        playBellSound();
        return;
      }
      if (mode === 'visual') {
        setBellFlash(true);
        window.setTimeout(() => setBellFlash(false), 180);
      }
    });

    const linkProviderDisposable = terminal.registerLinkProvider(makeFileLinkProvider(terminal));
    const oscDisposable = terminal.parser.registerOscHandler(7, (data: string) => {
      try {
        const url = new URL(data);
        const cwd = decodeURIComponent(url.pathname);
        updateSessionCwd(mountedTerminalId, cwd);
      } catch {
        // Ignore malformed OSC 7 payloads.
      }
      return false;
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

    createEffect(() => {
      if (!terminal) return;
      const nextSettings = settingsState.settings.terminal;
      terminal.options.fontSize = nextSettings.font_size;
      terminal.options.fontFamily = nextSettings.font_family;
      terminal.options.cursorStyle = nextSettings.cursor_style;
      terminal.options.cursorBlink = nextSettings.cursor_blink;
      terminal.options.scrollback = nextSettings.scrollback_lines;
      fitAddon?.fit();
    });

    function handleContextMenu(event: MouseEvent): void {
      if (!settingsState.settings.terminal.paste_on_right_click) return;
      event.preventDefault();
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      void clipboard
        .readText()
        .then((text) => {
          if (text) {
            return writeToTerminal(mountedTerminalId, text);
          }
          return undefined;
        })
        .catch(() => {});
    }

    containerRef.addEventListener('contextmenu', handleContextMenu);

    onCleanup(() => {
      unsubscribeOutput();
      inputDisposable.dispose();
      selectionDisposable.dispose();
      resizeDisposable.dispose();
      bellDisposable.dispose();
      linkProviderDisposable.dispose();
      oscDisposable.dispose();
      resizeObserver?.disconnect();
      containerRef?.removeEventListener('contextmenu', handleContextMenu);
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
      containerRef.style.boxShadow = bellFlash() ? 'inset 0 0 0 2px var(--color-accent)' : 'none';
    }
  });

  return <div ref={containerRef} class="flex-1 h-full w-full min-h-0" />;
};

export default TerminalPane;
