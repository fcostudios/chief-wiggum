# CHI-184 + CHI-185 + CHI-219 + CHI-220 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close Epic A (LaTeX + Image rendering) and lay the foundation for Actions Center v2 (Backend + Overview UI).

**Architecture:**
- CHI-184/185 use the existing renderer registry + post-render hydration pattern in MarkdownContent.tsx — no changes to the core createEffect loop, only new marked extensions and new SolidJS renderer components registered as side effects.
- CHI-219 refactors `ActionBridgeMap` to track project metadata per action, adds DB migration v4, and adds new IPC commands.
- CHI-220 extends actionStore and builds the Overview UI (ActionsCenter + WarehouseCard), wiring into the existing tab system.

**Tech Stack:** SolidJS 1.9, Tauri v2/Rust, KaTeX (lazy), marked tokenizer extensions, TailwindCSS v4

---

## Pre-flight checklist

Before starting, verify:
- Current DB migration is v3 (confirmed in migrations.rs)
- `renderRegistry.ts` exports `RENDERER_ATTR`, `RENDERER_CODE_ATTR`, `RENDERER_LANG_ATTR`, `registerRenderer`, `findRenderer` ✓
- MarkdownContent.tsx createEffect already handles `[data-cw-renderer]` placeholders via solidRender ✓
- No existing KaTeX imports anywhere in src/ (grep confirmed) ✓
- `src/locales/en.json` top-level keys include: common, statusBar, status, titlebar, sidebar, etc. ✓
- `actionStore.ts` already has `outputs`, `statuses`, `recentEvents` ✓

---

## Part A: CHI-184 — Math/LaTeX Rendering (MathRenderer + KaTeX)

**Files:**
- Create: `src/components/conversation/renderers/MathRenderer.tsx`
- Modify: `src/components/conversation/MarkdownContent.tsx` (add math tokenizer extension + import)
- Test: `src/components/conversation/renderers/MathRenderer.test.tsx`

---

### Task A1: Install KaTeX

**Step 1: Install KaTeX**

```bash
npm install katex
npm install --save-dev @types/katex
```

**Step 2: Verify install**

```bash
npx tsc --noEmit
```
Expected: no KaTeX-related errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "CHI-184: install katex + types"
```

---

### Task A2: Write MathRenderer component (failing tests first)

**Step 1: Write the failing test file**

Create `src/components/conversation/renderers/MathRenderer.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import MathRenderer from './MathRenderer';

// Mock KaTeX to avoid heavy import in tests
vi.mock('katex', () => ({
  default: {
    renderToString: (expr: string, opts?: { displayMode?: boolean }) => {
      if (expr === 'INVALID###') throw new Error('KaTeX parse error');
      return `<span class="katex${opts?.displayMode ? '-display' : ''}">${expr}</span>`;
    },
  },
}));

// Mock settingsStore
vi.mock('@/stores/settingsStore', () => ({
  settingsState: { settings: { appearance: { theme: 'dark' } } },
}));

// Mock renderer registry
vi.mock('@/lib/rendererRegistry', () => ({
  registerRenderer: vi.fn(),
}));

