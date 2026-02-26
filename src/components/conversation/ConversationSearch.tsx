import type { Component } from 'solid-js';
import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { ALargeSmall, ChevronDown, ChevronUp, Search, X } from 'lucide-solid';
import type { Message } from '@/lib/types';
import { searchMessages, type SearchMatch } from '@/lib/messageSearch';

interface ConversationSearchProps {
  messages: Message[];
  onNavigate: (messageIndex: number) => void;
  onMatchesChange: (matches: SearchMatch[]) => void;
  onClose: () => void;
}

const ConversationSearch: Component<ConversationSearchProps> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal('');
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [matches, setMatches] = createSignal<SearchMatch[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(-1);

  onMount(() => {
    requestAnimationFrame(() => inputRef?.focus());
  });

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  createEffect(() => {
    const currentQuery = query().trim();
    const isCaseSensitive = caseSensitive();
    if (searchTimer) clearTimeout(searchTimer);

    if (!currentQuery) {
      setMatches([]);
      setActiveIndex(-1);
      props.onMatchesChange([]);
      return;
    }

    searchTimer = setTimeout(() => {
      const result = searchMessages(currentQuery, props.messages, { caseSensitive: isCaseSensitive });
      setMatches(result);
      setActiveIndex(result.length > 0 ? 0 : -1);
      props.onMatchesChange(result);
      if (result.length > 0) {
        props.onNavigate(result[0].messageIndex);
      }
    }, 150);
  });

  onCleanup(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  function navigateTo(index: number): void {
    const result = matches();
    if (result.length === 0) return;
    const normalized = ((index % result.length) + result.length) % result.length;
    setActiveIndex(normalized);
    props.onNavigate(result[normalized].messageIndex);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
      return;
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      navigateTo(activeIndex() - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      navigateTo(activeIndex() + 1);
    }
  }

  return (
    <div
      class="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-in"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-primary)',
        'box-shadow': 'var(--shadow-md)',
      }}
      role="search"
      aria-label="Search messages"
    >
      <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} class="shrink-0" />

      <input
        ref={inputRef}
        type="text"
        class="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary/50 outline-none min-w-[120px]"
        placeholder="Search messages..."
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />

      <Show when={query().length > 0}>
        <span class="text-[10px] font-mono shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
          {matches().length > 0 ? `${activeIndex() + 1} of ${matches().length}` : 'No results'}
        </span>
      </Show>

      <Show when={matches().length > 0}>
        <div class="flex items-center gap-0.5">
          <button
            class="p-1 rounded hover:bg-bg-secondary transition-colors"
            onClick={() => navigateTo(activeIndex() - 1)}
            aria-label="Previous match"
            title="Previous (Shift+Enter)"
          >
            <ChevronUp size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
          <button
            class="p-1 rounded hover:bg-bg-secondary transition-colors"
            onClick={() => navigateTo(activeIndex() + 1)}
            aria-label="Next match"
            title="Next (Enter)"
          >
            <ChevronDown size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>
      </Show>

      <button
        class={`p-1 rounded transition-colors ${
          caseSensitive()
            ? 'bg-accent/20 text-accent'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        onClick={() => setCaseSensitive((current) => !current)}
        aria-label="Toggle case sensitivity"
        aria-pressed={caseSensitive()}
        title="Case sensitive"
      >
        <ALargeSmall size={14} />
      </button>

      <button
        class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
        onClick={props.onClose}
        aria-label="Close search"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default ConversationSearch;
