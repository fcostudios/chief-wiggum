// src/components/explorer/FileTreeNode.tsx
// Recursive tree node for the file explorer sidebar.
// Expands directories on click, selects files for preview.

import type { Component } from 'solid-js';
import { Show, For } from 'solid-js';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-solid';
import type { FileNode } from '@/lib/types';
import {
  fileState,
  isExpanded,
  getChildren,
  toggleFolder,
  selectFile,
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

  function handleClick() {
    const pid = projectId();
    if (!pid) return;
    if (isDir()) {
      toggleFolder(pid, props.node.relative_path);
    } else {
      selectFile(pid, props.node.relative_path);
    }
  }

  return (
    <div>
      <button
        class="flex items-center gap-1 w-full text-left py-0.5 pr-2 rounded-sm transition-colors text-xs"
        style={{
          'padding-left': `${props.depth * 12 + 4}px`,
          background: isSelected() ? 'var(--color-accent-muted)' : 'transparent',
          color: isSelected() ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          'transition-duration': 'var(--duration-fast)',
        }}
        onMouseEnter={(e) => {
          if (!isSelected()) {
            e.currentTarget.style.background = 'rgba(28, 33, 40, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected()) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
        onClick={handleClick}
        title={props.node.relative_path}
      >
        {/* Expand chevron for directories */}
        <Show
          when={isDir()}
          fallback={<span class="w-3 shrink-0" />}
        >
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
          <span class="text-[9px] font-mono shrink-0 opacity-40" style={{ color: 'var(--color-text-tertiary)' }}>
            bin
          </span>
        </Show>
      </button>

      {/* Recursive children */}
      <Show when={isDir() && expanded()}>
        <For each={children()}>
          {(child) => <FileTreeNode node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  );
};

export default FileTreeNode;
