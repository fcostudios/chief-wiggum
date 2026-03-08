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
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { MessageSquare, Users, GitCompare, Terminal, Zap } from 'lucide-solid';
import {
  uiState,
  setActiveView,
  dismissPermissionDialog,
  closeChangelog,
  closeAbout,
  closeQuickSwitcher,
  closeSessionSwitcher,
  setDetailsPanelWidth,
  setSidebarWidth,
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
import QuestionDialog from '@/components/questions/QuestionDialog';
import AutoApproveWarningDialog from '@/components/permissions/AutoApproveWarningDialog';
import { sessionState, createNewSession } from '@/stores/sessionStore';
import {
  sendMessage,
  conversationState,
  recordPermissionOutcome,
} from '@/stores/conversationStore';
import { cliState } from '@/stores/cliStore';
import TerminalPane from '@/components/terminal/TerminalPane';
import ActionsCenter from '@/components/actions/ActionsCenter';
import CommandPalette from '@/components/common/CommandPalette';
import KeyboardHelp from '@/components/common/KeyboardHelp';
import ExportDialog from '@/components/diagnostics/ExportDialog';
import ToastContainer from '@/components/common/ToastContainer';
import DiffPreviewPane from '@/components/diff/DiffPreviewPane';
import SettingsModal from '@/components/settings/SettingsModal';
import ContextBreakdownModal from '@/components/conversation/ContextBreakdownModal';
import SplitPaneContainer from '@/components/layout/SplitPaneContainer';
import AgentsView from '@/components/agents/AgentsView';
import { ensureMainPaneSession, viewState } from '@/stores/viewStore';
import EditorTakeover from '@/components/editor/EditorTakeover';
import { fileState } from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import ChangelogModal from '@/components/common/ChangelogModal';
import AboutModal from '@/components/common/AboutModal';
import QuickSessionSwitcher from '@/components/common/QuickSessionSwitcher';
import { discardUnsentContent, hasUnsentContent } from '@/stores/unsentStore';
import { t } from '@/stores/i18nStore';

const VIEW_ICONS: Record<ActiveView, Component<{ size?: number; class?: string }>> = {
  conversation: MessageSquare,
  agents: Users,
  diff: GitCompare,
  terminal: Terminal,
  actions_center: Zap,
};

const MainLayout: Component = () => {
  let layoutRowRef: HTMLDivElement | undefined;

  function startSidebarResize(event: MouseEvent): void {
    if (uiState.sidebarState !== 'expanded') return;
    const row = layoutRowRef;
    if (!row) return;
    event.preventDefault();
    const bounds = row.getBoundingClientRect();

    const onMove = (moveEvent: MouseEvent) => {
      setSidebarWidth(moveEvent.clientX - bounds.left);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startDetailsResize(event: MouseEvent): void {
    if (!uiState.detailsPanelVisible) return;
    const row = layoutRowRef;
    if (!row) return;
    event.preventDefault();
    const bounds = row.getBoundingClientRect();

    const onMove = (moveEvent: MouseEvent) => {
      setDetailsPanelWidth(bounds.right - moveEvent.clientX);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

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

  // Seed the primary pane with the current active session after app/session restore.
  onMount(() => {
    ensureMainPaneSession(sessionState.activeSessionId);
  });

  // Warn before closing the app when there is unsent content.
  onMount(() => {
    let unlisten: (() => void) | null = null;
    try {
      void getCurrentWindow()
        .onCloseRequested((event) => {
          if (!hasUnsentContent()) return;
          const confirmed = window.confirm(t('unsent.message'));
          if (!confirmed) {
            event.preventDefault();
            return;
          }
          discardUnsentContent();
        })
        .then((fn) => {
          unlisten = fn;
        });
    } catch {
      // Browser mode: no native window API.
    }

    onCleanup(() => {
      unlisten?.();
    });
  });

  return (
    <div class="h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
      {/* Skip navigation link — visible on keyboard focus */}
      <a href="#main-content" class="skip-to-content">
        Skip to content
      </a>

      <TitleBar />

      <div ref={layoutRowRef} class="flex-1 flex overflow-hidden">
        {/* Z2: Sidebar — transitions width for expanded/collapsed/hidden tri-state */}
        <div
          class="overflow-hidden shrink-0 transition-[width,border-width]"
          style={{
            width:
              uiState.sidebarState === 'expanded'
                ? `${uiState.sidebarWidth}px`
                : uiState.sidebarState === 'collapsed'
                  ? 'var(--sidebar-collapsed)'
                  : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            background: 'var(--color-bg-sidebar)',
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
                  : `${uiState.sidebarWidth}px`,
            }}
          >
            <Sidebar />
          </div>
        </div>
        <Show when={uiState.sidebarState === 'expanded'}>
          <div
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            class="w-1 shrink-0 cursor-col-resize group relative"
            onMouseDown={startSidebarResize}
          >
            <div
              class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors"
              style={{ background: 'var(--color-border-secondary)' }}
            />
          </div>
        </Show>

        {/* Z3: Main Content */}
        <main id="main-content" class="flex-1 flex flex-col min-w-0 overflow-hidden" tabindex={-1}>
          {/* View tabs — refined with subtle bottom border */}
          <div class="flex items-center gap-0.5 px-3 bg-bg-primary">
            <ViewTab label="Conversation" view="conversation" />
            <ViewTab label="Agents" view="agents" />
            <ViewTab label="Diff" view="diff" />
            <ViewTab label="Terminal" view="terminal" />
            <ViewTab
              label="Actions"
              view="actions_center"
              title="Background tasks & execution history"
            />
          </div>

          {/* View content area */}
          <div class="flex-1 flex flex-col overflow-hidden relative">
            <Show when={uiState.activeView === 'conversation'}>
              <div
                class={`flex flex-col flex-1 min-h-0 ${
                  fileState.editorTakeoverActive
                    ? 'absolute inset-0 opacity-0 pointer-events-none'
                    : 'relative'
                }`}
                aria-hidden={fileState.editorTakeoverActive}
              >
                <Show when={viewState.layoutMode === 'single'} fallback={<SplitPaneContainer />}>
                  <ConversationView />
                </Show>
              </div>
            </Show>
            <Show when={uiState.activeView === 'agents' && !fileState.editorTakeoverActive}>
              <AgentsView />
            </Show>
            <Show when={uiState.activeView === 'diff' && !fileState.editorTakeoverActive}>
              <DiffPreviewPane />
            </Show>
            <Show when={uiState.activeView === 'terminal' && !fileState.editorTakeoverActive}>
              <TerminalPane />
            </Show>
            <Show when={uiState.activeView === 'actions_center' && !fileState.editorTakeoverActive}>
              <ActionsCenter />
            </Show>
            <Show when={fileState.editorTakeoverActive}>
              <div class="absolute inset-0 z-10">
                <EditorTakeover />
              </div>
            </Show>
          </div>

          {/* Message input — only visible in conversation view */}
          <Show
            when={
              uiState.activeView === 'conversation' &&
              viewState.layoutMode === 'single' &&
              !fileState.editorTakeoverActive
            }
          >
            <MessageInput
              onSend={(text, images) => {
                const sessionId = sessionState.activeSessionId;
                if (sessionId) {
                  sendMessage(text, sessionId, images);
                } else {
                  createNewSession(
                    'claude-sonnet-4-6',
                    projectState.activeProjectId ?? undefined,
                  ).then((session) => {
                    sendMessage(text, session.id, images);
                  });
                }
              }}
              isLoading={conversationState.isLoading}
              isDisabled={!cliState.isDetected}
            />
          </Show>
        </main>

        <Show when={uiState.detailsPanelVisible}>
          <div
            role="separator"
            aria-label="Resize details panel"
            aria-orientation="vertical"
            class="w-1 shrink-0 cursor-col-resize group relative"
            onMouseDown={startDetailsResize}
          >
            <div
              class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors"
              style={{ background: 'var(--color-border-secondary)' }}
            />
          </div>
        </Show>

        {/* Z4: Details Panel — transitions width for smooth show/hide */}
        <div
          class="overflow-hidden shrink-0 transition-[width,border-width]"
          style={{
            width: uiState.detailsPanelVisible ? `${uiState.detailsPanelWidth}px` : '0px',
            'transition-duration': 'var(--duration-slow)',
            'transition-timing-function': 'var(--ease-default)',
            background: 'var(--color-bg-details)',
            'border-left': uiState.detailsPanelVisible
              ? '1px solid var(--color-chrome-border)'
              : 'none',
          }}
        >
          <div class="h-full" style={{ width: `${uiState.detailsPanelWidth}px` }}>
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

      {/* AskUserQuestion dialog (CHI-283) */}
      <Show when={uiState.questionRequest}>
        {(request) => <QuestionDialog request={request()} />}
      </Show>

      {/* Auto-approve warning dialog */}
      <Show when={uiState.yoloDialogVisible}>
        <AutoApproveWarningDialog />
      </Show>

      {/* Command palette (Cmd+K) */}
      <Show when={uiState.commandPaletteVisible}>
        <CommandPalette mode={uiState.commandPaletteMode} />
      </Show>

      {/* Session quick-switcher (Cmd+Shift+P) */}
      <Show when={uiState.sessionSwitcherVisible}>
        <CommandPalette mode="sessions" onClose={closeSessionSwitcher} />
      </Show>

      {/* Ctrl+Tab quick switcher */}
      <Show when={uiState.quickSwitcherVisible}>
        <QuickSessionSwitcher onClose={closeQuickSwitcher} />
      </Show>

      {/* Keyboard shortcuts help (Cmd+/) */}
      <Show when={uiState.keyboardHelpVisible}>
        <KeyboardHelp />
      </Show>

      {/* Export diagnostics dialog (CHI-98) */}
      <ExportDialog />

      {/* Settings overlay (CHI-124) */}
      <Show when={uiState.settingsVisible}>
        <SettingsModal />
      </Show>

      {/* Context budget breakdown (CHI-125) */}
      <Show when={uiState.contextBreakdownVisible}>
        <ContextBreakdownModal />
      </Show>

      <Show when={uiState.changelogVisible}>
        <ChangelogModal onClose={closeChangelog} />
      </Show>

      <Show when={uiState.aboutVisible}>
        <AboutModal onClose={closeAbout} />
      </Show>

      {/* Toast notifications — fixed bottom-right overlay */}
      <ToastContainer />
    </div>
  );
};

/** View tab button — pill indicator per CHI-234 */
const ViewTab: Component<{ label: string; view: ActiveView; title?: string }> = (props) => {
  const isActive = () => uiState.activeView === props.view;
  const badge = () => uiState.viewBadges[props.view] ?? 0;

  return (
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors"
      style={{
        'transition-duration': 'var(--duration-normal)',
        background: isActive() ? 'var(--color-tab-active-bg)' : 'transparent',
        color: isActive() ? 'var(--color-tab-active-text)' : 'var(--color-tab-inactive-text)',
      }}
      onClick={() => setActiveView(props.view)}
      title={props.title ?? props.label}
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
    </button>
  );
};

export default MainLayout;
