import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import TerminalTabs from './TerminalTabs';
import type { TerminalSession } from '@/stores/terminalStore';

const makeSession = (id: string): TerminalSession => ({
  terminal_id: id,
  shell: '/bin/zsh',
  cwd: '/home/user',
  status: 'running',
  exit_code: null,
  title: null,
  created_at: '2026-01-01T00:00:00Z',
});

describe('TerminalTabs', () => {
  it('renders a tab for each session', () => {
    const sessions = [makeSession('a'), makeSession('b')];
    const { getAllByRole } = render(() => (
      <TerminalTabs
        sessions={sessions}
        activeId="a"
        onSelect={() => {}}
        onClose={() => {}}
        onNew={() => {}}
      />
    ));

    expect(getAllByRole('tab')).toHaveLength(2);
  });

  it('marks the active tab', () => {
    const { getByRole } = render(() => (
      <TerminalTabs
        sessions={[makeSession('x')]}
        activeId="x"
        onSelect={() => {}}
        onClose={() => {}}
        onNew={() => {}}
      />
    ));

    expect(getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onNew when + button clicked', () => {
    const onNew = vi.fn();
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('y')]}
        activeId="y"
        onSelect={() => {}}
        onClose={() => {}}
        onNew={onNew}
      />
    ));

    fireEvent.click(getByLabelText('New terminal'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('z')]}
        activeId="z"
        onSelect={() => {}}
        onClose={onClose}
        onNew={() => {}}
      />
    ));

    fireEvent.click(getByLabelText('Close terminal z'));
    expect(onClose).toHaveBeenCalledWith('z');
  });
});
