// src/components/common/QuickSessionSwitcher.tsx
// Ctrl+Tab session switcher overlay (CHI-258).

import type { Component } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { Session } from '@/lib/types';
import { sessionState, setActiveSession } from '@/stores/sessionStore';
import { switchSession } from '@/stores/conversationStore';
import { t } from '@/stores/i18nStore';

interface QuickSessionSwitcherProps {
  onClose: () => void;
}

const MAX_SESSIONS = 5;

function parseActivityTs(session: Session): number {
  const raw = session.updated_at ?? session.created_at;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRelativeTime(session: Session): string {
  const ts = parseActivityTs(session);
  if (!ts) return '';
  const delta = Date.now() - ts;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const QuickSessionSwitcher: Component<QuickSessionSwitcherProps> = (props) => {
  const sessions = createMemo(() =>
    [...sessionState.sessions]
      .sort((a, b) => parseActivityTs(b) - parseActivityTs(a))
      .slice(0, MAX_SESSIONS),
  );
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  createEffect(() => {
    const count = sessions().length;
    if (count <= 1) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((prev) => Math.min(prev, count - 1));
  });

  onMount(() => {
    setSelectedIndex(sessions().length > 1 ? 1 : 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
        return;
      }
      if (event.code !== 'Tab' || (!event.ctrlKey && !event.metaKey)) return;
      const count = sessions().length;
      if (count === 0) return;
      event.preventDefault();
      setSelectedIndex((prev) =>
        event.shiftKey ? (prev - 1 + count) % count : (prev + 1) % count,
      );
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control' && event.key !== 'Meta') return;
      selectCurrentAndClose();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  });

  function selectCurrentAndClose(): void {
    const target = sessions()[selectedIndex()];
    if (!target) {
      props.onClose();
      return;
    }
    const previous = sessionState.activeSessionId;
    if (target.id !== previous) {
      setActiveSession(target.id);
      void switchSession(target.id, previous);
    }
    props.onClose();
  }

  return (
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.45)', 'backdrop-filter': 'blur(4px)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        class="w-full max-w-[420px] rounded-xl overflow-hidden animate-fade-in"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-primary)',
          'box-shadow': 'var(--shadow-xl)',
        }}
      >
        <div
          class="px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] font-semibold"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-bg-secondary)',
            'border-bottom': '1px solid var(--color-border-secondary)',
          }}
        >
          {t('quickSwitcher.title')}
        </div>

        <Show
          when={sessions().length > 0}
          fallback={
            <p
              class="px-4 py-6 text-xs text-center"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t('quickSwitcher.noSessions')}
            </p>
          }
        >
          <div class="py-1">
            <For each={sessions()}>
              {(session, index) => {
                const isSelected = () => selectedIndex() === index();
                const isCurrent = () => session.id === sessionState.activeSessionId;
                return (
                  <button
                    class="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                    style={{
                      background: isSelected() ? 'var(--color-tab-active-bg)' : 'transparent',
                      color: 'var(--color-text-primary)',
                      'border-left': isSelected()
                        ? '3px solid var(--color-accent)'
                        : '3px solid transparent',
                    }}
                    onMouseEnter={() => setSelectedIndex(index())}
                    onClick={() => {
                      setSelectedIndex(index());
                      selectCurrentAndClose();
                    }}
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="truncate text-sm">{session.title ?? 'New Session'}</span>
                        <Show when={isCurrent()}>
                          <span
                            class="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{
                              background:
                                'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                              color: 'var(--color-accent)',
                            }}
                          >
                            {t('quickSwitcher.current')}
                          </span>
                        </Show>
                      </div>
                      <span class="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        {(session.model ?? '').replace('claude-', '')} ·{' '}
                        {formatRelativeTime(session)}
                      </span>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default QuickSessionSwitcher;
