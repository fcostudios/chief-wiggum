import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

let mockModel = 'claude-sonnet-4-6';
let mockActiveSessionId: string | null = 'session-1';

const mockChangeSessionModel = vi.fn((nextModel: string) => {
  mockModel = nextModel;
});

vi.mock('@/stores/sessionStore', () => ({
  sessionState: {
    get activeSessionId() {
      return mockActiveSessionId;
    },
  },
  getActiveSession: () =>
    mockActiveSessionId
      ? {
          id: mockActiveSessionId,
          model: mockModel,
        }
      : undefined,
  changeSessionModel: (nextModel: string) => mockChangeSessionModel(nextModel),
}));

import ModelSelector from './ModelSelector';

describe('ModelSelector', () => {
  beforeEach(() => {
    mockModel = 'claude-sonnet-4-6';
    mockActiveSessionId = 'session-1';
    mockChangeSessionModel.mockClear();
  });

  it('renders current model label', () => {
    render(() => <ModelSelector />);
    expect(screen.getByText('Sonnet 4.6')).toBeInTheDocument();
  });

  it('opens listbox and selects a different model', () => {
    render(() => <ModelSelector />);
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    const option = screen.getByRole('option', { name: 'Opus 4.6' });
    fireEvent.click(option);
    expect(mockChangeSessionModel).toHaveBeenCalledWith('claude-opus-4-6');
    expect(screen.queryByRole('listbox', { name: 'Model options' })).toBeNull();
  });

  it('closes the dropdown on Escape', () => {
    render(() => <ModelSelector />);
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByRole('listbox', { name: 'Model options' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Model options' })).toBeNull();
  });

  it('disables selector when there is no active session', () => {
    mockActiveSessionId = null;
    render(() => <ModelSelector />);
    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled();
  });
});
