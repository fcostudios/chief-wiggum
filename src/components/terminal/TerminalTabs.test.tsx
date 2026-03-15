import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import TerminalTabs from './TerminalTabs';
import type { TerminalSession } from '@/stores/terminalStore';

const makeSession = (id: string, title?: string): TerminalSession => ({
  terminal_id: id,
  shell: '/bin/zsh',
  cwd: '/home/user',
  status: 'running',
  exit_code: null,
  title: title ?? null,
  created_at: '2026-01-01T00:00:00Z',
});

const noop = () => {};

describe('TerminalTabs', () => {
  it('renders a tab for each session', () => {
    const { getAllByRole } = render(() => (
      <TerminalTabs
        sessions={[makeSession('a'), makeSession('b')]}
        activeId="a"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));
    expect(getAllByRole('tab')).toHaveLength(2);
  });

  it('marks the active tab with aria-selected', () => {
    const { getAllByRole } = render(() => (
      <TerminalTabs
        sessions={[makeSession('x'), makeSession('y')]}
        activeId="x"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));
    const tabs = getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onNew when + button clicked', () => {
    const onNew = vi.fn();
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('y')]}
        activeId="y"
        onSelect={noop}
        onClose={noop}
        onNew={onNew}
        onRename={noop}
        onReorder={noop}
      />
    ));
    fireEvent.click(getByLabelText('Open new terminal session'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('z')]}
        activeId="z"
        onSelect={noop}
        onClose={onClose}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));
    fireEvent.click(getByLabelText('Close terminal session: zsh'));
    expect(onClose).toHaveBeenCalledWith('z');
  });

  it('shows custom title when session has one', () => {
    const { getByText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('t', 'My Server')]}
        activeId="t"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));
    expect(getByText('My Server')).toBeTruthy();
  });

  it('enters inline rename on double-click of tab label', async () => {
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('r')]}
        activeId="r"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));
    fireEvent.dblClick(getByLabelText('Rename terminal r'));
    const input = document.querySelector('input[data-rename-input]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
  });

  it('calls onRename with new title on Enter during rename', async () => {
    const onRename = vi.fn();
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('q')]}
        activeId="q"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={onRename}
        onReorder={noop}
      />
    ));
    fireEvent.dblClick(getByLabelText('Rename terminal q'));
    const input = document.querySelector('input[data-rename-input]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('q', 'Renamed');
  });

  it('cancels rename on Escape without calling onRename', () => {
    const onRename = vi.fn();
    const { getByLabelText } = render(() => (
      <TerminalTabs
        sessions={[makeSession('e')]}
        activeId="e"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={onRename}
        onReorder={noop}
      />
    ));
    fireEvent.dblClick(getByLabelText('Rename terminal e'));
    const input = document.querySelector('input[data-rename-input]') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(document.querySelector('input[data-rename-input]')).toBeNull();
  });

  it('tablist has the expected accessibility label', () => {
    const { getByRole } = render(() => (
      <TerminalTabs
        sessions={[makeSession('aria')]}
        activeId="aria"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));

    expect(getByRole('tablist')).toHaveAttribute('aria-label', 'Terminal sessions');
  });

  it('adds status-rich aria labels and ids to tabs', () => {
    const { getByRole } = render(() => (
      <TerminalTabs
        sessions={[{ ...makeSession('ax'), status: 'exited' }]}
        activeId="ax"
        onSelect={noop}
        onClose={noop}
        onNew={noop}
        onRename={noop}
        onReorder={noop}
      />
    ));

    const tab = getByRole('tab');
    expect(tab).toHaveAttribute('id', 'terminal-tab-ax');
    expect(tab).toHaveAttribute('aria-label', 'zsh, exited');
  });
});
