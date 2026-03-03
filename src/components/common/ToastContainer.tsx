// src/components/common/ToastContainer.tsx
// Fixed bottom-right toast container. Renders up to 3 toasts with enter/exit animations.
// 6 variants per SPEC-006 §5.3: success, info, warning, error, tip, undo.

import type { Component } from 'solid-js';
import { For, Match, Show, Switch, createSignal } from 'solid-js';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Lightbulb,
  Undo2,
  X,
  XCircle,
} from 'lucide-solid';
import { t } from '@/stores/i18nStore';
import { toastState, dismissToast, type ToastVariant } from '@/stores/toastStore';

function variantColor(variant: ToastVariant): string {
  switch (variant) {
    case 'success':
      return 'var(--color-success)';
    case 'warning':
      return 'var(--color-warning)';
    case 'error':
      return 'var(--color-error)';
    case 'info':
      return 'var(--color-text-link)';
    case 'tip':
      return 'var(--color-accent)';
    case 'undo':
      return 'var(--color-text-link)';
  }
}

const VariantIcon: Component<{ variant: ToastVariant }> = (props) => {
  const color = () => variantColor(props.variant);
  return (
    <Switch>
      <Match when={props.variant === 'success'}>
        <CheckCircle size={14} color={color()} />
      </Match>
      <Match when={props.variant === 'warning'}>
        <AlertTriangle size={14} color={color()} />
      </Match>
      <Match when={props.variant === 'error'}>
        <XCircle size={14} color={color()} />
      </Match>
      <Match when={props.variant === 'info'}>
        <Info size={14} color={color()} />
      </Match>
      <Match when={props.variant === 'tip'}>
        <Lightbulb size={14} color={color()} />
      </Match>
      <Match when={props.variant === 'undo'}>
        <Undo2 size={14} color={color()} />
      </Match>
    </Switch>
  );
};

const ErrorDetails: Component<{ details: string }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.details);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable in restricted contexts.
    }
  };

  return (
    <div class="mt-1.5">
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1 text-[11px] font-medium transition-colors"
          style={{ color: 'var(--color-error)' }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded() ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded() ? t('toast.hideDetails') : t('toast.details')}
        </button>
        <button
          class="flex items-center gap-1 text-[11px] font-medium transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={() => void handleCopy()}
        >
          <Copy size={10} />
          {copied() ? t('toast.copied') : t('toast.copyError')}
        </button>
      </div>
      <Show when={expanded()}>
        <div
          class="mt-1.5 overflow-auto rounded px-2 py-1.5 font-mono text-[11px] leading-relaxed"
          style={{
            background: 'var(--color-bg-inset)',
            color: 'var(--color-text-secondary)',
            'max-height': '120px',
            'white-space': 'pre-wrap',
            'word-break': 'break-word',
          }}
        >
          {props.details}
        </div>
      </Show>
    </div>
  );
};

const ToastContainer: Component = () => {
  return (
    <div
      class="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      style={{ 'max-width': '360px', 'min-width': '280px' }}
      role="region"
      aria-label="Notifications"
    >
      <For each={toastState.toasts}>
        {(toast) => (
          <div
            class={toast.dismissing ? 'animate-slide-out-right' : 'animate-slide-in-right'}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
              'border-left': `3px solid ${variantColor(toast.variant)}`,
              'border-radius': '8px',
              'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
          >
            <div class="flex items-start gap-2.5 px-3 py-2.5">
              <div class="mt-0.5 shrink-0">
                <VariantIcon variant={toast.variant} />
              </div>
              <div class="min-w-0 flex-1">
                <p
                  class="text-xs leading-relaxed text-text-primary"
                  style={{ 'white-space': 'pre-wrap', 'word-break': 'break-word' }}
                >
                  {toast.message}
                </p>

                <Show when={toast.variant === 'error' && toast.details}>
                  <ErrorDetails details={toast.details!} />
                </Show>

                <Show when={toast.action}>
                  <button
                    class="mt-1.5 text-[11px] font-medium transition-colors"
                    style={{ color: variantColor(toast.variant) }}
                    onClick={() => {
                      toast.action!.onClick();
                      if (toast.variant === 'undo') {
                        dismissToast(toast.id);
                      }
                    }}
                  >
                    {toast.action!.label}
                  </button>
                </Show>
              </div>
              <button
                class="shrink-0 rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={() => dismissToast(toast.id)}
                aria-label={t('toast.dismiss')}
              >
                <X size={12} />
              </button>
            </div>

            <Show when={toast.variant === 'undo' && toast.countdown && !toast.dismissing}>
              <div
                class="animate-toast-countdown"
                style={{
                  height: 'var(--toast-countdown-height, 2px)',
                  background: 'var(--toast-countdown-color, var(--color-info))',
                  '--toast-countdown-duration': `${toast.countdown}ms`,
                }}
              />
            </Show>
          </div>
        )}
      </For>
    </div>
  );
};

export default ToastContainer;