describe('MathRenderer', () => {
  it('renders inline math without display class when lang is math-inline', () => {
    const { container } = render(() => (
      <MathRenderer code="E = mc^2" lang="math-inline" />
    ));
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.querySelector('.katex-display')).toBeNull();
  });

  it('renders block math with display class when lang is math-block', () => {
    const { container } = render(() => (
      <MathRenderer code="\\int_0^1 f(x) dx" lang="math-block" />
    ));
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('shows raw LaTeX fallback on parse error', () => {
    const { container } = render(() => (
      <MathRenderer code="INVALID###" lang="math-inline" />
    ));
    // Should show the raw expression, not throw
    expect(container.textContent).toContain('INVALID###');
  });

  it('wraps block math in centered block container', () => {
    const { container } = render(() => (
      <MathRenderer code="x^2" lang="math-block" />
    ));
    const wrapper = container.querySelector('.math-block-wrapper');
    expect(wrapper).toBeTruthy();
  });

  it('renders without crash when code is empty string', () => {
    expect(() => render(() => <MathRenderer code="" lang="math-inline" />)).not.toThrow();
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
npx vitest run src/components/conversation/renderers/MathRenderer.test.tsx
```
Expected: FAIL — `MathRenderer` module not found

---

### Task A3: Implement MathRenderer.tsx

**Step 1: Create `src/components/conversation/renderers/MathRenderer.tsx`**

```typescript
// src/components/conversation/renderers/MathRenderer.tsx
// CHI-184: KaTeX math rendering — inline ($...$) and block ($$...$$).
// Lazy-loads KaTeX. Registered as a side effect (imported once from App.tsx).

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
            <span
              class="text-xs font-mono"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              …
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
          <span class="math-inline" innerHTML={rendered()!} />
        }
      >
        <div
          class="math-block-wrapper py-2 overflow-x-auto text-center"
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={rendered()!}
        />
      </Show>
    </Show>
  );
};

// Self-register — imported once from App.tsx.
registerRenderer('math-inline', {
  component: MathRenderer,
  label: 'Math (inline)',
});
registerRenderer('math-block', {
  component: MathRenderer,
  label: 'Math (block)',
});

export default MathRenderer;
```

**Step 2: Run tests — verify they pass**

```bash
npx vitest run src/components/conversation/renderers/MathRenderer.test.tsx
```
Expected: PASS (5 tests)

---

### Task A4: Add math tokenizer extensions to MarkdownContent

**Step 1: Read the top of MarkdownContent.tsx to find where to add the extension**

The `marked.use()` call for code blocks is at the top of the file (before the component definition). We add math tokenizer extensions in a separate `marked.use()` call.

**Step 2: Modify `src/components/conversation/MarkdownContent.tsx`**

Add the import at the top (after existing imports):
```typescript
import MathRenderer from '@/components/conversation/renderers/MathRenderer';
// Side-effect import registers math renderers
void MathRenderer;
```

Add the math tokenizer extension before the existing `marked.use({renderer: ...})` call:

```typescript
// Math tokenizer extensions — must be registered BEFORE the code renderer.
// Block math: $$...$$ on its own line(s)
// Inline math: $...$ within text
marked.use({
  extensions: [
    {
      // Block math: $$\n...\n$$
      name: 'mathBlock',
      level: 'block',
      start(src: string) {
        const idx = src.indexOf('$$');
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string) {
        const match = src.match(/^\$\$([\s\S]+?)\$\$/);
        if (match) {
          return {
            type: 'mathBlock',
            raw: match[0],
            text: match[1].trim(),
          };
        }
        return undefined;
      },
      renderer(token: { text: string }) {
        const encoded = encodeRendererCode(token.text);
        return `<div ${RENDERER_ATTR}="math-block" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="math-block" class="cw-renderer-placeholder"></div>`;
      },
    },
    {
      // Inline math: $...$
      name: 'mathInline',
      level: 'inline',
      start(src: string) {
        const idx = src.indexOf('$');
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string) {
        // Avoid matching $$ (block math)
        const match = src.match(/^\$(?!\$)((?:[^$]|\\.)+?)\$/);
        if (match) {
          return {
            type: 'mathInline',
            raw: match[0],
            text: match[1].trim(),
          };
        }
        return undefined;
      },
      renderer(token: { text: string }) {
        const encoded = encodeRendererCode(token.text);
        return `<span ${RENDERER_ATTR}="math-inline" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="math-inline" class="cw-renderer-placeholder"></span>`;
      },
    },
  ],
});
```

Also add `encodeRendererCode` helper near the top (or check if it already exists — if not, add it):
```typescript
// encode/decode helpers for renderer placeholder attributes
function encodeRendererCode(code: string): string {
  return encodeURIComponent(code);
}
function decodeRendererCode(encoded: string): string {
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}
```

> **Important:** Check if `encodeRendererCode` / `decodeRendererCode` already exist in MarkdownContent.tsx — they may already be defined. Look for `encodeURIComponent` or `btoa` usage in the file. The existing code renderer uses `encodeURIComponent` for the `data-cw-code` attribute (the `encoded` variable in the `code()` renderer), so this helper may already exist or be inlined. Reuse the existing pattern.

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/conversation/renderers/MathRenderer.tsx \
        src/components/conversation/renderers/MathRenderer.test.tsx \
        src/components/conversation/MarkdownContent.tsx
git commit -m "CHI-184: add KaTeX math renderer (inline + block) via marked tokenizer extensions"
```

---

### Task A5: Add KaTeX CSS link to index.html

KaTeX requires its stylesheet to render correctly.

**Step 1: Add to `index.html`**

```html
<!-- KaTeX stylesheet (lazy-loaded renderer, but CSS must be present) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
```

> **Note:** Alternatively, import `katex/dist/katex.min.css` directly in MathRenderer.tsx if the project supports CSS imports from node_modules. Check `vite.config.ts` — if CSS modules are supported, use `import 'katex/dist/katex.min.css'` inside MathRenderer.tsx `onMount`. The CDN link is simpler for now.

**Step 2: Run lint + build**

```bash
npx eslint . && npx vite build
```
Expected: clean

**Step 3: Commit**

```bash
git add index.html
git commit -m "CHI-184: add KaTeX stylesheet to index.html"
```

---

## Part B: CHI-185 — Inline Image Rendering (ImageRenderer)

**Files:**
- Create: `src/components/conversation/renderers/ImageRenderer.tsx`
- Modify: `src/components/conversation/MarkdownContent.tsx` (add image renderer override + import)
- Test: `src/components/conversation/renderers/ImageRenderer.test.tsx`

---

### Task B1: Write ImageRenderer tests (failing first)

**Step 1: Create `src/components/conversation/renderers/ImageRenderer.test.tsx`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import ImageRenderer from './ImageRenderer';

vi.mock('@/lib/rendererRegistry', () => ({ registerRenderer: vi.fn() }));

describe('ImageRenderer', () => {
  it('renders an img element with the provided src', () => {
    const { container } = render(() => (
      <ImageRenderer code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'A test image', title: '' })} lang="image" />
    ));
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/img.png');
    expect(img?.getAttribute('alt')).toBe('A test image');
  });

  it('renders a loading shimmer before image loads', () => {
    const { container } = render(() => (
      <ImageRenderer code={JSON.stringify({ src: 'https://example.com/img.png', alt: '', title: '' })} lang="image" />
    ));
    // Shimmer should be visible before load event
    expect(container.querySelector('.image-shimmer')).toBeTruthy();
  });

  it('hides shimmer after image load event', async () => {
    const { container } = render(() => (
      <ImageRenderer code={JSON.stringify({ src: 'https://example.com/img.png', alt: '', title: '' })} lang="image" />
    ));
    const img = container.querySelector('img')!;
    fireEvent.load(img);
    expect(container.querySelector('.image-shimmer')).toBeNull();
  });

  it('blocks external non-data URLs that are not HTTPS', () => {
    const { container } = render(() => (
      <ImageRenderer code={JSON.stringify({ src: 'http://insecure.example.com/img.png', alt: '', title: '' })} lang="image" />
    ));
    // Should render a blocked placeholder, not an img
    const img = container.querySelector('img');
    expect(img).toBeNull();
    expect(container.textContent).toContain('Image blocked');
  });

  it('allows data URI images', () => {
    const { container } = render(() => (
      <ImageRenderer code={JSON.stringify({ src: 'data:image/png;base64,abc123', alt: '', title: '' })} lang="image" />
    ));
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('opens lightbox on image click', async () => {
    const { container } = render(() => (
      <ImageRenderer code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'test', title: '' })} lang="image" />
    ));
    const img = container.querySelector('img')!;
    fireEvent.load(img);
    fireEvent.click(img);
    // Lightbox modal should appear
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('renders gracefully when code is malformed JSON', () => {
    expect(() =>
      render(() => <ImageRenderer code="not-json" lang="image" />)
    ).not.toThrow();
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
npx vitest run src/components/conversation/renderers/ImageRenderer.test.tsx
```
Expected: FAIL — `ImageRenderer` module not found

---

### Task B2: Implement ImageRenderer.tsx

**Step 1: Create `src/components/conversation/renderers/ImageRenderer.tsx`**

```typescript
// src/components/conversation/renderers/ImageRenderer.tsx
// CHI-185: Inline image rendering for assistant responses.
// Handles base64 data URIs and HTTPS URLs. HTTP URLs are blocked (security).
// Registered as a side effect — imported once from App.tsx.

import { type Component, Show, createSignal } from 'solid-js';
import { registerRenderer, type RendererComponentProps } from '@/lib/rendererRegistry';

interface ImagePayload {
  src: string;
  alt: string;
  title: string;
}

function parsePayload(code: string): ImagePayload | null {
  try {
    return JSON.parse(code) as ImagePayload;
  } catch {
    return null;
  }
}

function isSafeSource(src: string): boolean {
  return src.startsWith('data:image/') || src.startsWith('https://');
}

const ImageRenderer: Component<RendererComponentProps> = (props) => {
  const [loaded, setLoaded] = createSignal(false);
  const [lightbox, setLightbox] = createSignal(false);

  const payload = () => parsePayload(props.code);

  return (
    <Show
      when={payload()}
      fallback={
        <span
          class="text-xs font-mono"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
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
              Image blocked — HTTP URLs are not allowed
            </span>
          }
        >
          <span class="inline-block relative max-w-full">
            <Show when={!loaded()}>
              <span
                class="image-shimmer absolute inset-0 rounded"
                style={{
                  background: 'var(--color-bg-elevated)',
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
              class="max-w-full rounded cursor-zoom-in transition-opacity"
              style={{
                'max-height': '400px',
                opacity: loaded() ? '1' : '0',
              }}
              onLoad={() => setLoaded(true)}
              onClick={() => setLightbox(true)}
              aria-label={p().alt ? `Image: ${p().alt}` : 'Image'}
            />
          </span>

          {/* Lightbox */}
          <Show when={lightbox()}>
            <div
              class="fixed inset-0 z-50 flex items-center justify-center p-8"
              style={{ background: 'rgba(0, 0, 0, 0.85)' }}
              role="dialog"
              aria-label={p().alt ? `Image: ${p().alt}` : 'Image lightbox'}
              aria-modal="true"
              onClick={() => setLightbox(false)}
            >
              <div
                class="relative rounded-lg overflow-hidden max-w-[90vw] max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  class="absolute top-2 right-2 z-10 text-xs px-2 py-1 rounded"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-secondary)',
                    color: 'var(--color-text-secondary)',
                  }}
                  onClick={() => setLightbox(false)}
                  aria-label="Close lightbox"
                >
                  ✕ Close
                </button>
                <img
                  src={p().src}
                  alt={p().alt}
                  class="max-w-[90vw] max-h-[90vh] object-contain"
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

// Self-register — imported once from App.tsx.
registerRenderer('image', {
  component: ImageRenderer,
  label: 'Image',
});

export default ImageRenderer;
```

**Step 2: Run tests — verify they pass**

```bash
npx vitest run src/components/conversation/renderers/ImageRenderer.test.tsx
```
Expected: PASS (7 tests)

---

### Task B3: Add image renderer override to MarkdownContent

**Step 1: Modify `src/components/conversation/MarkdownContent.tsx`**

Add import at top:
```typescript
import ImageRenderer from '@/components/conversation/renderers/ImageRenderer';
void ImageRenderer; // side-effect import — registers 'image' renderer
```

Add `marked.use()` for the image renderer (before the code block renderer call):

```typescript
// Image renderer override — outputs placeholder divs for inline images.
marked.use({
  renderer: {
    image({ href, text, title }: { href: string; text: string; title: string | null }) {
      const payload: { src: string; alt: string; title: string } = {
        src: href ?? '',
        alt: text ?? '',
        title: title ?? '',
      };
      const encoded = encodeRendererCode(JSON.stringify(payload));
      return `<div ${RENDERER_ATTR}="image" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="image" class="cw-renderer-placeholder my-2"></div>`;
    },
  },
});
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Lint + build**

```bash
npx eslint . && npx vite build
```
Expected: clean

**Step 4: Commit**

```bash
git add src/components/conversation/renderers/ImageRenderer.tsx \
        src/components/conversation/renderers/ImageRenderer.test.tsx \
        src/components/conversation/MarkdownContent.tsx
git commit -m "CHI-185: add inline image renderer — lazy loading, lightbox, HTTPS/data-URI only"
```

---

### Task B4: Register new renderers in App.tsx

Both MathRenderer and ImageRenderer self-register via side-effect import. They need to be imported once at the app root so they load before any conversation renders.

**Step 1: Open `src/App.tsx` and add imports alongside MermaidRenderer**

Find where `MermaidRenderer` is imported (likely near the top of App.tsx) and add:

```typescript
import '@/components/conversation/renderers/MathRenderer';
import '@/components/conversation/renderers/ImageRenderer';
```

> **Note:** Check if MermaidRenderer is already imported in App.tsx. If it uses `import './renderers/MermaidRenderer'` pattern, follow the same pattern. If it's imported differently, match that style.

**Step 2: TypeScript + lint check**

```bash
npx tsc --noEmit && npx eslint .
```

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "CHI-184 CHI-185: register Math and Image renderers at app root"
```

---

## Part C: CHI-219 — Actions Center Backend

**Files:**
- Modify: `src-tauri/src/actions/bridge.rs` (add `project_id`, `project_name` to `ActionBridgeConfig`)
- Modify: `src-tauri/src/actions/manager.rs` (add `ActionRuntime` wrapper, `started_at`)
- Modify: `src-tauri/src/actions/event_loop.rs` (write history on exit, emit `action:status_changed`)
- Modify: `src-tauri/src/db/migrations.rs` (migration v4: `action_history` table)
- Modify: `src-tauri/src/db/queries.rs` (add `insert_action_history`, `get_action_history`)
- Modify: `src-tauri/src/commands/actions.rs` (add `list_all_running_actions`, `get_action_history` IPC, update `start_action`)
- Modify: `src-tauri/src/main.rs` (register new IPC commands)
- Tests in the respective modules

---

### Task C1: Add `project_id` / `project_name` to ActionBridgeConfig and ActionRuntime

**Step 1: Write the failing test**

In `src-tauri/src/actions/manager.rs`, in the test module at the bottom, add:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_action_runtime_stores_project_metadata() {
        let map = ActionBridgeMap::new();
        // This test verifies the compiler accepts project_id and project_name fields
        let config = crate::actions::bridge::ActionBridgeConfig {
            command: "echo hello".into(),
            working_dir: "/tmp".into(),
            project_id: "proj-1".into(),
            project_name: "Test Project".into(),
            ..Default::default()
        };
        // Just verifying field existence; actual spawn would need a real PTY
        let _ = config;
    }
}
```

**Step 2: Run test — verify it fails to compile**

```bash
cargo test -p chief-wiggum-lib 2>&1 | head -30
```
Expected: compile error — `project_id` and `project_name` fields don't exist yet

**Step 3: Add fields to `ActionBridgeConfig` in `bridge.rs`**

In `src-tauri/src/actions/bridge.rs`, extend `ActionBridgeConfig`:

```rust
/// Configuration for spawning an action process.
#[derive(Debug, Clone)]
pub struct ActionBridgeConfig {
    /// Shell command to execute.
    pub command: String,
    /// Working directory.
    pub working_dir: String,
    /// Environment variables.
    pub env_vars: HashMap<String, String>,
    /// PTY dimensions.
    pub pty_cols: u16,
    pub pty_rows: u16,
    /// Project identifier (for cross-project tracking — CHI-219).
    pub project_id: String,
    /// Human-readable project name (for UI display — CHI-219).
    pub project_name: String,
}
```

Update the `Default` impl to include the new fields:
```rust
impl Default for ActionBridgeConfig {
    fn default() -> Self {
        Self {
            command: String::new(),
            working_dir: String::new(),
            env_vars: HashMap::new(),
            pty_cols: 220,
            pty_rows: 50,
            project_id: String::new(),
            project_name: String::new(),
        }
    }
}
```

**Step 4: Refactor `ActionBridgeMap` to use `ActionRuntime` wrapper in `manager.rs`**

Replace the current `HashMap<String, Arc<ActionBridge>>` with a runtime wrapper:

```rust
/// Runtime metadata for a tracked action (CHI-219).
pub struct ActionRuntime {
    pub bridge: Arc<ActionBridge>,
    pub command: String,
    pub working_dir: String,
    pub project_id: String,
    pub project_name: String,
    pub started_at: std::time::Instant,
}

/// Tracks concurrent action processes.
#[derive(Clone)]
pub struct ActionBridgeMap {
    runtimes: Arc<RwLock<HashMap<String, Arc<ActionRuntime>>>>,
    max_concurrent: usize,
}
```

Update `spawn_action()` to accept the full config and build `ActionRuntime`:

```rust
pub async fn spawn_action(
    &self,
    action_id: &str,
    config: ActionBridgeConfig,
) -> AppResult<Arc<ActionBridge>> {
    if self.has(action_id).await {
        self.stop_action(action_id).await?;
    }
    let active = self.active_count().await;
    if active >= self.max_concurrent {
        return Err(AppError::ResourceLimit { max: self.max_concurrent, active });
    }
    let bridge = Arc::new(ActionBridge::spawn(config.clone())?);
    let runtime = Arc::new(ActionRuntime {
        bridge: bridge.clone(),
        command: config.command,
        working_dir: config.working_dir,
        project_id: config.project_id,
        project_name: config.project_name,
        started_at: std::time::Instant::now(),
    });
    let mut runtimes = self.runtimes.write().await;
    runtimes.insert(action_id.to_string(), runtime);
    Ok(bridge)
}
```

Update all methods that used `bridges` to use `runtimes` and `runtime.bridge`.

Add `get_runtime()` method for event_loop use:
```rust
pub async fn get_runtime(&self, action_id: &str) -> Option<Arc<ActionRuntime>> {
    let runtimes = self.runtimes.read().await;
    runtimes.get(action_id).cloned()
}
```

Update `list_running()` to build `RunningActionInfo` from runtime (keep backward compat):
```rust
pub async fn list_running(&self) -> Vec<RunningActionInfo> {
    let runtimes = self.runtimes.read().await;
    runtimes.keys().map(|id| RunningActionInfo {
        action_id: id.clone(),
        status: crate::actions::bridge::ActionStatus::Running,
    }).collect()
}
```

**Step 5: Run tests — verify they compile and pass**

```bash
cargo test -p chief-wiggum-lib -- actions 2>&1
```
Expected: PASS

**Step 6: Commit**

```bash
git add src-tauri/src/actions/bridge.rs src-tauri/src/actions/manager.rs
git commit -m "CHI-219: add project_id/project_name to ActionBridgeConfig, ActionRuntime wrapper in manager"
```

---

### Task C2: DB migration v4 — action_history table

**Step 1: Write the failing test**

In `src-tauri/src/db/migrations.rs`, in the existing `#[cfg(test)]` block, add:

```rust
#[test]
fn migration_v4_creates_action_history_table() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    run_migrations_on_conn(&conn).unwrap();
    // Verify table exists
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='action_history'",
        [],
        |row| row.get(0),
    ).unwrap();
    assert_eq!(count, 1, "action_history table should exist after v4 migration");
}

#[test]
fn migration_v4_index_exists() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    run_migrations_on_conn(&conn).unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_action_history_project'",
        [],
        |row| row.get(0),
    ).unwrap();
    assert_eq!(count, 1, "idx_action_history_project index should exist");
}
```

**Step 2: Run — verify fails**

```bash
cargo test -p chief-wiggum-lib -- migration_v4 2>&1
```
Expected: FAIL — table doesn't exist yet

**Step 3: Add migration v4 to `src-tauri/src/db/migrations.rs`**

Append to `MIGRATIONS` array (after v3):

```rust
Migration {
    version: 4,
    description: "Actions Center: action_history table for completed run persistence",
    sql: r#"
        CREATE TABLE IF NOT EXISTS action_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            action_name TEXT NOT NULL,
            command TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'custom',
            started_at TEXT NOT NULL,
            ended_at TEXT,
            exit_code INTEGER,
            duration_ms INTEGER,
            output_preview TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_action_history_project
            ON action_history (project_id, started_at DESC);
    "#,
},
```

**Step 4: Run tests — verify they pass**

```bash
cargo test -p chief-wiggum-lib -- migration 2>&1
```
Expected: all migration tests PASS (including new v4 tests)

**Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "CHI-219: DB migration v4 — action_history table + idx_action_history_project"
```

---

### Task C3: Add `insert_action_history` and `get_action_history` queries

**Step 1: Write failing tests in `src-tauri/src/db/queries.rs`**

Find the existing tests module and add:

```rust
#[cfg(test)]
mod action_history_tests {
    use super::*;

    fn setup_db() -> crate::db::Database {
        let db = crate::db::Database::open_in_memory().unwrap();
        db
    }

    #[test]
    fn insert_and_get_action_history() {
        let db = setup_db();
        let entry = crate::actions::ActionHistoryEntry {
            id: 0,
            action_id: "pkg:build".into(),
            project_id: "proj-1".into(),
            project_name: "My Project".into(),
            action_name: "build".into(),
            command: "npm run build".into(),
            category: "build".into(),
            started_at: "2026-03-01T10:00:00Z".into(),
            ended_at: Some("2026-03-01T10:02:00Z".into()),
            exit_code: Some(0),
            duration_ms: Some(120_000),
            output_preview: Some("Build successful".into()),
            created_at: "2026-03-01T10:02:00Z".into(),
        };
        db.insert_action_history(&entry).unwrap();
        let results = db.get_action_history("proj-1", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action_name, "build");
        assert_eq!(results[0].exit_code, Some(0));
    }

    #[test]
    fn get_action_history_ordered_by_started_at_desc() {
        let db = setup_db();
        for i in 0..3 {
            let entry = crate::actions::ActionHistoryEntry {
                id: 0,
                action_id: format!("action-{}", i),
                project_id: "proj-1".into(),
                project_name: "My Project".into(),
                action_name: format!("action {}", i),
                command: "echo hi".into(),
                category: "custom".into(),
                started_at: format!("2026-03-01T10:0{}:00Z", i),
                ended_at: None,
                exit_code: None,
                duration_ms: None,
                output_preview: None,
                created_at: format!("2026-03-01T10:0{}:00Z", i),
            };
            db.insert_action_history(&entry).unwrap();
        }
        let results = db.get_action_history("proj-1", 10).unwrap();
        // Most recent first
        assert_eq!(results[0].action_name, "action 2");
        assert_eq!(results[2].action_name, "action 0");
    }
}
```

**Step 2: Define `ActionHistoryEntry` type in `src-tauri/src/actions/mod.rs`**

```rust
/// A completed action run record (CHI-219).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActionHistoryEntry {
    pub id: i64,
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub action_name: String,
    pub command: String,
    pub category: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub output_preview: Option<String>,
    pub created_at: String,
}
```

**Step 3: Run — verify fails**

```bash
cargo test -p chief-wiggum-lib -- action_history_tests 2>&1
```
Expected: FAIL — methods don't exist

**Step 4: Add `insert_action_history` and `get_action_history` to `src-tauri/src/db/queries.rs`**

```rust
use crate::actions::ActionHistoryEntry;

impl super::Database {
    /// Insert a completed action run into action_history.
    pub fn insert_action_history(&self, entry: &ActionHistoryEntry) -> crate::AppResult<()> {
        self.with_conn(|conn| {
            conn.execute(
                r#"INSERT INTO action_history
                   (action_id, project_id, project_name, action_name, command, category,
                    started_at, ended_at, exit_code, duration_ms, output_preview)
                   VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)"#,
                rusqlite::params![
                    entry.action_id, entry.project_id, entry.project_name,
                    entry.action_name, entry.command, entry.category,
                    entry.started_at, entry.ended_at, entry.exit_code,
                    entry.duration_ms, entry.output_preview,
                ],
            )?;
            Ok(())
        })
    }

    /// Get action history for a project, ordered by started_at DESC.
    pub fn get_action_history(
        &self,
        project_id: &str,
        limit: u32,
    ) -> crate::AppResult<Vec<ActionHistoryEntry>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"SELECT id, action_id, project_id, project_name, action_name, command,
                          category, started_at, ended_at, exit_code, duration_ms,
                          output_preview, created_at
                   FROM action_history
                   WHERE project_id = ?1
                   ORDER BY started_at DESC
                   LIMIT ?2"#,
            )?;
            let rows = stmt.query_map(
                rusqlite::params![project_id, limit],
                |row| {
                    Ok(ActionHistoryEntry {
                        id: row.get(0)?,
                        action_id: row.get(1)?,
                        project_id: row.get(2)?,
                        project_name: row.get(3)?,
                        action_name: row.get(4)?,
                        command: row.get(5)?,
                        category: row.get(6)?,
                        started_at: row.get(7)?,
                        ended_at: row.get(8)?,
                        exit_code: row.get(9)?,
                        duration_ms: row.get(10)?,
                        output_preview: row.get(11)?,
                        created_at: row.get(12)?,
                    })
                },
            )?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }
}
```

**Step 5: Run tests — verify they pass**

```bash
cargo test -p chief-wiggum-lib -- action_history_tests 2>&1
```
Expected: PASS

**Step 6: Commit**

```bash
git add src-tauri/src/actions/mod.rs src-tauri/src/db/queries.rs
git commit -m "CHI-219: ActionHistoryEntry type + insert_action_history/get_action_history DB queries"
```

---

### Task C4: Write history on exit + emit `action:status_changed`

**Step 1: Update `event_loop.rs`**

The `spawn_action_event_loop()` function needs access to:
- `ActionBridgeMap` (to look up runtime metadata — project_id, project_name, started_at)
- `Database` (to write history row)
- `AppHandle` (already has it)

Update the function signature in `event_loop.rs`:

```rust
pub fn spawn_action_event_loop(
    app: AppHandle,
    action_id: String,
    bridge: Arc<ActionBridge>,
    action_map: ActionBridgeMap,
    action_name: String,  // NEW — action display name for history
    db: crate::db::Database,  // NEW — for history write
) -> tokio::task::JoinHandle<()>
```

In the `ActionBridgeOutput::Exited` handler, before emitting `action:completed`/`action:failed`, write history:

```rust
Ok(Some(ActionBridgeOutput::Exited { exit_code })) => {
    // Look up runtime metadata
    let runtime = action_map.get_runtime(&action_id).await;
    let (project_id, project_name, started_at_instant, command) = match &runtime {
        Some(r) => (
            r.project_id.clone(),
            r.project_name.clone(),
            r.started_at,
            r.command.clone(),
        ),
        None => (String::new(), String::new(), std::time::Instant::now(), String::new()),
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let duration_ms = started_at_instant.elapsed().as_millis() as i64;
    let ended_at = chrono::Utc::now().to_rfc3339();
    let started_at = (chrono::Utc::now() - chrono::Duration::milliseconds(duration_ms))
        .to_rfc3339();

    let history_entry = crate::actions::ActionHistoryEntry {
        id: 0,
        action_id: action_id.clone(),
        project_id: project_id.clone(),
        project_name: project_name.clone(),
        action_name: action_name.clone(),
        command,
        category: "custom".into(), // TODO: pass through category in C5
        started_at,
        ended_at: Some(ended_at),
        exit_code,
        duration_ms: Some(duration_ms),
        output_preview: None, // output_preview assembled below
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    if let Err(e) = db.insert_action_history(&history_entry) {
        tracing::warn!(action_id = %action_id, error = %e, "Failed to write action history");
    }

    // Emit action:status_changed
    let status_payload = ActionStatusChangedPayload {
        action_id: action_id.clone(),
        project_id: project_id.clone(),
        project_name: project_name.clone(),
        status: if exit_code == Some(0) || exit_code.is_none() {
            crate::actions::bridge::ActionStatus::Completed
        } else {
            crate::actions::bridge::ActionStatus::Failed
        },
        elapsed_ms: duration_ms as u64,
    };
    if let Err(e) = app.emit("action:status_changed", &status_payload) {
        tracing::warn!(error = %e, "Failed to emit action:status_changed");
    }

    // Existing logic: emit action:completed or action:failed
    let payload = ActionExitPayload { action_id: action_id.clone(), exit_code };
    let event_name = match exit_code {
        Some(0) | None => "action:completed",
        _ => "action:failed",
    };
    if let Err(e) = app.emit(event_name, &payload) {
        tracing::warn!(error = %e, action_id = %action_id, "Failed to emit {}", event_name);
    }
    // ...
}
```

Add the new payload struct:

```rust
/// Payload for `action:status_changed` event (CHI-219).
#[derive(Debug, Clone, Serialize)]
pub struct ActionStatusChangedPayload {
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub status: crate::actions::bridge::ActionStatus,
    pub elapsed_ms: u64,
}
```

> **Note:** You'll need `chrono` as a dependency. Check `Cargo.toml` — if `chrono` is not present, add it: `chrono = { version = "0.4", features = ["serde"] }`.

**Step 2: Update `start_action` and `restart_action` in `commands/actions.rs`**

Both need to pass `action_name` and `db` to `spawn_action_event_loop`. Update their signatures:

```rust
#[tauri::command(rename_all = "snake_case")]
pub async fn start_action(
    app: tauri::AppHandle,
    action_map: tauri::State<'_, ActionBridgeMap>,
    db: tauri::State<'_, crate::db::Database>,
    action_id: String,
    action_name: String,  // NEW: human-readable name
    command: String,
    working_dir: String,
    project_id: String,   // NEW
    project_name: String, // NEW
) -> Result<(), AppError> {
    // ...
    let config = ActionBridgeConfig {
        command: command.clone(),
        working_dir,
        project_id,
        project_name,
        ..Default::default()
    };
    let bridge = action_map.spawn_action(&action_id, config).await?;
    event_loop::spawn_action_event_loop(
        app, action_id, bridge, action_map.inner().clone(),
        action_name, db.inner().clone()
    );
    Ok(())
}
```

**Step 3: Run Rust tests**

```bash
cargo test -p chief-wiggum-lib 2>&1 | tail -20
```
Expected: PASS all tests

**Step 4: Commit**

```bash
git add src-tauri/src/actions/event_loop.rs src-tauri/src/commands/actions.rs
git commit -m "CHI-219: write action history on exit, emit action:status_changed with project context"
```

---

### Task C5: Add `list_all_running_actions` and `get_action_history` IPC commands

**Step 1: Add `CrossProjectRunningAction` struct and new commands to `commands/actions.rs`**

```rust
/// Cross-project running action info (CHI-219 — CHI-220 UI depends on this).
#[derive(Debug, Clone, serde::Serialize)]
pub struct CrossProjectRunningAction {
    pub action_id: String,
    pub project_id: String,
    pub project_name: String,
    pub action_name: String,
    pub status: crate::actions::bridge::ActionStatus,
    pub elapsed_ms: u64,
    pub command: String,
}

/// List all running actions across all projects.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_all_running_actions(
    action_map: tauri::State<'_, ActionBridgeMap>,
) -> Result<Vec<CrossProjectRunningAction>, AppError> {
    let runtimes = action_map.list_all_runtimes().await;
    let result = runtimes
        .into_iter()
        .map(|(action_id, runtime)| CrossProjectRunningAction {
            action_id: action_id.clone(),
            project_id: runtime.project_id.clone(),
            project_name: runtime.project_name.clone(),
            action_name: action_id.clone(), // best effort; TODO: store in runtime
            status: crate::actions::bridge::ActionStatus::Running,
            elapsed_ms: runtime.started_at.elapsed().as_millis() as u64,
            command: runtime.command.clone(),
        })
        .collect();
    Ok(result)
}

/// Get action run history for a project.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_action_history(
    db: tauri::State<'_, crate::db::Database>,
    project_id: String,
    limit: Option<u32>,
) -> Result<Vec<crate::actions::ActionHistoryEntry>, AppError> {
    db.get_action_history(&project_id, limit.unwrap_or(50))
}
```

Add `list_all_runtimes()` to `ActionBridgeMap` in `manager.rs`:
```rust
pub async fn list_all_runtimes(&self) -> Vec<(String, Arc<ActionRuntime>)> {
    let runtimes = self.runtimes.read().await;
    runtimes.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
}
```

**Step 2: Register new commands in `src-tauri/src/main.rs`**

Find the `invoke_handler!` macro call and add:
```rust
commands::actions::list_all_running_actions,
commands::actions::get_action_history,
```

**Step 3: Run full Rust check**

```bash
cargo check && cargo test -p chief-wiggum-lib 2>&1 | tail -10
```
Expected: clean compile + all tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/actions/manager.rs \
        src-tauri/src/commands/actions.rs \
        src-tauri/src/main.rs
git commit -m "CHI-219: add list_all_running_actions + get_action_history IPC commands"
```

---

### Task C6: Update frontend `actionStore.ts` to call new backend params

The `startAction()` function in `actionStore.ts` now needs to pass `project_id`, `project_name`, and `action_name` when calling `invoke('start_action', ...)`.

**Step 1: Update `startAction` call in `src/stores/actionStore.ts`**

```typescript
export async function startAction(action: ActionDefinition): Promise<void> {
  setState('statuses', action.id, 'starting');
  setState('outputs', action.id, []);
  setState('selectedActionId', action.id);

  const activeProject = getActiveProject();  // import from projectStore

  try {
    await invoke('start_action', {
      action_id: action.id,
      action_name: action.name,           // NEW
      command: action.command,
      working_dir: action.working_dir,
      project_id: activeProject?.id ?? '',   // NEW
      project_name: activeProject?.name ?? '', // NEW
    });
    // ... rest unchanged
  }
}
```

Do the same for `restartAction`.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/stores/actionStore.ts
git commit -m "CHI-219: pass project_id, project_name, action_name to start_action IPC"
```

---

## Part D: CHI-220 — Actions Center Overview UI

**Files:**
- Modify: `src/stores/actionStore.ts` (add crossProjectRunning, history, new functions)
- Create: `src/components/actions/ActionsCenter.tsx`
- Create: `src/components/actions/WarehouseCard.tsx`
- Modify: `src/stores/uiStore.ts` (add `'actions_center'` to ActiveView union)
- Modify: `src/components/layout/MainLayout.tsx` (add Actions Center view tab)
- Modify: `src/components/layout/Sidebar.tsx` (add active lane badge)
- Modify: `src/lib/keybindings.ts` (add Cmd+Shift+A)
- Modify: `src/styles/tokens.css` (add CSS animations)
- Modify: `src/locales/en.json`, `src/locales/es.json` (new i18n strings)

---

### Task D1: Extend actionStore with cross-project state

**Step 1: Write failing test**

In `src/stores/actionStore.test.ts`, add:

```typescript
describe('loadAllRunningActions', () => {
  it('sets crossProjectRunning from IPC result', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_all_running_actions') {
        return Promise.resolve([{
          action_id: 'pkg:build',
          project_id: 'proj-1',
          project_name: 'My Project',
          action_name: 'build',
          status: 'running',
          elapsed_ms: 5000,
          command: 'npm run build',
        }]);
      }
      return Promise.resolve([]);
    });
    await loadAllRunningActions();
    expect(actionState.crossProjectRunning).toHaveLength(1);
    expect(actionState.crossProjectRunning[0].project_name).toBe('My Project');
  });
});
```

**Step 2: Run — verify fails**

```bash
npx vitest run src/stores/actionStore.test.ts
```
Expected: FAIL — `crossProjectRunning` doesn't exist

**Step 3: Extend `actionStore.ts`**

Add to `ActionState` interface:
```typescript
interface ActionState {
  // ... existing fields ...
  /** Cross-project running actions (CHI-220). */
  crossProjectRunning: CrossProjectRunningAction[];
  /** Per-project action history. */
  history: Record<string, ActionHistoryEntry[]>;
  /** Whether history is loading per project. */
  historyLoading: Record<string, boolean>;
}
```

Add types (match backend structs):
```typescript
export interface CrossProjectRunningAction {
  action_id: string;
  project_id: string;
  project_name: string;
  action_name: string;
  status: ActionStatus;
  elapsed_ms: number;
  command: string;
}

