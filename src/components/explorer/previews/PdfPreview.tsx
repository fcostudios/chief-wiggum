import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ExternalLink, FileText } from 'lucide-solid';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';

interface PdfPreviewProps {
  relativePath: string;
  sizeBytes: number;
  onOpenExternal: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PdfPreview: Component<PdfPreviewProps> = (props) => {
  const [assetUrl, setAssetUrl] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);

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
          <FileText size={14} color="var(--color-text-secondary)" />
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

      <div class="flex-1 min-h-0 bg-bg-inset">
        <Show
          when={assetUrl() && !failed()}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-2 text-xs text-text-tertiary">
              <FileText size={30} color="var(--color-text-tertiary)" />
              <p>{failed() ? 'Failed to load PDF preview' : 'Loading PDF preview...'}</p>
              <Show when={failed()}>
                <button
                  class="text-xs text-accent hover:underline"
                  onClick={() => props.onOpenExternal()}
                >
                  {t('filePreview.openExternally')}
                </button>
              </Show>
            </div>
          }
        >
          <embed
            src={assetUrl()!}
            type="application/pdf"
            class="w-full h-full"
            title={fileName()}
          />
        </Show>
      </div>

      <div class="px-3 py-2 border-t border-border-secondary bg-bg-secondary text-[10px] text-text-tertiary">
        <div>Size: {formatFileSize(props.sizeBytes)}</div>
        <div>Read-only preview</div>
      </div>
    </div>
  );
};

export default PdfPreview;
