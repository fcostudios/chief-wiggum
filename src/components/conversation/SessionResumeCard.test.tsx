import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import SessionResumeCard from './SessionResumeCard';

const baseResume = {
  lastMessagePreview: 'Added JWT refresh token logic',
  lastMessageFull: 'Added JWT refresh token logic and updated refresh handling in auth flow.',
  filesTouched: ['src/auth/service.ts', 'src/auth/types.ts'],
  openTodos: ['Write tests', 'Update docs'],
  lastTool: 'Write',
};

describe('SessionResumeCard', () => {
  it('renders last message preview', () => {
    render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));
    expect(screen.getByText(/Added JWT refresh token logic/)).toBeInTheDocument();
  });

  it('shows files touched count and paths', () => {
    render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));
    expect(screen.getByText(/src\/auth\/service\.ts/)).toBeInTheDocument();
  });

  it('shows open todos', () => {
    render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));
    expect(screen.getByText(/Write tests/)).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={onDismiss}
        onContinue={() => {}}
      />
    ));
    screen.getByLabelText('Dismiss resume card').click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onContinue when Continue button clicked', () => {
    const onContinue = vi.fn();
    render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={onContinue}
      />
    ));
    screen.getByRole('button', { name: /Continue/i }).click();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('shows full assistant message after expanding summary', () => {
    render(() => (
      <SessionResumeCard
        resume={baseResume}
        resumedAgo="3 hours ago"
        onDismiss={() => {}}
        onContinue={() => {}}
      />
    ));

    screen.getByRole('button', { name: /Show full summary/i }).click();
    expect(screen.getByText(/updated refresh handling in auth flow/i)).toBeInTheDocument();
  });
});
