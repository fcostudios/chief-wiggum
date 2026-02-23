// src/components/common/ToastContainer.tsx
// Fixed bottom-right toast container. Renders up to 3 toasts with enter/exit animations.

import type { Component } from 'solid-js';
import { For, Switch, Match } from 'solid-js';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-solid';
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
    </Switch>
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
                {toast.action && (
                  <button
                    class="mt-1.5 text-[11px] font-medium transition-colors"
                    style={{ color: variantColor(toast.variant) }}
                    onClick={toast.action.onClick}
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                class="shrink-0 rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};

export default ToastContainer;
