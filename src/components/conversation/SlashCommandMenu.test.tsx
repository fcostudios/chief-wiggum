import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { SlashCommand } from '@/lib/types';
import SlashCommandMenu from './SlashCommandMenu';

function makeCommand(overrides?: Partial<SlashCommand>): SlashCommand {
  return {
    name: 'help',
    description: 'Show help information',
    category: 'Builtin',
    args_hint: null,
    source_path: null,
    from_sdk: false,
    ...overrides,
  };
}

const builtinCommands: SlashCommand[] = [
  makeCommand({ name: 'help', description: 'Show help', category: 'Builtin' }),
  makeCommand({ name: 'clear', description: 'Clear history', category: 'Builtin' }),
];

const mixedCommands: SlashCommand[] = [
  ...builtinCommands,
  makeCommand({
    name: 'deploy',
    description: 'Deploy app',
    category: 'Project',
    args_hint: '[env]',
  }),
  makeCommand({
    name: 'mcp__browser_click',
    description: 'Click element',
    category: 'Sdk',
    from_sdk: true,
  }),
];

describe('SlashCommandMenu', () => {
  it('renders nothing when closed or when command list is empty', () => {
    const closed = render(() => (
      <SlashCommandMenu
        isOpen={false}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(closed.container.querySelector('[role="listbox"]')).toBeNull();
    closed.unmount();

    const empty = render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={[]}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(empty.container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders listbox with options when open with commands', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('renders category group headers', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={mixedCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('SDK / MCP')).toBeInTheDocument();
  });

  it('displays command name with / prefix and description', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    expect(screen.getByText('/help')).toBeInTheDocument();
    expect(screen.getByText('Show help')).toBeInTheDocument();
  });

  it('displays args_hint when present', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={mixedCommands}
        highlightedIndex={2}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    expect(screen.getByText('[env]')).toBeInTheDocument();
  });

  it('marks highlighted option with aria-selected and data-highlighted', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={1}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[0]).toHaveAttribute('data-highlighted', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('data-highlighted', 'true');
  });

  it('calls onSelect when an option is clicked', () => {
    const onSelect = vi.fn();
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={onSelect}
        onClose={() => {}}
      />
    ));

    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onSelect).toHaveBeenCalledWith(builtinCommands[1]);
  });
});
