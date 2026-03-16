// src/components/common/HelpMenu.tsx
// Title-bar help dropdown (CHI-254).

import type { Component } from 'solid-js';
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { BookOpen, Bug, HelpCircle, Info, Keyboard, Sparkles } from 'lucide-solid';
import { toggleKeyboardHelp } from '@/stores/uiStore';
import { t } from '@/stores/i18nStore';

interface HelpMenuProps {
  onOpenChangelog: () => void;
  onOpenAbout: () => void;
}

interface HelpMenuAction {
  label: string;
  icon: Component<{ size?: number }>;
  onClick: () => void;
}

const DOCS_URL = 'https://github.com/fcostudios/chief-wiggum#readme';
const ISSUES_URL = 'https://github.com/fcostudios/chief-wiggum/issues';

function openExternal(url: string): void {
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup) popup.opener = null;
}

const HelpMenu: Component<HelpMenuProps> = (props) => {
  const [openState, setOpenState] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;

  const actions = (): HelpMenuAction[] => [
    {
      label: t('help.keyboardShortcuts'),
      icon: Keyboard,
      onClick: () => {
        setOpenState(false);
        toggleKeyboardHelp();
      },
    },
    {
      label: t('help.documentation'),
      icon: BookOpen,
      onClick: () => {
        setOpenState(false);
        openExternal(DOCS_URL);
      },
    },
    {
      label: t('help.whatsNew'),
      icon: Sparkles,
      onClick: () => {
        setOpenState(false);
        props.onOpenChangelog();
      },
    },
    {
      label: t('help.reportIssue'),
      icon: Bug,
      onClick: () => {
        setOpenState(false);
        openExternal(ISSUES_URL);
      },
    },
    {
      label: t('help.about'),
      icon: Info,
      onClick: () => {
        setOpenState(false);
        props.onOpenAbout();
      },
    },
  ];

  onMount(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inMenu = menuRef?.contains(target);
      const inButton = buttonRef?.contains(target);
      if (!inMenu && !inButton) {
        setOpenState(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenState(false);
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    });
  });

  return (
    <div class="relative" style={{ '-webkit-app-region': 'no-drag' }} data-no-window-drag="true">
      <button
        ref={buttonRef}
        class="flex items-center justify-center w-10 h-full text-text-tertiary hover:text-text-primary transition-colors"
        style={{
          'transition-duration': 'var(--duration-fast)',
          '-webkit-app-region': 'no-drag',
        }}
        onClick={() => setOpenState((prev) => !prev)}
        aria-expanded={openState()}
        aria-haspopup="menu"
        aria-label={t('help.menuLabel')}
        title={t('help.menuLabel')}
      >
        <HelpCircle size={13} />
      </button>

      <Show when={openState()}>
        <div
          ref={menuRef}
          role="menu"
          class="absolute right-0 top-full mt-1 w-[220px] rounded-lg overflow-hidden animate-fade-in"
          style={{
            'z-index': '70',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            'box-shadow': 'var(--shadow-lg)',
            '-webkit-app-region': 'no-drag',
          }}
        >
          <For each={actions()}>
            {(item) => (
              <button
                class="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors hover:bg-bg-secondary"
                style={{
                  color: 'var(--color-text-primary)',
                  'transition-duration': 'var(--duration-fast)',
                }}
                onClick={item.onClick}
                role="menuitem"
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default HelpMenu;
