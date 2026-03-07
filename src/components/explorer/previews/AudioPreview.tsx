import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ExternalLink, Music } from 'lucide-solid';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';

interface AudioPreviewProps {
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const AudioPreview: Component<AudioPreviewProps> = (props) => {
  const [assetUrl, setAssetUrl] = createSignal<string | null>(null);
  const [duration, setDuration] = createSignal<number | null>(null);
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    const projectId = projectState.activeProjectId;
    if (!projectId) return;
    setFailed(false);
    setDuration(null);

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
          <Music size={14} color="var(--color-accent)" />
          <span class="text-xs font-medium text-text-primary truncate">{fileName()}</span>
        </div>
        <button
          class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
          onClick={() => props.onOpenExternal()}
          aria-label={t('filePreview.openExternally')}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <div class="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-6">
        <Music size={38} color="var(--color-text-tertiary)" style={{ opacity: 0.5 }} />
        <span class="text-xs font-medium text-text-secondary break-all text-center">
          {fileName()}
        </span>
        <Show
          when={assetUrl() && !failed()}
          fallback={
            <div class="text-center text-xs text-text-tertiary">
              <p>Failed to load audio</p>
              <button
                class="text-accent hover:underline mt-1"
                onClick={() => props.onOpenExternal()}
              >
                {t('filePreview.openExternally')}
              </button>
            </div>
          }
        >
          <audio
            src={assetUrl()!}
            controls
            class="w-full max-w-[360px]"
            onLoadedMetadata={(event) => {
              const audio = event.currentTarget;
              if (Number.isFinite(audio.duration)) {
                setDuration(audio.duration);
              }
            }}
            onError={() => setFailed(true)}
          />
        </Show>
      </div>

      <div class="px-3 py-2 border-t border-border-secondary bg-bg-secondary text-[10px] text-text-tertiary">
        <Show when={duration()}>{(value) => <div>Duration: {formatDuration(value())}</div>}</Show>
        <div>Size: {formatFileSize(props.sizeBytes)}</div>
        <div>Format: {(props.extension ?? 'unknown').toUpperCase()}</div>
      </div>
    </div>
  );
};

export default AudioPreview;
