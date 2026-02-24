// src/components/conversation/ContextChip.tsx
// Removable pill showing an attached file reference.
// Displays filename, optional line range, and token estimate on hover.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { X, File } from 'lucide-solid';
import type { ContextAttachment } from '@/lib/types';

interface ContextChipProps {
  attachment: ContextAttachment;
  onRemove: (id: string) => void;
  onEdit?: (attachment: ContextAttachment) => void;
}

const ContextChip: Component<ContextChipProps> = (props) => {
  const ref = () => props.attachment.reference;
  const lineRange = () => {
    const r = ref();
    if (r.start_line && r.end_line) return `L${r.start_line}-${r.end_line}`;
    if (r.start_line) return `L${r.start_line}`;
    return null;
  };
  const tokenLabel = () => {
    const tokens = ref().estimated_tokens;
    if (tokens < 1000) return `~${tokens}`;
    return `~${(tokens / 1000).toFixed(1)}K`;
  };

  return (
    <span
      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono group transition-colors"
      classList={{ 'cursor-pointer': !!props.onEdit }}
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-secondary)',
        color: 'var(--color-text-secondary)',
        'transition-duration': 'var(--duration-fast)',
      }}
      onClick={() => props.onEdit?.(props.attachment)}
      onKeyDown={(e) => {
        if (!props.onEdit) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onEdit(props.attachment);
        }
      }}
      tabindex={props.onEdit ? 0 : undefined}
      role={props.onEdit ? 'button' : undefined}
      title={`${ref().relative_path} (~${ref().estimated_tokens} tokens)${props.onEdit ? ' — click to edit range' : ''}`}
    >
      <File size={10} class="shrink-0" style={{ color: 'var(--color-accent)' }} />
      <span class="truncate max-w-[120px]">{ref().name}</span>
      <Show when={lineRange()}>
        <span class="text-[9px] text-text-tertiary/50">{lineRange()}</span>
      </Show>
      <span class="text-[9px] text-text-tertiary/40">{tokenLabel()}</span>
      <button
        class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-bg-inset"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove(props.attachment.id);
        }}
        aria-label={`Remove ${ref().name}`}
      >
        <X size={8} style={{ color: 'var(--color-text-tertiary)' }} />
      </button>
    </span>
  );
};

export default ContextChip;
