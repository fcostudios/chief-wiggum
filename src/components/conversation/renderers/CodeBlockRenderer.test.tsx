import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import MarkdownContent from '../MarkdownContent';

const mockClipboardWriteText = vi.fn(() => Promise.resolve());

function renderCodeBlock(lang: string, code: string) {
  return render(() => <MarkdownContent content={`\`\`\`${lang}\n${code}\n\`\`\``} />);
}

describe('CodeBlock renderer toolbar (CHI-205)', () => {
  beforeEach(() => {
    mockClipboardWriteText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockClipboardWriteText },
    });
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders language badge and toolbar actions for fenced code blocks', async () => {
    const { container } = renderCodeBlock('typescript', 'const x = 1;');
    await waitFor(() => {
      expect(container.querySelector('.code-toolbar')).toBeTruthy();
    });
    expect(container.querySelector('.code-lang-badge')?.textContent).toBe('typescript');
    expect(container.querySelector('.lines-toggle-btn')).toBeTruthy();
    expect(container.querySelector('.wrap-toggle-btn')).toBeTruthy();
    expect(container.querySelector('.copy-btn')).toBeTruthy();
  });

  it('line-number toggle adds and removes gutter', async () => {
    const { container } = renderCodeBlock('ts', 'line1\nline2\nline3');
    await waitFor(() => {
      expect(container.querySelector('.lines-toggle-btn')).toBeTruthy();
    });
    const button = container.querySelector('.lines-toggle-btn') as HTMLButtonElement;
    expect(container.querySelector('.code-line-numbers')).toBeNull();

    fireEvent.click(button);
    expect(container.querySelector('.code-line-numbers')).toBeTruthy();
    expect(container.querySelectorAll('.code-line-numbers span').length).toBeGreaterThanOrEqual(3);

    fireEvent.click(button);
    expect(container.querySelector('.code-line-numbers')).toBeNull();
  });

  it('copy button writes raw code to clipboard', async () => {
    const { container } = renderCodeBlock('bash', 'echo hello world');
    await waitFor(() => {
      expect(container.querySelector('.copy-btn')).toBeTruthy();
    });
    fireEvent.click(container.querySelector('.copy-btn') as HTMLButtonElement);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('echo hello world\n');
  });

  it('copy button shows temporary success feedback then resets', async () => {
    const { container } = renderCodeBlock('bash', 'echo hello');
    await waitFor(() => {
      expect(container.querySelector('.copy-btn')).toBeTruthy();
    });
    const button = container.querySelector('.copy-btn') as HTMLButtonElement;
    const initialIcon = button.innerHTML;

    fireEvent.click(button);
    expect(button.style.color).toBe('var(--color-success)');
    expect(button.innerHTML).not.toBe(initialIcon);

    vi.advanceTimersByTime(2000);
    expect(button.style.color).toBe('');
    expect(button.innerHTML).toBe(initialIcon);
  });

  it('word-wrap toggle adds and removes wrapped class on code element', async () => {
    const { container } = renderCodeBlock('text', 'a very long line for wrapping checks');
    await waitFor(() => {
      expect(container.querySelector('.wrap-toggle-btn')).toBeTruthy();
    });
    const button = container.querySelector('.wrap-toggle-btn') as HTMLButtonElement;
    const code = container.querySelector('pre code') as HTMLElement;

    expect(code.classList.contains('code-wrapped')).toBe(false);
    fireEvent.click(button);
    expect(code.classList.contains('code-wrapped')).toBe(true);
    fireEvent.click(button);
    expect(code.classList.contains('code-wrapped')).toBe(false);
  });

  it('code block keeps keyboard focusability for context actions', async () => {
    const { container } = renderCodeBlock('ts', 'const y = 2;');
    await waitFor(() => {
      expect(container.querySelector('pre')).toBeTruthy();
    });
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre).toHaveAttribute('tabindex', '0');
    expect(pre.getAttribute('aria-label')).toContain('Code block');
  });
});
