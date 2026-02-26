import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import ContextMenu from './ContextMenu';

describe('ContextMenu', () => {
  const onClose = vi.fn();
  const onClick1 = vi.fn();
  const onClick2 = vi.fn();

  const baseItems = [
    { label: 'Copy', onClick: onClick1 },
    { label: 'Edit', onClick: onClick2 },
  ];

  beforeEach(() => {
    onClose.mockClear();
    onClick1.mockClear();
    onClick2.mockClear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders menu items with correct ARIA roles', () => {
    render(() => <ContextMenu items={baseItems} x={100} y={100} onClose={onClose} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('calls onClick and onClose when menu item is clicked', () => {
    render(() => <ContextMenu items={baseItems} x={100} y={100} onClose={onClose} />);
    fireEvent.click(screen.getByText('Copy'));
    expect(onClick1).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClick for disabled items', () => {
    const items = [{ label: 'Disabled', onClick: onClick1, disabled: true }];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    fireEvent.click(screen.getByText('Disabled'));
    expect(onClick1).not.toHaveBeenCalled();
  });

  it('renders separator items with separator role', () => {
    const items = [
      { label: 'First', onClick: onClick1 },
      { label: 'sep', separator: true },
      { label: 'Second', onClick: onClick2 },
    ];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('closes on Escape keypress', () => {
    render(() => <ContextMenu items={baseItems} x={100} y={100} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on mousedown outside menu', () => {
    render(() => <ContextMenu items={baseItems} x={100} y={100} onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies danger styling to danger items', () => {
    const items = [{ label: 'Delete', onClick: onClick1, danger: true }];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    const deleteBtn = screen.getByText('Delete');
    expect(deleteBtn.closest('button')?.className).toContain('text-error');
  });

  it('applies disabled styling to disabled items', () => {
    const items = [{ label: 'Locked', onClick: onClick1, disabled: true }];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    const btn = screen.getByText('Locked').closest('button');
    expect(btn).toBeDisabled();
    expect(btn?.className).toContain('cursor-not-allowed');
  });

  it('focuses the first enabled item on open', () => {
    const items = [
      { label: 'Disabled', disabled: true, onClick: onClick1 },
      { label: 'First Enabled', onClick: onClick1 },
      { label: 'Second Enabled', onClick: onClick2 },
    ];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);
    expect(screen.getByRole('menuitem', { name: 'First Enabled' })).toHaveFocus();
  });

  it('supports arrow navigation and wraps focus between enabled items', () => {
    const items = [
      { label: 'First', onClick: onClick1 },
      { label: 'sep', separator: true },
      { label: 'Disabled', onClick: onClick2, disabled: true },
      { label: 'Second', onClick: onClick2 },
    ];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);

    const first = screen.getByRole('menuitem', { name: 'First' });
    const second = screen.getByRole('menuitem', { name: 'Second' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(second).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(second).toHaveFocus();
  });

  it('supports Home/End and activates focused item with Enter', () => {
    const items = [
      { label: 'First', onClick: onClick1 },
      { label: 'Middle', onClick: onClick2 },
      { label: 'Last', onClick: onClick1 },
    ];
    render(() => <ContextMenu items={items} x={100} y={100} onClose={onClose} />);

    const first = screen.getByRole('menuitem', { name: 'First' });
    const last = screen.getByRole('menuitem', { name: 'Last' });

    fireEvent.keyDown(document, { key: 'End' });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Home' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClick1).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
