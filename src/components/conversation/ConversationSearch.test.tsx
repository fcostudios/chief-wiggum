import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';
import ConversationSearch from './ConversationSearch';

function makeMsg(id: string, content: string, role: Message['role'] = 'assistant'): Message {
  return {
    id,
    session_id: 's1',
    role,
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

const messages: Message[] = [
  makeMsg('1', 'Hello world', 'user'),
  makeMsg('2', 'Hello! I can help', 'assistant'),
  makeMsg('3', 'Search for code', 'user'),
];

describe('ConversationSearch', () => {
  const onNavigate = vi.fn();
  const onMatchesChange = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderSearch() {
    return render(() => (
      <ConversationSearch
        messages={messages}
        onNavigate={onNavigate}
        onMatchesChange={onMatchesChange}
        onClose={onClose}
      />
    ));
  }

  it('renders search input and close button', () => {
    renderSearch();
    expect(screen.getByLabelText('Search query')).toBeInTheDocument();
    expect(screen.getByLabelText('Close search')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    renderSearch();
    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', () => {
    renderSearch();
    fireEvent.click(screen.getByLabelText('Close search'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('searches after debounce and shows match count', async () => {
    renderSearch();
    fireEvent.input(screen.getByLabelText('Search query'), { target: { value: 'hello' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.getByText(/of 2/)).toBeInTheDocument();
    });
    expect(onMatchesChange).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('shows no results text for non-matching query', async () => {
    renderSearch();
    fireEvent.input(screen.getByLabelText('Search query'), { target: { value: 'zzzzz' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.getByText('No results')).toBeInTheDocument();
    });
  });

  it('navigates to next match on Enter', async () => {
    renderSearch();
    fireEvent.input(screen.getByLabelText('Search query'), { target: { value: 'hello' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith(1);
  });

  it('navigates to previous match on Shift+Enter', async () => {
    renderSearch();
    const input = screen.getByLabelText('Search query');
    fireEvent.input(input, { target: { value: 'hello' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onNavigate).toHaveBeenLastCalledWith(1);
  });

  it('toggles case sensitivity state', () => {
    renderSearch();
    const toggle = screen.getByLabelText('Toggle case sensitivity');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
