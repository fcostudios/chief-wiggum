// src/components/explorer/FileTreeNode.tsx
// Recursive tree node for the file explorer sidebar.
// Expands directories on click, selects files for preview.

import type { Component } from 'solid-js';
import { Show, For, createSignal, onCleanup } from 'solid-js';
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Copy,
  Plus,
  Pencil,
  FilePlus,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Music,
  Trash2,
} from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import {
  canAddToPrompt as canAddByPreviewType,
  canEdit as canEditByPreviewType,
} from '@/lib/types';
import type { FileNode, FileContent, FileBundleSuggestion } from '@/lib/types';
import {
  fileState,
  isExpanded,
  getChildren,
  toggleFolder,
  selectFile,
  openEditorTakeover,
  getGitStatus,
  startCreating,
  setRenamingPath,
  createFileInProject,
  createDirectoryInProject,
  renameFileInProject,
  duplicateFileInProject,
  deleteFileInProject,
  cancelCreating,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';
import { addFileBundle, addFileReference } from '@/stores/contextStore';
import { addToast } from '@/stores/toastStore';
import { t } from '@/stores/i18nStore';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';
import InlineFileInput from './InlineFileInput';
import InlineRenameInput from './InlineRenameInput';

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
}

/** Format file size for display. */
function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

/** Token-count color: green <1K, yellow <5K, orange <10K, red >10K. */
function sizeColor(bytes: number | null): string {
  if (bytes == null) return 'var(--color-text-tertiary)';
  const tokens = Math.round(bytes / 4);
  if (tokens < 1000) return 'var(--color-success)';
  if (tokens < 5000) return 'var(--color-warning)';
  if (tokens < 10000) return 'var(--color-accent)';
  return 'var(--color-error)';
}

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `~${tokens}`;
  return `~${(tokens / 1000).toFixed(1)}K`;
}

function iconForFile(node: FileNode) {
  switch (node.preview_type) {
    case 'image':
      return <ImageIcon size={12} class="shrink-0" style={{ color: 'var(--color-accent)' }} />;
    case 'svg':
      return <Layers size={12} class="shrink-0" style={{ color: 'var(--color-accent)' }} />;
    case 'pdf':
      return <FileText size={12} class="shrink-0" style={{ color: 'var(--color-warning)' }} />;
    case 'audio':
      return <Music size={12} class="shrink-0" style={{ color: 'var(--color-success)' }} />;
    default:
      return <File size={12} class="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />;
  }
}

