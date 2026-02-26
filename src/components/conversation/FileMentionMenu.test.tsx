import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileSearchResult } from '@/lib/types';
import FileMentionMenu from './FileMentionMenu';

function makeResult(overrides?: Partial<FileSearchResult>): FileSearchResult {
  return {
    relative_path: 'src/utils/helper.ts',
    name: 'helper.ts',
    extension: 'ts',
    score: 100,
    ...overrides,
  };
}

const twoResults: FileSearchResult[] = [
  makeResult({ name: 'helper.ts', relative_path: 'src/utils/helper.ts' }),
  makeResult({ name: 'main.ts', relative_path: 'src/main.ts' }),
];

describe('FileMentionMenu', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(() => (
      <FileMentionMenu
        isOpen={false}
        results={twoResults}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders nothing when results is empty', () => {
    const { container } = render(() => (
      <FileMentionMenu
        isOpen={true}
        results={[]}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders listbox with "Files" header when open', () => {
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    expect(screen.getByRole('listbox', { name: 'File mentions' })).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('displays filename and relative path for each result', () => {
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('src/utils/helper.ts')).toBeInTheDocument();
    expect(screen.getByText('main.ts')).toBeInTheDocument();
  });

  it('marks highlighted option with aria-selected', () => {
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={1}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect when option is clicked', () => {
    const onSelect = vi.fn();
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={0}
        onSelect={onSelect}
        onClose={() => {}}
      />
    ));

    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onSelect).toHaveBeenCalledWith(twoResults[1]);
  });
});