export interface ActionHistoryEntry {
  id: number;
  action_id: string;
  project_id: string;
  project_name: string;
  action_name: string;
  command: string;
  category: string;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  output_preview: string | null;
  created_at: string;
}
```

Add to initial state:
```typescript
const [state, setState] = createStore<ActionState>({
  // ...existing...
  crossProjectRunning: [],
  history: {},
  historyLoading: {},
});
```

Add new exported functions:
```typescript
/** Load all running actions across all projects. */
export async function loadAllRunningActions(): Promise<void> {
  try {
    const running = await invoke<CrossProjectRunningAction[]>('list_all_running_actions');
    setState('crossProjectRunning', running);
  } catch (err) {
    log.warn('list_all_running_actions failed: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/** Subscribe to action:status_changed and update crossProjectRunning. */
export async function subscribeToActionStatusChanged(): Promise<UnlistenFn> {
  return listen<{
    action_id: string;
    project_id: string;
    project_name: string;
    status: ActionStatus;
    elapsed_ms: number;
  }>('action:status_changed', (event) => {
    const payload = event.payload;
    setState('crossProjectRunning', (prev) => {
      const idx = prev.findIndex((a) => a.action_id === payload.action_id);
      if (payload.status === 'completed' || payload.status === 'failed' || payload.status === 'stopped') {
        // Remove from running list
        return idx >= 0 ? [...prev.slice(0, idx), ...prev.slice(idx + 1)] : prev;
      }
      // Update or insert
      const updated: CrossProjectRunningAction = {
        action_id: payload.action_id,
        project_id: payload.project_id,
        project_name: payload.project_name,
        action_name: prev[idx]?.action_name ?? payload.action_id,
        status: payload.status,
        elapsed_ms: payload.elapsed_ms,
        command: prev[idx]?.command ?? '',
      };
      if (idx >= 0) {
        return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      }
      return [...prev, updated];
    });
  });
}

/** Load action history for a specific project. */
export async function loadActionHistory(projectId: string, limit = 50): Promise<void> {
  setState('historyLoading', projectId, true);
  try {
    const entries = await invoke<ActionHistoryEntry[]>('get_action_history', {
      project_id: projectId,
      limit,
    });
    setState('history', projectId, entries);
  } catch (err) {
    log.warn('get_action_history failed: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    setState('historyLoading', projectId, false);
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
npx vitest run src/stores/actionStore.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/stores/actionStore.ts src/stores/actionStore.test.ts
git commit -m "CHI-220: extend actionStore with crossProjectRunning, history, subscribeToActionStatusChanged"
```

---

### Task D2: Add CSS animations to tokens.css

**Step 1: Modify `src/styles/tokens.css`** — append at the end:

```css
/* ============================================================
   Actions Center animations (CHI-220)
   ============================================================ */

/* Conveyor belt movement */
@keyframes conveyorSlide {
  to { background-position-x: 16px; }
}

/* Starting state pulsing left border */
@keyframes laneStartingPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Completed lane slide-out */
@keyframes laneSlideOut {
  from { opacity: 0.5; transform: translateY(0); max-height: 200px; }
  to { opacity: 0; transform: translateY(8px); max-height: 0; }
}

/* Conveyor strip pattern */
.conveyor-strip {
  background: repeating-linear-gradient(
    90deg,
    var(--conveyor-stripe-a, var(--color-border-secondary)) 0 8px,
    var(--conveyor-stripe-b, transparent) 8px 16px
  );
  height: 6px;
}

.conveyor-strip.active {
  animation: conveyorSlide 0.6s linear infinite;
}

/* Lane status stripe colors */
.lane-running  {
  --conveyor-stripe-a: color-mix(in srgb, var(--color-success) 30%, transparent);
  --conveyor-stripe-b: color-mix(in srgb, var(--color-success) 10%, transparent);
}
.lane-starting {
  --conveyor-stripe-a: color-mix(in srgb, var(--color-warning) 30%, transparent);
  --conveyor-stripe-b: color-mix(in srgb, var(--color-warning) 10%, transparent);
}
.lane-failed   {
  --conveyor-stripe-a: color-mix(in srgb, var(--color-error) 20%, transparent);
  --conveyor-stripe-b: color-mix(in srgb, var(--color-error) 10%, transparent);
}
.lane-stopped  {
  --conveyor-stripe-a: color-mix(in srgb, var(--color-border-secondary) 50%, transparent);
  --conveyor-stripe-b: transparent;
}

/* Reduced motion overrides */
@media (prefers-reduced-motion: reduce) {
  .conveyor-strip.active { animation: none; }
  .lane-starting-pulse { animation: none !important; }
}
```

**Step 2: Build check**

```bash
npx vite build 2>&1 | tail -5
```
Expected: clean

**Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "CHI-220: add Actions Center CSS animations (conveyor, lane states, reduced-motion)"
```

---

### Task D3: Add i18n strings

**Step 1: Modify `src/locales/en.json`** — add `actions_center` key:

```json
"actions_center": {
  "title": "Actions Center",
  "summary": "{n} projects · {m} lanes active",
  "launch_action": "Launch Action",
  "all_quiet": "All quiet on the factory floor",
  "open_project": "Open a project to see its warehouse",
  "add_lane": "Add Lane",
  "no_lanes": "No lanes running — add one to start the assembly line",
  "stop": "Stop",
  "restart": "Restart",
  "ask_ai": "Ask AI",
  "no_history": "No history yet — run an action to see it here",
  "load_more": "Load more",
  "view_output": "View Output",
  "output_preview_note": "Full output not persisted — showing last 3 lines",
  "inspect_hint": "Click to inspect logs"
}
```

**Step 2: Modify `src/locales/es.json`** — add Spanish translations:

```json
"actions_center": {
  "title": "Centro de Acciones",
  "summary": "{n} proyectos · {m} líneas activas",
  "launch_action": "Iniciar Acción",
  "all_quiet": "Todo tranquilo en la fábrica",
  "open_project": "Abre un proyecto para ver su almacén",
  "add_lane": "Añadir Línea",
  "no_lanes": "Sin líneas activas — añade una para arrancar la cadena de montaje",
  "stop": "Detener",
  "restart": "Reiniciar",
  "ask_ai": "Preguntar a IA",
  "no_history": "Sin historial aún — ejecuta una acción para verlo aquí",
  "load_more": "Cargar más",
  "view_output": "Ver Salida",
  "output_preview_note": "Salida completa no guardada — mostrando las últimas 3 líneas",
  "inspect_hint": "Clic para inspeccionar registros"
}
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/locales/en.json src/locales/es.json
git commit -m "CHI-220: add Actions Center i18n strings (en + es)"
```

---

### Task D4: Add `actions_center` to uiStore ActiveView union

**Step 1: Modify `src/stores/uiStore.ts`**

Find the `ActiveView` type declaration and add `'actions_center'`:

```typescript
export type ActiveView = 'conversation' | 'agents' | 'diff' | 'terminal' | 'actions_center';
```

Also add `'actions_center'` to `viewBadges` initial value if it exists as a Record<ActiveView, number>.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/stores/uiStore.ts
git commit -m "CHI-220: add 'actions_center' to ActiveView union in uiStore"
```

---

### Task D5: Create WarehouseCard.tsx

**Step 1: Write the failing test**

Create `src/components/actions/WarehouseCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import WarehouseCard from './WarehouseCard';

describe('WarehouseCard', () => {
  it('renders project name', () => {
    const { getByText } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="My Project"
        activeLaneCount={0}
        onSelect={() => {}}
      />
    ));
    expect(getByText('My Project')).toBeTruthy();
  });

  it('shows active lane count badge with green styling when > 0', () => {
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={3}
        onSelect={() => {}}
      />
    ));
    expect(container.textContent).toContain('3');
    // Active badge should have success color
    const badge = container.querySelector('.lane-count-badge');
    expect(badge).toBeTruthy();
  });

  it('shows "0 active" gray badge when no lanes running', () => {
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={0}
        onSelect={() => {}}
      />
    ));
    const badge = container.querySelector('.lane-count-badge');
    expect(badge).toBeTruthy();
  });

  it('calls onSelect with projectId when clicked', async () => {
    let selected = '';
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={0}
        onSelect={(id) => { selected = id; }}
      />
    ));
    const button = container.querySelector('button[role="button"]') as HTMLButtonElement;
    button?.click();
    expect(selected).toBe('proj-1');
  });

  it('adds active class to conveyor when activeLaneCount > 0', () => {
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={2}
        onSelect={() => {}}
      />
    ));
    const conveyor = container.querySelector('.conveyor-strip');
    expect(conveyor?.classList.contains('active')).toBe(true);
  });
});
```

**Step 2: Run — verify fails**

```bash
npx vitest run src/components/actions/WarehouseCard.test.tsx
```
Expected: FAIL

**Step 3: Create `src/components/actions/WarehouseCard.tsx`**

```typescript
// src/components/actions/WarehouseCard.tsx
// CHI-220: Project warehouse card for the Actions Center overview.

