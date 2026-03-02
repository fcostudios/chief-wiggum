// src/components/actions/LaneLogScreen.tsx
// CHI-221: Full supervisor terminal screen for a running action.
// Shows replayed output buffer + live streaming lines.

import {
  Component,
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { Search, ArrowDown, X, Square, RotateCcw, Bot } from 'lucide-solid';
import type { ActionOutputLine, CrossProjectRunningAction } from '@/lib/types';
import {
  getActionById,
  getActionOutput,
  listenToActionOutput,
  restartAction,
  stopAction,
  selectAction,
} from '@/stores/actionStore';
import { t } from '@/stores/i18nStore';
import { uiState, setActiveView } from '@/stores/uiStore';
import { addToast } from '@/stores/toastStore';

interface LaneLogScreenProps {
  lane: CrossProjectRunningAction;
  onBack: () => void;
}

const MAX_LINES = 2000;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const LaneLogScreen: Component<LaneLogScreenProps> = (props) => {
  const [lines, setLines] = createSignal<ActionOutputLine[]>([]);
  const [wrapMode, setWrapMode] = createSignal(false);
  const [tailMode, setTailMode] = createSignal(true);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  let scrollRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  function scrollToBottom() {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  }

  onMount(() => {
    const existing = getActionOutput(props.lane.action_id);
    setLines([...existing]);

    const unlisten = listenToActionOutput(props.lane.action_id, (logLine) => {
      setLines((prev) => {
        const next = [...prev, logLine];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
      if (tailMode()) {
        queueMicrotask(scrollToBottom);
      }
    });

    queueMicrotask(() => {
      if (tailMode()) scrollToBottom();
    });

    onCleanup(() => {
      unlisten();
    });
  });

  const filteredLines = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return lines();
    return lines().filter((l) => l.line.toLowerCase().includes(q));
  });

  const matchCount = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return 0;
    return filteredLines().length;
  });

  const isRunning = () => props.lane.status === 'running' || props.lane.status === 'starting';

  function handleRestart() {
    const action = getActionById(props.lane.action_id);
    if (!action) {
      addToast('Action definition is not loaded yet for restart', 'warning');
      return;
    }
    void restartAction(action);
  }

  function handleStop() {
    const confirmation = t('actions_center.lane.stop_confirm').replace('{name}', props.lane.action_name);
    if (!window.confirm(confirmation)) return;
    void stopAction(props.lane.action_id);
  }

  function handleAskAi() {
    const outputTail = lines()
      .slice(-20)
      .map((l) => l.line)
      .join('\n');
    const msg = `The action "${props.lane.action_name}" output:\n${outputTail || '(no output yet)'}\n\nWhat is happening and what should I do next?`;
    window.dispatchEvent(new CustomEvent('cw:prefill-input', { detail: { text: msg } }));
    setActiveView('conversation');
    selectAction(props.lane.action_id);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (searchOpen()) {
        setSearchOpen(false);
        setSearchQuery('');
        return;
      }
      props.onBack();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setSearchOpen(true);
      setTimeout(() => searchInputRef?.focus(), 50);
    }
  }

  return (
    <div class="flex h-full flex-col" onKeyDown={handleKeyDown} tabIndex={-1}>
      <div
        class="shrink-0 flex items-center gap-2 px-3 py-2"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <button
          class="text-xs hover:underline"
          style={{ color: 'var(--color-text-tertiary)' }}
          onClick={props.onBack}
        >
          ← Overview
        </button>
        <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
        <span class="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {props.lane.action_name}
        </span>

        <div class="flex-1" />

        <Show when={isRunning()}>
          <button
            class="p-1.5 rounded text-xs flex items-center gap-1 hover:opacity-80"
            style={{
              background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              color: 'var(--color-error)',
            }}
            onClick={handleStop}
          >
            <Square size={11} /> {t('actions_center.stop')}
          </button>
        </Show>
        <button
          class="p-1.5 rounded text-xs flex items-center gap-1 hover:opacity-80"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={handleRestart}
        >
          <RotateCcw size={11} /> {t('actions_center.restart')}
        </button>
        <button
          class="p-1.5 rounded text-xs flex items-center gap-1 hover:opacity-80"
          style={{
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-secondary)',
          }}
          onClick={handleAskAi}
        >
          <Bot size={11} /> {t('actions_center.ask_ai')}
        </button>
      </div>

      <div
        class="shrink-0 flex items-center gap-1 px-3 py-1.5"
        style={{
          background: '#161b22',
          'border-bottom': '1px solid #30363d',
        }}
      >
        <span class="text-[10px] font-mono" style={{ color: '#6e7681' }}>
          {lines().length} lines
        </span>
        <div class="flex-1" />
        <button
          class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{
            background: wrapMode() ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: wrapMode() ? '#e6edf3' : '#6e7681',
          }}
          aria-label={t('actions_center.log_screen.wrap')}
          onClick={() => setWrapMode((p) => !p)}
        >
          {t('actions_center.log_screen.wrap')}
        </button>
        <button
          class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{
            background: searchOpen() ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: searchOpen() ? '#e6edf3' : '#6e7681',
          }}
          aria-label={t('actions_center.log_screen.search')}
          onClick={() => {
            const next = !searchOpen();
            setSearchOpen(next);
            if (next) setTimeout(() => searchInputRef?.focus(), 50);
            if (!next) setSearchQuery('');
          }}
        >
          <Search size={11} class="inline mr-1" />
          {t('actions_center.log_screen.search')}
        </button>
        <button
          class="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{
            background: tailMode() ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: tailMode() ? '#e6edf3' : '#6e7681',
          }}
          aria-label={t('actions_center.log_screen.tail')}
          onClick={() => {
            setTailMode((p) => {
              const next = !p;
              if (next) queueMicrotask(scrollToBottom);
              return next;
            });
          }}
        >
          <ArrowDown size={11} class="inline mr-1" />
          {t('actions_center.log_screen.tail')}
        </button>
      </div>

      <Show when={searchOpen()}>
        <div
          class="shrink-0 flex items-center gap-2 px-3 py-1.5"
          style={{ background: '#1c2128', 'border-bottom': '1px solid #30363d' }}
        >
          <Search size={12} style={{ color: '#6e7681' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('actions_center.log_screen.search_placeholder')}
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="flex-1 bg-transparent text-xs font-mono outline-none"
            style={{ color: '#e6edf3' }}
          />
          <Show when={searchQuery().trim().length > 0}>
            <span class="text-[10px] font-mono" style={{ color: '#6e7681' }} role="status" aria-live="polite">
              {t('actions_center.log_screen.matches').replace('{n}', String(matchCount()))}
            </span>
          </Show>
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            style={{ color: '#6e7681' }}
            aria-label="Close search"
          >
            <X size={12} />
          </button>
        </div>
      </Show>

      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto overflow-x-auto min-h-[300px]"
        role="log"
        aria-live="off"
        aria-label={`Live action output for ${props.lane.action_name}`}
        style={{ background: '#0d1117' }}
      >
        <Show when={filteredLines().length > 0} fallback={<p class="px-3 py-2 text-xs font-mono" style={{ color: '#6e7681' }}>No output yet</p>}>
          <For each={filteredLines()}>
            {(entry) => {
              const isMatch =
                searchQuery().trim().length > 0 &&
                entry.line.toLowerCase().includes(searchQuery().trim().toLowerCase());
              return (
                <div
                  class={`px-3 py-0.5 text-xs font-mono leading-relaxed ${
                    wrapMode() ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                  }`}
                  style={{
                    color: entry.is_error ? '#f85149' : '#e6edf3',
                    background: isMatch ? 'rgba(255, 213, 0, 0.15)' : 'transparent',
                  }}
                >
                  <Show when={uiState.actionTechnicalMode}>
                    <span class="text-[10px] mr-2 select-none" style={{ color: '#6e7681' }}>
                      {`+${Math.round(entry.timestamp - (lines()[0]?.timestamp ?? entry.timestamp))}ms`}
                    </span>
                  </Show>
                  {entry.line}
                </div>
              );
            }}
          </For>
        </Show>

        <Show when={isRunning() && searchQuery().trim().length === 0}>
          <div class="px-3 py-0.5 text-xs font-mono" style={{ color: '#e6edf3' }}>
            <span class="animate-pulse">▌</span>
          </div>
        </Show>

        <Show when={!isRunning() && lines().length > 0}>
          <div
            class="px-3 py-2 text-[10px] font-mono text-center"
            style={{
              color: props.lane.status === 'completed' ? '#3fb950' : '#f85149',
              'border-top': `1px solid ${props.lane.status === 'completed' ? '#3fb95030' : '#f8514930'}`,
            }}
          >
            {props.lane.status === 'completed'
              ? t('actions_center.log_screen.exited_ok').replace(
                  '{duration}',
                  formatElapsed(props.lane.elapsed_ms),
                )
              : t('actions_center.log_screen.exited_err')
                  .replace('{code}', '1')
                  .replace('{duration}', formatElapsed(props.lane.elapsed_ms))}
          </div>
        </Show>
      </div>
    </div>
  );
};

export default LaneLogScreen;
