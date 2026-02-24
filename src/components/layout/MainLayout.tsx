// src/components/layout/MainLayout.tsx
// 5-zone layout per SPEC-003 §2:
// Z1: TitleBar (top, fixed height)
// Z2: Sidebar (left, togglable)
// Z3: Main Content (center, flexible)
// Z4: DetailsPanel (right, togglable)
// Z5: StatusBar (bottom, fixed height)

import type { Component } from 'solid-js';
import { onMount, onCleanup, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { MessageSquare, Users, GitCompare, Terminal } from 'lucide-solid';
import {
  uiState,
  setActiveView,
  dismissPermissionDialog,
  closeSessionSwitcher,
  type ActiveView,
} from '@/stores/uiStore';
import type { PermissionAction } from '@/lib/types';
import { handleGlobalKeyDown } from '@/lib/keybindings';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import DetailsPanel from './DetailsPanel';
import ConversationView from '@/components/conversation/ConversationView';
import MessageInput from '@/components/conversation/MessageInput';
import PermissionDialog from '@/components/permissions/PermissionDialog';
import YoloWarningDialog from '@/components/permissions/YoloWarningDialog';
import { sessionState, createNewSession } from '@/stores/sessionStore';
import {
  sendMessage,
  conversationState,
  recordPermissionOutcome,
} from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import TerminalPane from '@/components/terminal/TerminalPane';
import CommandPalette from '@/components/common/CommandPalette';
import ExportDialog from '@/components/diagnostics/ExportDialog';
import ToastContainer from '@/components/common/ToastContainer';
import DiffPreviewPane from '@/components/diff/DiffPreviewPane';
import SettingsModal from '@/components/settings/SettingsModal';

const VIEW_ICONS: Record<ActiveView, Component<{ size?: number; class?: string }>> = {
  conversation: MessageSquare,
  agents: Users,
  diff: GitCompare,
  terminal: Terminal,
};

const MainLayout: Component = () => {
  // Global keyboard shortcuts (Cmd+B, Cmd+Shift+B, Cmd+1/2/3/4)
  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    try {
      document.documentElement.classList.toggle('cw-platform-macos', platform() === 'macos');
    } catch {
      document.documentElement.classList.remove('cw-platform-macos');
    }
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
    document.documentElement.classList.remove('cw-platform-macos');
  });

  return (
    <div class="grain-overlay h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
      <TitleBar />

      <div class="flex-1 flex overflow-hidden">
        {/* Z2: Sidebar — transitions width for expanded/collapsed/hidden tri-state */}
        <div
          class="overflow-hidden shrink-0 transition-[width,border-width]"
          style={{
            width:
              uiState.sidebarState === 'expanded'
                ? 'var(--sidebar-width)'
                : uiState.sidebarState === 'collapsed'
                  ? 'var(--sidebar-collapsed)'
                  : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            background: 'var(--color-chrome-bg)',
            'backdrop-filter': 'blur(var(--glass-blur)) saturate(1.05)',
            'border-right':
              uiState.sidebarState !== 'hidden' ? '1px solid var(--color-chrome-border)' : 'none',
          }}
        >
          {/* Inner wrapper maintains full width during transition */}
          <div
            class="h-full"
            style={{
              width:
                uiState.sidebarState === 'collapsed'
                  ? 'var(--sidebar-collapsed)'
                  : 'var(--sidebar-width)',
            }}
          >
            <Sidebar />
          </div>
        </div>

        {/* Z3: Main Content */}
        <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* View tabs — refined with subtle bottom border */}
          <div
            class="flex items-center gap-0.5 px-3 bg-bg-primary"
            style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
          >
            <ViewTab label="Conversation" view="conversation" />
            <ViewTab label="Agents" view="agents" />
            <ViewTab label="Diff" view="diff" />
            <ViewTab label="Terminal" view="terminal" />
          </div>

          {/* View content area */}
          <div class="flex-1 flex flex-col overflow-hidden">
            <Show when={uiState.activeView === 'conversation'}>
              <ConversationView />
            </Show>
            <Show when={uiState.activeView === 'agents'}>
              <div class="flex items-center justify-center h-full">
                <div class="text-center animate-fade-in">
                  <p class="text-text-tertiary text-sm tracking-wide">Agent dashboard</p>
                  <p class="text-text-tertiary/50 text-xs mt-1">Coming soon</p>
                </div>
              </div>
            </Show>
            <Show when={uiState.activeView === 'diff'}>
              <DiffPreviewPane />
            </Show>
            <Show when={uiState.activeView === 'terminal'}>
              <TerminalPane />
            </Show>
          </div>

          {/* Message input — only visible in conversation view */}
          <Show when={uiState.activeView === 'conversation'}>
            <MessageInput
              onSend={(text) => {
                const sessionId = sessionState.activeSessionId;
                if (sessionId) {
                  sendMessage(text, sessionId);
                } else {
                  createNewSession('claude-sonnet-4-6').then((session) => {
                    sendMessage(text, session.id);
                  });
                }
              }}
              isLoading={conversationState.isLoading}
              isDisabled={!cliState.isDetected}
            />
          </Show>
        </main>

        {/* Z4: Details Panel — transitions width for smooth show/hide */}
        <div
          class="overflow-hidden shrink-0 transition-[width,border-width]"
          style={{
            width: uiState.detailsPanelVisible ? 'var(--details-panel-width)' : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            background: 'var(--color-chrome-bg)',
            'backdrop-filter': 'blur(var(--glass-blur)) saturate(1.05)',
            'border-left': uiState.detailsPanelVisible
              ? '1px solid var(--color-chrome-border)'
              : 'none',
          }}
        >
          <div class="h-full" style={{ width: 'var(--details-panel-width)' }}>
            <DetailsPanel />
          </div>
        </div>
      </div>

      <StatusBar />

      {/* Permission dialog — rendered above everything when a request is pending */}
      <Show when={uiState.permissionRequest}>
        {(request) => (
          <PermissionDialog
            request={request()}
            // eslint-disable-next-line solid/reactivity -- event handler callback, not a tracking scope
            onRespond={async (action: PermissionAction) => {
              const req = request();
              dismissPermissionDialog();
              // Record permission outcome as an inline message in the conversation (CHI-91)
              const outcome =
                action === 'Approve' || action === 'AlwaysAllow' ? 'allowed' : 'denied';
              const sid = sessionState.activeSessionId;
              if (sid && req) {
                recordPermissionOutcome(sid, req.tool, req.command, outcome, req.risk_level);
              }
              try {
                await invoke('respond_permission', {
                  request_id: req.request_id,
                  action,
                  pattern: null,
                });
              } catch (err) {
                if (import.meta.env.DEV) {
                  console.warn('[MainLayout] Failed to resolve permission:', err);
                }
              }
            }}
          />
        )}
      </Show>

      {/* YOLO warning dialog */}
      <Show when={uiState.yoloDialogVisible}>
        <YoloWarningDialog />
      </Show>

      {/* Command palette (Cmd+K) */}
      <Show when={uiState.commandPaletteVisible}>
        <CommandPalette mode={uiState.commandPaletteMode} />
      </Show>

      {/* Session quick-switcher (Cmd+Shift+P) */}
      <Show when={uiState.sessionSwitcherVisible}>
        <CommandPalette mode="sessions" onClose={closeSessionSwitcher} />
      </Show>

      {/* Export diagnostics dialog (CHI-98) */}
      <ExportDialog />

      {/* Settings overlay (CHI-124) */}
      <Show when={uiState.settingsVisible}>
        <SettingsModal />
      </Show>

      {/* Toast notifications — fixed bottom-right overlay */}
      <ToastContainer />
    </div>
  );
};

