import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

const mockPickAndCreateProject = vi.fn(async () => null);
const mockMarkOnboardingCompleted = vi.fn();

vi.mock('@/stores/projectStore', () => ({
  pickAndCreateProject: () => mockPickAndCreateProject(),
}));

vi.mock('@/stores/settingsStore', () => ({
  markOnboardingCompleted: () => mockMarkOnboardingCompleted(),
}));

import OnboardingFlow from './OnboardingFlow';

describe('OnboardingFlow', () => {
  beforeEach(() => {
    mockPickAndCreateProject.mockClear();
    mockMarkOnboardingCompleted.mockClear();
  });

  it('renders welcome step initially', () => {
    render(() => <OnboardingFlow />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Welcome to Chief Wiggum/i)).toBeInTheDocument();
  });

  it('shows four progress dots', () => {
    render(() => <OnboardingFlow />);
    const dots = document.querySelectorAll('[aria-hidden="true"] > div');
    expect(dots.length).toBe(4);
  });

  it('Next advances to the open project step', () => {
    render(() => <OnboardingFlow />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Open a Project/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Folder/i })).toBeInTheDocument();
  });

  it('Open Folder action calls pickAndCreateProject', () => {
    render(() => <OnboardingFlow />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Open Folder/i }));
    expect(mockPickAndCreateProject).toHaveBeenCalled();
  });

  it('Skip all completes onboarding', () => {
    render(() => <OnboardingFlow />);
    fireEvent.click(screen.getByRole('button', { name: /Skip all/i }));
    expect(mockMarkOnboardingCompleted).toHaveBeenCalled();
  });
});
