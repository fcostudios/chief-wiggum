import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

vi.mock('@/stores/projectStore', () => ({
  projectState: { activeProjectId: null },
}));

import WelcomeScreen from './WelcomeScreen';

describe('WelcomeScreen', () => {
  it('renders the Chief Wiggum wordmark', () => {
    render(() => <WelcomeScreen onPromptSelect={vi.fn()} model="claude-sonnet-4-6" />);
    expect(screen.getByText('Chief Wiggum')).toBeInTheDocument();
  });

  it('renders the active model badge', () => {
    render(() => <WelcomeScreen onPromptSelect={vi.fn()} model="claude-sonnet-4-6" />);
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
  });

  it('renders 4 prompt cards', () => {
    render(() => <WelcomeScreen onPromptSelect={vi.fn()} model="claude-sonnet-4-6" />);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4);
  });

  it('calls onPromptSelect when a card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(() => <WelcomeScreen onPromptSelect={onPromptSelect} model="claude-sonnet-4-6" />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onPromptSelect).toHaveBeenCalled();
  });

  it('renders a tips section', () => {
    render(() => <WelcomeScreen onPromptSelect={vi.fn()} model="claude-sonnet-4-6" />);
    expect(document.querySelector('[data-testid="welcome-tip"]')).toBeTruthy();
  });
});
