import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { HintTooltip } from './HintTooltip';

describe('HintTooltip', () => {
  it('renders hint text and shortcut', () => {
    const { getByRole, getByText } = render(() => (
      <HintTooltip id="test-hint" text="Press / to search" shortcut="Cmd+/" onDismiss={() => {}} />
    ));

    expect(getByRole('tooltip')).toBeInTheDocument();
    expect(getByText('Press / to search')).toBeInTheDocument();
    expect(getByText('Cmd+/')).toBeInTheDocument();
  });

  it('calls onDismiss when close button clicked', async () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(() => (
      <HintTooltip id="test-hint" text="Hint text" onDismiss={onDismiss} />
    ));

    await getByRole('button', { name: 'Dismiss hint' }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not render after dismiss', async () => {
    const { getByRole, queryByRole } = render(() => (
      <HintTooltip id="test-hint" text="Hint" onDismiss={() => {}} />
    ));
    expect(queryByRole('tooltip')).toBeInTheDocument();
    await getByRole('button', { name: 'Dismiss hint' }).click();
    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