/** View tab button — refined underline indicator with accent glow */
const ViewTab: Component<{ label: string; view: ActiveView }> = (props) => {
  const isActive = () => uiState.activeView === props.view;
  const badge = () => uiState.viewBadges[props.view] ?? 0;

  return (
    <button
      class={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium tracking-wide transition-colors ${
        isActive() ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
      }`}
      style={{ 'transition-duration': 'var(--duration-normal)' }}
      onClick={() => setActiveView(props.view)}
      title={props.label}
    >
      <Dynamic component={VIEW_ICONS[props.view]} size={13} />
      <span>{props.label}</span>
      <Show when={badge() > 0}>
        <span
          class="ml-0.5 text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
            'min-width': '14px',
            'text-align': 'center',
          }}
        >
          {badge() > 99 ? '99+' : badge()}
        </span>
      </Show>
      {/* Active indicator — warm accent line with subtle glow */}
      <div
        class="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
        style={{
          'transition-duration': 'var(--duration-normal)',
          'transition-timing-function': 'var(--ease-default)',
          background: isActive() ? 'var(--color-accent)' : 'transparent',
          'box-shadow': isActive() ? '0 0 8px rgba(232, 130, 90, 0.4)' : 'none',
          opacity: isActive() ? '1' : '0',
        }}
      />
    </button>
  );
};

export default MainLayout;
