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
  const [adjustedPos, setAdjustedPos] = createSignal({ x: 0, y: 0 });

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
      >
        <For each={props.items}>
          {(item) => (
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
                class={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  item.disabled
                    ? 'text-text-tertiary/40 cursor-not-allowed'
                    : item.danger
                      ? 'text-error hover:bg-error/10'
                      : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                }`}
                style={{ 'transition-duration': 'var(--duration-fast)' }}
                role="menuitem"
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