import type { Component } from 'solid-js';
import { For, Show, createMemo } from 'solid-js';
import { t } from '@/stores/i18nStore';
import type { CrossProjectRunningAction } from '@/stores/actionStore';

interface WarehouseCardProps {
  projectId: string;
  projectName: string;
  activeLaneCount: number;
  activeLanes?: CrossProjectRunningAction[];
  onSelect: (projectId: string) => void;
}

const WarehouseCard: Component<WarehouseCardProps> = (props) => {
  const isActive = () => props.activeLaneCount > 0;

  return (
    <button
      class="w-full text-left rounded-lg p-3 transition-colors group"
      role="button"
      aria-label={`Open ${props.projectName} warehouse`}
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-secondary)',
        'transition-duration': 'var(--duration-normal)',
      }}
      onClick={() => props.onSelect(props.projectId)}
    >
      {/* Header */}
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base" aria-hidden="true">🏭</span>
          <span
            class="text-sm font-medium truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {props.projectName}
          </span>
        </div>
        <span
          class="lane-count-badge text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2"
          style={{
            background: isActive()
              ? 'color-mix(in srgb, var(--color-success) 20%, transparent)'
              : 'var(--color-bg-inset)',
            color: isActive() ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            border: `1px solid ${isActive() ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : 'var(--color-border-secondary)'}`,
          }}
        >
          {props.activeLaneCount} active
        </span>
      </div>

      {/* Conveyor strip */}
      <div
        class={`conveyor-strip rounded ${isActive() ? 'active lane-running' : 'lane-stopped'}`}
        aria-hidden="true"
      />

      {/* Mini lane status dots */}
      <Show when={(props.activeLanes?.length ?? 0) > 0}>
        <div class="flex items-center gap-1.5 mt-2">
          <For each={props.activeLanes?.slice(0, 5)}>
            {(lane) => (
              <span
                class="w-2 h-2 rounded-full"
                title={lane.action_name}
                style={{
                  background: lane.status === 'running'
                    ? 'var(--color-success)'
                    : lane.status === 'starting'
                      ? 'var(--color-warning)'
                      : 'var(--color-error)',
                  animation: lane.status === 'running'
                    ? 'pulse 2s ease-in-out infinite'
                    : 'none',
                }}
                aria-label={`${lane.action_name}: ${lane.status}`}
              />
            )}
          </For>
          <Show when={(props.activeLanes?.length ?? 0) > 5}>
            <span class="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              +{(props.activeLanes?.length ?? 0) - 5}
            </span>
          </Show>
        </div>
      </Show>
    </button>
  );
};

