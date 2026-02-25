import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { ContextAttachment } from '@/lib/types';
import ContextChip from './ContextChip';

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    scores: {
      'att-1': {
        overall: 80,
        relevance: 90,
        tokenEfficiency: 70,
        isStale: false,
        label: 'high' as const,
      },
    },
  },
}));

function makeAttachment(overrides?: Partial<ContextAttachment>): ContextAttachment {
  return {
    id: 'att-1',
    reference: {
      relative_path: 'src/utils/helper.ts',
      name: 'helper.ts',
      extension: 'ts',
      estimated_tokens: 500,
      is_directory: false,
    },
    ...overrides,
  };
}

describe('ContextChip', () => {
  it('renders filename and token count', () => {
    render(() => <ContextChip attachment={makeAttachment()} onRemove={() => {}} />);
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('~500')).toBeInTheDocument();
  });

  it('formats large token counts with K suffix', () => {
    const att = makeAttachment({
      reference: {
        ...makeAttachment().reference,
        estimated_tokens: 5000,
      },
    });
    render(() => <ContextChip attachment={att} onRemove={() => {}} />);
    expect(screen.getByText('~5.0K')).toBeInTheDocument();
  });

  it('shows line range when present', () => {
    const att = makeAttachment({
      reference: { ...makeAttachment().reference, start_line: 10, end_line: 20 },
    });
    render(() => <ContextChip attachment={att} onRemove={() => {}} />);
    expect(screen.getByText('L10-20')).toBeInTheDocument();
  });

  it('omits line range when none is present', () => {
    render(() => <ContextChip attachment={makeAttachment()} onRemove={() => {}} />);
    expect(screen.queryByText(/^L\d/)).toBeNull();
  });

  it('renders quality indicator from score map', () => {
    render(() => <ContextChip attachment={makeAttachment()} onRemove={() => {}} />);
    expect(screen.getByLabelText('Context quality: high')).toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();
    render(() => <ContextChip attachment={makeAttachment()} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText('Remove helper.ts'));
    expect(onRemove).toHaveBeenCalledWith('att-1');
  });

  it('calls onEdit when chip is clicked', () => {
    const onEdit = vi.fn();
    const att = makeAttachment();
    render(() => <ContextChip attachment={att} onRemove={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByTitle(/helper\.ts/));
    expect(onEdit).toHaveBeenCalledWith(att);
  });

  it('sets button semantics when editable', () => {
    render(() => (
      <ContextChip attachment={makeAttachment()} onRemove={() => {}} onEdit={() => {}} />
    ));
    const chip = screen.getByTitle(/helper\.ts/);
    expect(chip).toHaveAttribute('role', 'button');
    expect(chip).toHaveAttribute('tabindex', '0');
  });

  it('remove click does not trigger edit', () => {
    const onRemove = vi.fn();
    const onEdit = vi.fn();
    render(() => <ContextChip attachment={makeAttachment()} onRemove={onRemove} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('Remove helper.ts'));
    expect(onRemove).toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });
});
