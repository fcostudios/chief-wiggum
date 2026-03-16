import { getCurrentWindow } from '@tauri-apps/api/window';

const NO_WINDOW_DRAG_SELECTOR = [
  '[data-no-window-drag="true"]',
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(', ');

export function beginWindowDrag(event: MouseEvent): void {
  if (event.button !== 0 || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest(NO_WINDOW_DRAG_SELECTOR)) return;

  try {
    void getCurrentWindow().startDragging();
  } catch {
    // Browser-mode preview / unit tests (no Tauri window API available).
  }
}
