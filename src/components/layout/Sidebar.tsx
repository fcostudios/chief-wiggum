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
      <div
        class="px-3 py-2.5"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <Show
          when={projectState.activeProjectId}
          fallback={
            <button
              class="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-elevated/50 transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={() => pickAndCreateProject()}
            >
              <FolderOpen size={13} />
              <span class="tracking-wide">Open Project Folder</span>
            </button>
          }
        >
          <button
            class="flex items-center gap-2 w-full py-1 px-2 rounded-md text-xs text-text-primary hover:bg-bg-elevated/50 transition-colors truncate"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => pickAndCreateProject()}
            title={activeProject()?.path ?? ''}
          >
            <FolderOpen size={13} class="shrink-0 text-accent" />
            <span class="truncate font-medium">{activeProject()?.name ?? 'Unknown'}</span>
          </button>
        </Show>
      </div>

      {/* Sessions header */}
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
          {sessionState.sessions.length}
        </span>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <Show
          when={sessionState.sessions.length > 0}
          fallback={
            <div class="px-2 py-6 text-center animate-fade-in">
              <p class="text-xs text-text-tertiary/60 tracking-wide">No sessions yet</p>
              <p class="text-[10px] text-text-tertiary/40 mt-1">Create one to get started</p>
            </div>
          }
        >
          <div class="space-y-0.5">
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
      <div class="p-2" style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
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
        }
      }}
      onMouseLeave={(e) => {
        if (!props.isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }
      }}
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

      <MessageSquare size={13} class="mt-0.5 shrink-0 text-text-tertiary" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium truncate">{props.session.title || 'New Session'}</span>
          <span
            class={`text-[9px] font-medium shrink-0 px-1 py-0.5 rounded ${modelColorClass(props.session.model)}`}
            style={{ background: 'currentColor', color: 'var(--color-bg-primary)' }}
          >
            {modelLabel(props.session.model)}
          </span>
        </div>
        <span class="text-[10px] text-text-tertiary/60">
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
        <Trash2 size={11} />
      </button>
    </div>
  );
};

export default Sidebar;
