// src/components/conversation/ContextChip.tsx
// Removable pill showing an attached file reference.
// Displays filename, optional line range, and token estimate on hover.

import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Sparkles, X, File } from 'lucide-solid';
import type { ContextAttachment } from '@/lib/types';
import { qualityColor } from '@/lib/contextScoring';
import {
  applyAttachmentOptimization,
  contextState,
  revertAttachmentOptimization,
} from '@/stores/contextStore';
import { addToast } from '@/stores/toastStore';

interface ContextChipProps {
  attachment: ContextAttachment;
  onRemove: (id: string) => void;
  onEdit?: (attachment: ContextAttachment) => void;
}

const ContextChip: Component<ContextChipProps> = (props) => {
  const ref = () => props.attachment.reference;
  const score = () => contextState.scores[props.attachment.id];
  const optimization = () => contextState.symbolSuggestions[props.attachment.id];
  const isOptimized = () => {
    const names = ref().symbol_names;
    return Array.isArray(names) && names.length > 0;
  };
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
  const fullTokenLabel = () => {
    const full = ref().full_file_tokens;
    if (!full) return null;
    if (full < 1000) return `~${full}`;
    return `~${(full / 1000).toFixed(1)}K`;
  };
  const symbolNames = () => ref().symbol_names ?? [];

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
      <span class="text-[9px] text-text-tertiary/40">
        {tokenLabel()}
        <Show when={isOptimized() && fullTokenLabel()}>{(full) => <> / {full()}</>}</Show>
      </span>
      <Show when={symbolNames().length > 0}>
        <span
          class="text-[9px] max-w-[140px] truncate"
          style={{ color: 'var(--color-accent)' }}
          title={`Symbols: ${symbolNames().join(', ')}`}
        >
          {symbolNames().slice(0, 2).join(', ')}
          <Show when={symbolNames().length > 2}>+{symbolNames().length - 2}</Show>
        </span>
      </Show>
      <Show when={score()}>
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: qualityColor(score()!.label) }}
          title={`Quality: ${score()!.label} (${score()!.overall}/100)`}
          aria-label={`Context quality: ${score()!.label}`}
        />
      </Show>
      <Show when={!isOptimized() && optimization()}>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-bg-inset flex items-center gap-1 text-[9px]"
          style={{ color: 'var(--color-accent)', 'transition-duration': 'var(--duration-fast)' }}
          title={`Optimize context (~${optimization()!.optimized_tokens} vs ~${optimization()!.full_tokens} tokens)`}
          onClick={(e) => {
            e.stopPropagation();
            if (applyAttachmentOptimization(props.attachment.id)) {
              addToast('Applied token-optimized snippet', 'success');
            }
          }}
          aria-label={`Optimize ${ref().name}`}
        >
          <Sparkles size={8} />
          Optimize
        </button>
      </Show>
      <Show when={isOptimized()}>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-bg-inset text-[9px]"
          style={{
            color: 'var(--color-text-secondary)',
            'transition-duration': 'var(--duration-fast)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (revertAttachmentOptimization(props.attachment.id)) {
              addToast('Reverted to full-file context', 'info');
            }
          }}
          aria-label={`Use full ${ref().name}`}
        >
          Full
        </button>
      </Show>
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
