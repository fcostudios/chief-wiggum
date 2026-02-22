// src/components/layout/MainLayout.tsx
// 5-zone layout per SPEC-003 §2:
// Z1: TitleBar (top, fixed height)
// Z2: Sidebar (left, togglable)
// Z3: Main Content (center, flexible)
// Z4: DetailsPanel (right, togglable)
// Z5: StatusBar (bottom, fixed height)

import type { Component } from 'solid-js';
import { onMount, onCleanup, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
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
import ToastContainer from '@/components/common/ToastContainer';

const MainLayout: Component = () => {
  // Global keyboard shortcuts (Cmd+B, Cmd+Shift+B, Cmd+1/2/3/4)
  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  return (
    <div class="grain-overlay h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
      <TitleBar />

      <div class="flex-1 flex overflow-hidden">
        {/* Z2: Sidebar — transitions width for expanded/collapsed/hidden tri-state */}
        <div
          class="bg-bg-secondary overflow-hidden shrink-0 transition-[width,border-width]"
          style={{
            width:
              uiState.sidebarState === 'expanded'
                ? 'var(--sidebar-width)'
                : uiState.sidebarState === 'collapsed'
                  ? 'var(--sidebar-collapsed)'
                  : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            'border-right':
              uiState.sidebarState !== 'hidden'
                ? '1px solid var(--color-border-secondary)'
                : 'none',
          }}
        >
          {/* Inner wrapper maintains full width during transition */}
          <div
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
              <div class="flex items-center justify-center h-full">
                <div class="text-center animate-fade-in">
                  <p class="text-text-tertiary text-sm tracking-wide">Diff review</p>
                  <p class="text-text-tertiary/50 text-xs mt-1">Coming soon</p>
                </div>
              </div>
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
          class="bg-bg-secondary overflow-hidden shrink-0 transition-[width,border-width]"
          style={{
            width: uiState.detailsPanelVisible ? 'var(--details-panel-width)' : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            'border-left': uiState.detailsPanelVisible
              ? '1px solid var(--color-border-secondary)'
              : 'none',
          }}
        >
          <div style={{ width: 'var(--details-panel-width)' }}>
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
        <CommandPalette />
      </Show>

      {/* Session quick-switcher (Cmd+Shift+P) */}
      <Show when={uiState.sessionSwitcherVisible}>
        <CommandPalette mode="sessions" onClose={closeSessionSwitcher} />
      </Show>

      {/* Toast notifications — fixed bottom-right overlay */}
      <ToastContainer />
    </div>
  );
};

/** View tab button — refined underline indicator with accent glow */
const ViewTab: Component<{ label: string; view: string }> = (props) => {
  const isActive = () => uiState.activeView === props.view;

  return (
    <button
      class={`relative px-3 py-2 text-xs font-medium tracking-wide transition-colors ${
        isActive() ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
      }`}
      style={{ 'transition-duration': 'var(--duration-normal)' }}
      onClick={() => setActiveView(props.view as ActiveView)}
    >
      {props.label}
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
