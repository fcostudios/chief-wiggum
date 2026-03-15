import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import type { ImportReviewItem } from '@/lib/types';
import { canSelectImportItem } from '@/stores/importStore';

interface ImportReviewListProps {
  items: ImportReviewItem[];
  selectedPaths: string[];
  focusedPath: string | null;
  searchQuery: string;
  activeProjectPath: string;
  onSearchQueryChange: (query: string) => void;
  onToggleSelect: (filePath: string) => void;
  onFocus: (filePath: string) => void;
}

export function formatReviewTitle(projectPath: string): string {
  const segments = projectPath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'Unknown project';
  }
  if (segments.length === 1) {
    return segments[0];
  }
  return `${segments[segments.length - 2]} / ${segments[segments.length - 1]}`;
}

export function shortenPath(path: string, maxLength = 56): string {
  if (path.length <= maxLength) {
    return path;
  }
  const keep = Math.floor((maxLength - 3) / 2);
  return `${path.slice(0, keep)}...${path.slice(path.length - keep)}`;
}

export function matchesActiveProject(item: ImportReviewItem, activeProjectPath: string): boolean {
  if (!activeProjectPath) {
    return false;
  }
  return (
    item.project_path === activeProjectPath ||
    item.project_path.startsWith(`${activeProjectPath}/`) ||
    activeProjectPath.startsWith(`${item.project_path}/`)
  );
}

function badgeClasses(kind: 'picked' | 'imported' | 'active' | 'warning') {
  switch (kind) {
    case 'picked':
      return 'border-accent/40 bg-accent/15 text-accent';
    case 'imported':
      return 'border-border-secondary bg-bg-inset text-text-secondary';
    case 'active':
      return 'border-success/40 bg-success/15 text-success';
    case 'warning':
      return 'border-warning/40 bg-warning/15 text-warning';
  }
}

const ImportReviewList: Component<ImportReviewListProps> = (props) => {
  const selected = () => new Set(props.selectedPaths);

  return (
    <section class="flex min-h-[28rem] flex-col rounded-xl border border-border-secondary bg-bg-primary/60">
      <div class="border-b border-border-secondary px-4 py-3">
        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          Review Queue
        </div>
        <div class="mt-3">
          <input
            value={props.searchQuery}
            onInput={(event) => props.onSearchQueryChange(event.currentTarget.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
            class="w-full rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <Show
          when={props.items.length > 0}
          fallback={
            <div class="flex h-full min-h-[16rem] items-center justify-center rounded-lg border border-dashed border-border-secondary bg-bg-secondary/40 px-6 text-center text-sm text-text-secondary">
              Scan <code>~/.claude/projects/</code> or pick JSONL files to review before import.
            </div>
          }
        >
          <div class="space-y-2">
            <For each={props.items}>
              {(item) => {
                const isFocused = () => props.focusedPath === item.file_path;
                const isSelected = () => selected().has(item.file_path);
                const isActiveMatch = () => matchesActiveProject(item, props.activeProjectPath);
                return (
                  <div
                    class="rounded-xl border px-3 py-3 transition-colors"
                    classList={{
                      'border-accent/50 bg-accent/8': isFocused(),
                      'border-border-secondary bg-bg-secondary/50': !isFocused(),
                      'opacity-65': item.already_imported,
                    }}
                  >
                    <div class="flex items-start gap-3">
                      <input
                        type="checkbox"
                        class="mt-1 h-4 w-4 shrink-0 accent-accent"
                        checked={isSelected()}
                        disabled={!canSelectImportItem(item)}
                        aria-label={`Select ${item.file_path}`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => props.onToggleSelect(item.file_path)}
                      />

                      <button
                        type="button"
                        aria-label={item.file_path}
                        onClick={() => props.onFocus(item.file_path)}
                        class="min-w-0 flex-1 text-left"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <div class="truncate text-sm font-semibold text-text-primary">
                              {formatReviewTitle(item.project_path)}
                            </div>
                            <div class="mt-1 truncate text-xs text-text-tertiary">
                              {shortenPath(item.project_path)}
                            </div>
                            <div class="mt-2 truncate text-xs text-text-secondary">
                              {item.cli_session_id}
                              {item.model ? ` • ${item.model}` : ''}
                            </div>
                          </div>
                        </div>

                        <div class="mt-3 flex flex-wrap gap-2">
                          <Show when={item.source === 'picked'}>
                            <span
                              class={`rounded-full border px-2 py-1 text-[11px] font-medium ${badgeClasses('picked')}`}
                            >
                              Picked
                            </span>
                          </Show>
                          <Show when={item.already_imported}>
                            <span
                              class={`rounded-full border px-2 py-1 text-[11px] font-medium ${badgeClasses('imported')}`}
                            >
                              Already imported
                            </span>
                          </Show>
                          <Show when={isActiveMatch()}>
                            <span
                              class={`rounded-full border px-2 py-1 text-[11px] font-medium ${badgeClasses('active')}`}
                            >
                              Active project
                            </span>
                          </Show>
                          <Show when={!!item.warning}>
                            <span
                              class={`rounded-full border px-2 py-1 text-[11px] font-medium ${badgeClasses('warning')}`}
                            >
                              Needs review
                            </span>
                          </Show>
                        </div>
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
};

export default ImportReviewList;
