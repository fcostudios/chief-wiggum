// src/components/conversation/ContextBreakdownModal.tsx
// Modal showing context budget and per-file quality scores (CHI-125).

import type { Component } from 'solid-js';
import { For, Show, onCleanup, onMount } from 'solid-js';
import { AlertTriangle, File, X } from 'lucide-solid';
import { qualityColor } from '@/lib/contextScoring';
import type { ContextQualityScore } from '@/lib/types';
import { closeContextBreakdown } from '@/stores/uiStore';
import {
  contextState,
  getTotalEstimatedTokens,
  recalculateScores,
  removeAttachment,
} from '@/stores/contextStore';

const TOKEN_BUDGET = 100_000;

const ContextBreakdownModal: Component = () => {
  const totalTokens = () => getTotalEstimatedTokens();
  const budgetPercent = () => Math.round((totalTokens() / TOKEN_BUDGET) * 100);

  onMount(() => {
    recalculateScores();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContextBreakdown();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const weakestAttachment = () => {
    let worst:
      | { id: string; name: string; tokens: number; score: ContextQualityScore }
      | null = null;
    for (const attachment of contextState.attachments) {
      const score = contextState.scores[attachment.id];
      if (score && (!worst || score.overall < worst.score.overall)) {
        worst = {
          id: attachment.id,
          name: attachment.reference.name,
          tokens: attachment.reference.estimated_tokens,
          score,
        };
      }
    }
    return worst;
  };

  function formatTokens(tokens: number): string {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return String(tokens);
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeContextBreakdown();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Context Budget"
    >
      <div
        class="w-full max-w-lg rounded-lg overflow-hidden animate-fade-in"
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-lg)',
        }}
      >
        <div
          class="flex items-center justify-between px-5 py-3"
          style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
        >
          <h2 class="text-sm font-semibold text-text-primary">Context Budget</h2>
          <button
            class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={closeContextBreakdown}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div class="px-5 py-4">
          <div class="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>
              Total: {formatTokens(totalTokens())} / {formatTokens(TOKEN_BUDGET)} tokens
            </span>
            <span>{budgetPercent()}%</span>
          </div>
          <div
            class="w-full h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--color-bg-inset)' }}
          >
            <div
              class="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(budgetPercent(), 100)}%`,
                background:
                  budgetPercent() > 80
                    ? 'var(--color-error)'
                    : budgetPercent() > 50
                      ? 'var(--color-warning)'
                      : 'var(--color-accent)',
                'transition-duration': 'var(--duration-normal)',
              }}
            />
          </div>
        </div>

        <div class="px-5 pb-2 max-h-64 overflow-y-auto">
          <Show
            when={contextState.attachments.length > 0}
            fallback={<p class="text-xs text-text-tertiary py-4 text-center">No files attached</p>}
          >
            <div class="space-y-1">
              <For each={contextState.attachments}>
                {(attachment) => {
                  const score = () => contextState.scores[attachment.id];
                  const color = () => (score() ? qualityColor(score()!.label) : 'var(--color-border-secondary)');
                  return (
                    <div
                      class="flex items-center gap-3 px-3 py-2 rounded-md"
                      style={{ background: 'var(--color-bg-secondary)' }}
                    >
                      <File size={12} class="shrink-0 text-text-tertiary" />
                      <span class="flex-1 text-xs text-text-primary truncate">
                        {attachment.reference.name}
                      </span>
                      <span class="text-[10px] font-mono text-text-tertiary">
                        ~{formatTokens(attachment.reference.estimated_tokens)}
                      </span>
                      <Show when={score()}>
                        <span
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize"
                          style={{
                            color: color(),
                            background: `color-mix(in srgb, ${color()} 15%, transparent)`,
                          }}
                          title={`Quality ${score()!.overall}/100`}
                        >
                          {score()!.label}
                        </span>
                      </Show>
                      <button
                        class="p-0.5 rounded text-text-tertiary hover:text-error transition-colors"
                        style={{ 'transition-duration': 'var(--duration-fast)' }}
                        onClick={() => removeAttachment(attachment.id)}
                        aria-label={`Remove ${attachment.reference.name}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        <Show when={weakestAttachment() && weakestAttachment()!.score.label === 'low'}>
          <div
            class="mx-5 mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-xs"
            style={{
              background: 'rgba(248, 81, 73, 0.08)',
              border: '1px solid rgba(248, 81, 73, 0.15)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <AlertTriangle
              size={12}
              class="shrink-0 mt-0.5"
              style={{ color: 'var(--color-warning)' }}
            />
            <span>
              <strong>{weakestAttachment()!.name}</strong> has low relevance — consider removing it
              to save ~{formatTokens(weakestAttachment()!.tokens)} tokens.
            </span>
          </div>
        </Show>

        <div class="px-5 py-3" style={{ 'border-top': '1px solid var(--color-border-secondary)' }}>
          <p class="text-[10px] text-text-tertiary">
            Cmd+Shift+T to toggle | Quality scores update when attachments change
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContextBreakdownModal;
