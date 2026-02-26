import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { ContextAttachment, ContextQualityScore } from '@/lib/types';

const mockCloseContextBreakdown = vi.fn();
const mockRemoveAttachment = vi.fn();
const mockRecalculateScores = vi.fn();

function makeAttachment(id: string, name: string, tokens: number): ContextAttachment {
  return {
    id,
    reference: {
      relative_path: `src/${name}`,
      name,
      extension: name.split('.').pop() ?? null,
      estimated_tokens: tokens,
      is_directory: false,
    },
  };
}

const highScore: ContextQualityScore = {
  overall: 85,
  relevance: 90,
  tokenEfficiency: 80,
  isStale: false,
  label: 'high',
};

const lowScore: ContextQualityScore = {
  overall: 20,
  relevance: 15,
  tokenEfficiency: 25,
  isStale: false,
  label: 'low',
};

let mockAttachments: ContextAttachment[] = [];
let mockScores: Record<string, ContextQualityScore> = {};

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    get attachments() {
      return mockAttachments;
    },
    get scores() {
      return mockScores;
    },
  },
  getTotalEstimatedTokens: () =>
    mockAttachments.reduce((sum, a) => sum + a.reference.estimated_tokens, 0),
  removeAttachment: (...args: unknown[]) => mockRemoveAttachment(...args),
  recalculateScores: () => mockRecalculateScores(),
}));

vi.mock('@/stores/uiStore', () => ({
  closeContextBreakdown: () => mockCloseContextBreakdown(),
}));

vi.mock('@/lib/contextScoring', () => ({
  qualityColor: (label: string) => {
    if (label === 'high') return 'green';
    if (label === 'medium') return 'yellow';
    return 'red';
  },
}));

import ContextBreakdownModal from './ContextBreakdownModal';

describe('ContextBreakdownModal', () => {
  beforeEach(() => {
    mockCloseContextBreakdown.mockClear();
    mockRemoveAttachment.mockClear();
    mockRecalculateScores.mockClear();
    mockAttachments = [
      makeAttachment('att-1', 'helper.ts', 5000),
      makeAttachment('att-2', 'config.ts', 3000),
    ];
    mockScores = {
      'att-1': highScore,
      'att-2': highScore,
    };
  });

  it('renders dialog with Context Budget title', () => {
    render(() => <ContextBreakdownModal />);
    expect(screen.getByRole('dialog', { name: 'Context Budget' })).toBeInTheDocument();
    expect(screen.getByText('Context Budget')).toBeInTheDocument();
  });

  it('shows total token count and percentage', () => {
    render(() => <ContextBreakdownModal />);
    expect(screen.getByText(/8\.0K/)).toBeInTheDocument();
    expect(screen.getByText(/100\.0K/)).toBeInTheDocument();
    expect(screen.getByText('8%')).toBeInTheDocument();
  });

  it('lists all attachments with filenames and token counts', () => {
    render(() => <ContextBreakdownModal />);
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
    expect(screen.getByText(/~5\.0K/)).toBeInTheDocument();
    expect(screen.getByText(/~3\.0K/)).toBeInTheDocument();
  });

  it('shows quality score badges', () => {
    render(() => <ContextBreakdownModal />);
    const highBadges = screen.getAllByText('high');
    expect(highBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "No files attached" when empty', () => {
    mockAttachments = [];
    mockScores = {};
    render(() => <ContextBreakdownModal />);
    expect(screen.getByText('No files attached')).toBeInTheDocument();
  });

  it('shows low quality warning when weakest attachment is low', () => {
    mockScores = {
      'att-1': highScore,
      'att-2': lowScore,
    };
    render(() => <ContextBreakdownModal />);
    expect(screen.getAllByText(/config\.ts/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/has low relevance/)).toBeInTheDocument();
  });

  it('calls removeAttachment when remove button is clicked', () => {
    render(() => <ContextBreakdownModal />);
    const removeButtons = screen.getAllByLabelText(/Remove/);
    fireEvent.click(removeButtons[0]);
    expect(mockRemoveAttachment).toHaveBeenCalledWith('att-1');
  });

  it('calls closeContextBreakdown when close button is clicked', () => {
    render(() => <ContextBreakdownModal />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(mockCloseContextBreakdown).toHaveBeenCalled();
  });
});
