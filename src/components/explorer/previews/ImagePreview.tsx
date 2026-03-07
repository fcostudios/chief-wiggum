import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ExternalLink, Image as ImageIcon, ZoomIn, ZoomOut } from 'lucide-solid';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';

interface ImagePreviewProps {
  relativePath: string;
  sizeBytes: number;
  extension: string | null;
  onOpenExternal: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ImagePreview: Component<ImagePreviewProps> = (props) => {
  const [assetUrl, setAssetUrl] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [failed, setFailed] = createSignal(false);
  const [zoomed, setZoomed] = createSignal(false);
  const [dimensions, setDimensions] = createSignal<{ width: number; height: number } | null>(null);

  createEffect(() => {
    const projectId = projectState.activeProjectId;
    if (!projectId) return;
    setLoading(true);
    setFailed(false);

    void invoke<string>('resolve_file_path', {
      project_id: projectId,
      relative_path: props.relativePath,
    })
      .then((absPath) => setAssetUrl(convertFileSrc(absPath)))
      .catch(() => {
        setAssetUrl(null);
        setFailed(true);
        setLoading(false);
      });
  });

  onCleanup(() => {
    setAssetUrl(null);
  });

  const fileName = () => props.relativePath.split('/').pop() ?? props.relativePath;

  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-secondary">
        <div class="flex items-center gap-2 min-w-0">
          <ImageIcon size={14} color="var(--color-text-secondary)" />
          <span class="text-xs font-medium text-text-primary truncate">{fileName()}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            onClick={() => setZoomed((prev) => !prev)}
            aria-label={zoomed() ? 'Fit image' : 'Zoom image'}
          >
            <Show when={zoomed()} fallback={<ZoomIn size={14} />}>
              <ZoomOut size={14} />
            </Show>
          </button>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            onClick={() => props.onOpenExternal()}
            aria-label={t('filePreview.openExternally')}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-bg-inset">
        <Show when={loading() && !failed()}>
          <div class="w-full h-48 rounded animate-pulse bg-bg-secondary" />
        </Show>

        <Show when={failed()}>
          <div class="text-center space-y-2">
            <ImageIcon size={30} color="var(--color-text-tertiary)" />
            <p class="text-xs text-text-tertiary">{t('filePreview.imageLoadError')}</p>
            <button
              class="text-xs text-accent hover:underline"
              onClick={() => props.onOpenExternal()}
            >
              {t('filePreview.openExternally')}
            </button>
          </div>
        </Show>

        <Show when={assetUrl() && !failed()}>
          <img
            src={assetUrl()!}
            alt={fileName()}
            class="rounded transition-all"
            classList={{
              'max-w-full max-h-full object-contain': !zoomed(),
              'max-w-none max-h-none': zoomed(),
            }}
            style={{ display: loading() ? 'none' : 'block' }}
            onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
              setLoading(false);
            }}
            onError={() => {
              setFailed(true);
              setLoading(false);
            }}
            draggable={false}
          />
        </Show>
      </div>

      <div class="px-3 py-2 border-t border-border-secondary bg-bg-secondary text-[10px] text-text-tertiary">
        <div>
          {t('editor.size')}: {formatFileSize(props.sizeBytes)}
        </div>
        <Show when={dimensions()}>
          {(meta) => (
            <div>
              {meta().width} × {meta().height}
            </div>
          )}
        </Show>
        <div>Format: {(props.extension ?? 'unknown').toUpperCase()}</div>
      </div>
    </div>
  );
};

export default ImagePreview;
