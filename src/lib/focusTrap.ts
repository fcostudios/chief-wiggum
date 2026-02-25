// src/lib/focusTrap.ts
// Minimal focus trap for modal/overlay dialogs.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap Tab/Shift+Tab focus within a container. Returns a cleanup function. */
export function createFocusTrap(container: HTMLElement): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  requestAnimationFrame(() => {
    const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  });

  return () => container.removeEventListener('keydown', handleKeyDown);
}

