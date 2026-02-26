import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import type { PermissionRequest } from '@/lib/types';

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => key,
}));

import PermissionDialog from './PermissionDialog';

function makeRequest(overrides?: Partial<PermissionRequest>): PermissionRequest {
  return {
    request_id: 'perm-1',
    tool: 'Bash',
    command: 'ls -la',
    file_path: '/tmp/project',
    risk_level: 'medium',
    ...overrides,
  };
}

describe('PermissionDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders dialog with required label', () => {
    render(() => <PermissionDialog request={makeRequest()} onRespond={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('permissions.required')).toBeInTheDocument();
  });

  it('displays tool and command details', () => {
    render(() => <PermissionDialog request={makeRequest()} onRespond={vi.fn()} />);
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText('ls -la')).toBeInTheDocument();
  });

  it('shows file path when provided', () => {
    render(() => (
      <PermissionDialog request={makeRequest({ file_path: '/repo/src' })} onRespond={vi.fn()} />
    ));
    expect(screen.getByText('permissions.path')).toBeInTheDocument();
    expect(screen.getByText('/repo/src')).toBeInTheDocument();
  });

  it('does not render file path row when file_path is null', () => {
    render(() => (
      <PermissionDialog request={makeRequest({ file_path: null })} onRespond={vi.fn()} />
    ));
    expect(screen.queryByText('permissions.path')).not.toBeInTheDocument();
  });

  it('buttons and keyboard shortcuts call onRespond', () => {
    const onRespond = vi.fn();
    render(() => <PermissionDialog request={makeRequest()} onRespond={onRespond} />);

    fireEvent.click(screen.getByRole('button', { name: /permissions\.allowOnce/i }));
    fireEvent.keyDown(document, { key: 'A' });
    fireEvent.keyDown(document, { key: 'N' });

    expect(onRespond).toHaveBeenNthCalledWith(1, 'Approve');
    expect(onRespond).toHaveBeenNthCalledWith(2, 'AlwaysAllow');
    expect(onRespond).toHaveBeenNthCalledWith(3, 'Deny');
  });

  it('auto-denies after timeout', async () => {
    const onRespond = vi.fn();
    render(() => <PermissionDialog request={makeRequest()} onRespond={onRespond} />);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onRespond).toHaveBeenCalledWith('Deny');
  });
});