export default WarehouseCard;
```

**Step 4: Run tests — verify they pass**

```bash
npx vitest run src/components/actions/WarehouseCard.test.tsx
```
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/components/actions/WarehouseCard.tsx src/components/actions/WarehouseCard.test.tsx
git commit -m "CHI-220: WarehouseCard component with conveyor strip, lane dots, active badge"
```

---

### Task D6: Create ActionsCenter.tsx (Overview)

**Step 1: Create `src/components/actions/ActionsCenter.tsx`**

```typescript
// src/components/actions/ActionsCenter.tsx
// CHI-220: Actions Center overview — warehouse grid per project.

import type { Component } from 'solid-js';
import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js';
import {
  actionState,
  loadAllRunningActions,
  subscribeToActionStatusChanged,
  type UnlistenFn,
} from '@/stores/actionStore';
import { projectState } from '@/stores/projectStore';
import { t } from '@/stores/i18nStore';
import WarehouseCard from './WarehouseCard';

const ActionsCenter: Component = () => {
  const [selectedWarehouse, setSelectedWarehouse] = createSignal<string | null>(null);
  let unlistenStatusChange: UnlistenFn | undefined;

  onMount(async () => {
    await loadAllRunningActions();
    unlistenStatusChange = await subscribeToActionStatusChanged();
  });

  onCleanup(() => {
    unlistenStatusChange?.();
  });

  const projects = () => projectState.projects ?? [];

  const summaryText = createMemo(() => {
    const n = projects().length;
    const m = actionState.crossProjectRunning.length;
    return t('actions_center.summary').replace('{n}', String(n)).replace('{m}', String(m));
  });

  const activeLanesForProject = (projectId: string) =>
    actionState.crossProjectRunning.filter((a) => a.project_id === projectId);

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        class="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
      >
        <div>
          <h2 class="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('actions_center.title')}
          </h2>
          <div
            role="status"
            aria-live="polite"
            class="text-xs mt-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {summaryText()}
          </div>
        </div>
      </div>

      {/* Warehouse grid */}
      <div class="flex-1 overflow-y-auto p-4">
        <Show
          when={projects().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-3 text-center">
              <span class="text-3xl" aria-hidden="true">🏭</span>
              <p class="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t('actions_center.open_project')}
              </p>
            </div>
          }
        >
          <div class="grid gap-3" style={{ 'grid-template-columns': 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            <For each={projects()}>
              {(project) => (
                <WarehouseCard
                  projectId={project.id}
                  projectName={project.name}
                  activeLaneCount={activeLanesForProject(project.id).length}
                  activeLanes={activeLanesForProject(project.id)}
                  onSelect={(id) => setSelectedWarehouse(id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ActionsCenter;
```

