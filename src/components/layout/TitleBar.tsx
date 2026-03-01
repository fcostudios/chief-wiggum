// src/components/layout/TitleBar.tsx
// Custom title bar (40px) per SPEC-003 §2 Z1.
// CHI-229: reduced chrome density, project-centered context, status-driven model chip.

import type { Component } from 'solid-js';
import { Show, createMemo, createSignal, onMount } from 'solid-js';
import { ChevronDown, Minus, Maximize2, X, Settings } from 'lucide-solid';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { uiState, openSettings } from '@/stores/uiStore';
import { conversationState } from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import { getActiveProject } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import ModelSelector from '@/components/common/ModelSelector';

const TitleBar: Component = () => {
  const [isMac, setIsMac] = createSignal(false);
  const isAgentBusy = () =>
    conversationState.processStatus === 'running' || conversationState.isStreaming;
  const projectName = createMemo(() => getActiveProject()?.name ?? t('titlebar.project_none'));
  const chipStatus = createMemo(() => {
    if (!cliState.isDetected) {
      return {
        text: t('status.cli_not_found'),
        color: 'var(--color-error)',
        pulse: false,
        showModel: false,
      };
    }
    if (uiState.permissionRequest) {
      return {
        text: t('status.permission_needed'),
        color: 'var(--color-warning)',
        pulse: false,
        showModel: true,
      };
    }
    if (isAgentBusy()) {
      return {
        text: t('status.responding'),
        color: 'var(--color-success)',
        pulse: true,
        showModel: true,
      };
    }
    return {
      text: null,
      color: 'var(--color-text-tertiary)',
      pulse: false,
      showModel: false,
    };
  });

  function withCurrentWindow(
    action: (appWindow: ReturnType<typeof getCurrentWindow>) => void,
  ): void {
    try {
      action(getCurrentWindow());
    } catch {
      // Browser-mode preview / Playwright E2E (no Tauri window API available).
    }
  }

  onMount(() => {
    try {
      const result = platform();
      if (typeof result === 'string') {
        setIsMac(result === 'macos');
        return;
      }
      void Promise.resolve(result)
        .then((value) => setIsMac(value === 'macos'))
        .catch(() => setIsMac(false));
    } catch {
      setIsMac(false);
    }
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

      <div class="flex-1 min-w-0 flex items-center">
        <div class="flex-1 h-full" data-tauri-drag-region />

        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-full min-w-0 max-w-[40%]"
          style={{
            background: 'rgba(28, 33, 40, 0.5)',
            border: '1px solid var(--color-border-secondary)',
          }}
          data-tauri-drag-region
          title={projectName()}
        >
          <span class="text-xs text-text-secondary truncate">{projectName()}</span>
          <ChevronDown size={11} class="text-text-tertiary shrink-0" />
        </div>

        <div
          class="mx-2 rounded-full"
          style={{
            background: 'rgba(28, 33, 40, 0.45)',
            border: '1px solid var(--color-border-secondary)',
          }}
        >
          <ModelSelector
            statusText={chipStatus().text}
            statusColor={chipStatus().color}
            statusPulse={chipStatus().pulse}
            showModelWhenStatus={chipStatus().showModel}
          />
        </div>

        <div class="flex-1 h-full" data-tauri-drag-region />
      </div>

      {/* Right: settings + window controls */}
      <div class="flex items-center shrink-0">
        <button
          class="flex items-center justify-center w-10 h-full text-text-tertiary hover:text-text-primary transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={openSettings}
          aria-label="Open settings"
          title="Open settings (Cmd+,)"
        >
          <Settings size={13} />
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
              onClick={() => withCurrentWindow((appWindow) => void appWindow.minimize())}
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
              onClick={() => withCurrentWindow((appWindow) => void appWindow.toggleMaximize())}
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
              onClick={() => withCurrentWindow((appWindow) => void appWindow.close())}
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
