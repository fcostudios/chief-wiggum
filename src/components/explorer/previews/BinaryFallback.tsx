import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Archive, Cog, Database, ExternalLink, FileQuestion, Package, Video } from 'lucide-solid';
import { getBinaryCategory } from '@/lib/types';
import { t } from '@/stores/i18nStore';

interface BinaryFallbackProps {
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

const BinaryFallback: Component<BinaryFallbackProps> = (props) => {
  const category = () => getBinaryCategory(props.extension);
  const fileName = () => props.relativePath.split('/').pop() ?? props.relativePath;

  return (
    <div class="flex flex-col items-center justify-center h-full gap-3 p-6 text-center rounded border border-border-secondary bg-bg-inset">
      <Show when={category().icon === 'Video'}>
        <Video size={36} color="var(--color-text-tertiary)" />
      </Show>
      <Show when={category().icon === 'Cog'}>
        <Cog size={36} color="var(--color-text-tertiary)" />
      </Show>
      <Show when={category().icon === 'Package'}>
        <Package size={36} color="var(--color-text-tertiary)" />
      </Show>
      <Show when={category().icon === 'Archive'}>
        <Archive size={36} color="var(--color-text-tertiary)" />
      </Show>
      <Show when={category().icon === 'Database'}>
        <Database size={36} color="var(--color-text-tertiary)" />
      </Show>
      <Show when={category().icon === 'FileQuestion'}>
        <FileQuestion size={36} color="var(--color-text-tertiary)" />
      </Show>

      <div>
        <p class="text-xs font-medium text-text-secondary break-all">{fileName()}</p>
        <p class="text-[10px] text-text-tertiary mt-1">
          {category().label} · {formatFileSize(props.sizeBytes)}
        </p>
      </div>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-accent border border-accent/20 hover:bg-accent/10 transition-colors"
        onClick={() => props.onOpenExternal()}
      >
        <ExternalLink size={12} />
        {t('filePreview.openExternally')}
      </button>
    </div>
  );
};

export default BinaryFallback;
