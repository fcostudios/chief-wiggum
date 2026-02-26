import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { For } from 'solid-js';
import type { Message } from '@/lib/types';

const mockAddToast = vi.fn();
const mockClipboardWriteText = vi.fn(() => Promise.resolve());

vi.mock('@/stores/toastStore', () => ({
  addToast: (...args: unknown[]) => mockAddToast(...args),
}));

vi.mock('./MarkdownContent', () => ({
  default: (props: { content: string }) => (
    <div data-testid="markdown-content">{props.content}</div>
  ),
}));

vi.mock('@/components/common/ContextMenu', () => ({
  default: (props: {
    items: Array<{ label: string; onClick?: () => void; disabled?: boolean; separator?: boolean }>;
    onClose: () => void;
  }) => (
    <div data-testid="context-menu" role="menu">
      <For each={props.items.filter((item) => !item.separator)}>
        {(item) => (
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              props.onClose();
            }}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  ),
}));

import MessageBubble from './MessageBubble';

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    role: 'assistant',
    content: 'Hello, world!',
    model: 'claude-sonnet-4-6',
    input_tokens: 1500,
    output_tokens: 800,
    thinking_tokens: null,
    cost_cents: 250,
    is_compacted: false,
    created_at: '2026-02-26T12:00:00.000Z',
    ...overrides,
  };
}

describe('MessageBubble', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
    mockClipboardWriteText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockClipboardWriteText },
    });
  });

  it('renders assistant role label and content', () => {
    render(() => <MessageBubble message={makeMessage()} />);
    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Hello, world!');
  });

  it('renders user messages as plain text with You label', () => {
    render(() => <MessageBubble message={makeMessage({ role: 'user', content: 'My prompt' })} />);
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('My prompt')).toBeInTheDocument();
  });

  it('renders system role label', () => {
    render(() => (
      <MessageBubble message={makeMessage({ role: 'system', content: 'System note' })} />
    ));
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('System note');
  });

  it('shows Sonnet model badge for sonnet model IDs', () => {
    render(() => <MessageBubble message={makeMessage({ model: 'claude-sonnet-4-6' })} />);
    expect(screen.getByText('Sonnet')).toBeInTheDocument();
  });

  it('hides model badge when model is null', () => {
    render(() => (
      <MessageBubble message={makeMessage({ model: null, content: 'No model badge' })} />
    ));
    expect(screen.queryByText('Sonnet')).toBeNull();
    expect(screen.queryByText('Opus')).toBeNull();
    expect(screen.queryByText('Haiku')).toBeNull();
  });

  it('formats and displays token totals for assistant messages', () => {
    render(() => (
      <MessageBubble message={makeMessage({ input_tokens: 1500, output_tokens: 800 })} />
    ));
    expect(screen.getByText('2.3K tokens')).toBeInTheDocument();
  });

  it('formats and displays cost in dollars', () => {
    render(() => <MessageBubble message={makeMessage({ cost_cents: 250 })} />);
    expect(screen.getByText('$2.50')).toBeInTheDocument();
  });

  it('enters edit mode when edit button is clicked on user messages', () => {
    render(() => (
      <MessageBubble
        message={makeMessage({ role: 'user', content: 'Editable text' })}
        onEdit={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByLabelText('Edit message'));
    expect(screen.getByRole('textbox')).toHaveValue('Editable text');
    expect(screen.getByText('Save & Resend')).toBeInTheDocument();
  });

  it('Escape cancels edit mode', () => {
    render(() => (
      <MessageBubble
        message={makeMessage({ role: 'user', content: 'Cancel me' })}
        onEdit={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByLabelText('Edit message'));
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Cancel me')).toBeInTheDocument();
  });

  it('Ctrl+Enter saves edited message and calls onEdit with trimmed content', () => {
    const onEdit = vi.fn();
    render(() => (
      <MessageBubble
        message={makeMessage({ id: 'user-1', role: 'user', content: 'Original' })}
        onEdit={onEdit}
      />
    ));
    fireEvent.click(screen.getByLabelText('Edit message'));
    const textarea = screen.getByRole('textbox');
    fireEvent.input(textarea, { target: { value: '  Updated content  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onEdit).toHaveBeenCalledWith('user-1', 'Updated content');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('assistant action buttons support regenerate and copy', () => {
    const onRegenerate = vi.fn();
    render(() => (
      <MessageBubble
        message={makeMessage({ id: 'assistant-1', content: 'Copy this' })}
        onRegenerate={onRegenerate}
      />
    ));

    fireEvent.click(screen.getByLabelText('Regenerate response'));
    expect(onRegenerate).toHaveBeenCalledWith('assistant-1');

    fireEvent.click(screen.getByLabelText('Copy message'));
    expect(mockClipboardWriteText).toHaveBeenCalledWith('Copy this');
    expect(mockAddToast).toHaveBeenCalledWith('Copied to clipboard', 'success');
  });

  describe('context menu', () => {
    it('opens context menu on right-click', () => {
      render(() => <MessageBubble message={makeMessage()} />);
      const bubble = screen.getByText('Assistant').closest('[class*="rounded-lg"]');
      expect(bubble).toBeTruthy();
      fireEvent.contextMenu(bubble as Element);
      expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy message' })).toBeInTheDocument();
    });

    it('shows Edit and resend for user messages', () => {
      render(() => (
        <MessageBubble
          message={makeMessage({ role: 'user', content: 'User msg' })}
          onEdit={vi.fn()}
        />
      ));
      fireEvent.contextMenu(screen.getByText('User msg'));
      expect(screen.getByRole('menuitem', { name: 'Edit and resend' })).toBeInTheDocument();
    });

    it('shows Regenerate for assistant messages', () => {
      render(() => <MessageBubble message={makeMessage()} onRegenerate={vi.fn()} />);
      const bubble = screen.getByText('Assistant').closest('[class*="rounded-lg"]');
      expect(bubble).toBeTruthy();
      fireEvent.contextMenu(bubble as Element);
      expect(screen.getByRole('menuitem', { name: 'Regenerate' })).toBeInTheDocument();
    });

    it('shows Fork from here and Delete message actions', () => {
      render(() => <MessageBubble message={makeMessage()} onDelete={vi.fn()} onFork={vi.fn()} />);
      const bubble = screen.getByText('Assistant').closest('[class*="rounded-lg"]');
      expect(bubble).toBeTruthy();
      fireEvent.contextMenu(bubble as Element);
      expect(screen.getByRole('menuitem', { name: 'Fork from here' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Delete message' })).toBeInTheDocument();
    });

    it('calls onDelete when Delete message is clicked', () => {
      const onDelete = vi.fn();
      render(() => <MessageBubble message={makeMessage({ id: 'del-1' })} onDelete={onDelete} />);
      const bubble = screen.getByText('Assistant').closest('[class*="rounded-lg"]');
      expect(bubble).toBeTruthy();
      fireEvent.contextMenu(bubble as Element);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }));
      expect(onDelete).toHaveBeenCalledWith('del-1');
    });
  });
});
