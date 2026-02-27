import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';

describe('StreamingThinkingBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders in compact mode by default', () => {
    render(() => <StreamingThinkingBlock content="Analyzing project structure and dependencies" />);

    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand thinking')).toBeInTheDocument();
  });

  it('shows compact summary when collapsed', () => {
    render(() => <StreamingThinkingBlock content="This is a short summary" />);
    expect(screen.getByText('This is a short summary')).toBeInTheDocument();
  });

  it('truncates long content in compact mode', () => {
    const longText = 'A'.repeat(100);
    render(() => <StreamingThinkingBlock content={longText} />);

    expect(screen.queryByText(longText)).toBeNull();
    expect(screen.getByText(/A{20,}\.\.\./)).toBeInTheDocument();
  });

  it('expands to show full content on click', () => {
    const content = 'Full thinking content appears only when expanded.';
    render(() => <StreamingThinkingBlock content={content} />);

    fireEvent.click(screen.getByLabelText('Expand thinking'));
    expect(screen.getByLabelText('Collapse thinking')).toBeInTheDocument();
    expect(screen.getByText(content, { exact: false })).toBeInTheDocument();
  });

  it('collapses back on second click', () => {
    render(() => <StreamingThinkingBlock content="Toggle content" />);

    fireEvent.click(screen.getByLabelText('Expand thinking'));
    expect(screen.getByLabelText('Collapse thinking')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Collapse thinking'));
    expect(screen.getByLabelText('Expand thinking')).toBeInTheDocument();
  });

  it('increments elapsed time each second', () => {
    render(() => <StreamingThinkingBlock content="Thinking..." />);
    expect(screen.getByText(/0s ·/)).toBeInTheDocument();

    vi.advanceTimersByTime(5000);
    expect(screen.getByText(/5s ·/)).toBeInTheDocument();

    vi.advanceTimersByTime(55000);
    expect(screen.getByText(/1m 0s ·/)).toBeInTheDocument();
  });

  it('displays token estimate', () => {
    render(() => <StreamingThinkingBlock content={'x'.repeat(100)} />);
    expect(screen.getByText(/~25 tokens/)).toBeInTheDocument();
  });

  it('shows animated dots indicator while streaming', () => {
    render(() => <StreamingThinkingBlock content="Thinking..." />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('displays K notation for large token counts', () => {
    render(() => <StreamingThinkingBlock content={'x'.repeat(8000)} />);
    expect(screen.getByText(/~2\.0K tokens/)).toBeInTheDocument();
  });
});
