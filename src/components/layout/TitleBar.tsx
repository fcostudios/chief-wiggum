// src/components/layout/TitleBar.tsx
// Custom title bar (40px) per SPEC-003 §2 Z1.
// macOS: native traffic lights via titleBarStyle overlay (70px spacer).
// Windows/Linux: minimize, maximize, close buttons on the right.

import type { Component } from 'solid-js';
import { Show, createSignal, onMount } from 'solid-js';
import { Menu, Minus, Maximize2, X, Zap } from 'lucide-solid';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { toggleSidebar, uiState, toggleYoloMode } from '@/stores/uiStore';
import ModelSelector from '@/components/common/ModelSelector';

const TitleBar: Component = () => {
  const appWindow = getCurrentWindow();
  const [isMac, setIsMac] = createSignal(false);

  onMount(() => {
    setIsMac(platform() === 'macos');
  });

  return (
    <header
      class="flex items-center bg-bg-secondary border-b border-border-primary select-none"
      style={{ height: 'var(--title-bar-height)' }}
    >
      {/* macOS: spacer for native traffic lights (rendered by OS via titleBarStyle overlay) */}
      <Show when={isMac()}>
        <div class="w-[70px] shrink-0" />
      </Show>

      {/* Left: sidebar toggle + app name */}
      <div class="flex items-center gap-2 px-3">
        <button
          class="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
        <span class="text-md font-semibold text-text-primary">Chief Wiggum</span>
        <Show when={uiState.yoloMode}>
          <span class="px-2 py-0.5 rounded text-xs font-medium bg-warning-muted text-warning animate-pulse">
            YOLO
          </span>
        </Show>
      </div>

      {/* Center: model selector + drag region */}
      <div class="flex-1 h-full flex items-center justify-center" data-tauri-drag-region>
        <ModelSelector />
      </div>

      {/* Right: YOLO toggle + window controls */}
      <div class="flex items-center">
        <button
          class={`flex items-center justify-center w-12 h-full transition-colors ${
            uiState.yoloMode
              ? 'text-warning bg-warning-muted'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleYoloMode}
          aria-label={uiState.yoloMode ? 'Disable YOLO Mode' : 'Enable YOLO Mode'}
          title={
            uiState.yoloMode ? 'YOLO Mode active (Cmd+Shift+Y)' : 'Enable YOLO Mode (Cmd+Shift+Y)'
          }
        >
          <Zap size={14} />
        </button>

        {/* Windows/Linux: right-side window controls (macOS uses native traffic lights) */}
        <Show when={!isMac()}>
          <button
            class="flex items-center justify-center w-12 h-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => appWindow.minimize()}
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            class="flex items-center justify-center w-12 h-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => appWindow.toggleMaximize()}
            aria-label="Maximize"
          >
            <Maximize2 size={14} />
          </button>
          <button
            class="flex items-center justify-center w-12 h-full text-text-secondary hover:text-text-primary hover:bg-error-muted transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => appWindow.close()}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </Show>
      </div>
    </header>
  );
};

export default TitleBar;
