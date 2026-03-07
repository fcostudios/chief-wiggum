import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Code2, ExternalLink, Eye, Layers, Pencil } from 'lucide-solid';
import { projectState } from '@/stores/projectStore';

interface SvgPreviewProps {
  relativePath: string;
  sizeBytes: number;
  content: string;
  onOpenExternal: () => void;
  onOpenEditor: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SvgPreview: Component<SvgPreviewProps> = (props) => {
  const [assetUrl, setAssetUrl] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [mode, setMode] = createSignal<'rendered' | 'code'>('rendered');

  createEffect(() => {
    const projectId = projectState.activeProjectId;
    if (!projectId) return;
    setFailed(false);
    void invoke<string>('resolve_file_path', {
      project_id: projectId,
      relative_path: props.relativePath,
    })
      .then((absPath) => setAssetUrl(convertFileSrc(absPath)))
      .catch(() => {
        setAssetUrl(null);
        setFailed(true);
      });
  });

  onCleanup(() => {
    setAssetUrl(null);
  });

  const fileName = () => props.relativePath.split('/').pop() ?? props.relativePath;

  return (
    <div class="flex flex-col h-full min-h-0 rounded border border-border-secondary bg-bg-inset overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-secondary bg-bg-secondary">
        <div class="flex items-center gap-2 min-w-0">
          <Layers size={14} color="var(--color-accent)" />
          <span class="text-xs font-medium text-text-primary truncate">{fileName()}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            onClick={() => setMode((prev) => (prev === 'rendered' ? 'code' : 'rendered'))}
            aria-label={mode() === 'rendered' ? 'View SVG source' : 'View rendered SVG'}
          >
            <Show when={mode() === 'rendered'} fallback={<Eye size={14} />}>
              <Code2 size={14} />
            </Show>
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            onClick={() => props.onOpenEditor()}
            aria-label="Edit SVG"
          >
            <Pencil size={14} />
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            onClick={() => props.onOpenExternal()}
            aria-label="Open SVG externally"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      <Show
        when={mode() === 'rendered'}
        fallback={
          <pre class="flex-1 min-h-0 overflow-auto p-3 text-[11px] leading-relaxed font-mono text-text-secondary">
            {props.content}
          </pre>
        }
      >
        <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4">
          <Show
            when={assetUrl() && !failed()}
            fallback={<div class="text-xs text-text-tertiary">Failed to render SVG</div>}
          >
            <img
              src={assetUrl()!}
              alt={fileName()}
              class="max-w-full max-h-full object-contain"
              onError={() => setFailed(true)}
              draggable={false}
            />
          </Show>
        </div>
      </Show>

      <div class="px-3 py-2 border-t border-border-secondary bg-bg-secondary text-[10px] text-text-tertiary">
        <div>Size: {formatFileSize(props.sizeBytes)}</div>
        <div>Read/write SVG source</div>
      </div>
    </div>
  );
};

export default SvgPreview;
