import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import InlineRenameInput from './InlineRenameInput';

vi.mock('@/stores/i18nStore', () => ({
  t: (key: string) => {
    if (key === 'files.nameEmpty') return 'Name cannot be empty';
    if (key === 'files.invalidChar') return 'Invalid character';
    if (key === 'files.reservedName') return 'Reserved system name';
    return key;
  },
}));

describe('InlineRenameInput', () => {
  it('pre-fills with currentName', () => {
    render(() => (
      <InlineRenameInput currentName="hello.ts" depth={0} onConfirm={vi.fn()} onCancel={vi.fn()} />
    ));
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('hello.ts');
  });

  it('calls onConfirm with new name on Enter', () => {
    const onConfirm = vi.fn();
    render(() => (
      <InlineRenameInput currentName="old.ts" depth={0} onConfirm={onConfirm} onCancel={vi.fn()} />
    ));
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'new.ts' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('new.ts');
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(() => (
      <InlineRenameInput currentName="file.ts" depth={0} onConfirm={vi.fn()} onCancel={onCancel} />
    ));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when name is unchanged', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(() => (
      <InlineRenameInput
        currentName="same.ts"
        depth={0}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows validation error for invalid chars', () => {
    render(() => (
      <InlineRenameInput currentName="file.ts" depth={0} onConfirm={vi.fn()} onCancel={vi.fn()} />
    ));
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'bad<name.ts' } });
    expect(screen.getByText('Invalid character')).toBeInTheDocument();
  });
});
