import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@solidjs/testing-library';
import MathRenderer from './MathRenderer';

const renderToStringMock = vi.fn((expr: string, opts?: { displayMode?: boolean }) => {
  if (expr === 'INVALID###') throw new Error('KaTeX parse error');
  return `<span class="${opts?.displayMode ? 'katex-display' : 'katex'}">${expr}</span>`;
});

vi.mock('katex', () => ({
  default: {
    renderToString: renderToStringMock,
  },
}));

vi.mock('@/lib/rendererRegistry', () => ({
  registerRenderer: vi.fn(),
}));

describe('MathRenderer (CHI-184)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderToStringMock.mockImplementation((expr: string, opts?: { displayMode?: boolean }) => {
      if (expr === 'INVALID###') throw new Error('KaTeX parse error');
      return `<span class="${opts?.displayMode ? 'katex-display' : 'katex'}">${expr}</span>`;
    });
  });

  it('renders inline math without display class when lang is math-inline', async () => {
    const { container, findByText } = render(() => (
      <MathRenderer code="E = mc^2" lang="math-inline" />
    ));
    await findByText('E = mc^2');
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.querySelector('.katex-display')).toBeNull();
  });

  it('renders block math with display class when lang is math-block', async () => {
    const { container } = render(() => <MathRenderer code="\\int_0^1 f(x) dx" lang="math-block" />);
    await waitFor(() => {
      expect(container.querySelector('.katex-display')).toBeTruthy();
    });
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('shows raw LaTeX fallback on parse error', async () => {
    const { container, findByText } = render(() => (
      <MathRenderer code="INVALID###" lang="math-inline" />
    ));
    await findByText('INVALID###');
    expect(container.textContent).toContain('INVALID###');
  });

  it('wraps block math in centered block container', async () => {
    const { container, findByText } = render(() => <MathRenderer code="x^2" lang="math-block" />);
    await findByText('x^2');
    const wrapper = container.querySelector('.math-block-wrapper');
    expect(wrapper).toBeTruthy();
  });

  it('renders without crash when code is empty string', () => {
    expect(() => render(() => <MathRenderer code="" lang="math-inline" />)).not.toThrow();
  });

  it('does not call KaTeX render synchronously before mount work runs', () => {
    expect(renderToStringMock).not.toHaveBeenCalled();
  });

  it('calls KaTeX render only after component mounts (lazy behavior)', async () => {
    render(() => <MathRenderer code="E=mc^2" lang="math-inline" />);

    expect(renderToStringMock).toHaveBeenCalledTimes(0);
    await waitFor(() => {
      expect(renderToStringMock).toHaveBeenCalledTimes(1);
    });
  });
});