const FileTreeNode: Component<FileTreeNodeProps> = (props) => {
  const isDir = () => props.node.node_type === 'Directory';
  const expanded = () => isExpanded(props.node.relative_path);
  const children = () => getChildren(props.node.relative_path);
  const isSelected = () => fileState.selectedPath === props.node.relative_path;
  const projectId = () => projectState.activeProjectId;
  const [showTooltip, setShowTooltip] = createSignal(false);
  const [isRowHovered, setIsRowHovered] = createSignal(false);
  const [contextMenuPos, setContextMenuPos] = createSignal<{ x: number; y: number } | null>(null);
  const [bundleOptions, setBundleOptions] = createSignal<FileBundleSuggestion[]>([]);
  const [tooltipContent, setTooltipContent] = createSignal<{
    lines: string[];
    size: string;
    tokens: number;
  } | null>(null);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  const isRenaming = () => fileState.renamingPath === props.node.relative_path;

  onCleanup(() => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
  });

  function handleDragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(
      'application/x-chief-wiggum-file',
      JSON.stringify({
        relative_path: props.node.relative_path,
        name: props.node.name,
        extension: props.node.extension,
        size_bytes: props.node.size_bytes,
        is_binary: props.node.is_binary,
        preview_type: props.node.preview_type,
        node_type: props.node.node_type,
      }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleClick() {
    const pid = projectId();
    if (!pid) return;
    if (isDir()) {
      void toggleFolder(pid, props.node.relative_path);
    } else {
      void selectFile(pid, props.node.relative_path);
    }
  }

  async function handleAddToPrompt(): Promise<void> {
    const pid = projectId();
    if (!pid || isDir()) return;

    let estimatedTokens = Math.round((props.node.size_bytes ?? 0) / 4);
    try {
      estimatedTokens = await invoke<number>('get_file_token_estimate', {
        project_id: pid,
        relative_path: props.node.relative_path,
      });
    } catch {
      // Fallback estimate from file size.
    }

    addFileReference(
      {
        relative_path: props.node.relative_path,
        name: props.node.name,
        extension: props.node.extension,
        estimated_tokens: Math.max(1, estimatedTokens),
        is_directory: false,
      },
      'auto',
    );
    addToast(`Added ${props.node.name} to prompt`, 'success');
  }

  async function loadBundleOptions(): Promise<void> {
    const pid = projectId();
    if (!pid || isDir() || props.node.is_binary) {
      setBundleOptions([]);
      return;
    }

    try {
      const bundles = await invoke<FileBundleSuggestion[]>('get_file_bundles', {
        project_id: pid,
        relative_path: props.node.relative_path,
      });
      setBundleOptions(bundles);
    } catch {
      setBundleOptions([]);
    }
  }

  const contextMenuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: 'Copy path',
        icon: Copy,
        onClick: () => {
          navigator.clipboard.writeText(props.node.relative_path);
          addToast('Path copied', 'success');
        },
      },
      {
        label: isDir() ? (expanded() ? 'Collapse folder' : 'Expand folder') : 'Preview file',
        icon: isDir() ? FolderOpen : File,
        onClick: handleClick,
      },
      {
        label: 'Edit',
        icon: Pencil,
        onClick: () => void openEditorTakeover(props.node.relative_path),
        disabled: isDir() || !canEditByPreviewType(props.node.preview_type),
      },
      { separator: true, label: 'separator-create' },
      {
        label: t('files.newFile'),
        icon: FilePlus,
        onClick: () =>
          startCreating(
            isDir()
              ? props.node.relative_path
              : props.node.relative_path.split('/').slice(0, -1).join('/'),
            'file',
          ),
      },
      {
        label: t('files.newFolder'),
        icon: FolderPlus,
        onClick: () =>
          startCreating(
            isDir()
              ? props.node.relative_path
              : props.node.relative_path.split('/').slice(0, -1).join('/'),
            'folder',
          ),
      },
      { separator: true, label: 'separator' },
      {
        label: 'Add to prompt',
        icon: Plus,
        onClick: () => {
          void handleAddToPrompt();
        },
        disabled: isDir() || !canAddByPreviewType(props.node.preview_type),
      },
      { separator: true, label: 'separator-manage' },
      {
        label: t('files.rename'),
        icon: Pencil,
        onClick: () => {
          const pid = projectId();
          if (!pid) return;
          setRenamingPath(props.node.relative_path);
          setContextMenuPos(null);
        },
      },
      {
        label: t('files.duplicate'),
        icon: Copy,
        onClick: () => {
          const pid = projectId();
          if (!pid) return;
          void duplicateFileInProject(pid, props.node.relative_path);
        },
        disabled: isDir(),
      },
      {
        label: t('files.delete'),
        icon: Trash2,
        danger: true,
        onClick: () => {
          const pid = projectId();
          if (!pid) return;
          const message = isDir()
            ? t('files.deleteConfirmDir', { name: props.node.name })
            : t('files.deleteConfirm', { name: props.node.name });
          if (window.confirm(message)) {
            void deleteFileInProject(pid, props.node.relative_path);
          }
        },
      },
    ];

    for (const bundle of bundleOptions()) {
      items.push({
        label: `${bundle.label} (${formatTokenCount(bundle.estimated_tokens)})`,
        icon: Plus,
        disabled: isDir() || !canAddByPreviewType(props.node.preview_type),
        onClick: () => {
          addFileBundle(bundle);
        },
      });
    }

    return items;
  };

  function handleKeyDown(e: KeyboardEvent) {
    const pid = projectId();
    if (!pid) return;

    if (e.key === 'ArrowRight' && isDir() && !expanded()) {
      e.preventDefault();
      void toggleFolder(pid, props.node.relative_path);
      return;
    }

    if (e.key === 'ArrowLeft' && isDir() && expanded()) {
      e.preventDefault();
      void toggleFolder(pid, props.node.relative_path);
      return;
    }

    if (e.key === 'Enter' && !isDir()) {
      e.preventDefault();
      void selectFile(pid, props.node.relative_path);
    }
  }

  async function handleMouseEnterTooltip() {
    if (isDir() || props.node.is_binary) return;
    const pid = projectId();
    if (!pid) return;

    hoverTimeout = setTimeout(async () => {
      try {
        const content = await invoke<FileContent>('read_project_file', {
          project_id: pid,
          relative_path: props.node.relative_path,
          start_line: null,
          end_line: 5,
        });
        setTooltipContent({
          lines: content.content.split('\n').slice(0, 5),
          size: formatSize(content.size_bytes),
          tokens: content.estimated_tokens,
        });
        setShowTooltip(true);
      } catch {
        // Silently fail — tooltip is optional
      }
    }, 500);
  }

  function handleMouseLeaveTooltip() {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    setShowTooltip(false);
    setTooltipContent(null);
  }

  return (
    <div class="relative">
      <Show when={isRenaming()}>
        <InlineRenameInput
          currentName={props.node.name}
          depth={props.depth}
          onConfirm={(newName) => {
            const pid = projectId();
            if (!pid) return;
            const parent = props.node.relative_path.split('/').slice(0, -1).join('/');
            const nextPath = parent ? `${parent}/${newName}` : newName;
            void renameFileInProject(pid, props.node.relative_path, nextPath).finally(() =>
              setRenamingPath(null),
            );
          }}
          onCancel={() => setRenamingPath(null)}
        />
      </Show>

      <Show when={!isRenaming()}>
        <button
          class="group flex items-center gap-1 w-full text-left py-0.5 pr-8 rounded-sm transition-colors text-xs"
          classList={{ 'opacity-50': !!props.node.is_git_ignored }}
          style={{
            'padding-left': `${props.depth * 12 + 4}px`,
            background: isSelected()
              ? 'var(--color-accent-muted)'
              : isRowHovered()
                ? 'rgba(28, 33, 40, 0.5)'
                : 'transparent',
            color: isSelected() ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          draggable={!isDir()}
          onDragStart={handleDragStart}
          onMouseEnter={() => {
            setIsRowHovered(true);
            void handleMouseEnterTooltip();
          }}
          onMouseLeave={() => {
            setIsRowHovered(false);
            handleMouseLeaveTooltip();
          }}
          onClick={handleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMouseLeaveTooltip();
            setContextMenuPos({ x: e.clientX, y: e.clientY });
            void loadBundleOptions();
          }}
          onKeyDown={handleKeyDown}
          role="treeitem"
          aria-level={props.depth + 1}
          aria-expanded={isDir() ? expanded() : undefined}
          title={
            props.node.is_git_ignored
              ? `${props.node.relative_path} • Ignored by .gitignore`
              : props.node.relative_path
          }
        >
          {/* Expand chevron for directories */}
          <Show when={isDir()} fallback={<span class="w-3 shrink-0" />}>
            <ChevronRight
              size={10}
              class="shrink-0 transition-transform"
              style={{
                transform: expanded() ? 'rotate(90deg)' : 'rotate(0deg)',
                'transition-duration': 'var(--duration-fast)',
                color: 'var(--color-text-tertiary)',
              }}
            />
          </Show>

          {/* Icon */}
          <Show when={isDir()} fallback={iconForFile(props.node)}>
            <Show
              when={expanded()}
              fallback={
                <Folder size={12} class="shrink-0" style={{ color: 'var(--color-accent)' }} />
              }
            >
              <FolderOpen size={12} class="shrink-0" style={{ color: 'var(--color-accent)' }} />
            </Show>
          </Show>

          {/* Name */}
          <span class="truncate flex-1 font-mono text-[11px]">{props.node.name}</span>

          {/* Git status indicator */}
          <Show when={getGitStatus(props.node.relative_path)}>
            {(status) => {
              const config = () => {
                switch (status().status) {
                  case 'modified':
                    return { label: 'M', name: 'Modified', color: 'var(--color-warning)' };
                  case 'untracked':
                    return { label: 'U', name: 'Untracked', color: 'var(--color-success)' };
                  case 'staged':
                    return { label: 'S', name: 'Staged', color: 'var(--color-success)' };
                  case 'deleted':
                    return { label: 'D', name: 'Deleted', color: 'var(--color-error)' };
                  case 'renamed':
                    return { label: 'R', name: 'Renamed', color: 'var(--color-accent)' };
                  case 'conflict':
                    return { label: '!', name: 'Conflicted', color: 'var(--color-error)' };
                  default:
                    return { label: '?', name: 'Unknown', color: 'var(--color-text-tertiary)' };
                }
              };
              return (
                <span
                  class="text-[8px] font-mono font-bold shrink-0 leading-none"
                  style={{ color: config().color }}
                  aria-label={`Git status: ${config().name}`}
                  title={`Git: ${config().name}`}
                >
                  {config().label}
                </span>
              );
            }}
          </Show>

          <Show when={props.node.is_git_ignored}>
            <span
              class="text-[9px] font-mono shrink-0"
              style={{ color: 'var(--color-text-tertiary)' }}
              title="Ignored by .gitignore"
              aria-label="Ignored by .gitignore"
            >
              ⦻
            </span>
          </Show>

          {/* Size badge for files */}
          <Show when={!isDir() && !props.node.is_binary && props.node.size_bytes != null}>
            <span
              class="text-[9px] font-mono shrink-0 opacity-60"
              style={{ color: sizeColor(props.node.size_bytes) }}
            >
              {formatSize(props.node.size_bytes)}
            </span>
          </Show>
          <Show when={props.node.is_binary}>
            <span
              class="text-[9px] font-mono shrink-0 opacity-40"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              bin
            </span>
          </Show>
        </button>
      </Show>

      <Show when={!isRenaming() && (isRowHovered() || contextMenuPos())}>
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 shrink-0 rounded px-0.5 leading-none text-base transition-opacity"
          style={{
            color: 'var(--color-text-tertiary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          title="More options"
          aria-label={`More options for ${props.node.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMouseLeaveTooltip();
            const rect = e.currentTarget.getBoundingClientRect();
            setContextMenuPos({ x: rect.left, y: rect.bottom + 2 });
            void loadBundleOptions();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenuPos({ x: rect.left, y: rect.bottom + 2 });
              void loadBundleOptions();
            }
          }}
          onMouseEnter={() => setIsRowHovered(true)}
          onMouseLeave={() => setIsRowHovered(false)}
        >
          ···
        </button>
      </Show>

      {/* Hover preview tooltip */}
      <Show when={showTooltip() && tooltipContent()}>
        <div
          class="absolute left-full top-0 ml-2 z-50 rounded-md shadow-lg overflow-hidden pointer-events-none"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-secondary)',
            'min-width': '200px',
            'max-width': '320px',
          }}
        >
          <div
            class="px-2 py-1.5 flex items-center gap-2 border-b"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <span
              class="text-[10px] font-mono truncate"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {props.node.name}
            </span>
            <span
              class="text-[9px] font-mono ml-auto"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {tooltipContent()!.size} · ~{tooltipContent()!.tokens} tok
            </span>
          </div>
          <div class="px-2 py-1.5">
            <For each={tooltipContent()!.lines}>
              {(line) => (
                <div
                  class="text-[9px] font-mono leading-relaxed truncate"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {line || '\u00A0'}
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={contextMenuPos()}>
        {(pos) => (
          <ContextMenu
            items={contextMenuItems()}
            x={pos().x}
            y={pos().y}
            onClose={() => setContextMenuPos(null)}
          />
        )}
      </Show>

      {/* Recursive children */}
      <Show when={isDir() && expanded()}>
        <div role="group">
          <Show
            when={
              fileState.creatingInFolder === props.node.relative_path &&
              fileState.creatingType &&
              isDir()
            }
          >
            <InlineFileInput
              parentPath={props.node.relative_path}
              type={fileState.creatingType!}
              depth={props.depth + 1}
              onConfirm={(name) => {
                const pid = projectId();
                if (!pid) return;
                const fullPath = props.node.relative_path
                  ? `${props.node.relative_path}/${name}`
                  : name;
                if (fileState.creatingType === 'folder') {
                  void createDirectoryInProject(pid, fullPath);
                } else {
                  void createFileInProject(pid, fullPath);
                }
              }}
              onCancel={cancelCreating}
            />
          </Show>
          <For each={children()}>
            {(child) => <FileTreeNode node={child} depth={props.depth + 1} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default FileTreeNode;
