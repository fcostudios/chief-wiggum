import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

const mockEnableYoloMode = vi.fn();
const mockDismissYoloDialog = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  enableYoloMode: () => mockEnableYoloMode(),
  dismissYoloDialog: () => mockDismissYoloDialog(),
}));

import AutoApproveWarningDialog from './AutoApproveWarningDialog';

describe('AutoApproveWarningDialog', () => {
  beforeEach(() => {
    mockEnableYoloMode.mockClear();
    mockDismissYoloDialog.mockClear();
  });

  it('renders warning dialog with action buttons', () => {
    render(() => <AutoApproveWarningDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable Auto-approve Mode/i })).toBeInTheDocument();
  });

  it('Escape dismisses the dialog', () => {
    render(() => <AutoApproveWarningDialog />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockDismissYoloDialog).toHaveBeenCalled();
  });

  it('Enter enables auto-approve mode', () => {
    render(() => <AutoApproveWarningDialog />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(mockEnableYoloMode).toHaveBeenCalled();
  });

  it('clicking the backdrop dismisses the dialog', () => {
    render(() => <AutoApproveWarningDialog />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(mockDismissYoloDialog).toHaveBeenCalled();
  });

  it('dialog title says Auto-approve, not YOLO', () => {
    render(() => <AutoApproveWarningDialog />);
    expect(screen.getByText(/Enable Auto-approve Mode\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/YOLO/i)).not.toBeInTheDocument();
  });
});
