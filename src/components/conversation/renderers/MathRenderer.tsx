import { type Component, Show, createSignal, onMount } from 'solid-js';
import { registerRenderer, type RendererComponentProps } from '@/lib/rendererRegistry';

const MathRenderer: Component<RendererComponentProps> = (props) => {
  const [rendered, setRendered] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const isBlock = () => props.lang === 'math-block';

  onMount(async () => {
    if (!props.code.trim()) {
      setRendered('');
      return;
    }

    try {
      const katex = (await import('katex')).default;
      const html = katex.renderToString(props.code, {
        displayMode: isBlock(),
        throwOnError: true,
        output: 'html',
      });
      setRendered(html);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  return (
    <Show
      when={rendered() !== null}
      fallback={
        <Show
          when={error()}
          fallback={
            <span class="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
              Rendering math…
            </span>
          }
        >
          {(err) => (
            <span
              class="text-xs font-mono px-1 rounded"
              title={err()}
              style={{
                background: 'rgba(248, 81, 73, 0.08)',
                color: 'var(--color-text-secondary)',
                border: '1px solid rgba(248, 81, 73, 0.2)',
              }}
            >
              {props.code}
            </span>
          )}
        </Show>
      }
    >
      <Show
        when={isBlock()}
        fallback={
          // eslint-disable-next-line solid/no-innerhtml
          <span class="math-inline" innerHTML={rendered() ?? ''} />
        }
      >
        <div
          class="math-block-wrapper py-2 overflow-x-auto text-center"
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={rendered() ?? ''}
        />
      </Show>
    </Show>
  );
};

registerRenderer('math-inline', {
  component: MathRenderer,
  label: 'Math (inline)',
});

registerRenderer('math-block', {
  component: MathRenderer,
  label: 'Math (block)',
});

export default MathRenderer;
