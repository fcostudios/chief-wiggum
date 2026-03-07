// src/components/common/CommandPalette.tsx
// Command palette overlay (Cmd+K) with fuzzy search, categorized actions, keyboard navigation.
// CHI-76: Power user UX — like VS Code, Linear, or Arc command palettes.

import type { Component, JSX } from 'solid-js';
import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import {
  MessageSquare,
  Users,
  GitCompare,
  Terminal,
  PanelLeft,
  PanelRight,
  Sparkles,
  Plus,
  Search,
  Play,
  Square,
  RotateCw,
  Download,
  Pencil,
  Clock,
  FilePlus,
  FolderPlus,
  Trash2,
  Copy,
} from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import {
  closeCommandPalette,
  toggleSidebar,
  toggleDetailsPanel,
  setActiveView,
  type ActiveView,
} from '@/stores/uiStore';
import {
  sessionState,
  setActiveSession,
  createNewSession,
  cycleModel,
} from '@/stores/sessionStore';
import { switchSession, conversationState } from '@/stores/conversationStore';
import { projectState } from '@/stores/projectStore';
import {
  actionState,
  getActionStatus,
  selectAction,
  startAction,
  stopAction,
  restartAction,
} from '@/stores/actionStore';
import type { ActionDefinition } from '@/lib/types';
import { addToast } from '@/stores/toastStore';
import {
  fileState,
  openEditorTakeover,
  createFileInProject,
  createDirectoryInProject,
  deleteFileInProject,
  duplicateFileInProject,
  renameFileInProject,
} from '@/stores/fileStore';
import { getRecentCommands, recordCommand } from '@/stores/recentCommandStore';
import {
  buildExportFilename,
  exportAsHtml,
  exportAsMarkdown,
  exportAsText,
  type ExportFormat,
} from '@/lib/conversationExport';
import { t } from '@/stores/i18nStore';

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon?: () => JSX.Element;
  action: () => void;
  searchText?: string;
  meta?: { model?: string };
}

