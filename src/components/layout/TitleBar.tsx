// src/components/layout/TitleBar.tsx
// Custom title bar (40px) per SPEC-003 §2 Z1.
// Left: hamburger (sidebar toggle) + app name.
// Right: window controls (minimize, maximize, close).
// Center spacer: data-tauri-drag-region for window dragging.

import type { Component } from 'solid-js';
import { Menu, Minus, Maximize2, X } from 'lucide-solid';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toggleSidebar } from '@/stores/uiStore';

const TitleBar: Component = () => {
  const appWindow = getCurrentWindow();

  return (
    <header
      class="flex items-center bg-bg-secondary border-b border-border-primary select-none"
      style={{ height: 'var(--title-bar-height)' }}
    >
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
      </div>

      {/* Center: drag region */}
      <div class="flex-1 h-full" data-tauri-drag-region />

      {/* Right: window controls */}
      <div class="flex items-center">
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
      </div>
    </header>
  );
};

export default TitleBar;