> **Note:** `projectState.projects` — check projectStore for the correct accessor. It may be `projectState.projects` or require a helper. Match the existing usage in other components (e.g., Sidebar.tsx).

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/actions/ActionsCenter.tsx
git commit -m "CHI-220: ActionsCenter overview with warehouse grid, reactive summary bar"
```

---

### Task D7: Wire ActionsCenter into MainLayout + add Cmd+Shift+A keybinding

**Step 1: Modify `src/components/layout/MainLayout.tsx`**

Add the import:
```typescript
import { Factory } from 'lucide-solid';
import ActionsCenter from '@/components/actions/ActionsCenter';
```

Add `'actions_center'` to `VIEW_ICONS`:
```typescript
const VIEW_ICONS: Record<ActiveView, Component<{ size?: number; class?: string }>> = {
  conversation: MessageSquare,
  agents: Users,
  diff: GitCompare,
  terminal: Terminal,
  actions_center: Factory,
};
```

Add the view tab in the tab strip:
```tsx
<ViewTab label="Center" view="actions_center" />
```

Add the view content:
```tsx
<Show when={uiState.activeView === 'actions_center'}>
  <ActionsCenter />
</Show>
```

**Step 2: Modify `src/lib/keybindings.ts`**

Find the global shortcut handler and add:
```typescript
// Cmd+Shift+A — open Actions Center
if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyA') {
  e.preventDefault();
  setActiveView('actions_center');
  return;
}
```

> **Note:** Place this after other Cmd+Shift shortcuts in the handler to avoid conflicts with `Cmd+Shift+A` (attachment shortcut is `Cmd+Shift+A` per CHI-C4). Check if there's a conflict — if CHI-C4 isn't implemented yet, no conflict exists. If it is, discuss with the team.

**Step 3: TypeScript check + lint**

```bash
npx tsc --noEmit && npx eslint .
```

**Step 4: Commit**

```bash
git add src/components/layout/MainLayout.tsx src/lib/keybindings.ts
git commit -m "CHI-220: wire ActionsCenter into main layout tab, add Cmd+Shift+A shortcut"
```

---

### Task D8: Sidebar badge for active lane count

**Step 1: Modify `src/components/layout/Sidebar.tsx`**

Find where view tab badges are controlled (likely via `uiStore.viewBadges`) and update the badge for `actions_center` to reflect `actionState.crossProjectRunning.length`.

Add a `createEffect` that syncs the badge:
```typescript
import { actionState } from '@/stores/actionStore';
import { setViewBadge } from '@/stores/uiStore'; // check if this function exists

