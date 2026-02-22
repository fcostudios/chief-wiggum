// src/components/layout/Sidebar.tsx
// Left sidebar (240px) per SPEC-003 §2 Z2.
// Displays real session list from sessionStore, supports create/switch/delete.

import type { Component } from 'solid-js';
import { For, Show, onMount, createSignal } from 'solid-js';
import { Plus, Trash2, MessageSquare, FolderOpen, Pin } from 'lucide-solid';
import type { Session } from '@/lib/types';
import {
  sessionState,
  loadSessions,
  createNewSession,
  setActiveSession,
  deleteSession,
  toggleSessionPinned,
} from '@/stores/sessionStore';
import {
  loadMessages,
  clearMessages,
  cleanupEventListeners,
  switchSession,
  stopSessionCli,
} from '@/stores/conversationStore';
import {
  projectState,
  loadProjects,
  pickAndCreateProject,
  setActiveProject,
  getActiveProject,
} from '@/stores/projectStore';
import { uiState } from '@/stores/uiStore';

/** Format a timestamp as relative time (e.g., "2m ago", "1h ago"). */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map model ID to short display label. */
function modelLabel(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('haiku')) return 'Haiku';
  return 'Sonnet';
}

/** Map model ID to badge background color. */
function modelBgColor(model: string): string {
  if (model.includes('opus')) return 'var(--color-model-opus)';
  if (model.includes('haiku')) return 'var(--color-model-haiku)';
  return 'var(--color-model-sonnet)';
}

