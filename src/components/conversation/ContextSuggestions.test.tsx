import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileSuggestion } from '@/lib/types';

const mockAddFileReference = vi.fn();

let mockSuggestions: FileSuggestion[] = [];

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    get suggestions() {
      return mockSuggestions;
    },
  },
  addFileReference: (...args: unknown[]) => mockAddFileReference(...args),
}));

import ContextSuggestions from './ContextSuggestions';

describe('ContextSuggestions', () => {
  beforeEach(() => {
    mockAddFileReference.mockClear();
    mockSuggestions = [
      {
        path: 'src/utils/helper.ts',
        reason: 'Imported by main.ts',
        confidence: 0.9,
        estimated_tokens: 200,
      },
      {
        path: 'src/lib/config.ts',
        reason: 'Config dependency',
        confidence: 0.7,
        estimated_tokens: 150,
      },
    ];
  });

  it('renders suggestion buttons when suggestions exist', () => {
    render(() => <ContextSuggestions />);
    expect(screen.getByText('Suggested:')).toBeInTheDocument();
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
  });

  it('renders nothing when suggestions are empty', () => {
    mockSuggestions = [];
    const { container } = render(() => <ContextSuggestions />);
    expect(container.textContent).toBe('');
  });

  it('shows tooltip with path, reason, and token estimate', () => {
    render(() => <ContextSuggestions />);
    const btn = screen.getByText('helper.ts').closest('button');
    expect(btn).toHaveAttribute('title', expect.stringContaining('src/utils/helper.ts'));
    expect(btn).toHaveAttribute('title', expect.stringContaining('Imported by main.ts'));
    expect(btn).toHaveAttribute('title', expect.stringContaining('200'));
  });

  it('calls addFileReference when suggestion is clicked', () => {
    render(() => <ContextSuggestions />);
    fireEvent.click(screen.getByText('helper.ts').closest('button')!);

    expect(mockAddFileReference).toHaveBeenCalledTimes(1);
    const ref = mockAddFileReference.mock.calls[0][0] as {
      relative_path: string;
      name: string;
      extension: string | null;
      estimated_tokens: number;
      is_directory: boolean;
    };
    expect(ref.relative_path).toBe('src/utils/helper.ts');
    expect(ref.name).toBe('helper.ts');
    expect(ref.extension).toBe('ts');
    expect(ref.estimated_tokens).toBe(200);
    expect(ref.is_directory).toBe(false);
    expect(mockAddFileReference.mock.calls[0][1]).toBe('referenced');
  });

  it('extracts filename from path correctly', () => {
    render(() => <ContextSuggestions />);
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
    expect(screen.queryByText('src/utils/helper.ts')).not.toBeInTheDocument();
  });
});
