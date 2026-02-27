import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string, vars?: Record<string, unknown>) => {
    if (key === 'todoBlock.header') return 'Tasks';
    if (key === 'todoBlock.progress') return `${String(vars?.done)}/${String(vars?.total)} done`;
    if (key === 'todoBlock.allDone') return `All ${String(vars?.n)} done`;
    if (key === 'todoBlock.empty') return 'No tasks';
    return key;
  },
}));

import { TodoWriteBlock } from './TodoWriteBlock';

function makeMsg(todos: Array<{ content: string; status: string; activeForm: string }>): Message {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    role: 'tool_use',
    content: JSON.stringify({
      tool_name: 'TodoWrite',
      tool_input: JSON.stringify({ todos }),
    }),
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
}

describe('TodoWriteBlock', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('renders collapsed by default showing Tasks header and progress', () => {
    const msg = makeMsg([
      { content: 'Fix bug', status: 'completed', activeForm: 'Fixing bug' },
      { content: 'Run tests', status: 'in_progress', activeForm: 'Running tests' },
      { content: 'Update docs', status: 'pending', activeForm: 'Updating docs' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('1/3 done')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument();
  });

  it('sets aria-expanded="false" on toggle button when collapsed', () => {
    const msg = makeMsg([{ content: 'Task', status: 'pending', activeForm: 'Task' }]);
    render(() => <TodoWriteBlock message={msg} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to show all items when header button is clicked', () => {
    const msg = makeMsg([
      { content: 'Fix bug', status: 'completed', activeForm: 'Fixing bug' },
      { content: 'Run tests', status: 'pending', activeForm: 'Running tests' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('Run tests')).toBeInTheDocument();
  });

  it('sets aria-expanded="true" after expanding', () => {
    const msg = makeMsg([{ content: 'Task', status: 'pending', activeForm: 'Task' }]);
    render(() => <TodoWriteBlock message={msg} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses back on second click', () => {
    const msg = makeMsg([{ content: 'Fix bug', status: 'pending', activeForm: 'Fixing bug' }]);
    render(() => <TodoWriteBlock message={msg} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument();
  });

  it('shows "All N done" header when all tasks are completed', () => {
    const msg = makeMsg([
      { content: 'Step 1', status: 'completed', activeForm: 'Doing step 1' },
      { content: 'Step 2', status: 'completed', activeForm: 'Doing step 2' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    expect(screen.getByText('All 2 done')).toBeInTheDocument();
  });

  it('renders each expanded item with correct data-status attribute', () => {
    const msg = makeMsg([
      { content: 'Done task', status: 'completed', activeForm: 'Done' },
      { content: 'Active task', status: 'in_progress', activeForm: 'Active' },
      { content: 'Waiting task', status: 'pending', activeForm: 'Waiting' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    fireEvent.click(screen.getByRole('button'));

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('data-status', 'completed');
    expect(items[1]).toHaveAttribute('data-status', 'in_progress');
    expect(items[2]).toHaveAttribute('data-status', 'pending');
  });

  it('shows "No tasks" text when expanded with empty todos array', () => {
    const msg = makeMsg([]);
    render(() => <TodoWriteBlock message={msg} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('renders gracefully with malformed JSON content and does not throw', () => {
    const badMsg: Message = {
      id: 'msg-bad',
      session_id: 'session-1',
      role: 'tool_use',
      content: 'not valid { json }',
      model: null,
      input_tokens: null,
      output_tokens: null,
      thinking_tokens: null,
      cost_cents: null,
      is_compacted: false,
      created_at: new Date().toISOString(),
    };

    expect(() => render(() => <TodoWriteBlock message={badMsg} />)).not.toThrow();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('shows in_progress badge pill on header when items are in progress', () => {
    const msg = makeMsg([
      { content: 'Active', status: 'in_progress', activeForm: 'Active' },
      { content: 'Waiting', status: 'pending', activeForm: 'Waiting' },
    ]);
    render(() => <TodoWriteBlock message={msg} />);
    expect(screen.getByText(/⟳ 1/)).toBeInTheDocument();
  });
});