const Sidebar: Component = () => {
  const isCollapsed = () => uiState.sidebarState === 'collapsed';
  const [pinnedOpen, setPinnedOpen] = createSignal(true);
  const [recentOpen, setRecentOpen] = createSignal(true);
  const [olderOpen, setOlderOpen] = createSignal(true);

  /** Sessions filtered by active project. Shows all if no project selected. */
  const filteredSessions = () => {
    const projectId = projectState.activeProjectId;
    if (!projectId) return sessionState.sessions;
    return sessionState.sessions.filter((s) => s.project_id === projectId || !s.project_id);
  };

  const pinnedSessions = () => filteredSessions().filter((s) => s.pinned);
  const recentSessions = () => {
    const cutoff = Date.now() - 86400000; // 24 hours
    return filteredSessions().filter(
      (s) => !s.pinned && s.updated_at && new Date(s.updated_at).getTime() > cutoff,
    );
  };
  const olderSessions = () => {
    const cutoff = Date.now() - 86400000;
    return filteredSessions().filter(
      (s) => !s.pinned && (!s.updated_at || new Date(s.updated_at).getTime() <= cutoff),
    );
  };

  onMount(async () => {
    await loadSessions();
    await loadProjects();
    // Auto-select the most recent session on app start
    if (sessionState.sessions.length > 0 && !sessionState.activeSessionId) {
      const firstSession = sessionState.sessions[0];
      setActiveSession(firstSession.id);
      // Restore the project context for this session
      if (firstSession.project_id) {
        setActiveProject(firstSession.project_id);
      }
      await loadMessages(firstSession.id);
    }
  });

  async function handleNewSession() {
    const oldId = sessionState.activeSessionId;
    if (oldId) {
      await stopSessionCli(oldId);
    }
    await cleanupEventListeners();
    clearMessages();
    const project = getActiveProject();
    await createNewSession(project?.default_model ?? 'claude-sonnet-4-6', project?.id);
  }

  async function handleDeleteSession(sessionId: string) {
    // Stop any running CLI process first
    await stopSessionCli(sessionId);

    const isActive = sessionState.activeSessionId === sessionId;
    await deleteSession(sessionId);

    if (isActive) {
      const nextSession = sessionState.sessions[0];
      if (nextSession) {
        setActiveSession(nextSession.id);
        await switchSession(nextSession.id, null);
      } else {
        clearMessages();
      }
    }
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionState.activeSessionId === sessionId) return;
    const oldId = sessionState.activeSessionId;
    setActiveSession(sessionId);
    // Switch active project to match the session's project
    const session = sessionState.sessions.find((s) => s.id === sessionId);
    if (session?.project_id) {
      setActiveProject(session.project_id);
    }
    await switchSession(sessionId, oldId);
  }

  return (
    <nav class="flex flex-col h-full overflow-hidden" aria-label="Sidebar">
      {/* Project section */}
      <div style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
        <Show
          when={!isCollapsed()}
          fallback={
            /* Collapsed: single centered folder icon */
            <div class="flex flex-col items-center py-2 gap-1">
              <button
                class="flex items-center justify-center w-8 h-8 rounded-md text-text-tertiary hover:text-accent hover:bg-bg-elevated/50 transition-colors"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={() => pickAndCreateProject()}
                aria-label="Open project folder"
                title="Projects"
              >
                <FolderOpen size={16} />
              </button>
            </div>
          }
        >
          {/* Project header */}
          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
              Projects
            </span>
            <button
              class="p-0.5 rounded text-text-tertiary hover:text-accent transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => pickAndCreateProject()}
              aria-label="Add project folder"
              title="Open project folder"
            >
              <FolderOpen size={12} />
            </button>
          </div>

          {/* Recent projects list (max 5) */}
          <div class="px-2 pb-2">
            <Show
              when={projectState.projects.length > 0}
              fallback={
                <button
                  class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-elevated/50 transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={() => pickAndCreateProject()}
                >
                  <Plus size={11} />
                  <span class="tracking-wide">Open a project folder</span>
                </button>
              }
            >
              <div class="space-y-0.5">
                <For each={projectState.projects.slice(0, 5)}>
                  {(project) => (
                    <button
                      class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs transition-all truncate"
                      style={{
                        'transition-duration': 'var(--duration-fast)',
                        background:
                          projectState.activeProjectId === project.id
                            ? 'var(--color-bg-elevated)'
                            : 'transparent',
                        color:
                          projectState.activeProjectId === project.id
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        if (projectState.activeProjectId !== project.id) {
                          e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
                          e.currentTarget.style.color = 'var(--color-text-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (projectState.activeProjectId !== project.id) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--color-text-secondary)';
                        }
                      }}
                      onClick={() => setActiveProject(project.id)}
                      title={project.path}
                    >
                      <FolderOpen
                        size={12}
                        class="shrink-0"
                        style={{
                          color:
                            projectState.activeProjectId === project.id
                              ? 'var(--color-accent)'
                              : 'var(--color-text-tertiary)',
                        }}
                      />
                      <span class="truncate">{project.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Sessions header */}
      <Show
        when={!isCollapsed()}
        fallback={
          /* Collapsed: divider line only (sessions section flows directly below) */
          <div
            class="flex justify-center py-1"
            style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
          >
            <span
              class="text-[9px] font-mono px-1 py-0.5 rounded-full"
              style={{
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-tertiary)',
              }}
              title={`${filteredSessions().length} sessions`}
            >
              {filteredSessions().length}
            </span>
          </div>
        }
      >
        <div
          class="flex items-center justify-between px-3 py-2"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
            Sessions
          </span>
          <span
            class="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {filteredSessions().length}
          </span>
        </div>
      </Show>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-1 py-2" classList={{ 'px-2': !isCollapsed() }}>
        <Show
          when={filteredSessions().length > 0}
          fallback={
            <Show when={!isCollapsed()}>
              <div class="px-2 py-6 text-center animate-fade-in">
                <p class="text-xs text-text-tertiary/60 tracking-wide">No sessions yet</p>
                <p class="text-[10px] text-text-tertiary/40 mt-1">Create one to get started</p>
              </div>
            </Show>
          }
        >
          <div class="space-y-0.5">
            <SidebarSection
              title="Pinned"
              sessions={pinnedSessions()}
              open={pinnedOpen()}
              onToggle={() => setPinnedOpen((p) => !p)}
              isCollapsed={isCollapsed()}
              onSelect={handleSelectSession}
              onDelete={handleDeleteSession}
            />
            <SidebarSection
              title="Recent"
              sessions={recentSessions()}
              open={recentOpen()}
              onToggle={() => setRecentOpen((p) => !p)}
              isCollapsed={isCollapsed()}
              onSelect={handleSelectSession}
              onDelete={handleDeleteSession}
            />
            <SidebarSection
              title="Older"
              sessions={olderSessions()}
              open={olderOpen()}
              onToggle={() => setOlderOpen((p) => !p)}
              isCollapsed={isCollapsed()}
              onSelect={handleSelectSession}
              onDelete={handleDeleteSession}
            />
          </div>
        </Show>
      </div>

      {/* New session button */}
      <div class="p-2" style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
        <Show
          when={!isCollapsed()}
          fallback={
            /* Collapsed: icon-only new session button */
            <button
              class="flex items-center justify-center w-full h-8 rounded-md transition-all"
              style={{
                'transition-duration': 'var(--duration-normal)',
                color: 'var(--color-text-secondary)',
                background: 'transparent',
                border: '1px solid var(--color-border-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent)';
                e.currentTarget.style.borderColor = 'rgba(232, 130, 90, 0.3)';
                e.currentTarget.style.background = 'rgba(232, 130, 90, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
                e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={handleNewSession}
              aria-label="New session"
              title="New Session"
            >
              <Plus size={14} />
            </button>
          }
        >
          <button
            class="flex items-center justify-center gap-2 w-full py-2 rounded-md text-xs font-medium transition-all"
            style={{
              'transition-duration': 'var(--duration-normal)',
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--color-border-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-accent)';
              e.currentTarget.style.borderColor = 'rgba(232, 130, 90, 0.3)';
              e.currentTarget.style.background = 'rgba(232, 130, 90, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.borderColor = 'var(--color-border-secondary)';
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={handleNewSession}
            aria-label="New session"
          >
            <Plus size={13} />
            <span class="tracking-wide">New Session</span>
          </button>
        </Show>
      </div>
    </nav>
  );
};

/** Collapsible section for grouping sessions (Pinned / Recent / Older). */
function SidebarSection(props: {
  title: string;
  sessions: Session[];
  open: boolean;
  onToggle: () => void;
  isCollapsed: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Show when={props.sessions.length > 0}>
      <Show when={!props.isCollapsed}>
        <button
          class="flex items-center gap-1.5 w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={() => props.onToggle()}
        >
          <span
            class="transition-transform"
            style={{
              transform: props.open ? 'rotate(90deg)' : 'rotate(0deg)',
              'transition-duration': 'var(--duration-fast)',
            }}
          >
            ›
          </span>
          <span>{props.title}</span>
          <span style={{ opacity: '0.5' }}>({props.sessions.length})</span>
        </button>
      </Show>
      <Show when={props.open || props.isCollapsed}>
        <For each={props.sessions}>
          {(session) => (
            <Show
              when={!props.isCollapsed}
              fallback={
                /* Collapsed: icon-only session button */
                <button
                  class="flex items-center justify-center w-full h-8 rounded-md transition-colors"
                  style={{
                    'transition-duration': 'var(--duration-fast)',
                    background:
                      sessionState.activeSessionId === session.id
                        ? 'var(--color-bg-elevated)'
                        : 'transparent',
                    color:
                      sessionState.activeSessionId === session.id
                        ? 'var(--color-accent)'
                        : 'var(--color-text-tertiary)',
                  }}
                  onMouseEnter={(e) => {
                    if (sessionState.activeSessionId !== session.id) {
                      e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (sessionState.activeSessionId !== session.id) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    }
                  }}
                  onClick={() => props.onSelect(session.id)}
                  title={session.title || 'New Session'}
                  aria-label={session.title || 'New Session'}
                >
                  <MessageSquare size={14} />
                </button>
              }
            >
              <SessionItem
                session={session}
                isActive={sessionState.activeSessionId === session.id}
                onSelect={props.onSelect}
                onDelete={props.onDelete}
              />
            </Show>
          )}
        </For>
      </Show>
    </Show>
  );
}

/** Individual session item in the sidebar list. */
const SessionItem: Component<{
  session: Session;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}> = (props) => {
  let hoverBorderRef: HTMLDivElement | undefined;

  return (
    <div
      class="group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-all relative"
      style={{
        'transition-duration': 'var(--duration-fast)',
        background: props.isActive ? 'var(--color-bg-elevated)' : 'transparent',
        color: props.isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      }}
      onMouseEnter={(e) => {
        if (!props.isActive) {
          e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
          e.currentTarget.style.color = 'var(--color-text-primary)';
          if (hoverBorderRef) {
            hoverBorderRef.style.width = '2px';
            hoverBorderRef.style.opacity = '0.4';
          }
        }
      }}
      onMouseLeave={(e) => {
        if (!props.isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
          if (hoverBorderRef) {
            hoverBorderRef.style.width = '0px';
            hoverBorderRef.style.opacity = '0';
          }
        }
      }}
      onClick={() => props.onSelect(props.session.id)}
      role="button"
      tabindex="0"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect(props.session.id);
        }
      }}
    >
      {/* Active indicator — warm accent stripe */}
      <Show when={props.isActive}>
        <div
          class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
          style={{
            background: 'var(--color-accent)',
            'box-shadow': '0 0 6px rgba(232, 130, 90, 0.3)',
          }}
        />
      </Show>

      {/* Hover indicator for non-active sessions */}
      <Show when={!props.isActive}>
        <div
          ref={hoverBorderRef}
          class="absolute left-0 top-2 bottom-2 w-0 rounded-full opacity-0 transition-all"
          style={{
            background: 'var(--color-accent)',
            'transition-duration': 'var(--duration-fast)',
          }}
        />
      </Show>

      <MessageSquare size={13} class="mt-0.5 shrink-0 text-text-tertiary" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium truncate">{props.session.title || 'New Session'}</span>
          <span
            class="text-[9px] font-medium shrink-0 px-1 py-0.5 rounded"
            style={{ background: modelBgColor(props.session.model), color: 'var(--color-bg-primary)' }}
          >
            {modelLabel(props.session.model)}
          </span>
        </div>
        <span class="text-[10px] text-text-tertiary/60">
          {formatRelativeTime(props.session.updated_at)}
        </span>
      </div>
      <button
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-accent transition-all"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          toggleSessionPinned(props.session.id);
        }}
        aria-label={props.session.pinned ? 'Unpin session' : 'Pin session'}
        title={props.session.pinned ? 'Unpin' : 'Pin'}
      >
        <Pin size={11} class={props.session.pinned ? 'fill-current' : ''} />
      </button>
      <button
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-error transition-opacity"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete(props.session.id);
        }}
        aria-label="Delete session"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
};

export default Sidebar;