interface CommandPaletteProps {
  /** When 'sessions', only show session commands. Default: show all. */
  mode?: 'all' | 'sessions' | 'actions';
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CommandPalette: Component<CommandPaletteProps> = (props) => {
  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [pathInputMode, setPathInputMode] = createSignal<'file' | 'folder' | null>(null);
  const [pathInputValue, setPathInputValue] = createSignal('');
  let inputRef: HTMLInputElement | undefined;
  let pathInputRef: HTMLInputElement | undefined;

  const mode = () => props.mode ?? 'all';

  const handleClose = () => {
    setPathInputMode(null);
    setPathInputValue('');
    if (props.onClose) props.onClose();
    else closeCommandPalette();
  };

  function isSelectedPathFile(path: string): boolean {
    if (!path) return false;
    if (fileState.previewContent?.relative_path === path) return true;
    return path.includes('.');
  }

  function selectedFolderPath(): string {
    const path = fileState.selectedPath;
    if (!path) return '';
    if (isSelectedPathFile(path)) {
      return path.split('/').slice(0, -1).join('/');
    }
    return path;
  }

  function selectedPathOrToast(): string | null {
    const path = fileState.selectedPath;
    if (!path) {
      addToast(t('commandPalette.noFileSelected'), 'info');
      return null;
    }
    return path;
  }

  function activeProjectIdOrToast(): string | null {
    const pid = projectState.activeProjectId;
    if (!pid) {
      addToast(t('commandPalette.noProject'), 'info');
      return null;
    }
    return pid;
  }

  async function submitPathInput(): Promise<void> {
    const mode = pathInputMode();
    const raw = pathInputValue().trim();
    const pid = projectState.activeProjectId;
    if (!mode || !pid || !raw) return;

    if (mode === 'folder') {
      await createDirectoryInProject(pid, raw.replace(/\/+$/, ''));
    } else {
      await createFileInProject(pid, raw.replace(/\/+$/, ''));
    }
    handleClose();
  }

  async function exportConversation(format: ExportFormat): Promise<void> {
    const sessionId = sessionState.activeSessionId;
    if (!sessionId) {
      addToast('No active session to export', 'warning');
      return;
    }

    const messages = conversationState.messages;
    if (messages.length === 0) {
      addToast('No messages to export', 'info');
      return;
    }

    const content =
      format === 'md'
        ? exportAsMarkdown(messages, sessionId)
        : format === 'html'
          ? exportAsHtml(messages, sessionId)
          : exportAsText(messages, sessionId);

    try {
      const savedPath = await invoke<string | null>('save_export_file', {
        content,
        default_name: buildExportFilename(sessionId, format),
        extension: format,
      });

      if (savedPath) {
        addToast('Conversation exported', 'success', {
          label: 'Open File',
          onClick: () => {
            void invoke('open_path_in_shell', { path: savedPath });
          },
        });
      }
    } catch (err) {
      addToast(
        'Export failed',
        'error',
        undefined,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Build static commands list
  const staticCommands: Command[] = [
    // Views
    {
      id: 'view-conversation',
      label: 'Go to Conversation',
      category: 'Views',
      shortcut: '\u2318 1',
      icon: () => <MessageSquare size={16} />,
      action: () => setActiveView('conversation' as ActiveView),
    },
    {
      id: 'view-agents',
      label: 'Go to Agents',
      category: 'Views',
      shortcut: '\u2318 2',
      icon: () => <Users size={16} />,
      action: () => setActiveView('agents' as ActiveView),
    },
    {
      id: 'view-diff',
      label: 'Go to Diff',
      category: 'Views',
      shortcut: '\u2318 3',
      icon: () => <GitCompare size={16} />,
      action: () => setActiveView('diff' as ActiveView),
    },
    {
      id: 'view-terminal',
      label: 'Go to Terminal',
      category: 'Views',
      shortcut: '\u2318 4',
      icon: () => <Terminal size={16} />,
      action: () => setActiveView('terminal' as ActiveView),
    },

    // Panels
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      category: 'Panels',
      shortcut: '\u2318 B',
      icon: () => <PanelLeft size={16} />,
      action: () => toggleSidebar(),
    },
    {
      id: 'toggle-details',
      label: 'Toggle Details Panel',
      category: 'Panels',
      shortcut: '\u2318\u21E7 B',
      icon: () => <PanelRight size={16} />,
      action: () => toggleDetailsPanel(),
    },
    {
      id: 'edit-file',
      label: 'Edit file...',
      category: 'File',
      shortcut: '\u2318 E',
      icon: () => <Pencil size={16} />,
      action: () => {
        const filePath = fileState.editingFilePath ?? fileState.selectedPath;
        if (filePath) {
          void openEditorTakeover(filePath);
        } else {
          addToast('No file selected — select a file first', 'info');
        }
      },
    },
    {
      id: 'create-file',
      label: 'Create File',
      category: 'File',
      shortcut: '\u2318 N',
      icon: () => <FilePlus size={16} />,
      action: () => {
        const pid = activeProjectIdOrToast();
        if (!pid) return;
        const folder = selectedFolderPath();
        setPathInputMode('file');
        setPathInputValue(folder ? `${folder}/` : '');
      },
    },
    {
      id: 'create-folder',
      label: 'Create Folder',
      category: 'File',
      shortcut: '\u2318\u21E7 N',
      icon: () => <FolderPlus size={16} />,
      action: () => {
        const pid = activeProjectIdOrToast();
        if (!pid) return;
        const folder = selectedFolderPath();
        setPathInputMode('folder');
        setPathInputValue(folder ? `${folder}/` : '');
      },
    },
    {
      id: 'rename-file',
      label: 'Rename File',
      category: 'File',
      shortcut: 'F2',
      icon: () => <Pencil size={16} />,
      action: () => {
        const pid = activeProjectIdOrToast();
        const oldPath = selectedPathOrToast();
        if (!pid || !oldPath) return;

        const oldName = oldPath.split('/').pop() ?? oldPath;
        const requestedName = window.prompt(t('files.rename'), oldName);
        if (!requestedName) return;
        const nextName = requestedName.trim();
        if (!nextName || nextName === oldName) return;

        const parent = oldPath.split('/').slice(0, -1).join('/');
        const newPath = parent ? `${parent}/${nextName}` : nextName;
        void renameFileInProject(pid, oldPath, newPath);
      },
    },
    {
      id: 'delete-file',
      label: 'Delete File',
      category: 'File',
      shortcut: 'Del',
      icon: () => <Trash2 size={16} />,
      action: () => {
        const pid = activeProjectIdOrToast();
        const path = selectedPathOrToast();
        if (!pid || !path) return;

        const name = path.split('/').pop() ?? path;
        const message = isSelectedPathFile(path)
          ? t('files.deleteConfirm', { name })
          : t('files.deleteConfirmDir', { name });
        if (window.confirm(message)) {
          void deleteFileInProject(pid, path);
        }
      },
    },
    {
      id: 'duplicate-file',
      label: 'Duplicate File',
      category: 'File',
      icon: () => <Copy size={16} />,
      action: () => {
        const pid = activeProjectIdOrToast();
        const path = selectedPathOrToast();
        if (!pid || !path) return;
        void duplicateFileInProject(pid, path);
      },
    },

    // Session
    {
      id: 'new-session',
      label: 'New Session',
      category: 'Session',
      icon: () => <Plus size={16} />,
      action: () => {
        createNewSession('claude-sonnet-4-6').catch((err) => {
          if (import.meta.env.DEV) console.warn('[CommandPalette] Failed to create session:', err);
        });
      },
    },
    {
      id: 'cycle-model',
      label: 'Cycle Model (Sonnet / Opus / Haiku)',
      category: 'Session',
      shortcut: '\u2318 M',
      icon: () => <Sparkles size={16} />,
      action: () => cycleModel(),
    },
    {
      id: 'export-md',
      label: 'Export Conversation as Markdown',
      category: 'Session',
      icon: () => <Download size={16} />,
      action: () => {
        void exportConversation('md');
      },
    },
    {
      id: 'export-html',
      label: 'Export Conversation as HTML',
      category: 'Session',
      icon: () => <Download size={16} />,
      action: () => {
        void exportConversation('html');
      },
    },
    {
      id: 'export-txt',
      label: 'Export Conversation as Plain Text',
      category: 'Session',
      icon: () => <Download size={16} />,
      action: () => {
        void exportConversation('txt');
      },
    },
  ];

  function buildActionCommands(actions: ActionDefinition[]): Command[] {
    const commands: Command[] = [];
    for (const action of actions) {
      const status = getActionStatus(action.id);
      const running = status === 'running' || status === 'starting';
      const searchText = [
        action.name,
        action.command,
        action.source.replaceAll('_', ' '),
        action.category,
        action.description ?? '',
      ]
        .join(' ')
        .toLowerCase();

      commands.push({
        id: `action-run-${action.id}`,
        label: `Run: ${action.name}`,
        category: 'Actions',
        icon: () => <Play size={16} />,
        searchText,
        action: () => {
          selectAction(action.id);
          void startAction(action);
        },
      });

      if (running) {
        commands.push({
          id: `action-stop-${action.id}`,
          label: `Stop: ${action.name}`,
          category: 'Actions',
          icon: () => <Square size={16} />,
          searchText,
          action: () => {
            selectAction(action.id);
            void stopAction(action.id);
          },
        });
        commands.push({
          id: `action-restart-${action.id}`,
          label: `Restart: ${action.name}`,
          category: 'Actions',
          icon: () => <RotateCw size={16} />,
          searchText,
          action: () => {
            selectAction(action.id);
            void restartAction(action);
          },
        });
      }
    }
    return commands;
  }

  // Build dynamic commands from sessions list + static commands
  const allCommands = createMemo<Command[]>(() => {
    const sessionCommands: Command[] = sessionState.sessions.map((s) => ({
      id: `session-${s.id}`,
      label: s.title || 'Untitled session',
      category: 'Sessions',
      icon: () => <MessageSquare size={16} />,
      action: () => {
        const oldId = sessionState.activeSessionId;
        setActiveSession(s.id);
        switchSession(s.id, oldId).catch((err) => {
          if (import.meta.env.DEV) console.warn('[CommandPalette] Failed to switch session:', err);
        });
      },
      meta: { model: s.model },
    }));
    const actionCommands =
      projectState.activeProjectId && actionState.actions.length > 0
        ? buildActionCommands(actionState.actions)
        : [];

    return [...staticCommands, ...sessionCommands, ...actionCommands];
  });

  // Filter commands based on mode (sessions-only or all)
  const modeCommands = createMemo<Command[]>(() => {
    const all = allCommands();
    if (mode() === 'sessions') return all.filter((c) => c.category === 'Sessions');
    if (mode() === 'actions') return all.filter((c) => c.category === 'Actions');
    return all;
  });

  // Filter by query (simple case-insensitive substring match)
  const filteredCommands = createMemo<Command[]>(() => {
    const q = query().toLowerCase().trim();
    const commands = modeCommands();

    if (!q) {
      if (mode() !== 'all') return commands;

      const recentResolved: Command[] = [];
      for (const recent of getRecentCommands(5)) {
        const resolved =
          commands.find((command) => command.id === recent.id) ??
          commands.find((command) => command.label === recent.label);
        if (resolved) {
          recentResolved.push({
            ...resolved,
            category: t('recentCommands.sectionTitle'),
            icon: () => <Clock size={16} />,
          });
        }
      }

      const recentIds = new Set(recentResolved.map((command) => command.id));
      const remaining = commands.filter((command) => !recentIds.has(command.id));
      return [...recentResolved, ...remaining];
    }

    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.searchText?.includes(q),
    );
  });

  // Group filtered commands by category (preserving insertion order)
  const groupedCommands = createMemo<{ category: string; commands: Command[] }[]>(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of filteredCommands()) {
      const existing = groups.get(cmd.category);
      if (existing) {
        existing.push(cmd);
      } else {
        groups.set(cmd.category, [cmd]);
      }
    }
    return Array.from(groups.entries()).map(([category, commands]) => ({
      category,
      commands,
    }));
  });

