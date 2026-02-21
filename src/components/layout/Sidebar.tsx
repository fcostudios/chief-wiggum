// src/components/layout/Sidebar.tsx
// Left sidebar (240px) per SPEC-003 §2 Z2.
// Displays real session list from sessionStore, supports create/switch/delete.

import type { Component } from 'solid-js';
import { For, Show, onMount } from 'solid-js';
import { Plus, Trash2, MessageSquare, FolderOpen } from 'lucide-solid';
import type { Session } from '@/lib/types';
import {
  sessionState,
  loadSessions,
  createNewSession,
  setActiveSession,
  deleteSession,
} from '@/stores/sessionStore';
import { loadMessages, clearMessages } from '@/stores/conversationStore';
import { projectState, loadProjects, pickAndCreateProject } from '@/stores/projectStore';

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

/** Map model ID to badge color class. */
function modelColorClass(model: string): string {
  if (model.includes('opus')) return 'text-model-opus';
  if (model.includes('haiku')) return 'text-model-haiku';
  return 'text-model-sonnet';
}

/** Reactive accessor for the active project. */
function activeProject() {
  return projectState.projects.find((p) => p.id === projectState.activeProjectId);
}

const Sidebar: Component = () => {
  onMount(() => {
    loadSessions();
    loadProjects();
  });

  async function handleNewSession() {
    clearMessages();
    await createNewSession('claude-sonnet-4-6');
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionState.activeSessionId === sessionId) return;
    setActiveSession(sessionId);
    await loadMessages(sessionId);
  }

  return (
    <nav class="flex flex-col h-full" aria-label="Sidebar">
      {/* Project selector */}
      <div class="px-3 py-2 border-b border-border-secondary">
        <Show
          when={projectState.activeProjectId}
          fallback={
            <button
              class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => pickAndCreateProject()}
            >
              <FolderOpen size={14} />
              <span>Open Project Folder</span>
            </button>
          }
        >
          <button
            class="flex items-center gap-2 w-full py-1 px-2 rounded-md text-xs text-text-primary hover:bg-bg-elevated transition-colors truncate"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => pickAndCreateProject()}
            title={activeProject()?.path ?? ''}
          >
            <FolderOpen size={14} class="shrink-0 text-accent" />
            <span class="truncate">{activeProject()?.name ?? 'Unknown'}</span>
          </button>
        </Show>
      </div>

      {/* Sessions header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-secondary">
        <span class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Sessions
        </span>
        <span class="text-xs text-text-tertiary">{sessionState.sessions.length}</span>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <Show
          when={sessionState.sessions.length > 0}
          fallback={
            <p class="text-xs text-text-tertiary px-2 py-4 text-center">
              No sessions yet. Click below to start one.
            </p>
          }
        >
          <div class="space-y-1">
            <For each={sessionState.sessions}>
              {(session) => (
                <SessionItem
                  session={session}
                  isActive={sessionState.activeSessionId === session.id}
                  onSelect={() => handleSelectSession(session.id)}
                  onDelete={() => deleteSession(session.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* New session button */}
      <div class="p-2 border-t border-border-secondary">
        <button
          class="flex items-center justify-center gap-2 w-full py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={handleNewSession}
          aria-label="New session"
        >
          <Plus size={14} />
          <span>New Session</span>
        </button>
      </div>
    </nav>
  );
};

/** Individual session item in the sidebar list. */
const SessionItem: Component<{
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = (props) => {
  return (
    <div
      class={`group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
        props.isActive
          ? 'bg-bg-elevated text-text-primary'
          : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
      }`}
      style={{ 'transition-duration': 'var(--duration-fast)' }}
      onClick={() => props.onSelect()}
      role="button"
      tabindex="0"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect();
        }
      }}
    >
      <MessageSquare size={14} class="mt-0.5 shrink-0 text-text-tertiary" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1">
          <span class="text-xs font-medium truncate">{props.session.title || 'New Session'}</span>
          <span class={`text-[10px] shrink-0 ${modelColorClass(props.session.model)}`}>
            {modelLabel(props.session.model)}
          </span>
        </div>
        <span class="text-[10px] text-text-tertiary">
          {formatRelativeTime(props.session.updated_at)}
        </span>
      </div>
      <button
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-error transition-opacity"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
        aria-label="Delete session"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

export default Sidebar;
