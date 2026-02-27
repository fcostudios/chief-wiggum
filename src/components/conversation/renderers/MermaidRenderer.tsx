import { type Component, Show, createSignal, onMount } from 'solid-js';
import { registerRenderer, type RendererComponentProps } from '@/lib/rendererRegistry';
import { settingsState } from '@/stores/settingsStore';

const MermaidRenderer: Component<RendererComponentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [svg, setSvg] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [fullscreen, setFullscreen] = createSignal(false);

  onMount(async () => {
    try {
      const mermaid = (await import('mermaid')).default;
      const theme = settingsState.settings.appearance.theme;
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
      });

      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
      const { svg: renderedSvg } = await mermaid.render(id, props.code);
      setSvg(renderedSvg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  return (
    <>
      <Show
        when={svg()}
        fallback={
          <Show
            when={error()}
            fallback={
              <div
                class="text-xs font-mono px-3 py-2 rounded"
                style={{
                  background: 'var(--color-bg-inset)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Rendering diagram…
              </div>
            }
          >
            {(err) => (
              <div
                class="rounded overflow-hidden"
                style={{ border: '1px solid var(--color-tool-permission-deny)' }}
              >
                <div
                  class="text-[10px] px-2 py-1"
                  style={{
                    background: 'rgba(248, 81, 73, 0.08)',
                    color: 'var(--color-tool-permission-deny)',
                  }}
                >
                  Mermaid parse error — showing source
                </div>
                <pre
                  class="text-xs px-3 py-2 overflow-x-auto"
                  style={{
                    'font-family': 'var(--font-mono)',
                    background: 'var(--color-bg-inset)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <code>{props.code}</code>
                </pre>
                <div class="text-[10px] px-2 pb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  {err()}
                </div>
              </div>
            )}
          </Show>
        }
      >
        {(svgContent) => (
          <div
            ref={containerRef}
            class="relative group rounded overflow-hidden"
            style={{ border: '1px solid var(--color-border-secondary)' }}
          >
            <div
              class="p-3 overflow-auto"
              style={{ background: 'var(--color-bg-inset)', 'max-height': '500px' }}
              // eslint-disable-next-line solid/no-innerhtml
              innerHTML={svgContent()}
            />
            <button
              class="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-primary)',
                color: 'var(--color-text-secondary)',
              }}
              onClick={() => setFullscreen(true)}
              aria-label="Open diagram fullscreen"
            >
              ⛶ Fullscreen
            </button>
          </div>
        )}
      </Show>

      <Show when={fullscreen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ background: 'rgba(0, 0, 0, 0.85)' }}
          onClick={() => setFullscreen(false)}
          role="dialog"
          aria-label="Diagram fullscreen view"
          aria-modal="true"
        >
          <div
            class="relative rounded-lg overflow-auto max-w-[90vw] max-h-[90vh] p-6"
            style={{
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              class="absolute top-3 right-3 text-xs px-2 py-1 rounded"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-secondary)',
                color: 'var(--color-text-secondary)',
              }}
              onClick={() => setFullscreen(false)}
              aria-label="Close fullscreen"
            >
              ✕ Close
            </button>
            <div
              // eslint-disable-next-line solid/no-innerhtml
              innerHTML={svg()!}
            />
          </div>
        </div>
      </Show>
    </>
  );
};

// Self-register as a side effect — imported once from App.tsx.
registerRenderer('mermaid', {
  component: MermaidRenderer,
  label: 'Mermaid',
});

export default MermaidRenderer;
