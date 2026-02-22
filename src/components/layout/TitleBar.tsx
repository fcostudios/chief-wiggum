// src/components/layout/TitleBar.tsx
// Custom title bar (40px) per SPEC-003 §2 Z1.
// macOS: native traffic lights via titleBarStyle overlay (70px spacer).
// Windows/Linux: minimize, maximize, close buttons on the right.

import type { Component } from 'solid-js';
import { Show, createSignal, onMount } from 'solid-js';
import { Minus, Maximize2, X, Zap, Shield, ShieldCheck, Settings } from 'lucide-solid';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import {
  uiState,
  cyclePermissionTier,
  getPermissionTier,
  toggleDetailsPanel,
} from '@/stores/uiStore';
import { conversationState } from '@/stores/conversationStore';
import ModelSelector from '@/components/common/ModelSelector';

const TitleBar: Component = () => {
  const appWindow = getCurrentWindow();
  const [isMac, setIsMac] = createSignal(false);
  const isAgentBusy = () =>
    conversationState.processStatus === 'running' || conversationState.isStreaming;

  onMount(() => {
    setIsMac(platform() === 'macos');
  });

  return (
    <header
      class="flex items-center select-none relative"
      style={{
        height: 'var(--title-bar-height)',
        background:
          'linear-gradient(180deg, var(--color-chrome-bg-strong) 0%, var(--color-chrome-bg) 100%)',
        'backdrop-filter': 'blur(var(--glass-blur)) saturate(1.08)',
        'border-bottom': '1px solid var(--color-chrome-border)',
      }}
    >
      {/* Subtle warm glow on bottom edge */}
      <div
        class="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(232, 130, 90, 0.15) 50%, transparent 100%)',
        }}
      />

      {/* macOS: spacer for native traffic lights */}
      <Show when={isMac()}>
        <div class="w-[70px] shrink-0" />
      </Show>

      {/* Left: app name */}
      <div class="flex items-center gap-2.5 px-3">
        <span
          class="text-sm font-semibold tracking-tight text-text-primary"
          style={{ 'letter-spacing': '-0.02em' }}
        >
          Chief Wiggum
        </span>
        <Show when={uiState.yoloMode}>
          <span
            class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(210, 153, 34, 0.15)',
              color: 'var(--color-warning)',
              border: '1px solid rgba(210, 153, 34, 0.3)',
              animation: 'glow-pulse 2s ease-in-out infinite',
            }}
          >
            YOLO
          </span>
        </Show>
        <Show when={!uiState.yoloMode && uiState.developerMode}>
          <span
            class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(232, 130, 90, 0.15)',
              color: 'var(--color-accent)',
              border: '1px solid rgba(232, 130, 90, 0.3)',
            }}
          >
            DEV
          </span>
        </Show>
      </div>

      {/* Center: model selector + drag region */}
      <div class="flex-1 h-full flex items-center justify-center" data-tauri-drag-region>
        <ModelSelector />
      </div>

      {/* Right: settings + permission tier toggle + window controls */}
      <div class="flex items-center">
        {/* Settings gear — toggles details panel */}
        <button
          class="flex items-center justify-center w-10 h-full text-text-tertiary hover:text-text-primary transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleDetailsPanel}
          aria-label="Toggle settings panel"
          title="Toggle details panel (Cmd+Shift+B)"
        >
          <Settings size={13} />
        </button>

        {/* Permission tier cycle: Safe → Developer → YOLO */}
        <button
          class="flex items-center justify-center w-10 h-full transition-colors"
          style={{
            'transition-duration': 'var(--duration-fast)',
            color: uiState.yoloMode
              ? 'var(--color-warning)'
              : uiState.developerMode
                ? 'var(--color-accent)'
                : 'var(--color-text-tertiary)',
            background: uiState.yoloMode
              ? 'rgba(210, 153, 34, 0.1)'
              : uiState.developerMode
                ? 'rgba(232, 130, 90, 0.1)'
                : 'transparent',
            opacity: isAgentBusy() ? '0.4' : '1',
            cursor: isAgentBusy() ? 'not-allowed' : 'pointer',
          }}
          onClick={() => {
            if (!isAgentBusy()) cyclePermissionTier();
          }}
          disabled={isAgentBusy()}
          aria-label={`Permission: ${getPermissionTier()} — ${isAgentBusy() ? 'locked while agent is responding' : 'click to cycle'}`}
          title={
            isAgentBusy()
              ? 'Cannot change mode while agent is responding'
              : uiState.yoloMode
                ? 'YOLO Mode — click for Safe mode'
                : uiState.developerMode
                  ? 'Developer Mode — click for YOLO mode (Cmd+Shift+Y)'
                  : 'Safe Mode — click for Developer mode'
          }
        >
          <Show when={uiState.yoloMode}>
            <Zap size={13} />
          </Show>
          <Show when={!uiState.yoloMode && uiState.developerMode}>
            <ShieldCheck size={13} />
          </Show>
          <Show when={!uiState.yoloMode && !uiState.developerMode}>
            <Shield size={13} />
          </Show>
        </button>

        {/* Windows/Linux: right-side window controls */}
        <Show when={!isMac()}>
          <div class="flex items-center" style={{ 'margin-left': '4px' }}>
            <button
              class="flex items-center justify-center w-11 text-text-tertiary hover:text-text-primary hover:bg-bg-elevated/50 transition-colors"
              style={{
                height: 'var(--title-bar-height)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onClick={() => appWindow.minimize()}
              aria-label="Minimize"
            >
              <Minus size={13} />
            </button>
            <button
              class="flex items-center justify-center w-11 text-text-tertiary hover:text-text-primary hover:bg-bg-elevated/50 transition-colors"
              style={{
                height: 'var(--title-bar-height)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onClick={() => appWindow.toggleMaximize()}
              aria-label="Maximize"
            >
              <Maximize2 size={13} />
            </button>
            <button
              class="flex items-center justify-center w-11 text-text-tertiary hover:text-text-primary transition-colors"
              style={{
                height: 'var(--title-bar-height)',
                'transition-duration': 'var(--duration-fast)',
              }}
              onClick={() => appWindow.close()}
              aria-label="Close"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248, 81, 73, 0.2)';
                e.currentTarget.style.color = 'var(--color-error)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
              }}
            >
              <X size={13} />
            </button>
          </div>
        </Show>
      </div>
    </header>
  );
};

export default TitleBar;
