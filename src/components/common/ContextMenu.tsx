import type { Component } from 'solid-js';
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ContextMenuItem {
  label: string;
  icon?: Component<{ size?: number }>;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

const ContextMenu: Component<ContextMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const itemButtons: Array<HTMLButtonElement | undefined> = [];
  const [adjustedPos, setAdjustedPos] = createSignal({ x: 0, y: 0 });
  const [activeItemIndex, setActiveItemIndex] = createSignal<number | null>(null);

  function isOpenShortcut(e: KeyboardEvent): boolean {
    return e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
  }

  function enabledItemIndexes(): number[] {
    const indexes: number[] = [];
    props.items.forEach((item, index) => {
      if (!item.separator && !item.disabled) indexes.push(index);
    });
    return indexes;
  }

  function focusEnabledItem(position: number): void {
    const enabled = enabledItemIndexes();
    if (enabled.length === 0) return;
    const clamped = Math.max(0, Math.min(position, enabled.length - 1));
    const itemIndex = enabled[clamped];
    setActiveItemIndex(itemIndex);
    itemButtons[itemIndex]?.focus();
  }

  function moveFocus(delta: 1 | -1): void {
    const enabled = enabledItemIndexes();
    if (enabled.length === 0) return;
    const current = activeItemIndex();
    const currentPos = current === null ? -1 : enabled.indexOf(current);
    const nextPos =
      currentPos === -1
        ? delta === 1
          ? 0
          : enabled.length - 1
        : (currentPos + delta + enabled.length) % enabled.length;
    focusEnabledItem(nextPos);
  }

  onMount(() => {
    setAdjustedPos({ x: props.x, y: props.y });
    requestAnimationFrame(() => {
      if (!menuRef) return;
      const rect = menuRef.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = props.x;
      let y = props.y;
      if (x + rect.width > vw) x = vw - rect.width - 8;
      if (y + rect.height > vh) y = vh - rect.height - 8;
      setAdjustedPos({ x: Math.max(4, x), y: Math.max(4, y) });
      requestAnimationFrame(() => {
        focusEnabledItem(0);
      });
    });

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (isOpenShortcut(e)) {
        // Prevent nested/open-key recursion when a menu is already open.
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        focusEnabledItem(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        const enabled = enabledItemIndexes();
        if (enabled.length > 0) focusEnabledItem(enabled.length - 1);
        return;
      }
      if (e.key === 'Tab') {
        props.onClose();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const current = activeItemIndex();
        if (current !== null) {
          e.preventDefault();
          itemButtons[current]?.click();
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape, true);
    });
  });

  return (
    <Portal>
      <div
        ref={menuRef}
        class="fixed z-[70] min-w-[170px] py-1 rounded-md animate-fade-in"
        style={{
          left: `${adjustedPos().x}px`,
          top: `${adjustedPos().y}px`,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-md)',
        }}
        role="menu"
        aria-orientation="vertical"
      >
        <For each={props.items}>
          {(item, index) => (
            <Show
              when={!item.separator}
              fallback={
                <div
                  class="my-1"
                  style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
                  role="separator"
                />
              }
            >
              <button
                ref={(el) => {
                  itemButtons[index()] = el;
                }}
                class={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  item.disabled
                    ? 'text-text-tertiary/40 cursor-not-allowed'
                    : item.danger
                      ? 'text-error hover:bg-error/10'
                      : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                }`}
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                role="menuitem"
                tabindex={activeItemIndex() === index() ? 0 : -1}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  props.onClose();
                }}
              >
                <Show when={item.icon}>
                  {(Icon) => {
                    const IconComp = Icon();
                    return <IconComp size={12} />;
                  }}
                </Show>
                <span>{item.label}</span>
              </button>
            </Show>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default ContextMenu;