createEffect(() => {
  const count = actionState.crossProjectRunning.length;
  setViewBadge('actions_center', count);
});
```

> **Note:** Check `uiStore.ts` for how `viewBadges` is updated. If there's a `setViewBadge` function, use it. If not, update `viewBadges` directly via the store setter. The `MainLayout.tsx` `ViewTab` component already reads `uiState.viewBadges[view]` and shows a badge when > 0.

**Step 2: TypeScript + lint check**

```bash
npx tsc --noEmit && npx eslint .
```

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "CHI-220: sync Actions Center tab badge with crossProjectRunning count"
```

---

### Task D9: Final full check

**Step 1: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -20
```
Expected: all tests pass

**Step 2: Run all Rust tests**

```bash
cargo test 2>&1 | tail -10
```
Expected: all tests pass

**Step 3: TypeScript + ESLint + Prettier**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```
Expected: clean

**Step 4: Cargo checks**

```bash
cargo clippy -- -D warnings && cargo fmt --check
```
Expected: clean

**Step 5: Build**

```bash
npx vite build
```
Expected: clean build

**Step 6: Final commit if any cleanup needed**

```bash
git add -p  # Review any remaining changes
git commit -m "CHI-220: final cleanup and type fixes"
```

---

## Summary of deliverables

| Task | Status | Commit |
|------|--------|--------|
| CHI-184: KaTeX install | Task A1 | `CHI-184: install katex + types` |
| CHI-184: MathRenderer component | Task A2-A3 | `CHI-184: add KaTeX math renderer` |
| CHI-184: MarkdownContent integration | Task A4 | `CHI-184: marked tokenizer extensions` |
| CHI-185: ImageRenderer component | Task B1-B2 | `CHI-185: add inline image renderer` |
| CHI-185: MarkdownContent integration | Task B3 | `CHI-185: image renderer override` |
| CHI-184/185: App.tsx registration | Task B4 | `CHI-184 CHI-185: register renderers` |
| CHI-219: ActionBridgeConfig + ActionRuntime | Task C1 | `CHI-219: project metadata in ActionRuntime` |
| CHI-219: DB migration v4 | Task C2 | `CHI-219: DB migration v4 action_history` |
| CHI-219: DB queries | Task C3 | `CHI-219: insert/get action_history queries` |
| CHI-219: History write on exit | Task C4 | `CHI-219: write history on exit + action:status_changed` |
| CHI-219: New IPC commands | Task C5 | `CHI-219: list_all_running_actions + get_action_history IPC` |
| CHI-219: Frontend IPC params | Task C6 | `CHI-219: pass project context to start_action` |
| CHI-220: actionStore extensions | Task D1 | `CHI-220: crossProjectRunning + history in actionStore` |
| CHI-220: CSS animations | Task D2 | `CHI-220: conveyor animations in tokens.css` |
| CHI-220: i18n strings | Task D3 | `CHI-220: Actions Center i18n strings` |
| CHI-220: uiStore ActiveView | Task D4 | `CHI-220: add actions_center view type` |
| CHI-220: WarehouseCard | Task D5 | `CHI-220: WarehouseCard component` |
| CHI-220: ActionsCenter | Task D6 | `CHI-220: ActionsCenter overview` |
| CHI-220: MainLayout + keybinding | Task D7 | `CHI-220: wire ActionsCenter into layout` |
| CHI-220: Sidebar badge | Task D8 | `CHI-220: sidebar badge for active lanes` |

