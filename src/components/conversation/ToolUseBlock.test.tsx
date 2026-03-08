import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    const btn = screen.getByRole('button', { name: 'Expand Bash tool use' });
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
    const btn = screen.getByRole('button', { name: 'Expand Bash tool use' });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"command":"cargo test"/)).toBeInTheDocument();
  });

  it('copy button calls clipboard.writeText with tool input', () => {
    const msg = makeMsg('Write', JSON.stringify({ path: 'src/app.ts', content: 'hello' }));
    render(() => <ToolUseBlock message={msg} />);

    fireEvent.click(screen.getByLabelText('Copy tool input'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ path: 'src/app.ts', content: 'hello' }),
    );
  });

  it('copy button feedback icon resets after 2 seconds', () => {
    const msg = makeMsg('Read', JSON.stringify({ path: 'src/app.ts' }));
    render(() => <ToolUseBlock message={msg} />);

    const copyBtn = screen.getByLabelText('Copy tool input');
    const before = copyBtn.innerHTML;
    fireEvent.click(copyBtn);
    const during = copyBtn.innerHTML;
    expect(during).not.toBe(before);

    vi.advanceTimersByTime(2000);
    expect(copyBtn.innerHTML).toBe(before);
  });

  it('renders completion check when isCompleted is true', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'npm run test' }));
    render(() => <ToolUseBlock message={msg} isCompleted={true} />);
    expect(screen.getByTestId('tool-use-complete')).toBeInTheDocument();
  });

  it('does not render completion check when isCompleted is false', () => {
    const msg = makeMsg('Bash', JSON.stringify({ command: 'npm run test' }));
    render(() => <ToolUseBlock message={msg} isCompleted={false} />);
    expect(screen.queryByTestId('tool-use-complete')).not.toBeInTheDocument();
  });
  it('shows question count summary for unanswered AskUserQuestion', () => {
    const input = {
      questions: [
        {
          question: 'Which auth method?',
          header: 'Auth method',
          options: [{ label: 'JWT', description: 'JSON Web Tokens' }],
          multiSelect: false,
        },
        {
          question: 'Which scope?',
          header: 'Scope',
          options: [{ label: 'Read', description: '' }],
          multiSelect: false,
        },
      ],
    };
    const msg = makeMsg('AskUserQuestion', JSON.stringify(input));
    render(() => <ToolUseBlock message={msg} />);

    expect(screen.getByText('2 questions')).toBeInTheDocument();
  });

  it('shows first answer summary for answered AskUserQuestion', () => {
    const input = {
      questions: [
        {
          question: 'Which auth?',
          header: 'Auth',
          options: [{ label: 'JWT', description: '' }],
          multiSelect: false,
        },
        {
          question: 'Which scope?',
          header: 'Scope',
          options: [{ label: 'Login', description: '' }],
          multiSelect: true,
        },
      ],
      answers: { 'Which auth?': 'JWT', 'Which scope?': 'Login, Signup' },
    };
    const msg = makeMsg('AskUserQuestion', JSON.stringify(input));
    render(() => <ToolUseBlock message={msg} />);

    expect(screen.getByText('Answered: JWT')).toBeInTheDocument();
  });

  it('uses AskUserQuestion icon in the header row', () => {
    const input = {
      questions: [{ question: 'Q?', header: 'H', options: [], multiSelect: false }],
      answers: { 'Q?': 'A' },
    };
    const msg = makeMsg('AskUserQuestion', JSON.stringify(input));
    const { container } = render(() => <ToolUseBlock message={msg} />);

    expect(container.querySelector('.lucide-message-circle-question-mark')).toBeInTheDocument();
    expect(container.querySelector('.lucide-wrench')).not.toBeInTheDocument();
  });
});
