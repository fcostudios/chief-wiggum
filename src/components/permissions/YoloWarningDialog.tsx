// src/components/permissions/YoloWarningDialog.tsx
// YOLO mode warning dialog per SPEC-001 §7.
// Modal: warns user about auto-approving all permissions.
// Keyboard: Enter=confirm, Escape=cancel.
// Focus trap: Tab cycles within dialog.

import type { Component } from 'solid-js';
import { onMount, onCleanup } from 'solid-js';
import { AlertTriangle } from 'lucide-solid';
import { enableYoloMode, dismissYoloDialog } from '@/stores/uiStore';

const YoloWarningDialog: Component = () => {
  let dialogRef: HTMLDivElement | undefined;

  // --- Keyboard shortcuts ---
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      enableYoloMode();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dismissYoloDialog();
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
    // Focus the cancel button (safer default)
    const cancelBtn = dialogRef?.querySelector<HTMLElement>('[data-cancel]');
    cancelBtn?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    // Overlay — click outside cancels
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="YOLO mode warning"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          dismissYoloDialog();
        }
      }}
    >
      <div
        ref={dialogRef}
        class="w-full max-w-[480px] bg-bg-elevated rounded-lg shadow-md border-l-4 border-l-warning"
      >
        {/* Header */}
        <div class="flex items-center gap-2 px-6 pt-5 pb-3">
          <AlertTriangle size={20} class="text-warning" />
          <h2 class="text-xl font-semibold text-text-primary">Enable YOLO Mode?</h2>
        </div>

        {/* Content */}
        <div class="px-6 pb-4">
          <p class="text-sm text-text-secondary mb-3">
            YOLO mode will{' '}
            <span class="font-semibold text-warning">auto-approve all permission requests</span>{' '}
            without showing the permission dialog.
          </p>
          <div class="rounded-md bg-error-muted border border-error/30 p-3 mb-3">
            <p class="text-sm text-error font-medium">
              This includes file writes, shell commands, and MCP tool calls. Only enable this if you
              trust the current session completely.
            </p>
          </div>
          <p class="text-xs text-text-tertiary">
            You can disable YOLO mode at any time with Cmd+Shift+Y.
          </p>
        </div>

        {/* Footer: action buttons */}
        <div class="flex items-center justify-end gap-2 px-6 pb-5">
          <button
            data-cancel
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={dismissYoloDialog}
          >
            Cancel
            <kbd class="ml-1.5 text-xs text-text-tertiary">Esc</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-white bg-warning hover:brightness-110 transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={enableYoloMode}
          >
            Enable YOLO Mode
            <kbd class="ml-1.5 text-xs text-white/60">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};

export default YoloWarningDialog;
