import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { For } from 'solid-js';

const mockClipboardWriteText = vi.fn(() => Promise.resolve());

vi.mock('highlight.js', () => ({
  default: {
    getLanguage: () => true,
    highlight: (code: string) => ({ value: code }),
    highlightAuto: (code: string) => ({ value: code }),
  },
}));

vi.mock('@/components/common/ContextMenu', () => ({
  default: (props: {
    items: Array<{ label: string; onClick?: () => void; separator?: boolean }>;
    onClose: () => void;
  }) => (
    <div data-testid="code-context-menu" role="menu">
      <For each={props.items.filter((item) => !item.separator)}>
        {(item) => (
          <button
            role="menuitem"
            onClick={() => {
              item.onClick?.();
              props.onClose();
            }}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  ),
}));

vi.mock('@/stores/toastStore', () => ({
  addToast: vi.fn(),
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

  describe('code block context menu', () => {
    it('shows context menu on right-click of code block', async () => {
      const { container } = render(() => <MarkdownContent content={'```ts\nconst x = 1;\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('pre .copy-btn')).toBeTruthy();
      });

      const pre = container.querySelector('pre');
      expect(pre).toBeTruthy();
      fireEvent.contextMenu(pre as Element);
      await waitFor(() => {
        expect(screen.getByTestId('code-context-menu')).toBeInTheDocument();
      });
      expect(screen.getByRole('menuitem', { name: 'Copy code' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy as markdown' })).toBeInTheDocument();
    });

    it('Copy code writes raw code to clipboard', async () => {
      const { container } = render(() => <MarkdownContent content={'```\ncopy me\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('pre .copy-btn')).toBeTruthy();
      });

      const pre = container.querySelector('pre');
      expect(pre).toBeTruthy();
      fireEvent.contextMenu(pre as Element);
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Copy code' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy code' }));
      expect(mockClipboardWriteText).toHaveBeenCalledWith('copy me\n');
    });

    it('Copy as markdown wraps code in fenced block', async () => {
      const { container } = render(() => <MarkdownContent content={'```ts\nconst x = 1;\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('pre .copy-btn')).toBeTruthy();
      });

      const pre = container.querySelector('pre');
      expect(pre).toBeTruthy();
      fireEvent.contextMenu(pre as Element);
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Copy as markdown' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy as markdown' }));
      expect(mockClipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('```ts'));
    });
  });
});
