import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import ImageRenderer from './ImageRenderer';

vi.mock('@/lib/rendererRegistry', () => ({ registerRenderer: vi.fn() }));

describe('ImageRenderer (CHI-185)', () => {
  it('renders an img element with the provided src', () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({
          src: 'https://example.com/img.png',
          alt: 'A test image',
          title: '',
        })}
        lang="image"
      />
    ));
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/img.png');
    expect(img?.getAttribute('alt')).toBe('A test image');
  });

  it('renders a loading shimmer before image loads', () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({
          src: 'https://example.com/img.png',
          alt: '',
          title: '',
        })}
        lang="image"
      />
    ));
    expect(container.querySelector('.image-shimmer')).toBeTruthy();
  });

  it('hides shimmer after image load event', () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({
          src: 'https://example.com/img.png',
          alt: '',
          title: '',
        })}
        lang="image"
      />
    ));
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.load(img as HTMLImageElement);
    expect(container.querySelector('.image-shimmer')).toBeNull();
  });

  it('blocks external non-HTTPS URLs', () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({
          src: 'http://insecure.example.com/img.png',
          alt: '',
          title: '',
        })}
        lang="image"
      />
    ));
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Image blocked');
  });

  it('allows data URI images', () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({
          src: 'data:image/png;base64,abc123',
          alt: '',
          title: '',
        })}
        lang="image"
      />
    ));
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('opens lightbox on image click', () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({
          src: 'https://example.com/img.png',
          alt: 'test',
          title: '',
        })}
        lang="image"
      />
    ));
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.load(img as HTMLImageElement);
    fireEvent.click(img as HTMLImageElement);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('renders gracefully when code is malformed JSON', () => {
    expect(() => render(() => <ImageRenderer code="not-json" lang="image" />)).not.toThrow();
  });

  describe('max-height and show-full toggle (CHI-206)', () => {
    it('applies a max-height constraint by default', async () => {
      const { container } = render(() => (
        <ImageRenderer
          code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'test' })}
          lang="image"
        />
      ));

      await waitFor(() => {
        const img = container.querySelector('img') as HTMLImageElement | null;
        expect(img).toBeTruthy();
        expect(img?.style.maxHeight).toBe('400px');
      });
    });

    it('renders a Show full button for constrained images', async () => {
      render(() => (
        <ImageRenderer
          code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'test' })}
          lang="image"
        />
      ));

      await waitFor(() => {
        expect(screen.getByLabelText('Show full image')).toBeInTheDocument();
      });
    });

    it('clicking Show full removes max-height and shows Collapse button', async () => {
      const { container } = render(() => (
        <ImageRenderer
          code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'test' })}
          lang="image"
        />
      ));

      await waitFor(() => {
        expect(screen.getByLabelText('Show full image')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Show full image'));

      await waitFor(() => {
        const img = container.querySelector('img') as HTMLImageElement | null;
        expect(img?.style.maxHeight).toBe('none');
        expect(screen.queryByLabelText('Show full image')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Collapse image')).toBeInTheDocument();
      });
    });
  });
});
