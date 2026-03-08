import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { QuestionRequest } from '@/lib/types';

const mockInvoke = vi.fn().mockResolvedValue(undefined);
const mockDismiss = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/stores/uiStore', () => ({
  dismissQuestionDialog: () => mockDismiss(),
}));

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (key === 'questionDialog.timeoutWarning') return `${params?.seconds}s remaining`;
    if (key === 'questionDialog.title') return 'Claude is asking...';
    if (key === 'questionDialog.cancel') return 'Cancel';
    if (key === 'questionDialog.submit') return 'Submit';
    if (key === 'questionDialog.otherLabel') return 'Other:';
    if (key === 'questionDialog.otherPlaceholder') return 'Type your answer...';
    if (key === 'questionDialog.defaultAnswer') return 'No answer provided';
    if (key === 'questionDialog.freeTextPlaceholder') return 'Type your answer...';
    return key;
  },
}));

import QuestionDialog from './QuestionDialog';

function makeRequest(questions: QuestionRequest['questions']): QuestionRequest {
  return {
    request_id: 'req-1',
    session_id: 'sess-1',
    questions,
  };
}

describe('QuestionDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders dialog with role="dialog" and aria-modal="true"', () => {
    const req = makeRequest([
      {
        question: 'Pick one',
        header: 'Choice',
        options: [{ label: 'A', description: '' }],
        multiSelect: false,
      },
    ]);
    render(() => <QuestionDialog request={req} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('traps Tab within the dialog', () => {
    const req = makeRequest([
      {
        question: 'Pick one',
        header: 'Choice',
        options: [
          { label: 'A', description: '' },
          { label: 'B', description: '' },
        ],
        multiSelect: false,
      },
    ]);
    render(() => <QuestionDialog request={req} />);

    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(1);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('renders countdown as an aria-live timer region', () => {
    const req = makeRequest([
      {
        question: 'Pick one',
        header: 'Choice',
        options: [{ label: 'A', description: '' }],
        multiSelect: false,
      },
    ]);
    render(() => <QuestionDialog request={req} />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('auto-submits on timeout with first option as default for unanswered', async () => {
    const req = makeRequest([
      {
        question: 'Pick one',
        header: 'Choice',
        options: [
          { label: 'Default', description: 'first option' },
          { label: 'Other', description: 'second' },
        ],
        multiSelect: false,
      },
    ]);
    render(() => <QuestionDialog request={req} />);

    vi.advanceTimersByTime(60_000);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'respond_question',
        expect.objectContaining({
          answers: expect.objectContaining({ 'Pick one': 'Default' }),
        }),
      );
    });
  });

  it('sends empty answers on Escape', async () => {
    const req = makeRequest([
      {
        question: 'Q?',
        header: 'H',
        options: [{ label: 'A', description: '' }],
        multiSelect: false,
      },
    ]);
    render(() => <QuestionDialog request={req} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(mockInvoke).toHaveBeenCalledWith(
      'respond_question',
      expect.objectContaining({
        answers: {},
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('renders free-text input only when question has zero options', () => {
    const req = makeRequest([
      { question: 'Type freely', header: 'Free', options: [], multiSelect: false },
    ]);
    render(() => <QuestionDialog request={req} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
  });

  it('handles empty questions array gracefully', async () => {
    const req = makeRequest([]);
    render(() => <QuestionDialog request={req} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'respond_question',
        expect.objectContaining({
          answers: {},
        }),
      );
    });
  });
});
