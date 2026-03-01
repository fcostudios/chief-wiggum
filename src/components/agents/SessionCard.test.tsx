import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import type { Session } from '@/lib/types';
import SessionCard from './SessionCard';

const baseSession: Session = {
  id: 'sess-1',
  title: 'Refactoring auth module',
  model: 'claude-sonnet-4-6',
  total_cost_cents: 463,
  cli_session_id: null,
  created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  project_id: null,
  pinned: false,
  status: null,
  parent_session_id: null,
  context_tokens: null,
  total_input_tokens: null,
  total_output_tokens: null,
};

describe('SessionCard', () => {
  it('renders session title', () => {
    const { getByText } = render(() => (
      <SessionCard
        session={baseSession}
        status="running"
        isActive={false}
        messageCount={47}
        projectName="my-app"
        onFocus={() => {}}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    expect(getByText(/Refactoring auth module/)).toBeTruthy();
  });

  it('shows running status indicator', () => {
    const { getByRole } = render(() => (
      <SessionCard
        session={baseSession}
        status="running"
        isActive={false}
        messageCount={47}
        projectName="my-app"
        onFocus={() => {}}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    expect(getByRole('img', { name: /running/i })).toBeTruthy();
  });

  it('shows cost display', () => {
    const { getByText } = render(() => (
      <SessionCard
        session={baseSession}
        status="not_started"
        isActive={false}
        messageCount={47}
        projectName="my-app"
        onFocus={() => {}}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    expect(getByText('$4.63')).toBeTruthy();
    expect(getByText('47 msgs')).toBeTruthy();
    expect(getByText(/my-app · claude-sonnet-4-6/)).toBeTruthy();
  });

  it('calls onFocus when Focus button clicked', () => {
    const onFocus = vi.fn();
    const { getByRole } = render(() => (
      <SessionCard
        session={baseSession}
        status="not_started"
        isActive={false}
        messageCount={47}
        projectName="my-app"
        onFocus={onFocus}
        onStop={() => {}}
        onSplit={() => {}}
      />
    ));
    getByRole('button', { name: /focus/i }).click();
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('calls onStop when Stop button clicked', () => {
    const onStop = vi.fn();
    const { getByRole } = render(() => (
      <SessionCard
        session={baseSession}
        status="running"
        isActive={false}
        messageCount={47}
        projectName="my-app"
        onFocus={() => {}}
        onStop={onStop}
        onSplit={() => {}}
      />
    ));
    getByRole('button', { name: /stop/i }).click();
    expect(onStop).toHaveBeenCalledOnce();
  });
});
