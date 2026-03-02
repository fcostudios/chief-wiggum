import { type Component, Show, createSignal } from 'solid-js';
import { registerRenderer, type RendererComponentProps } from '@/lib/rendererRegistry';

interface ImagePayload {
  src: string;
  alt: string;
  title: string;
}

function parsePayload(code: string): ImagePayload | null {
  try {
    const parsed = JSON.parse(code) as Partial<ImagePayload>;
    if (!parsed.src || typeof parsed.src !== 'string') return null;
    return {
      src: parsed.src,
      alt: typeof parsed.alt === 'string' ? parsed.alt : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
    };
  } catch {
    return null;
  }
}

function isSafeSource(src: string): boolean {
  return src.startsWith('data:image/') || src.startsWith('https://');
}

const ImageRenderer: Component<RendererComponentProps> = (props) => {
  const [loaded, setLoaded] = createSignal(false);
  const [lightboxOpen, setLightboxOpen] = createSignal(false);
  const [errored, setErrored] = createSignal(false);
  const [showFull, setShowFull] = createSignal(false);

  const payload = () => parsePayload(props.code);

  return (
    <Show
      when={payload()}
      fallback={
        <span class="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          [image]
        </span>
      }
    >
      {(p) => (
        <Show
          when={isSafeSource(p().src)}
          fallback={
            <span
              class="text-xs px-2 py-0.5 rounded"
              style={{
                background: 'rgba(248, 81, 73, 0.08)',
                color: 'var(--color-text-secondary)',
                border: '1px solid rgba(248, 81, 73, 0.2)',
              }}
            >
              Image blocked
            </span>
          }
        >
          <span class="inline-block relative max-w-full align-top">
            <Show when={!loaded() && !errored()}>
              <span
                class="image-shimmer absolute inset-0 rounded"
                style={{
                  background:
                    'linear-gradient(90deg, var(--color-bg-inset), var(--color-bg-elevated), var(--color-bg-inset))',
                  'background-size': '200% 100%',
                  animation: 'shimmer 1.2s ease-in-out infinite',
                  'min-width': '120px',
                  'min-height': '60px',
                  display: 'block',
                }}
                aria-hidden="true"
              />
            </Show>

            <img
              src={p().src}
              alt={p().alt}
              title={p().title || undefined}
              loading="lazy"
              class="max-w-full rounded transition-opacity cursor-zoom-in"
              style={{
                'max-height': showFull() ? 'none' : '400px',
                opacity: loaded() ? '1' : '0',
                border: '1px solid var(--color-border-secondary)',
              }}
              onLoad={() => setLoaded(true)}
              onError={() => {
                setErrored(true);
                setLoaded(false);
              }}
              onClick={() => setLightboxOpen(true)}
              aria-label={p().alt ? `Image: ${p().alt}` : 'Image'}
            />

            <Show when={!errored()}>
              <button
                class="mt-1 text-[11px] font-medium transition-colors"
                style={{ color: showFull() ? 'var(--color-text-tertiary)' : 'var(--color-accent)' }}
                aria-label={showFull() ? 'Collapse image' : 'Show full image'}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFull((prev) => !prev);
                }}
              >
                {showFull() ? 'Collapse' : 'Show full'}
              </button>
            </Show>

            <Show when={errored()}>
              <span
                class="text-xs px-2 py-1 rounded inline-flex items-center"
                style={{
                  background: 'var(--color-bg-inset)',
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid var(--color-border-secondary)',
                }}
              >
                Failed to load image
              </span>
            </Show>
          </span>

          <Show when={lightboxOpen()}>
            <div
              class="fixed inset-0 z-50 flex items-center justify-center p-8"
              style={{ background: 'rgba(0, 0, 0, 0.85)' }}
              role="dialog"
              aria-label={p().alt ? `Image: ${p().alt}` : 'Image lightbox'}
              aria-modal="true"
              onClick={() => setLightboxOpen(false)}
            >
              <div
                class="relative rounded-lg overflow-hidden max-w-[90vw] max-h-[90vh]"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  background: 'var(--color-bg-primary)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  class="absolute top-2 right-2 z-10 text-xs px-2 py-1 rounded"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-secondary)',
                    color: 'var(--color-text-secondary)',
                  }}
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close lightbox"
                >
                  ✕ Close
                </button>
                <img
                  src={p().src}
                  alt={p().alt}
                  class="max-w-[90vw] max-h-[90vh] object-contain block"
                />
                <Show when={p().alt}>
                  <div
                    class="text-xs px-3 py-2 text-center"
                    style={{
                      background: 'var(--color-bg-primary)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {p().alt}
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </Show>
      )}
    </Show>
  );
};

registerRenderer('image', {
  component: ImageRenderer,
  label: 'Image',
});

export default ImageRenderer;
