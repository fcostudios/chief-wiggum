// src/components/layout/MainLayout.tsx
// 5-zone layout per SPEC-003 §2:
// Z1: TitleBar (top, fixed height)
// Z2: Sidebar (left, togglable)
// Z3: Main Content (center, flexible)
// Z4: DetailsPanel (right, togglable)
// Z5: StatusBar (bottom, fixed height)

import type { Component } from 'solid-js';
import { onMount, onCleanup, Show } from 'solid-js';
import { uiState, setActiveView, dismissPermissionDialog, type ActiveView } from '@/stores/uiStore';
import type { PermissionAction } from '@/lib/types';
import { handleGlobalKeyDown } from '@/lib/keybindings';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import DetailsPanel from './DetailsPanel';
import ConversationView from '@/components/conversation/ConversationView';
import MessageInput from '@/components/conversation/MessageInput';
import PermissionDialog from '@/components/permissions/PermissionDialog';
import { sendMessage } from '@/stores/conversationStore';

const MainLayout: Component = () => {
  // Global keyboard shortcuts (Cmd+B, Cmd+Shift+B, Cmd+1/2/3/4)
  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  return (
    <div class="h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
      <TitleBar />

      <div class="flex-1 flex overflow-hidden">
        {/* Z2: Sidebar — transitions width for smooth show/hide */}
        <div
          class="bg-bg-secondary border-r border-border-primary overflow-hidden shrink-0 transition-[width]"
          style={{
            width: uiState.sidebarVisible ? 'var(--sidebar-width)' : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            'border-right-width': uiState.sidebarVisible ? '1px' : '0px',
          }}
        >
          {/* Inner wrapper maintains full width during transition */}
          <div style={{ width: 'var(--sidebar-width)' }}>
            <Sidebar />
          </div>
        </div>

        {/* Z3: Main Content */}
        <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* View tabs */}
          <div class="flex items-center gap-1 px-3 border-b border-border-secondary bg-bg-primary">
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
                <p class="text-text-tertiary text-sm">Agent dashboard (future)</p>
              </div>
            </Show>
            <Show when={uiState.activeView === 'diff'}>
              <div class="flex items-center justify-center h-full">
                <p class="text-text-tertiary text-sm">Diff review (future)</p>
              </div>
            </Show>
            <Show when={uiState.activeView === 'terminal'}>
              <div class="flex items-center justify-center h-full">
                <p class="text-text-tertiary text-sm">Terminal (CHI-21)</p>
              </div>
            </Show>
          </div>

          {/* Message input — only visible in conversation view */}
          <Show when={uiState.activeView === 'conversation'}>
            <MessageInput
              onSend={(text) => {
                sendMessage(text);
              }}
              isLoading={false}
              isDisabled={false}
            />
          </Show>
        </main>

        {/* Z4: Details Panel — transitions width for smooth show/hide */}
        <div
          class="bg-bg-secondary border-l border-border-primary overflow-hidden shrink-0 transition-[width]"
          style={{
            width: uiState.detailsPanelVisible ? 'var(--details-panel-width)' : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            'border-left-width': uiState.detailsPanelVisible ? '1px' : '0px',
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
            onRespond={(_action: PermissionAction) => {
              // TODO: wire to IPC respond_permission command
              dismissPermissionDialog();
            }}
          />
        )}
      </Show>
    </div>
  );
};

/** View tab button — highlights active view with accent border */
const ViewTab: Component<{ label: string; view: string }> = (props) => {
  const isActive = () => uiState.activeView === props.view;

  return (
    <button
      class={`px-3 py-2 text-xs transition-colors ${
        isActive()
          ? 'text-text-primary border-b-2 border-accent'
          : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
      }`}
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() => setActiveView(props.view as ActiveView)}
    >
      {props.label}
    </button>
  );
};

export default MainLayout;
