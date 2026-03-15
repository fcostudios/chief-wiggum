import type { Component, JSX } from 'solid-js';
import { Show } from 'solid-js';
import type { ImportReviewItem } from '@/lib/types';
import { formatReviewTitle, matchesActiveProject } from './ImportReviewList';

interface ImportSessionDetailsProps {
  item: ImportReviewItem | null;
  activeProjectPath: string;
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not available';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DetailRow: Component<{ label: string; value: JSX.Element | string }> = (props) => (
  <div class="rounded-lg border border-border-secondary bg-bg-secondary/50 px-3 py-3">
    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
      {props.label}
    </div>
    <div class="mt-2 text-sm text-text-primary">{props.value}</div>
  </div>
);

const ImportSessionDetails: Component<ImportSessionDetailsProps> = (props) => {
  return (
    <section class="flex min-h-[28rem] flex-col rounded-xl border border-border-secondary bg-bg-primary/70">
      <div class="border-b border-border-secondary px-4 py-3">
        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          Session Details
        </div>
        <Show when={props.item}>
          {(item) => (
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="rounded-full border border-border-secondary bg-bg-secondary px-2 py-1 text-[11px] font-medium text-text-secondary">
                {item().source === 'picked' ? 'Picked file' : 'Scanned file'}
              </span>
              <Show when={matchesActiveProject(item(), props.activeProjectPath)}>
                <span class="rounded-full border border-success/40 bg-success/15 px-2 py-1 text-[11px] font-medium text-success">
                  Active project match
                </span>
              </Show>
            </div>
          )}
        </Show>
      </div>

      <Show
        when={props.item}
        fallback={
          <div class="flex flex-1 items-center justify-center px-8 text-center text-sm text-text-secondary">
            Choose a session on the left to inspect its full path and metadata before importing.
          </div>
        }
      >
        {(item) => (
          <div class="grid flex-1 gap-3 overflow-y-auto p-4">
            <DetailRow label="Project identity" value={formatReviewTitle(item().project_path)} />
            <DetailRow
              label="Full file path"
              value={<span class="break-all">{item().file_path}</span>}
            />
            <DetailRow
              label="Project path"
              value={<span class="break-all">{item().project_path}</span>}
            />
            <DetailRow label="Started" value={formatDate(item().first_timestamp)} />
            <DetailRow label="Last modified" value={formatDate(item().last_modified_timestamp)} />
            <DetailRow label="Model" value={item().model ?? 'Unknown'} />
            <DetailRow
              label="File stats"
              value={`${formatBytes(item().file_size_bytes)} • ${item().line_count} line${item().line_count === 1 ? '' : 's'}`}
            />
            <DetailRow
              label="Import status"
              value={
                item().already_imported
                  ? 'Already imported'
                  : item().is_valid_jsonl
                    ? 'Ready to import'
                    : 'Invalid JSONL'
              }
            />
            <Show when={item().warning}>
              <DetailRow label="Warning" value={item().warning ?? ''} />
            </Show>
            <DetailRow
              label="First user message"
              value={item().first_user_preview ?? 'No user message preview available'}
            />
          </div>
        )}
      </Show>
    </section>
  );
};

export default ImportSessionDetails;
