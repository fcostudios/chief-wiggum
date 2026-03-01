// src/components/layout/Sidebar.tsx
// Left sidebar (240px) per SPEC-003 §2 Z2.
// Displays real session list from sessionStore, supports create/switch/delete.

import type { Component } from 'solid-js';
import { For, Show, onMount, onCleanup, createSignal, createEffect } from 'solid-js';
import {
  Plus,
  Trash2,
  MessageSquare,
  FolderOpen,
  Pin,
  Pencil,
  Copy,
  FileCode,
  MoreHorizontal,
  Zap,
  Search,
  X,
} from 'lucide-solid';
import type { Session } from '@/lib/types';
import {
  sessionState,
  loadSessions,
  createNewSession,
  setActiveSession,
  deleteSession,
  toggleSessionPinned,
  updateSessionTitle,
  duplicateSession,
  sessionHasMessages,
} from '@/stores/sessionStore';
import {
  loadMessages,
  clearMessages,
  switchSession,
  stopSessionCli,
  getSessionStatus,
  isSessionUnread,
  clearSessionUnread,
} from '@/stores/conversationStore';
import {
  projectState,
  loadProjects,
  pickAndCreateProject,
  setActiveProject,
  getActiveProject,
} from '@/stores/projectStore';
import { fileState, toggleFilesVisible } from '@/stores/fileStore';
import { actionState, discoverActions } from '@/stores/actionStore';
import { uiState, setViewBadge } from '@/stores/uiStore';
import { t } from '@/stores/i18nStore';
import FileTree from '@/components/explorer/FileTree';
import ActionsPanel from '@/components/actions/ActionsPanel';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';

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
  const [actionsOpen, setActionsOpen] = createSignal(false);
  const [sessionsOpen, setSessionsOpen] = createSignal(true);
  const [focusedContentSection, setFocusedContentSection] = createSignal<
    'files' | 'actions' | null
  >(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [debouncedQuery, setDebouncedQuery] = createSignal('');
  let searchInputRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function updateSearch(value: string) {
    setSearchQuery(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setDebouncedQuery(value.trim().toLowerCase());
    }, 100);
  }

  /** Sessions filtered by active project. Shows all if no project selected. */
  const projectFilteredSessions = () => {
    const projectId = projectState.activeProjectId;
    if (!projectId) return sessionState.sessions;
    return sessionState.sessions.filter((s) => s.project_id === projectId || !s.project_id);
  };

  /** Sessions filtered by both project and debounced search query. */
  const filteredSessions = () => {
    const query = debouncedQuery();
    if (!query) return projectFilteredSessions();
    return projectFilteredSessions().filter((s) =>
      (s.title || t('sidebar.newSession')).toLowerCase().includes(query),
    );
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

  onCleanup(() => clearTimeout(debounceTimer));

  function ensureActionsDiscovered() {
    if (actionState.actions.length > 0) return;
    const project = getActiveProject();
    if (project?.path) {
      void discoverActions(project.path);
    }
  }

  function openActionsSection() {
    setActionsOpen(true);
    ensureActionsDiscovered();
  }

  function handleFilesSectionHeaderClick() {
    if (!fileState.isVisible) {
      toggleFilesVisible();
      setFocusedContentSection('files');
      return;
    }

    if (focusedContentSection() !== 'files') {
      setFocusedContentSection('files');
      return;
    }

    toggleFilesVisible();
    setFocusedContentSection((prev) => (prev === 'files' ? null : prev));
  }

  function handleActionsSectionHeaderClick() {
    if (!actionsOpen()) {
      openActionsSection();
      setFocusedContentSection('actions');
      return;
    }

    if (focusedContentSection() !== 'actions') {
      setFocusedContentSection('actions');
      return;
    }

    setActionsOpen(false);
    setFocusedContentSection((prev) => (prev === 'actions' ? null : prev));
  }

  onMount(async () => {
    await loadSessions();
    await loadProjects();
    // Auto-select the most recent session on app start
    if (sessionState.sessions.length > 0 && !sessionState.activeSessionId) {
      const firstSession = sessionState.sessions[0];
      setActiveSession(firstSession.id);
      clearSessionUnread(firstSession.id);
      // Restore the project context for this session
      if (firstSession.project_id) {
        setActiveProject(firstSession.project_id);
      }
      await loadMessages(firstSession.id);
    }
  });

  createEffect(() => {
    if (!projectState.activeProjectId || isCollapsed()) {
      setFocusedContentSection(null);
    }
    if (focusedContentSection() === 'files' && !fileState.isVisible) {
      setFocusedContentSection(null);
    }
    if (focusedContentSection() === 'actions' && !actionsOpen()) {
      setFocusedContentSection(null);
    }
  });

  createEffect(() => {
    setViewBadge('actions_center', actionState.crossProjectRunning.length);
  });

  async function handleNewSession() {
    // Don't stop old CLI -- it continues running in the background
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
    clearSessionUnread(sessionId);
    // Switch active project to match the session's project
    const session = sessionState.sessions.find((s) => s.id === sessionId);
    if (session?.project_id) {
      setActiveProject(session.project_id);
    }
    await switchSession(sessionId, oldId);
  }

  return (
    <nav
      class="flex flex-col h-full overflow-hidden"
      style={{
        background: 'transparent',
        'backdrop-filter': 'saturate(1.02)',
      }}
      aria-label="Sidebar"
    >
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
                aria-label={t('sidebar.openProject')}
                title={t('sidebar.projects')}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          }
        >
          {/* Project header */}
          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
              {t('sidebar.projects')}
            </span>
            <button
              class="p-0.5 rounded text-text-tertiary hover:text-accent transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => pickAndCreateProject()}
              aria-label={t('sidebar.openProject')}
              title={t('sidebar.openProject')}
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
                  <span class="tracking-wide">{t('sidebar.openProject')}</span>
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

      {/* Files section — only when project is active */}
      <Show when={projectState.activeProjectId}>
        <div
          class="flex flex-col shrink-0"
          classList={{
            'flex-1': fileState.isVisible && focusedContentSection() === 'files',
            'min-h-0': fileState.isVisible && focusedContentSection() === 'files',
          }}
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <Show
            when={!isCollapsed()}
            fallback={
              <div class="flex flex-col items-center py-2 gap-1">
                <button
                  class="flex items-center justify-center w-8 h-8 rounded-md text-text-tertiary hover:text-accent hover:bg-bg-elevated/50 transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={() => toggleFilesVisible()}
                  aria-label="Toggle files"
                  title={t('sidebar.files')}
                >
                  <FileCode size={16} />
                </button>
              </div>
            }
          >
            {/* Files header */}
            <button
              class="flex items-center justify-between w-full px-3 py-2 text-left"
              onClick={handleFilesSectionHeaderClick}
              aria-expanded={fileState.isVisible}
              style={{
                background:
                  fileState.isVisible && focusedContentSection() === 'files'
                    ? 'rgba(232, 130, 90, 0.07)'
                    : 'transparent',
              }}
            >
              <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
                {t('sidebar.files')}
              </span>
              <span
                class="text-[9px] transition-transform"
                style={{
                  color: 'var(--color-text-tertiary)',
                  transform: fileState.isVisible ? 'rotate(90deg)' : 'rotate(0deg)',
                  'transition-duration': 'var(--duration-fast)',
                }}
              >
                ›
              </span>
            </button>

            {/* File tree (collapsible) */}
            <Show when={fileState.isVisible}>
              <div
                class="min-h-0"
                classList={{
                  'max-h-[220px]': focusedContentSection() !== 'files',
                  'flex-1': focusedContentSection() === 'files',
                  'overflow-y-auto': true,
                }}
                style={{
                  'transition-duration': 'var(--duration-normal)',
                  'scrollbar-gutter': 'stable',
                  'overscroll-behavior': 'contain',
                }}
              >
                <FileTree singleScroll={focusedContentSection() === 'files'} />
              </div>
            </Show>
          </Show>
        </div>
      </Show>

      {/* Actions section — only when project is active */}
      <Show when={projectState.activeProjectId}>
        <div
          class="flex flex-col shrink-0"
          classList={{
            'flex-1': actionsOpen() && focusedContentSection() === 'actions',
            'min-h-0': actionsOpen() && focusedContentSection() === 'actions',
          }}
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <Show
            when={!isCollapsed()}
            fallback={
              <div class="flex flex-col items-center py-2 gap-1">
                <button
                  class="flex items-center justify-center w-8 h-8 rounded-md text-text-tertiary hover:text-accent hover:bg-bg-elevated/50 transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={() => setActionsOpen((prev) => !prev)}
                  aria-label="Toggle actions"
                  title={t('sidebar.actions')}
                >
                  <Zap size={16} />
                </button>
              </div>
            }
          >
            <button
              class="flex items-center justify-between w-full px-3 py-2 text-left"
              onClick={handleActionsSectionHeaderClick}
              aria-expanded={actionsOpen()}
              style={{
                background:
                  actionsOpen() && focusedContentSection() === 'actions'
                    ? 'rgba(232, 130, 90, 0.07)'
                    : 'transparent',
              }}
            >
              <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
                {t('sidebar.actions')}
              </span>
              <span
                class="text-[9px] transition-transform"
                style={{
                  color: 'var(--color-text-tertiary)',
                  transform: actionsOpen() ? 'rotate(90deg)' : 'rotate(0deg)',
                  'transition-duration': 'var(--duration-fast)',
                }}
              >
                ›
              </span>
            </button>

            <Show when={actionsOpen()}>
              <div
                class="min-h-0"
                classList={{
                  'max-h-[220px]': focusedContentSection() !== 'actions',
                  'flex-1': focusedContentSection() === 'actions',
                  'overflow-y-auto': true,
                }}
                style={{
                  'transition-duration': 'var(--duration-normal)',
                  'scrollbar-gutter': 'stable',
                  'overscroll-behavior': 'contain',
                }}
              >
                <ActionsPanel singleScroll={focusedContentSection() === 'actions'} />
              </div>
            </Show>
          </Show>
        </div>
      </Show>

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
        <div style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}>
          <button
            class="flex items-center justify-between w-full px-3 py-2 text-left"
            onClick={() => setSessionsOpen((p) => !p)}
          >
            <div class="flex items-center gap-1.5">
              <span
                class="text-[9px] transition-transform"
                style={{
                  color: 'var(--color-text-tertiary)',
                  transform: sessionsOpen() ? 'rotate(90deg)' : 'rotate(0deg)',
                  'transition-duration': 'var(--duration-fast)',
                }}
              >
                ›
              </span>
              <span class="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">
                {t('sidebar.sessions')}
              </span>
            </div>
            <span
              class="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
              style={{
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {filteredSessions().length}
            </span>
          </button>
          <div class="px-2 pb-2">
            <div
              class="flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{
                background: 'var(--color-bg-inset)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <Search size={11} class="shrink-0 text-text-tertiary" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('sidebar.filterSessions')}
                value={searchQuery()}
                onInput={(e) => updateSearch(e.currentTarget.value)}
                class="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary/40 outline-none min-w-0"
              />
              <Show when={searchQuery().length > 0}>
                <button
                  class="shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors"
                  style={{ 'transition-duration': 'var(--duration-fast)' }}
                  onClick={() => {
                    updateSearch('');
                    searchInputRef?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Session list */}
      <Show when={sessionsOpen() || isCollapsed()}>
        <div
          class="overflow-y-auto px-1 py-2 min-h-0"
          classList={{
            'flex-1': true,
            'px-2': !isCollapsed(),
          }}
        >
          <Show
            when={filteredSessions().length > 0}
            fallback={
              <Show when={!isCollapsed()}>
                <div class="px-2 py-6 text-center animate-fade-in">
                  <Show
                    when={debouncedQuery().length > 0}
                    fallback={
                      <>
                        <p class="text-xs text-text-tertiary/60 tracking-wide">
                          {t('sidebar.noSessions')}
                        </p>
                        <p class="text-[10px] text-text-tertiary/40 mt-1">
                          {t('sidebar.createToStart')}
                        </p>
                      </>
                    }
                  >
                    <p class="text-xs text-text-tertiary/60 tracking-wide">
                      {t('sidebar.noMatching')}
                    </p>
                    <p class="text-[10px] text-text-tertiary/40 mt-1">
                      {t('sidebar.tryDifferent')}
                    </p>
                  </Show>
                </div>
              </Show>
            }
          >
            <div class="space-y-0.5">
              <SidebarSection
                title={t('sidebar.pinned')}
                sessions={pinnedSessions()}
                open={pinnedOpen()}
                onToggle={() => setPinnedOpen((p) => !p)}
                isCollapsed={isCollapsed()}
                onSelect={handleSelectSession}
                onDelete={handleDeleteSession}
              />
              <SidebarSection
                title={t('sidebar.recent')}
                sessions={recentSessions()}
                open={recentOpen()}
                onToggle={() => setRecentOpen((p) => !p)}
                isCollapsed={isCollapsed()}
                onSelect={handleSelectSession}
                onDelete={handleDeleteSession}
              />
              <SidebarSection
                title={t('sidebar.older')}
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
      </Show>

      {/* New session button — hidden when sessions section is manually collapsed */}
      <Show when={sessionsOpen() || isCollapsed()}>
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
                aria-label={t('sidebar.newSession')}
                title={t('sidebar.newSession')}
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
              aria-label={t('sidebar.newSession')}
            >
              <Plus size={13} />
              <span class="tracking-wide">{t('sidebar.newSession')}</span>
            </button>
          </Show>
        </div>
      </Show>
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
          aria-expanded={props.open}
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
                  title={session.title || t('sidebar.newSession')}
                  aria-label={session.title || t('sidebar.newSession')}
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
  let menuRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [isRenaming, setIsRenaming] = createSignal(false);
  const [draftTitle, setDraftTitle] = createSignal('');
  const [sessionContextPos, setSessionContextPos] = createSignal<{ x: number; y: number } | null>(
    null,
  );

  function currentTitle() {
    return props.session.title || t('sidebar.newSession');
  }

  function startRenaming() {
    setDraftTitle(currentTitle());
    setMenuOpen(false);
    setIsRenaming(true);
    requestAnimationFrame(() => {
      inputRef?.focus();
      inputRef?.select();
    });
  }

  function cancelRenaming() {
    setDraftTitle(currentTitle());
    setIsRenaming(false);
  }

  async function commitRename() {
    const trimmed = draftTitle().trim();
    if (!trimmed) {
      cancelRenaming();
      return;
    }
    if (trimmed !== currentTitle()) {
      await updateSessionTitle(props.session.id, trimmed);
    }
    setIsRenaming(false);
  }

  async function handleDuplicateClick(e?: MouseEvent) {
    e?.stopPropagation();
    const dup = await duplicateSession(props.session.id);
    setMenuOpen(false);
    props.onSelect(dup.id);
  }

  async function handleDeleteRequest(e?: MouseEvent) {
    e?.stopPropagation();
    setMenuOpen(false);

    const hasMessages = await sessionHasMessages(props.session.id);
    if (hasMessages) {
      const confirmed = window.confirm(t('sidebar.deleteConfirm'));
      if (!confirmed) return;
    }

    await props.onDelete(props.session.id);
  }

  const sessionContextItems = (): ContextMenuItem[] => [
    {
      label: t('sidebar.rename'),
      icon: Pencil,
      onClick: startRenaming,
    },
    {
      label: props.session.pinned ? t('sidebar.unpin') : t('sidebar.pin'),
      icon: Pin,
      onClick: () => {
        void toggleSessionPinned(props.session.id);
      },
    },
    {
      label: t('sidebar.duplicate'),
      icon: Copy,
      onClick: () => {
        void handleDuplicateClick();
      },
    },
    { separator: true, label: 'separator' },
    {
      label: t('common.delete'),
      icon: Trash2,
      danger: true,
      onClick: () => {
        void handleDeleteRequest();
      },
    },
  ];

  function handleClickOutside(e: MouseEvent) {
    if (!menuOpen()) return;
    if (menuRef && !menuRef.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  }

  function handleDocumentKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (isRenaming()) {
        cancelRenaming();
        return;
      }
      setMenuOpen(false);
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleDocumentKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleDocumentKeyDown);
  });

  return (
    <div
      data-testid="session-item"
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
      onContextMenu={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSessionContextPos({ x: e.clientX, y: e.clientY });
      }}
      role="button"
      tabindex="0"
      onKeyDown={(e) => {
        if (isRenaming()) return;
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setSessionContextPos({
            x: Math.round(rect.left + Math.min(24, Math.max(rect.width - 8, 8))),
            y: Math.round(rect.top + Math.min(24, Math.max(rect.height - 8, 8))),
          });
          return;
        }
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

      <div class="relative mt-0.5 shrink-0">
        <MessageSquare size={13} class="text-text-tertiary" />
        {/* Per-session status indicator */}
        <Show when={getSessionStatus(props.session.id) === 'running'}>
          <div
            class="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--color-success)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
            aria-label="Running"
            title="Running"
            role="status"
          />
        </Show>
        <Show when={getSessionStatus(props.session.id) === 'error'}>
          <div
            class="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-error)' }}
            aria-label="Error"
            title="Error"
            role="status"
          />
        </Show>
        <Show when={isSessionUnread(props.session.id) && !props.isActive}>
          <div
            class="absolute -left-0.5 -bottom-0.5 w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--color-accent)',
              'box-shadow': '0 0 4px rgba(232, 130, 90, 0.35)',
            }}
            aria-label="Unread background activity"
            title="Unread background activity"
            role="status"
          />
        </Show>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <Show
            when={!isRenaming()}
            fallback={
              <input
                ref={inputRef}
                value={draftTitle()}
                class="text-xs font-medium min-w-0 flex-1 bg-bg-inset rounded px-1 py-0.5 border"
                style={{
                  border: '1px solid var(--color-border-focus)',
                  color: 'var(--color-text-primary)',
                }}
                onClick={(e) => e.stopPropagation()}
                onInput={(e) => setDraftTitle(e.currentTarget.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRenaming();
                  }
                }}
                onBlur={() => {
                  void commitRename();
                }}
                aria-label={t('sidebar.rename')}
              />
            }
          >
            <span
              class="text-xs font-medium truncate"
              onDblClick={(e) => {
                e.stopPropagation();
                startRenaming();
              }}
              title="Double-click to rename"
            >
              {currentTitle()}
            </span>
          </Show>
          <span
            class="text-[9px] font-medium shrink-0 px-1 py-0.5 rounded"
            style={{
              background: modelBgColor(props.session.model),
              color: 'var(--color-bg-primary)',
            }}
          >
            {modelLabel(props.session.model)}
          </span>
          <Show when={(props.session.total_cost_cents ?? 0) > 0}>
            <span
              class="text-[9px] font-mono shrink-0 px-1 py-0.5 rounded"
              style={{
                color: 'var(--color-text-tertiary)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
              }}
              title="Session cost"
            >
              {`$${((props.session.total_cost_cents ?? 0) / 100).toFixed(2)}`}
            </span>
          </Show>
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
        aria-label={props.session.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
        title={props.session.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
      >
        <Pin size={11} class={props.session.pinned ? 'fill-current' : ''} />
      </button>
      <button
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-error transition-opacity"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          void handleDeleteRequest(e);
        }}
        aria-label={t('common.delete')}
      >
        <Trash2 size={11} />
      </button>
      <div ref={menuRef} class="relative">
        <button
          class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-text-primary transition-opacity"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          aria-label="Session actions"
          aria-expanded={menuOpen()}
          title="Session actions"
        >
          <MoreHorizontal size={11} />
        </button>

        <Show when={menuOpen()}>
          <div
            class="absolute right-0 top-6 z-50 min-w-[132px] rounded-md overflow-hidden"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
              'box-shadow': 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              class="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-secondary transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={(e) => {
                e.stopPropagation();
                startRenaming();
              }}
            >
              {t('sidebar.rename')}
            </button>
            <button
              class="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-secondary transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={(e) => {
                e.stopPropagation();
                void toggleSessionPinned(props.session.id);
                setMenuOpen(false);
              }}
            >
              {props.session.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
            </button>
            <button
              class="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-secondary transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={(e) => {
                void handleDuplicateClick(e);
              }}
            >
              {t('sidebar.duplicate')}
            </button>
            <button
              class="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-secondary transition-colors"
              style={{
                'transition-duration': 'var(--duration-fast)',
                color: 'var(--color-error)',
              }}
              onClick={(e) => {
                void handleDeleteRequest(e);
              }}
            >
              {t('common.delete')}
            </button>
          </div>
        </Show>
      </div>
      <Show when={sessionContextPos()}>
        {(pos) => (
          <ContextMenu
            items={sessionContextItems()}
            x={pos().x}
            y={pos().y}
            onClose={() => setSessionContextPos(null)}
          />
        )}
      </Show>
    </div>
  );
};

export default Sidebar;
