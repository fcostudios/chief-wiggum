import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import { hasRenderer } from '@/lib/rendererRegistry';
import MermaidRenderer from './MermaidRenderer';

const initializeMock = vi.fn();
const renderMock = vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">diagram</svg>' });

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args),
  },
}));

vi.mock('@/stores/settingsStore', () => ({
  settingsState: {
    settings: {
      appearance: {
        theme: 'dark',
      },
    },
  },
}));

describe('MermaidRenderer (CHI-182)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SVG after mermaid resolves', async () => {
    const { container } = render(() => <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="mermaid-svg"]')).toBeTruthy();
    });
  });

  it('shows loading state before mermaid resolves', () => {
    const { getByText } = render(() => <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />);

    expect(getByText('Rendering diagram…')).toBeInTheDocument();
  });

  it('shows error fallback + raw code on parse failure', async () => {
    renderMock.mockRejectedValueOnce(new Error('Parse error: unexpected token'));

    const { getByText } = render(() => <MermaidRenderer code="invalid mermaid" lang="mermaid" />);

    await waitFor(() => {
      expect(getByText('Mermaid parse error — showing source')).toBeInTheDocument();
      expect(getByText('invalid mermaid')).toBeInTheDocument();
      expect(getByText(/Parse error: unexpected token/)).toBeInTheDocument();
    });
  });

  it('shows fullscreen button after SVG renders', async () => {
    const { getByLabelText } = render(() => <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />);

    await waitFor(() => {
      expect(getByLabelText('Open diagram fullscreen')).toBeInTheDocument();
    });
  });

  it('opens fullscreen dialog on fullscreen button click', async () => {
    const { getByLabelText, getByRole } = render(() => (
      <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />
    ));

    await waitFor(() => {
      expect(getByLabelText('Open diagram fullscreen')).toBeInTheDocument();
    });

    fireEvent.click(getByLabelText('Open diagram fullscreen'));
    expect(getByRole('dialog')).toBeInTheDocument();
  });

  it('closes fullscreen on close button click', async () => {
    const { getByLabelText, queryByRole } = render(() => (
      <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />
    ));

    await waitFor(() => {
      expect(getByLabelText('Open diagram fullscreen')).toBeInTheDocument();
    });

    fireEvent.click(getByLabelText('Open diagram fullscreen'));
    fireEvent.click(getByLabelText('Close fullscreen'));

    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes fullscreen on backdrop click', async () => {
    const { getByLabelText, getByRole, queryByRole } = render(() => (
      <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />
    ));

    await waitFor(() => {
      expect(getByLabelText('Open diagram fullscreen')).toBeInTheDocument();
    });

    fireEvent.click(getByLabelText('Open diagram fullscreen'));
    fireEvent.click(getByRole('dialog'));

    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('initializes mermaid with dark theme when settings say dark', async () => {
    render(() => <MermaidRenderer code={'graph TD\n  A-->B'} lang="mermaid" />);

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
    });
  });

  it('renderer is registered in the registry after module loads', () => {
    expect(hasRenderer('mermaid')).toBe(true);
  });
});