  // Reset selection when filter changes
  const resetSelection = () => setSelectedIndex(0);

  // Execute a command and close the palette
  function executeCommand(cmd: Command) {
    recordCommand(cmd.id, cmd.label, cmd.shortcut);
    cmd.action();
    if (!pathInputMode()) {
      handleClose();
    }
  }

  // Execute the currently selected command
  function executeSelected() {
    const cmds = filteredCommands();
    const idx = selectedIndex();
    if (idx >= 0 && idx < cmds.length) {
      executeCommand(cmds[idx]);
    }
  }

  // Keyboard navigation handler (on document, not the container div)
  function handleKeyDown(e: KeyboardEvent) {
    if (pathInputMode()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPathInputMode(null);
        setPathInputValue('');
        setTimeout(() => inputRef?.focus(), 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
      return;
    }

    const cmds = filteredCommands();
    const total = cmds.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(total, 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + Math.max(total, 1)) % Math.max(total, 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
      return;
    }
  }

  onMount(() => {
    // Focus the search input
    inputRef?.focus();
    // Listen for keyboard events globally (Escape works even when nothing focused)
    document.addEventListener('keydown', handleKeyDown, true);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown, true);
  });

  // Scroll selected item into view
  function scrollSelectedIntoView(el: HTMLButtonElement) {
    el.scrollIntoView({ block: 'nearest' });
  }

