// src/components/permissions/PermissionDialog.tsx
// Permission dialog per SPEC-003 §3.7 and SPEC-001 §7.
// Modal: blocks all interaction until resolved.
// Risk-level stripe: green (low), amber (medium), red (high).
// Tool-type badge: blue (file ops), amber (bash), purple (MCP).
// Keyboard: Y=approve, N=deny, A=always allow, Escape=deny.
// Timeout: 60s auto-deny with countdown bar.
// Focus trap: Tab cycles within dialog.

import type { Component } from 'solid-js';
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { ShieldAlert } from 'lucide-solid';
import type { PermissionRequest, PermissionAction } from '@/lib/types';

interface PermissionDialogProps {
  request: PermissionRequest;
  onRespond: (action: PermissionAction) => void;
}

const TIMEOUT_SECONDS = 60;

/** Map risk level to left-border color class */
function riskBorderColor(level: string): string {
  switch (level) {
    case 'low':
      return 'border-l-success';
    case 'medium':
      return 'border-l-warning';
    case 'high':
      return 'border-l-error';
    default:
      return 'border-l-border-primary';
  }
}

/** Map risk level to badge styling */
function riskBadge(level: string): { bg: string; text: string; label: string } {
  switch (level) {
    case 'low':
      return { bg: 'bg-success-muted', text: 'text-success', label: 'Low Risk' };
    case 'medium':
      return { bg: 'bg-warning-muted', text: 'text-warning', label: 'Medium Risk' };
    case 'high':
      return { bg: 'bg-error-muted', text: 'text-error', label: 'High Risk' };
    default:
      return { bg: 'bg-bg-elevated', text: 'text-text-secondary', label: level };
  }
}

/** Map tool type to badge color: file ops=blue, bash=amber, MCP=purple */
function toolBadge(tool: string): { bg: string; text: string } {
  const t = tool.toLowerCase();
  if (t.includes('bash') || t.includes('shell') || t.includes('command')) {
    return { bg: 'bg-warning-muted', text: 'text-warning' };
  }
  if (t.includes('mcp')) {
    return { bg: 'bg-[#a371f733]', text: 'text-[#a371f7]' };
  }
  // Default: file operations — blue
  return { bg: 'bg-[#58a6ff33]', text: 'text-info' };
}

const PermissionDialog: Component<PermissionDialogProps> = (props) => {
  const [timeLeft, setTimeLeft] = createSignal(TIMEOUT_SECONDS);
  let dialogRef: HTMLDivElement | undefined;

  // --- Timeout countdown ---
  const timer = setInterval(() => {
    setTimeLeft((prev) => {
      if (prev <= 1) {
        clearInterval(timer);
        props.onRespond('Deny');
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  onCleanup(() => clearInterval(timer));

  // --- Keyboard shortcuts ---
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      props.onRespond('Approve');
    } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
      e.preventDefault();
      props.onRespond('Deny');
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      props.onRespond('AlwaysAllow');
    }

    // Focus trap
    if (e.key === 'Tab' && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Focus first button
    const firstBtn = dialogRef?.querySelector<HTMLElement>('button');
    firstBtn?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  const risk = () => riskBadge(props.request.risk_level);
  const tool = () => toolBadge(props.request.tool);
  const timeoutPercent = () => (timeLeft() / TIMEOUT_SECONDS) * 100;

  return (
    // Overlay — does NOT close on click (security-critical modal)
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Permission required"
    >
      <div
        ref={dialogRef}
        class={`w-full max-w-[560px] bg-bg-elevated rounded-lg shadow-md border-l-4 ${riskBorderColor(props.request.risk_level)}`}
      >
        {/* Header */}
        <div class="flex items-center gap-2 px-6 pt-5 pb-3">
          <ShieldAlert size={20} class="text-warning" />
          <h2 class="text-xl font-semibold text-text-primary">Permission Required</h2>
        </div>

        {/* Content */}
        <div class="px-6 pb-4">
          {/* Tool type + risk badges */}
          <div class="flex items-center gap-2 mb-3">
            <span class={`px-2 py-0.5 rounded text-xs font-medium ${tool().bg} ${tool().text}`}>
              {props.request.tool}
            </span>
            <span class={`px-2 py-0.5 rounded text-xs font-medium ${risk().bg} ${risk().text}`}>
              {risk().label}
            </span>
          </div>

          {/* Command display */}
          <div class="rounded-md bg-bg-inset border border-border-secondary p-3 mb-3">
            <code class="text-sm font-mono text-text-primary break-all">
              {props.request.command}
            </code>
          </div>

          {/* File path (if present) */}
          <Show when={props.request.file_path}>
            <div class="text-xs text-text-secondary mb-3">
              <span class="text-text-tertiary">Path: </span>
              <span class="font-mono">{props.request.file_path}</span>
            </div>
          </Show>

          {/* Timeout indicator */}
          <div class="mb-4">
            <div class="flex items-center justify-between text-xs text-text-tertiary mb-1">
              <span>Auto-deny in</span>
              <span class="font-mono">{timeLeft()}s</span>
            </div>
            <div class="h-1 bg-bg-inset rounded-full overflow-hidden">
              <div
                class="h-full bg-warning rounded-full transition-all ease-linear"
                style={{
                  width: `${timeoutPercent()}%`,
                  'transition-duration': '1000ms',
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer: action buttons */}
        <div class="flex items-center justify-end gap-2 px-6 pb-5">
          <button
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onRespond('Deny')}
          >
            Deny
            <kbd class="ml-1.5 text-xs text-text-tertiary">N</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onRespond('AlwaysAllow')}
          >
            Always Allow
            <kbd class="ml-1.5 text-xs text-text-tertiary">A</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-white bg-accent hover:bg-accent-hover transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={() => props.onRespond('Approve')}
          >
            Allow Once
            <kbd class="ml-1.5 text-xs text-white/60">Y</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
