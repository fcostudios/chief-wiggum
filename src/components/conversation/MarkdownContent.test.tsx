import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { For } from 'solid-js';

const mockClipboardWriteText = vi.fn(() => Promise.resolve());
const mockSetActiveView = vi.fn();

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

vi.mock('@/stores/uiStore', () => ({
  setActiveView: (...args: unknown[]) =>
    (mockSetActiveView as (...inner: unknown[]) => unknown)(...args),
}));

import MarkdownContent from './MarkdownContent';
import { clearRenderers, registerRenderer } from '@/lib/rendererRegistry';

describe('MarkdownContent', () => {
  beforeEach(() => {
    mockClipboardWriteText.mockClear();
    mockSetActiveView.mockClear();
    clearRenderers();
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

  describe('GFM table rendering', () => {
    it('renders markdown table as HTML table', () => {
      const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
      const { container } = render(() => <MarkdownContent content={md} />);
      expect(container.querySelector('table')).toBeTruthy();
      expect(container.querySelectorAll('th').length).toBe(2);
      expect(container.querySelectorAll('td').length).toBe(4);
    });

    it('wraps table in horizontal scroll wrapper', async () => {
      const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
      const { container } = render(() => <MarkdownContent content={md} />);
      await waitFor(() => {
        expect(container.querySelector('.table-scroll-wrapper')).toBeTruthy();
      });
      expect(container.querySelector('.table-scroll-wrapper table')).toBeTruthy();
    });

    it('adds table copy button and copies table markdown', async () => {
      const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
      const { container } = render(() => <MarkdownContent content={md} />);
      await waitFor(() => {
        expect(container.querySelector('.table-scroll-wrapper .copy-btn')).toBeTruthy();
      });
      fireEvent.click(
        container.querySelector('.table-scroll-wrapper .copy-btn') as HTMLButtonElement,
      );
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        expect.stringContaining('| Name | Age |'),
      );
    });
  });

  describe('enhanced code blocks', () => {
    it('shows language badge when language is provided', async () => {
      const { container } = render(() => (
        <MarkdownContent content={'```typescript\nconst x = 1;\n```'} />
      ));
      await waitFor(() => {
        expect(container.querySelector('.code-lang-badge')).toBeTruthy();
      });
      expect(container.querySelector('.code-lang-badge')?.textContent).toBe('typescript');
    });

    it('does not show language badge for plain fenced code', async () => {
      const { container } = render(() => <MarkdownContent content={'```\nplain code\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('pre .copy-btn')).toBeTruthy();
      });
      expect(container.querySelector('.code-lang-badge')).toBeNull();
    });

    it('adds line number and word-wrap toggle buttons', async () => {
      const { container } = render(() => <MarkdownContent content={'```ts\nline1\nline2\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('.lines-toggle-btn')).toBeTruthy();
        expect(container.querySelector('.wrap-toggle-btn')).toBeTruthy();
      });
    });

    it('toggles wrapped class on code element', async () => {
      const { container } = render(() => (
        <MarkdownContent content={'```ts\nconst longLine = "a".repeat(200);\n```'} />
      ));
      await waitFor(() => {
        expect(container.querySelector('.wrap-toggle-btn')).toBeTruthy();
      });
      const wrapBtn = container.querySelector('.wrap-toggle-btn') as HTMLButtonElement;
      const code = container.querySelector('pre code') as HTMLElement;
      expect(code.classList.contains('code-wrapped')).toBe(false);
      fireEvent.click(wrapBtn);
      expect(code.classList.contains('code-wrapped')).toBe(true);
      fireEvent.click(wrapBtn);
      expect(code.classList.contains('code-wrapped')).toBe(false);
    });

    it('toggles line number gutter', async () => {
      const { container } = render(() => (
        <MarkdownContent content={'```ts\nline1\nline2\nline3\n```'} />
      ));
      await waitFor(() => {
        expect(container.querySelector('.lines-toggle-btn')).toBeTruthy();
      });
      const linesBtn = container.querySelector('.lines-toggle-btn') as HTMLButtonElement;
      expect(container.querySelector('.code-line-numbers')).toBeNull();
      fireEvent.click(linesBtn);
      expect(container.querySelector('.code-line-numbers')).toBeTruthy();
      const lineNums = container.querySelectorAll('.code-line-numbers span');
      expect(lineNums.length).toBeGreaterThanOrEqual(3);
    });
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
      expect(screen.getByRole('menuitem', { name: 'Open in terminal' })).toBeInTheDocument();
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

    it('Open in terminal switches to terminal view and copies code', async () => {
      const { container } = render(() => <MarkdownContent content={'```\necho \"hi\"\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('pre .copy-btn')).toBeTruthy();
      });

      const pre = container.querySelector('pre');
      expect(pre).toBeTruthy();
      fireEvent.contextMenu(pre as Element);
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Open in terminal' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('menuitem', { name: 'Open in terminal' }));
      expect(mockSetActiveView).toHaveBeenCalledWith('terminal');
      expect(mockClipboardWriteText).toHaveBeenCalledWith('echo "hi"\n');
    });

    it('opens code context menu via keyboard shortcut on focused code block', async () => {
      const { container } = render(() => <MarkdownContent content={'```ts\nconst x = 1;\n```'} />);
      await waitFor(() => {
        expect(container.querySelector('pre .copy-btn')).toBeTruthy();
      });

      const pre = container.querySelector('pre') as HTMLElement;
      expect(pre).toHaveAttribute('tabindex', '0');
      fireEvent.keyDown(pre, { key: 'F10', shiftKey: true });
      await waitFor(() => {
        expect(screen.getByTestId('code-context-menu')).toBeInTheDocument();
      });
    });
  });

  describe('renderer registry hydration', () => {
    it('renders a registered component in place of a matching code block', async () => {
      registerRenderer('custom-test', {
        label: 'Custom Test',
        component: (rendererProps: { code: string; lang: string }) => (
          <div data-testid="custom-renderer">
            {rendererProps.lang}:{rendererProps.code}
          </div>
        ),
      });

      const { container } = render(() => (
        <MarkdownContent content={'```custom-test\nhello world\n```'} />
      ));

      await waitFor(() => {
        expect(container.querySelector('[data-testid="custom-renderer"]')).toBeTruthy();
      });

      expect(container.querySelector('pre')).toBeNull();
      expect(container.querySelector('[data-testid="custom-renderer"]')?.textContent).toContain(
        'hello world',
      );
    });

    it('falls back to normal code block when no renderer is registered', async () => {
      const { container } = render(() => (
        <MarkdownContent content={'```python\nprint("hi")\n```'} />
      ));

      await waitFor(() => {
        expect(container.querySelector('pre')).toBeTruthy();
      });

      expect(container.querySelector('[data-cw-renderer]')).toBeNull();
      expect(container.querySelector('pre')).toBeTruthy();
    });
  });
});
