import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

vi.mock('./TodoWriteBlock', () => ({
  TodoWriteBlock: () => <div data-testid="todo-write-block">Todo Block</div>,
}));

import { ToolUseBlock } from './ToolUseBlock';

function makeMsg(toolName: string, toolInput: string): Message {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    role: 'tool_use',
    content: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

describe('ToolUseBlock', () => {
  it('delegates to TodoWriteBlock for TodoWrite tool calls', () => {
    const msg = makeMsg('TodoWrite', JSON.stringify({ todos: [] }));
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.getByTestId('todo-write-block')).toBeInTheDocument();
  });

  it('does NOT render TodoWriteBlock for Bash tool calls', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'ls -la' }));
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.queryByTestId('todo-write-block')).not.toBeInTheDocument();
  });

  it('renders default expand button for non-TodoWrite tool calls', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'npm test' }));
    render(() => <ToolUseBlock message={msg} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-label', 'Expand Bash tool use');
  });

  it('does NOT render TodoWriteBlock for Read tool calls', () => {
    const msg = makeMsg('Read', JSON.stringify({ file_path: '/src/foo.ts' }));
    render(() => <ToolUseBlock message={msg} />);
    expect(screen.queryByTestId('todo-write-block')).not.toBeInTheDocument();
  });

  it('expands default block to show tool input on click', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'cargo test' }));
    render(() => <ToolUseBlock message={msg} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"command":"cargo test"/)).toBeInTheDocument();
  });
});
