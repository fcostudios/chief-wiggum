import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
}));

import { ThinkingBlock } from './ThinkingBlock';

function makeThinkingMessage(content: string): Message {
  return {
    id: 'thinking-1',
    session_id: 'session-1',
    role: 'thinking',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

describe('ThinkingBlock', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders Thinking header', () => {
    render(() => <ThinkingBlock message={makeThinkingMessage('Reasoning output')} />);
    expect(screen.getByText('Thinking')).toBeInTheDocument();
  });

  it('toggles expanded state on header click', () => {
    render(() => <ThinkingBlock message={makeThinkingMessage('Toggle me')} />);

    const toggleBtn = screen.getByLabelText('Expand thinking');
    fireEvent.click(toggleBtn);
    expect(screen.getByLabelText('Collapse thinking')).toBeInTheDocument();
    expect(screen.getByText('Toggle me')).toBeInTheDocument();
  });

  it('copies thinking content to clipboard', () => {
    render(() => <ThinkingBlock message={makeThinkingMessage('copy this thinking')} />);

    const copyBtn = screen.getByLabelText('Copy thinking content');
    const before = copyBtn.innerHTML;
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy this thinking');
    expect(copyBtn.innerHTML).not.toBe(before);

    vi.advanceTimersByTime(2000);
    expect(copyBtn.innerHTML).toBe(before);
  });

  it('starts expanded while streaming', () => {
    render(() => (
      <ThinkingBlock message={makeThinkingMessage('Streaming reasoning')} isStreaming={true} />
    ));

    expect(screen.getByLabelText('Collapse thinking')).toBeInTheDocument();
    expect(screen.getByText('Streaming reasoning')).toBeInTheDocument();
  });
});
