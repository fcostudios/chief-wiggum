import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

const mockDismissTooltip = vi.fn();

vi.mock('@/stores/onboardingStore', () => ({
  dismissTooltip: (id: string) => mockDismissTooltip(id),
}));

import OnboardingTooltip from './OnboardingTooltip';

describe('OnboardingTooltip', () => {
  it('renders the message text', () => {
    render(() => <OnboardingTooltip id="onboarding:test" message="Try this feature" />);
    expect(screen.getByText('Try this feature')).toBeInTheDocument();
  });

  it('calls dismissTooltip when close button is clicked', () => {
    render(() => <OnboardingTooltip id="onboarding:test" message="Try this feature" />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockDismissTooltip).toHaveBeenCalledWith('onboarding:test');
  });
});