## Notes for executor

1. **CHI-184 marked extensions:** The `encodeRendererCode` function may already exist in MarkdownContent.tsx — check for `encodeURIComponent` usage before adding a helper. The existing code block renderer uses `encodeURIComponent(code)` inline; extract or reuse that pattern.

2. **CHI-185 marked image renderer:** `marked.use({renderer: {image: ...}})` — the callback signature changed in marked v5+. Check the current marked version in `package.json` and match the renderer API accordingly. The `image` renderer may receive `(href, title, text)` args or an object — match what the existing `code` renderer uses.

3. **CHI-219 chrono dependency:** Check `src-tauri/Cargo.toml` for `chrono`. If not present, add `chrono = { version = "0.4", features = ["serde"] }`. Alternatively, use `std::time::SystemTime` for ISO-8601 formatting to avoid the dependency.

4. **CHI-219 action_name in history:** The `start_action` IPC now receives `action_name` from the frontend. The `ActionRuntime` should store `action_name` too (alongside `project_id`, `project_name`) so history entries have correct names.

5. **CHI-220 projectState accessor:** Check how `projectStore.ts` exports the project list. It may be `projectState.projects` or a computed memo. Look at how `Sidebar.tsx` or `ActionsPanel.tsx` accesses projects.

6. **CHI-220 setViewBadge:** If `uiStore.ts` doesn't have `setViewBadge`, check how the Agents tab `0` badge was set previously — might be via direct `setState`. Match the existing pattern.

7. **Execution order:** A (184) → B (185) → C (219) → D (220). C and D together form Actions Center v2 groundwork — don't skip C even if D tasks seem more visible.
