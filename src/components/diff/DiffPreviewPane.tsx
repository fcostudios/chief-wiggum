import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { X } from 'lucide-solid';
import InlineDiff from '@/components/conversation/InlineDiff';
import { clearActiveInlineDiff, diffReviewState } from '@/stores/diffReviewStore';

const DiffPreviewPane: Component = () => {
  return (
    <div class="flex-1 overflow-y-auto">
      <Show
        when={diffReviewState.activeInlineDiff}
        fallback={
          <div class="flex items-center justify-center h-full">
            <div class="text-center animate-fade-in">
              <p class="text-text-tertiary text-sm tracking-wide">No diff selected</p>
              <p class="text-text-tertiary/50 text-xs mt-1">
                Open an inline diff from the conversation to review it here
              </p>
            </div>
          </div>
        }
      >
        {(preview) => (
          <div class="px-4 py-4 max-w-5xl mx-auto w-full">
            <div
              class="flex items-center justify-between gap-3 px-3 py-2 rounded-md"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <div class="min-w-0">
                <p class="text-xs font-mono text-text-primary truncate">{preview().filePath}</p>
                <p class="text-[10px] font-mono text-text-tertiary mt-0.5">
                  +{preview().addedLines} / -{preview().removedLines}
                </p>
              </div>
              <button
                class="shrink-0 p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={clearActiveInlineDiff}
                aria-label="Clear selected diff"
                title="Clear selected diff"
              >
                <X size={12} />
              </button>
            </div>

            <InlineDiff preview={preview()} defaultExpanded />
          </div>
        )}
      </Show>
    </div>
  );
};

export default DiffPreviewPane;
