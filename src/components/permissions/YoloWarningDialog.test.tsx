import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

const mockEnableYoloMode = vi.fn();
const mockDismissYoloDialog = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  enableYoloMode: () => mockEnableYoloMode(),
  dismissYoloDialog: () => mockDismissYoloDialog(),
}));

import YoloWarningDialog from './YoloWarningDialog';

describe('YoloWarningDialog', () => {
  beforeEach(() => {
    mockEnableYoloMode.mockClear();
    mockDismissYoloDialog.mockClear();
  });

  it('renders warning dialog with action buttons', () => {
    render(() => <YoloWarningDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable YOLO Mode/i })).toBeInTheDocument();
  });

  it('Escape dismisses the dialog', () => {
    render(() => <YoloWarningDialog />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockDismissYoloDialog).toHaveBeenCalled();
  });

  it('Enter enables YOLO mode', () => {
    render(() => <YoloWarningDialog />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(mockEnableYoloMode).toHaveBeenCalled();
  });

  it('clicking the backdrop dismisses the dialog', () => {
    render(() => <YoloWarningDialog />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(mockDismissYoloDialog).toHaveBeenCalled();
  });
});
