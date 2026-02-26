import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';

const mockClipboardWriteText = vi.fn(() => Promise.resolve());

vi.mock('highlight.js', () => ({
  default: {
    getLanguage: () => true,
    highlight: (code: string) => ({ value: code }),
    highlightAuto: (code: string) => ({ value: code }),
  },
}));

import MarkdownContent from './MarkdownContent';

describe('MarkdownContent', () => {
  beforeEach(() => {
    mockClipboardWriteText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockClipboardWriteText },
    });

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders plain text content', () => {
    const { container } = render(() => <MarkdownContent content="Hello world" />);
    expect(container.textContent).toContain('Hello world');
  });

  it('renders markdown headings', () => {
    const { container } = render(() => <MarkdownContent content="# Title" />);
    expect(container.querySelector('h1')?.textContent).toBe('Title');
  });

  it('renders bold markdown text', () => {
    const { container } = render(() => <MarkdownContent content="This is **bold** text" />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  it('renders inline code spans', () => {
    const { container } = render(() => <MarkdownContent content="Use `console.log`" />);
    expect(container.querySelector('code')?.textContent).toBe('console.log');
  });

  it('renders code blocks and injects copy button', async () => {
    const { container } = render(() => <MarkdownContent content={'```ts\nconst x = 1;\n```'} />);
    expect(container.querySelector('pre')).toBeTruthy();
    await waitFor(() => {
      expect(container.querySelector('pre .copy-btn')).toBeTruthy();
    });
  });

  it('copy button writes code block content to clipboard', async () => {
    const { container } = render(() => <MarkdownContent content={'```\ncopy me\n```'} />);
    await waitFor(() => {
      expect(container.querySelector('pre .copy-btn')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('pre .copy-btn') as HTMLButtonElement);
    expect(mockClipboardWriteText).toHaveBeenCalledWith('copy me\n');
  });
});