  // Track the flat index across grouped sections
  let flatIndex = 0;

  return (
    <div
      class="fixed inset-0 flex justify-center z-50 animate-fade-in"
      style={{ 'padding-top': '20vh', 'background-color': 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        class="flex flex-col overflow-hidden"
        style={{
          width: '560px',
          'max-height': '400px',
          'background-color': 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-primary)',
          'border-radius': 'var(--radius-lg)',
          'box-shadow': 'var(--shadow-lg)',
          'align-self': 'flex-start',
        }}
      >
        {/* Search input */}
        <Show
          when={!pathInputMode()}
          fallback={
            <div
              class="flex items-center gap-2 px-3 py-2.5 shrink-0"
              style={{ 'border-bottom': '1px solid var(--color-border-primary)' }}
            >
              <Show when={pathInputMode() === 'folder'} fallback={<FilePlus size={16} />}>
                <FolderPlus size={16} />
              </Show>
              <input
                ref={(el) => {
                  pathInputRef = el;
                  setTimeout(() => pathInputRef?.focus(), 0);
                }}
                type="text"
                placeholder={
                  pathInputMode() === 'folder' ? 'path/to/new-folder' : 'path/to/new-file.ts'
                }
                class="flex-1 bg-transparent text-sm outline-none font-mono"
                style={{
                  color: 'var(--color-text-primary)',
                  'font-family': 'var(--font-mono)',
                  'font-size': 'var(--text-base)',
                  'line-height': 'var(--text-base--line-height)',
                }}
                value={pathInputValue()}
                onInput={(e) => setPathInputValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitPathInput();
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setPathInputMode(null);
                    setPathInputValue('');
                    setTimeout(() => inputRef?.focus(), 0);
                  }
                }}
              />
              <kbd
                class="text-xs px-1.5 py-0.5 rounded shrink-0"
                style={{
                  color: 'var(--color-text-tertiary)',
                  'background-color': 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border-primary)',
                  'font-family': 'var(--font-ui)',
                  'font-size': 'var(--text-xs)',
                }}
              >
                enter
              </kbd>
            </div>
          }
        >
          <div
            class="flex items-center gap-2 px-3 py-2.5 shrink-0"
            style={{ 'border-bottom': '1px solid var(--color-border-primary)' }}
          >
            <Search size={16} style={{ color: 'var(--color-text-tertiary)', 'flex-shrink': '0' }} />
            <input
              ref={inputRef}
              type="text"
              placeholder={
                mode() === 'sessions'
                  ? 'Switch to session...'
                  : mode() === 'actions'
                    ? 'Run, stop, or restart actions...'
                    : 'Type a command...'
              }
              class="flex-1 bg-transparent text-sm outline-none"
              style={{
                color: 'var(--color-text-primary)',
                'font-family': 'var(--font-ui)',
                'font-size': 'var(--text-base)',
                'line-height': 'var(--text-base--line-height)',
              }}
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                resetSelection();
              }}
            />
            <kbd
              class="text-xs px-1.5 py-0.5 rounded shrink-0"
              style={{
                color: 'var(--color-text-tertiary)',
                'background-color': 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-primary)',
                'font-family': 'var(--font-ui)',
                'font-size': 'var(--text-xs)',
              }}
            >
              esc
            </kbd>
          </div>
        </Show>

        {/* Command list */}
        <div class="overflow-y-auto flex-1 py-1">
          <Show
            when={filteredCommands().length > 0}
            fallback={
              <div class="px-4 py-6 text-center">
                <p style={{ color: 'var(--color-text-tertiary)', 'font-size': 'var(--text-sm)' }}>
                  No commands found
                </p>
              </div>
            }
          >
            {(() => {
              flatIndex = 0;
              return null;
            })()}
            <For each={groupedCommands()}>
              {(group) => (
                <div>
                  {/* Category header */}
                  <div
                    class="px-3 py-1.5 text-xs font-medium tracking-wide uppercase"
                    style={{ color: 'var(--color-text-tertiary)', 'font-size': 'var(--text-xs)' }}
                  >
                    {group.category}
                  </div>
                  {/* Commands in category */}
                  <For each={group.commands}>
                    {(cmd) => {
                      const myIndex = flatIndex++;
                      return (
                        <CommandItem
                          command={cmd}
                          isSelected={() => selectedIndex() === myIndex}
                          onExecute={() => executeCommand(cmd)}
                          onHover={() => setSelectedIndex(myIndex)}
                          scrollRef={scrollSelectedIntoView}
                        />
                      );
                    }}
                  </For>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CommandItem sub-component
// ---------------------------------------------------------------------------

interface CommandItemProps {
  command: Command;
  isSelected: () => boolean;
  onExecute: () => void;
  onHover: () => void;
  scrollRef: (el: HTMLButtonElement) => void;
}

const CommandItem: Component<CommandItemProps> = (props) => {
  let buttonRef: HTMLButtonElement | undefined;

  // Auto-scroll when selected
  const checkScroll = () => {
    if (props.isSelected() && buttonRef) {
      props.scrollRef(buttonRef);
    }
  };

  return (
    <button
      ref={(el) => {
        buttonRef = el;
        // Check scroll on mount if already selected
        checkScroll();
      }}
      class="flex items-center gap-3 w-full px-3 py-2 text-left transition-colors"
      style={{
        'background-color': props.isSelected() ? 'var(--color-bg-elevated)' : 'transparent',
        color: 'var(--color-text-primary)',
        'font-size': 'var(--text-base)',
        'transition-duration': 'var(--duration-fast)',
      }}
      onClick={() => props.onExecute()}
      onMouseEnter={() => props.onHover()}
    >
      {/* Icon */}
      <Show when={props.command.icon}>
        {(iconFn) => (
          <span style={{ color: 'var(--color-text-tertiary)', 'flex-shrink': '0' }}>
            {iconFn()()}
          </span>
        )}
      </Show>
      {/* Label */}
      <span class="flex-1 truncate">{props.command.label}</span>
      {/* Model badge dot */}
      <Show when={props.command.meta?.model}>
        {(model) => (
          <span
            class="w-2 h-2 rounded-full shrink-0"
            style={{
              background: model().includes('opus')
                ? 'var(--color-model-opus)'
                : model().includes('haiku')
                  ? 'var(--color-model-haiku)'
                  : 'var(--color-model-sonnet)',
            }}
          />
        )}
      </Show>
      {/* Shortcut badge */}
      <Show when={props.command.shortcut}>
        <kbd
          class="text-xs px-1.5 py-0.5 rounded shrink-0"
          style={{
            color: 'var(--color-text-tertiary)',
            'background-color': 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
            'font-family': 'var(--font-ui)',
            'font-size': 'var(--text-xs)',
          }}
        >
          {props.command.shortcut}
        </kbd>
      </Show>
    </button>
  );
};

export default CommandPalette;
