// src/components/explorer/FileTreeNode.tsx
// Recursive tree node for the file explorer sidebar.
// Expands directories on click, selects files for preview.

import type { Component } from 'solid-js';
import { Show, For, createSignal, onCleanup } from 'solid-js';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-solid';
import { invoke } from '@tauri-apps/api/core';
import type { FileNode, FileContent } from '@/lib/types';
import {
  fileState,
  isExpanded,
  getChildren,
  toggleFolder,
  selectFile,
  getGitStatus,
} from '@/stores/fileStore';
import { projectState } from '@/stores/projectStore';

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

const FileTreeNode: Component<FileTreeNodeProps> = (props) => {
  const isDir = () => props.node.node_type === 'Directory';
  const expanded = () => isExpanded(props.node.relative_path);
  const children = () => getChildren(props.node.relative_path);
  const isSelected = () => fileState.selectedPath === props.node.relative_path;
  const projectId = () => projectState.activeProjectId;
  const [showTooltip, setShowTooltip] = createSignal(false);
  const [tooltipContent, setTooltipContent] = createSignal<{
    lines: string[];
    size: string;
    tokens: number;
  } | null>(null);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

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
      <button
        class="flex items-center gap-1 w-full text-left py-0.5 pr-2 rounded-sm transition-colors text-xs"
        style={{
          'padding-left': `${props.depth * 12 + 4}px`,
          background: isSelected() ? 'var(--color-accent-muted)' : 'transparent',
          color: isSelected() ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          'transition-duration': 'var(--duration-fast)',
        }}
        draggable={!isDir()}
        onDragStart={handleDragStart}
        onMouseEnter={(e) => {
          if (!isSelected()) {
            e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
          }
          void handleMouseEnterTooltip();
        }}
        onMouseLeave={(e) => {
          if (!isSelected()) {
            e.currentTarget.style.background = 'transparent';
          }
          handleMouseLeaveTooltip();
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        aria-level={props.depth + 1}
        aria-expanded={isDir() ? expanded() : undefined}
        title={props.node.relative_path}
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
        <Show
          when={isDir()}
          fallback={
            <File size={12} class="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
          }
        >
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
                  return { label: 'M', color: 'var(--color-warning)' };
                case 'untracked':
                  return { label: 'U', color: 'var(--color-success)' };
                case 'staged':
                  return { label: 'S', color: 'var(--color-success)' };
                case 'deleted':
                  return { label: 'D', color: 'var(--color-error)' };
                case 'renamed':
                  return { label: 'R', color: 'var(--color-accent)' };
                case 'conflict':
                  return { label: '!', color: 'var(--color-error)' };
                default:
                  return { label: '?', color: 'var(--color-text-tertiary)' };
              }
            };
            return (
              <span
                class="text-[8px] font-mono font-bold shrink-0 leading-none"
                style={{ color: config().color }}
                title={`Git: ${status().status}`}
              >
                {config().label}
              </span>
            );
          }}
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

      {/* Recursive children */}
      <Show when={isDir() && expanded()}>
        <div role="group">
          <For each={children()}>
            {(child) => <FileTreeNode node={child} depth={props.depth + 1} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default FileTreeNode;
