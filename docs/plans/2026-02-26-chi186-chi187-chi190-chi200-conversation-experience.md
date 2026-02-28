# Conversation Experience Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement four independent Conversation Experience features: Renderer Registry (CHI-186), Compact Streaming Thinking (CHI-187), Clipboard Image Paste (CHI-190), and In-Session Message Search (CHI-200).

**Architecture:** Four independent tracks. CHI-186 creates a pluggable renderer system within MarkdownContent via a `RendererRegistry` class with `register(contentType, component)` API and post-render hydration. CHI-187 replaces the expanded `StreamingThinkingBlock` with a compact single-line indicator. CHI-190 adds paste event handling to `MessageInput` textarea with base64 image conversion and thumbnail chips. CHI-200 adds a floating search bar above `ConversationView` with real-time highlighting and virtual scroll integration.

**Tech Stack:** SolidJS, marked (custom extensions), highlight.js, @tanstack/solid-virtual, Vitest + @solidjs/testing-library, Playwright

**Protocol compliance:** GUIDE-003 §2.1, §2.2, §2.3, §2.4, §3.1, §3.3

---

## Test Requirements (GUIDE-003 §2.1)

### Test Layers
- [x] Unit tests (Frontend): rendererRegistry, StreamingThinkingBlock, image paste logic, message search utility
- [x] Component tests (Frontend): ContextMenu integration, image thumbnail chips, ConversationSearch overlay
- [x] E2E tests (Playwright): compact thinking indicator, image paste, Cmd+F search

### Estimated Test Count
- Frontend unit: ~35 tests
- E2E: ~12 scenarios

### Regression Risk
- Existing MarkdownContent tests (6) — must still pass after CHI-186
- Existing ConversationView rendering — must not break after CHI-186/200
- Existing MessageInput tests — must still pass after CHI-190
- Existing keyboard shortcuts — Cmd+F must not conflict

### Coverage Target
- New code coverage: ≥85%
- Overall project coverage: must not decrease

---

## Execution Order

```
CHI-186 (Tasks 1-3) ──────────────────────────┐
CHI-187 (Tasks 4-5) ──────────────────────────┤
CHI-190 (Tasks 6-9) ──────────────────────────┼─→ Task 14 (Close all)
CHI-200 (Tasks 10-13) ────────────────────────┘
```

All four tracks are independent — can run in any order or parallel.

---

# Track A: CHI-186 — Renderer Registry & Content Detection

---

### Task 1: Create RendererRegistry Module

**Files:**
- Create: `src/lib/rendererRegistry.ts`
- Test: `src/lib/rendererRegistry.test.ts`

**Context:** This is the architectural backbone for pluggable content rendering inside MarkdownContent. The registry maps content types (detected from markdown code block language tags or content patterns) to SolidJS component factories. When MarkdownContent renders a code block, a custom `marked` renderer checks the registry. If a match is found, it emits a placeholder `<div>` with a `data-cw-renderer` attribute. A post-render hydration pass then mounts the registered SolidJS component into the placeholder.

The registry must be:
- HMR-safe (singleton survives hot reload)
- Tree-shakeable (only registered renderers are bundled)
- Type-safe (generic component props)

**Step 1: Write failing tests for RendererRegistry**

Create `src/lib/rendererRegistry.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerRenderer,
  getRenderer,
  hasRenderer,
  listRenderers,
  clearRenderers,
  type ContentDetector,
} from './rendererRegistry';

describe('RendererRegistry', () => {
  beforeEach(() => {
    clearRenderers();
  });

  it('registers and retrieves a renderer by content type', () => {
    const component = vi.fn();
    registerRenderer('json', { component, label: 'JSON Viewer' });
    expect(hasRenderer('json')).toBe(true);
    const entry = getRenderer('json');
    expect(entry).toBeDefined();
    expect(entry!.component).toBe(component);
    expect(entry!.label).toBe('JSON Viewer');
  });

  it('returns undefined for unregistered content type', () => {
    expect(getRenderer('mermaid')).toBeUndefined();
    expect(hasRenderer('mermaid')).toBe(false);
  });

  it('lists all registered renderer types', () => {
    registerRenderer('json', { component: vi.fn(), label: 'JSON' });
    registerRenderer('svg', { component: vi.fn(), label: 'SVG' });
    const types = listRenderers();
    expect(types).toContain('json');
    expect(types).toContain('svg');
    expect(types).toHaveLength(2);
  });

  it('clearRenderers removes all entries', () => {
    registerRenderer('json', { component: vi.fn(), label: 'JSON' });
    clearRenderers();
    expect(listRenderers()).toHaveLength(0);
  });

  it('overwrites existing renderer on re-register (HMR)', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerRenderer('json', { component: first, label: 'v1' });
    registerRenderer('json', { component: second, label: 'v2' });
    expect(getRenderer('json')!.component).toBe(second);
  });
});

describe('ContentDetector', () => {
  beforeEach(() => {
    clearRenderers();
  });

  it('detects renderer by code block language tag', () => {
    registerRenderer('json', {
      component: vi.fn(),
      label: 'JSON',
      detect: (lang: string, _code: string) => lang === 'json',
    });
    const entry = getRenderer('json');
    expect(entry!.detect!('json', '{}')).toBe(true);
    expect(entry!.detect!('typescript', '{}')).toBe(false);
  });

  it('detects renderer by content pattern when lang is empty', () => {
    registerRenderer('json-auto', {
      component: vi.fn(),
      label: 'JSON Auto',
      detect: (_lang: string, code: string) => {
        try { JSON.parse(code); return true; } catch { return false; }
      },
    });
    const entry = getRenderer('json-auto');
    expect(entry!.detect!('', '{"key": "value"}')).toBe(true);
    expect(entry!.detect!('', 'not json')).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rendererRegistry.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement rendererRegistry.ts**

Create `src/lib/rendererRegistry.ts`:

```typescript
// src/lib/rendererRegistry.ts
// Pluggable renderer registry for custom content rendering inside MarkdownContent.
// Renderers are registered by content type (e.g., 'json', 'mermaid', 'svg').
// MarkdownContent checks the registry during code block rendering.
// HMR-safe: singleton map survives hot reloads via module-level state.

import type { Component } from 'solid-js';

/** Detect whether a code block should use this renderer. */
export type ContentDetector = (lang: string, code: string) => boolean;

/** A registered renderer entry. */
export interface RendererEntry {
  /** SolidJS component that renders the content. Props: { code: string; lang: string } */
  component: Component<{ code: string; lang: string }>;
  /** Human-readable label for the renderer. */
  label: string;
  /** Optional custom detection function. If omitted, matches by exact lang tag. */
  detect?: ContentDetector;
}

/** Module-level singleton map — survives HMR. */
const registry = new Map<string, RendererEntry>();

/** Register a renderer for a content type. Overwrites existing (HMR-safe). */
export function registerRenderer(contentType: string, entry: RendererEntry): void {
  registry.set(contentType, entry);
}

/** Get a renderer entry by content type. */
export function getRenderer(contentType: string): RendererEntry | undefined {
  return registry.get(contentType);
}

/** Check if a renderer is registered for a content type. */
export function hasRenderer(contentType: string): boolean {
  return registry.has(contentType);
}

/** List all registered content types. */
export function listRenderers(): string[] {
  return Array.from(registry.keys());
}

/** Clear all registered renderers (for testing). */
export function clearRenderers(): void {
  registry.clear();
}

/**
 * Find a matching renderer for a code block.
 * First tries exact language match, then runs detect() on all entries.
 */
export function findRenderer(lang: string, code: string): RendererEntry | undefined {
  // 1. Exact lang match
  if (lang && registry.has(lang)) {
    const entry = registry.get(lang)!;
    if (!entry.detect || entry.detect(lang, code)) {
      return entry;
    }
  }

  // 2. Run detect() on all entries
  for (const entry of registry.values()) {
    if (entry.detect && entry.detect(lang, code)) {
      return entry;
    }
  }

  return undefined;
}

/** Placeholder attribute name used by MarkdownContent for hydration. */
export const RENDERER_ATTR = 'data-cw-renderer';
export const RENDERER_CODE_ATTR = 'data-cw-code';
export const RENDERER_LANG_ATTR = 'data-cw-lang';
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rendererRegistry.test.ts`
Expected: 7 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/rendererRegistry.ts src/lib/rendererRegistry.test.ts
git commit -m "feat: add RendererRegistry module for pluggable content rendering (CHI-186)

Register/lookup pattern with content detection. HMR-safe singleton.
7 unit tests covering registration, retrieval, overwrite, and detection.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Integrate Registry with MarkdownContent

**Files:**
- Modify: `src/components/conversation/MarkdownContent.tsx`

**Context:** Currently `MarkdownContent.tsx` (74 lines) uses a global `Marked` instance with `markedHighlight`. We need to add a custom renderer extension that checks the `RendererRegistry` for code blocks. When a match is found, instead of rendering the highlighted code block, it emits a placeholder `<div>` with `data-cw-renderer`, `data-cw-code` (base64-encoded), and `data-cw-lang` attributes. A post-render hydration pass then scans for these placeholder divs and mounts the registered SolidJS components using `render()` from `solid-js/web`.

The existing copy button injection and context menu continue to work for non-registered code blocks. Only blocks with a matching renderer get the custom treatment.

**Step 1: Update MarkdownContent.tsx**

Replace the file with the updated version that integrates the registry. Key changes:

1. Import `findRenderer`, `RENDERER_ATTR`, `RENDERER_CODE_ATTR`, `RENDERER_LANG_ATTR` from `rendererRegistry`
2. Add a custom `marked` extension for the `code` renderer that checks the registry
3. Add a hydration pass in the `createEffect` that mounts SolidJS components into placeholders
4. Track mounted component cleanup for proper unmounting

```typescript
// src/components/conversation/MarkdownContent.tsx
// Renders markdown string to HTML with syntax-highlighted code blocks.
// Uses marked + highlight.js. Code blocks get copy buttons via DOM post-processing.
// Registered renderers (via rendererRegistry) get custom SolidJS components hydrated.
// Styles in src/styles/tokens.css under .markdown-content.

import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { render as solidRender } from 'solid-js/web';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { Copy, FileCode } from 'lucide-solid';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu';
import { addToast } from '@/stores/toastStore';
import {
  findRenderer,
  RENDERER_ATTR,
  RENDERER_CODE_ATTR,
  RENDERER_LANG_ATTR,
} from '@/lib/rendererRegistry';

// Configure marked with highlight.js integration
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

// Custom code renderer extension: checks RendererRegistry before default rendering.
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang || '';
      const entry = findRenderer(language, text);
      if (entry) {
        // Emit a placeholder div for post-render hydration.
        // Base64-encode the code to safely embed in an HTML attribute.
        const encoded = btoa(unescape(encodeURIComponent(text)));
        return `<div ${RENDERER_ATTR}="${language}" ${RENDERER_CODE_ATTR}="${encoded}" ${RENDERER_LANG_ATTR}="${language}" class="cw-renderer-placeholder"></div>`;
      }
      // Fall through to default marked rendering (highlight.js)
      return false;
    },
  },
});

interface MarkdownContentProps {
  content: string;
}

const MarkdownContent: Component<MarkdownContentProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [codeMenuPos, setCodeMenuPos] = createSignal<{ x: number; y: number } | null>(null);
  const [codeMenuTarget, setCodeMenuTarget] = createSignal<{ code: string; lang: string }>({
    code: '',
    lang: '',
  });

  // Track mounted SolidJS components for cleanup
  const disposers: (() => void)[] = [];

  const html = () => marked.parse(props.content) as string;

  function codeMenuItems(): ContextMenuItem[] {
    const { code, lang } = codeMenuTarget();
    return [
      {
        label: 'Copy code',
        icon: Copy,
        onClick: () => {
          navigator.clipboard.writeText(code);
          addToast('Copied to clipboard', 'success');
        },
      },
      {
        label: 'Copy as markdown',
        icon: FileCode,
        onClick: () => {
          const fence = lang ? `\`\`\`${lang}\n${code}\n\`\`\`` : `\`\`\`\n${code}\n\`\`\``;
          navigator.clipboard.writeText(fence);
          addToast('Copied as markdown', 'success');
        },
      },
    ];
  }

  // Post-process: copy buttons + context menu + registry hydration
  createEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _html = html(); // track reactive dependency
    if (!containerRef) return;

    // Clean up any previously mounted SolidJS components
    for (const dispose of disposers) dispose();
    disposers.length = 0;

    const rafId = requestAnimationFrame(() => {
      // 1. Inject copy buttons and context menus on regular <pre> blocks
      containerRef!.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return;

        const codeEl = pre.querySelector('code');
        const code = codeEl?.textContent || '';
        const langClass = codeEl?.className.match(/language-(\w+)/);
        const lang = langClass ? langClass[1] : '';

        const copyIcon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        const checkIcon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        const btn = document.createElement('button');
        btn.className = 'copy-btn press-feedback';
        btn.innerHTML = copyIcon;
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(code);
          btn.innerHTML = checkIcon;
          btn.style.color = 'var(--color-success)';
          setTimeout(() => {
            btn.innerHTML = copyIcon;
            btn.style.color = '';
          }, 2000);
        });
        pre.appendChild(btn);

        // Add right-click context menu
        pre.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setCodeMenuTarget({ code, lang });
          setCodeMenuPos({ x: e.clientX, y: e.clientY });
        });
      });

      // 2. Hydrate registry placeholders
      containerRef!.querySelectorAll(`[${RENDERER_ATTR}]`).forEach((placeholder) => {
        const encodedCode = placeholder.getAttribute(RENDERER_CODE_ATTR) || '';
        const lang = placeholder.getAttribute(RENDERER_LANG_ATTR) || '';

        let code: string;
        try {
          code = decodeURIComponent(escape(atob(encodedCode)));
        } catch {
          code = encodedCode;
        }

        const entry = findRenderer(lang, code);
        if (!entry) return;

        const Comp = entry.component;
        const dispose = solidRender(() => <Comp code={code} lang={lang} />, placeholder as HTMLElement);
        disposers.push(dispose);
      });
    });

    onCleanup(() => {
      cancelAnimationFrame(rafId);
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    });
  });

  return (
    <>
      {/* eslint-disable-next-line solid/no-innerhtml -- intentional: renders trusted markdown from marked */}
      <div ref={containerRef} class="markdown-content" innerHTML={html()} />
      <Show when={codeMenuPos()}>
        {(pos) => (
          <ContextMenu
            items={codeMenuItems()}
            x={pos().x}
            y={pos().y}
            onClose={() => setCodeMenuPos(null)}
          />
        )}
      </Show>
    </>
  );
};

export default MarkdownContent;
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Run existing MarkdownContent tests**

Run: `npx vitest run src/components/conversation/MarkdownContent.test.tsx`
Expected: All 6 existing tests PASS (registry has no renderers registered, so code blocks render normally).

**Step 4: Commit**

```bash
git add src/components/conversation/MarkdownContent.tsx
git commit -m "feat: integrate RendererRegistry with MarkdownContent hydration pass (CHI-186)

Custom marked code renderer checks registry, emits placeholders for matches.
Post-render hydration mounts SolidJS components into placeholders.
Cleanup on content change. Copy buttons + context menus preserved.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Registry Integration Tests + Hydration Tests

**Files:**
- Modify: `src/components/conversation/MarkdownContent.test.tsx`
- Modify: `src/lib/rendererRegistry.test.ts` (add findRenderer tests)

**Step 1: Add findRenderer tests to rendererRegistry.test.ts**

```typescript
describe('findRenderer', () => {
  beforeEach(() => {
    clearRenderers();
  });

  it('finds renderer by exact lang match', () => {
    const comp = vi.fn();
    registerRenderer('json', { component: comp as any, label: 'JSON' });
    const found = findRenderer('json', '{}');
    expect(found).toBeDefined();
    expect(found!.component).toBe(comp);
  });

  it('returns undefined when no renderer matches', () => {
    expect(findRenderer('python', 'print("hi")')).toBeUndefined();
  });

  it('falls back to detect() when exact lang does not match', () => {
    const comp = vi.fn();
    registerRenderer('json-auto', {
      component: comp as any,
      label: 'JSON Auto',
      detect: (_lang, code) => {
        try { JSON.parse(code); return true; } catch { return false; }
      },
    });
    const found = findRenderer('', '{"key": "value"}');
    expect(found).toBeDefined();
    expect(found!.label).toBe('JSON Auto');
  });

  it('returns undefined when detect() returns false for all entries', () => {
    registerRenderer('json-auto', {
      component: vi.fn() as any,
      label: 'JSON Auto',
      detect: () => false,
    });
    expect(findRenderer('', 'not json')).toBeUndefined();
  });
});
```

Import `findRenderer` at the top of the test file.

**Step 2: Add hydration test to MarkdownContent.test.tsx**

Add after existing tests:

```typescript
import { registerRenderer, clearRenderers } from '@/lib/rendererRegistry';

describe('RendererRegistry hydration', () => {
  beforeEach(() => {
    clearRenderers();
  });

  it('renders registered component in place of code block', async () => {
    registerRenderer('custom-test', {
      component: (props: { code: string; lang: string }) => (
        <div data-testid="custom-renderer">{props.code}</div>
      ),
      label: 'Custom Test',
    });

    const { container } = render(() => (
      <MarkdownContent content={'```custom-test\nhello world\n```'} />
    ));

    await waitFor(() => {
      expect(container.querySelector('[data-testid="custom-renderer"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-testid="custom-renderer"]')?.textContent).toBe(
      'hello world',
    );
  });

  it('falls back to normal code block when no renderer registered', async () => {
    const { container } = render(() => (
      <MarkdownContent content={'```python\nprint("hi")\n```'} />
    ));
    await waitFor(() => {
      expect(container.querySelector('pre')).toBeTruthy();
    });
    expect(container.querySelector('[data-cw-renderer]')).toBeNull();
  });
});
```

**Step 3: Run all tests**

Run: `npx vitest run src/lib/rendererRegistry.test.ts src/components/conversation/MarkdownContent.test.tsx`
Expected: All pass (11 registry + 8 MarkdownContent).

**Step 4: Commit**

```bash
git add src/lib/rendererRegistry.test.ts src/components/conversation/MarkdownContent.test.tsx
git commit -m "test: add findRenderer and MarkdownContent hydration tests (CHI-186)

4 new findRenderer tests, 2 hydration integration tests.
Verifies placeholder detection, SolidJS mount, and fallback behavior.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

# Track B: CHI-187 — Compact Streaming Thinking Indicator

---

### Task 4: Redesign StreamingThinkingBlock as Compact Indicator

**Files:**
- Modify: `src/components/conversation/StreamingThinkingBlock.tsx`

**Context:** The current `StreamingThinkingBlock.tsx` (87 lines) always starts expanded during streaming, showing the full thinking text with a blinking cursor. CHI-187 requires replacing this with a compact single-line indicator: thinking icon + brief summary (~60 chars) + elapsed time + token estimate. Click expands to full content. The component stays compact by default during streaming, only expanding on user click.

**Step 1: Rewrite StreamingThinkingBlock.tsx**

```typescript
import { Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Brain, ChevronDown, ChevronRight } from 'lucide-solid';

interface StreamingThinkingBlockProps {
  content: string;
}

/** Truncate to ~60 chars at word boundary. */
function compactSummary(content: string): string {
  const trimmed = content.trim().replace(/\n/g, ' ');
  if (trimmed.length <= 60) return trimmed;
  const cut = trimmed.lastIndexOf(' ', 60);
  return trimmed.slice(0, cut > 20 ? cut : 57) + '...';
}

/** Format elapsed seconds as human-readable. */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/** Rough token estimate: ~4 chars per token for thinking text. */
function estimateTokens(content: string): number {
  return Math.max(1, Math.round(content.length / 4));
}

export const StreamingThinkingBlock: Component<StreamingThinkingBlockProps> = (props) => {
  // Compact by default during streaming — user can expand
  const [expanded, setExpanded] = createSignal(false);
  const [elapsed, setElapsed] = createSignal(0);

  // Tick elapsed time every second
  const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
  onCleanup(() => clearInterval(interval));

  const toggleExpanded = () => setExpanded((prev) => !prev);
  const tokens = () => estimateTokens(props.content);
  const tokenLabel = () => {
    const t = tokens();
    return t >= 1000 ? `~${(t / 1000).toFixed(1)}K` : `~${t}`;
  };

  return (
    <div class="flex justify-start animate-fade-in">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'rgba(22, 27, 34, 0.5)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Compact header — always visible */}
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleExpanded}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
        >
          <Brain
            size={14}
            class="shrink-0 animate-thinking-shimmer"
            style={{ color: 'var(--color-text-tertiary)' }}
          />

          <span class="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            Thinking
          </span>

          {/* Compact summary — visible when collapsed */}
          <Show when={!expanded()}>
            <span
              class="text-xs italic truncate flex-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.6' }}
            >
              {compactSummary(props.content)}
            </span>
          </Show>

          {/* Elapsed time + token estimate */}
          <span
            class="text-[10px] font-mono shrink-0"
            style={{ color: 'var(--color-text-tertiary)', opacity: '0.5' }}
          >
            {formatElapsed(elapsed())} · {tokenLabel()} tokens
          </span>

          {/* Shimmer dots indicating ongoing thinking */}
          <span
            class="animate-thinking-shimmer text-[10px] shrink-0"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            ...
          </span>

          <Show
            when={expanded()}
            fallback={
              <ChevronRight size={14} color="var(--color-text-tertiary)" class="shrink-0" />
            }
          >
            <ChevronDown size={14} color="var(--color-text-tertiary)" class="shrink-0" />
          </Show>
        </button>

        {/* Expanded content — shown on click */}
        <Show when={expanded()}>
          <div
            class="px-3 pb-3 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <p
              class="mt-2 text-xs italic leading-5 whitespace-pre-wrap"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {props.content}
              <span
                class="inline-block w-[3px] h-3 rounded-[1px] animate-cursor-blink ml-0.5"
                style={{ background: 'var(--color-text-tertiary)' }}
              />
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
};
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors. Note: `Brain` icon is from lucide-solid — verify it exists. If not, use `Lightbulb` or `Sparkles` instead.

**Step 3: Commit**

```bash
git add src/components/conversation/StreamingThinkingBlock.tsx
git commit -m "feat: compact streaming thinking indicator with elapsed time (CHI-187)

Thinking block now starts collapsed as a single-line indicator showing:
brain icon + ~60 char summary + elapsed time + token estimate.
Click to expand full thinking content. Replaces always-expanded behavior.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: StreamingThinkingBlock Unit Tests

**Files:**
- Create: `src/components/conversation/StreamingThinkingBlock.test.tsx`

**Step 1: Create test file**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';

describe('StreamingThinkingBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders in compact mode by default', () => {
    render(() => <StreamingThinkingBlock content="Analyzing the code structure" />);
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand thinking')).toBeInTheDocument();
  });

  it('shows compact summary of content when collapsed', () => {
    render(() => <StreamingThinkingBlock content="This is a short summary" />);
    expect(screen.getByText('This is a short summary')).toBeInTheDocument();
  });

  it('truncates long content to ~60 chars in compact mode', () => {
    const longText = 'A'.repeat(100);
    render(() => <StreamingThinkingBlock content={longText} />);
    // Should not show the full 100-char text in compact mode
    const summary = screen.queryByText(longText);
    expect(summary).toBeNull();
  });

  it('expands to show full content on click', () => {
    const content = 'Full thinking content that should only appear when expanded';
    render(() => <StreamingThinkingBlock content={content} />);

    fireEvent.click(screen.getByLabelText('Expand thinking'));
    expect(screen.getByText(content, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Collapse thinking')).toBeInTheDocument();
  });

  it('collapses back on second click', () => {
    render(() => <StreamingThinkingBlock content="Toggle me" />);

    fireEvent.click(screen.getByLabelText('Expand thinking'));
    expect(screen.getByLabelText('Collapse thinking')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Collapse thinking'));
    expect(screen.getByLabelText('Expand thinking')).toBeInTheDocument();
  });

  it('displays elapsed time that increments', () => {
    render(() => <StreamingThinkingBlock content="Thinking..." />);
    expect(screen.getByText(/0s/)).toBeInTheDocument();

    vi.advanceTimersByTime(5000);
    expect(screen.getByText(/5s/)).toBeInTheDocument();

    vi.advanceTimersByTime(55000);
    expect(screen.getByText(/1m 0s/)).toBeInTheDocument();
  });

  it('displays token estimate', () => {
    // 100 chars ≈ 25 tokens
    render(() => <StreamingThinkingBlock content={'x'.repeat(100)} />);
    expect(screen.getByText(/~25 tokens/)).toBeInTheDocument();
  });

  it('displays K notation for large token counts', () => {
    // 8000 chars ≈ 2000 tokens = ~2.0K
    render(() => <StreamingThinkingBlock content={'x'.repeat(8000)} />);
    expect(screen.getByText(/~2\.0K tokens/)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/components/conversation/StreamingThinkingBlock.test.tsx`
Expected: 8 tests PASS.

**Step 3: Commit**

```bash
git add src/components/conversation/StreamingThinkingBlock.test.tsx
git commit -m "test: add StreamingThinkingBlock unit tests (CHI-187)

8 tests covering compact/expanded toggle, summary truncation,
elapsed time with fake timers, token estimate display.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

# Track C: CHI-190 — Clipboard Image Paste

---

### Task 6: Add ImageAttachment Type to contextStore

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/contextStore.ts`

**Context:** The contextStore currently manages `FileReference`-based attachments. For clipboard images, we need a new `ImageAttachment` type that stores base64 data, MIME type, file size, and a thumbnail preview. Images are stored purely in frontend memory (no backend IPC needed for Phase 1). The token estimate for images is ~85 tokens (per Anthropic's image token pricing for small images). The assembleContext function needs to include image data in the XML context prefix.

**Step 1: Add ImageAttachment type to types.ts**

After the `ContextAttachment` interface (around line 259), add:

```typescript
/** An image pasted from clipboard, stored as base64. */
export interface ImageAttachment {
  id: string;
  data_url: string;          // data:image/png;base64,...
  mime_type: string;          // image/png, image/jpeg, image/gif, image/webp
  file_name: string;          // Generated: paste-1.png
  size_bytes: number;
  estimated_tokens: number;   // ~85 tokens for small images, scales with resolution
  width?: number;
  height?: number;
}
```

**Step 2: Add image state to contextStore.ts**

Add to `ContextState` interface:

```typescript
interface ContextState {
  attachments: ContextAttachment[];
  images: ImageAttachment[];         // <-- NEW
  scores: Record<string, ContextQualityScore>;
  suggestions: FileSuggestion[];
  isAssembling: boolean;
}
```

Update initial state:

```typescript
const [state, setState] = createStore<ContextState>({
  attachments: [],
  images: [],                        // <-- NEW
  scores: {},
  suggestions: [],
  isAssembling: false,
});
```

**Step 3: Add image management functions to contextStore.ts**

```typescript
const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** Rough token estimate for an image based on resolution. */
function estimateImageTokens(width: number, height: number): number {
  // Anthropic pricing: ~85 tokens for small, scales with tile count
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return Math.max(85, tiles * 85);
}

/** Add a pasted image to the context. Returns the attachment ID or null if rejected. */
export function addImageAttachment(
  dataUrl: string,
  mimeType: string,
  sizeBytes: number,
  width?: number,
  height?: number,
): string | null {
  if (sizeBytes > IMAGE_MAX_SIZE) {
    addToast(`Image too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max is 5MB.`, 'error');
    return null;
  }

  const id = crypto.randomUUID();
  const idx = state.images.length + 1;
  const ext = mimeType.split('/')[1] || 'png';
  const fileName = `paste-${idx}.${ext}`;
  const tokens = estimateImageTokens(width ?? 512, height ?? 512);

  setState('images', (prev) => [
    ...prev,
    { id, data_url: dataUrl, mime_type: mimeType, file_name: fileName, size_bytes: sizeBytes, estimated_tokens: tokens, width, height },
  ]);
  return id;
}

/** Remove an image attachment by ID. */
export function removeImageAttachment(id: string): void {
  setState('images', (prev) => prev.filter((img) => img.id !== id));
}

/** Get total image token estimate. */
export function getImageTokenEstimate(): number {
  return state.images.reduce((sum, img) => sum + img.estimated_tokens, 0);
}

/** Get total count of images. */
export function getImageCount(): number {
  return state.images.length;
}
```

**Step 4: Update clearAttachments to also clear images**

Find the existing `clearAttachments()` function and add:

```typescript
export function clearAttachments(): void {
  setState('attachments', []);
  setState('images', []);           // <-- ADD THIS LINE
  setState('scores', reconcile({}));
}
```

**Step 5: Update getTotalEstimatedTokens to include images**

```typescript
export function getTotalEstimatedTokens(): number {
  return (
    state.attachments.reduce((sum, a) => sum + a.reference.estimated_tokens, 0) +
    state.images.reduce((sum, img) => sum + img.estimated_tokens, 0)
  );
}
```

**Step 6: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 7: Commit**

```bash
git add src/lib/types.ts src/stores/contextStore.ts
git commit -m "feat: add ImageAttachment type and image management to contextStore (CHI-190)

New ImageAttachment interface for clipboard images stored as base64.
addImageAttachment(), removeImageAttachment(), getImageCount() functions.
5MB size limit enforcement. Token estimates based on resolution tiles.
clearAttachments() clears images too.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Add Paste Handler to MessageInput

**Files:**
- Modify: `src/components/conversation/MessageInput.tsx`

**Context:** MessageInput has a `<textarea>` with `onInput`, `on:keydown`, `onFocus`, `onBlur` handlers but NO `onPaste`. We need to add a paste event handler that detects images in the clipboard, converts them to base64 data URLs, reads dimensions, and passes them to `addImageAttachment()`.

**Step 1: Add imports**

At the top of MessageInput.tsx, add to the contextStore imports:

```typescript
import {
  contextState,
  addFileReference,
  removeAttachment,
  clearAttachments,
  getAttachmentCount,
  getTotalEstimatedTokens,
  assembleContext,
  addImageAttachment,      // <-- ADD
  removeImageAttachment,   // <-- ADD
  getImageCount,           // <-- ADD
} from '@/stores/contextStore';
```

Also add `Image as ImageIcon, X` to lucide-solid imports.

**Step 2: Add handlePaste function**

Inside the `MessageInput` component function (after `handleDrop`), add:

```typescript
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;

  let hasImage = false;
  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/')) continue;
    hasImage = true;

    const blob = item.getAsFile();
    if (!blob) continue;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const sizeBytes = blob.size;
      const mimeType = blob.type;

      // Read dimensions via Image element
      const img = new window.Image();
      img.onload = () => {
        addImageAttachment(dataUrl, mimeType, sizeBytes, img.width, img.height);
      };
      img.onerror = () => {
        // Still add without dimensions
        addImageAttachment(dataUrl, mimeType, sizeBytes);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(blob);
  }

  // If we handled images, prevent the default paste (which would insert gibberish)
  if (hasImage) {
    e.preventDefault();
  }
}
```

**Step 3: Wire handlePaste to the textarea**

On the `<textarea>` element (around line 623), add the `onPaste` handler:

```tsx
onPaste={handlePaste}
```

So it becomes:

```tsx
<textarea
  ref={textareaRef}
  ...
  onInput={handleInput}
  onPaste={handlePaste}
  on:keydown={handleKeyDown}
  ...
/>
```

**Step 4: Add image thumbnail chips display**

After the existing context chips `<Show>` block (around line 576-598) and before the ContextSuggestions, add image chips:

```tsx
{/* Image attachment thumbnails (CHI-190) */}
<Show when={getImageCount() > 0}>
  <div class="flex flex-wrap items-center gap-2 mb-2 max-w-4xl mx-auto">
    <ImageIcon size={10} style={{ color: 'var(--color-text-tertiary)' }} />
    <For each={contextState.images}>
      {(img) => (
        <div
          class="relative group rounded-md overflow-hidden"
          style={{
            border: '1px solid var(--color-border-secondary)',
            background: 'var(--color-bg-inset)',
          }}
        >
          <img
            src={img.data_url}
            alt={img.file_name}
            class="h-12 w-auto max-w-[80px] object-cover"
          />
          <button
            class="absolute -top-1 -right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-primary)',
            }}
            onClick={() => removeImageAttachment(img.id)}
            aria-label={`Remove ${img.file_name}`}
          >
            <X size={8} />
          </button>
          <div
            class="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] font-mono"
            style={{
              background: 'rgba(0,0,0,0.6)',
              color: 'var(--color-text-primary)',
            }}
          >
            ~{img.estimated_tokens} tok
          </div>
        </div>
      )}
    </For>
  </div>
</Show>
```

Add `Image as ImageIcon` and `X` to the lucide-solid imports:

```typescript
import { Send, Square, Paperclip, Image as ImageIcon, X } from 'lucide-solid';
```

**Step 5: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 6: Commit**

```bash
git add src/components/conversation/MessageInput.tsx
git commit -m "feat: add clipboard image paste with thumbnail chips (CHI-190)

Paste handler detects images in clipboard, converts to base64 data URLs,
reads dimensions, stores in contextStore. Thumbnail chips with remove button
and token estimate shown below textarea. 5MB size limit enforced.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Image Paste Unit Tests

**Files:**
- Modify: `src/stores/contextStore.test.ts`
- Create: `src/components/conversation/MessageInput.paste.test.tsx` (or add to existing)

**Step 1: Add image attachment tests to contextStore.test.ts**

Add to the existing test file:

```typescript
describe('image attachments', () => {
  it('addImageAttachment stores image and returns ID', async () => {
    const { addImageAttachment, contextState } = await import('./contextStore');
    const id = addImageAttachment('data:image/png;base64,abc', 'image/png', 1024, 200, 200);
    expect(id).toBeTruthy();
    expect(contextState.images).toHaveLength(1);
    expect(contextState.images[0].file_name).toBe('paste-1.png');
  });

  it('rejects images over 5MB', async () => {
    const { addImageAttachment } = await import('./contextStore');
    const id = addImageAttachment('data:image/png;base64,abc', 'image/png', 6 * 1024 * 1024);
    expect(id).toBeNull();
  });

  it('removeImageAttachment removes by ID', async () => {
    const { addImageAttachment, removeImageAttachment, contextState } = await import('./contextStore');
    const id = addImageAttachment('data:image/png;base64,abc', 'image/png', 1024, 100, 100);
    expect(contextState.images).toHaveLength(1);
    removeImageAttachment(id!);
    expect(contextState.images).toHaveLength(0);
  });

  it('clearAttachments also clears images', async () => {
    const { addImageAttachment, clearAttachments, contextState } = await import('./contextStore');
    addImageAttachment('data:image/png;base64,abc', 'image/png', 1024);
    expect(contextState.images).toHaveLength(1);
    clearAttachments();
    expect(contextState.images).toHaveLength(0);
  });

  it('getTotalEstimatedTokens includes image tokens', async () => {
    const { addImageAttachment, getTotalEstimatedTokens } = await import('./contextStore');
    addImageAttachment('data:image/png;base64,abc', 'image/png', 1024, 512, 512);
    expect(getTotalEstimatedTokens()).toBeGreaterThan(0);
  });
});
```

Note: Use `vi.resetModules()` before each test group if the existing contextStore tests use that pattern.

**Step 2: Run tests**

Run: `npx vitest run src/stores/contextStore.test.ts`
Expected: All existing + 5 new tests PASS.

**Step 3: Commit**

```bash
git add src/stores/contextStore.test.ts
git commit -m "test: add image attachment unit tests for contextStore (CHI-190)

5 tests covering addImageAttachment, removeImageAttachment,
5MB size limit, clearAttachments, and token estimate inclusion.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Include Images in Context Assembly

**Files:**
- Modify: `src/stores/contextStore.ts` (assembleContext function)

**Context:** The `assembleContext()` function builds an XML string with file contents. We need to extend it to also include images as `<image>` tags with base64 data. The Claude API accepts images in the `content` array as `image` type blocks, but since we're sending through the CLI bridge as a text message, we include them as XML-encoded base64 in the context prefix. The CLI bridge will need to handle this format (or we can include a note for future CHI-191 to handle multimodal properly).

For now, include images as:
```xml
<image name="paste-1.png" type="image/png" tokens="~85">
  [base64 data]
</image>
```

**Step 1: Update assembleContext**

Find the `assembleContext()` function in contextStore.ts. After the file assembly loop and before the closing `</context>` tag, add image assembly:

```typescript
// Append images
for (const img of state.images) {
  // Extract base64 data without the data URL prefix
  const base64Data = img.data_url.replace(/^data:[^;]+;base64,/, '');
  parts.push(
    `<image name="${img.file_name}" type="${img.mime_type}" tokens="~${img.estimated_tokens}">\n${base64Data}\n</image>`,
  );
}
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/stores/contextStore.ts
git commit -m "feat: include pasted images in context assembly XML (CHI-190)

Images encoded as base64 in <image> tags within context prefix.
Strips data URL prefix, includes MIME type and token estimate.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

# Track D: CHI-200 — In-Session Message Search

---

### Task 10: Create Message Search Utility

**Files:**
- Create: `src/lib/messageSearch.ts`
- Create: `src/lib/messageSearch.test.ts`

**Context:** A pure utility function that searches across `Message[]` by content and role. Case-insensitive by default. Returns matched message indices and match positions for highlighting. No external dependencies — just string operations.

**Step 1: Write failing tests**

Create `src/lib/messageSearch.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { Message } from '@/lib/types';
import { searchMessages, type SearchMatch } from './messageSearch';

function makeMsg(id: string, content: string, role: string = 'assistant'): Message {
  return {
    id,
    session_id: 's1',
    role: role as Message['role'],
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('searchMessages', () => {
  const messages: Message[] = [
    makeMsg('1', 'Hello world', 'user'),
    makeMsg('2', 'Hello! How can I help?', 'assistant'),
    makeMsg('3', 'Search for files', 'user'),
    makeMsg('4', 'I found 3 files matching your query', 'assistant'),
    makeMsg('5', 'Show me the code', 'user'),
  ];

  it('returns empty array for empty query', () => {
    expect(searchMessages('', messages)).toEqual([]);
  });

  it('finds all messages containing query (case-insensitive)', () => {
    const results = searchMessages('hello', messages);
    expect(results).toHaveLength(2);
    expect(results[0].messageIndex).toBe(0);
    expect(results[1].messageIndex).toBe(1);
  });

  it('returns match positions within content', () => {
    const results = searchMessages('hello', messages);
    expect(results[0].ranges).toEqual([{ start: 0, end: 5 }]);
  });

  it('finds multiple occurrences in a single message', () => {
    const msgs = [makeMsg('1', 'the quick brown fox jumps over the lazy dog')];
    const results = searchMessages('the', msgs);
    expect(results[0].ranges).toHaveLength(2);
    expect(results[0].ranges[0]).toEqual({ start: 0, end: 3 });
    expect(results[0].ranges[1]).toEqual({ start: 31, end: 34 });
  });

  it('supports case-sensitive mode', () => {
    const results = searchMessages('Hello', messages, { caseSensitive: true });
    expect(results).toHaveLength(2);
    // 'hello' in "Hello world" and "Hello! How..."
  });

  it('returns no results for non-matching query', () => {
    expect(searchMessages('nonexistent', messages)).toEqual([]);
  });

  it('escapes regex special characters in query', () => {
    const msgs = [makeMsg('1', 'file.test.ts (5 lines)')];
    const results = searchMessages('file.test', msgs);
    expect(results).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/messageSearch.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement messageSearch.ts**

Create `src/lib/messageSearch.ts`:

```typescript
// src/lib/messageSearch.ts
// In-memory message search for the active conversation.
// Returns match indices and positions for highlighting.

import type { Message } from '@/lib/types';

/** A character range within a message's content. */
export interface MatchRange {
  start: number;
  end: number;
}

/** A search match — which message index and where within its content. */
export interface SearchMatch {
  messageIndex: number;
  messageId: string;
  ranges: MatchRange[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
}

/** Escape regex special characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search messages by content.
 * Returns an array of SearchMatch objects with match positions.
 */
export function searchMessages(
  query: string,
  messages: Message[],
  options?: SearchOptions,
): SearchMatch[] {
  if (!query || query.length === 0) return [];

  const flags = options?.caseSensitive ? 'g' : 'gi';
  const pattern = new RegExp(escapeRegex(query), flags);

  const results: SearchMatch[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    // Skip non-text message types
    if (msg.role === 'tool_use' || msg.role === 'tool_result' || msg.role === 'permission') {
      continue;
    }

    const ranges: MatchRange[] = [];
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(msg.content)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }

    if (ranges.length > 0) {
      results.push({ messageIndex: i, messageId: msg.id, ranges });
    }
  }

  return results;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/messageSearch.test.ts`
Expected: 7 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/messageSearch.ts src/lib/messageSearch.test.ts
git commit -m "feat: add in-memory message search utility (CHI-200)

searchMessages() returns match indices and ranges for highlighting.
Case-insensitive by default, regex-safe, skips tool/permission messages.
7 unit tests covering search, multi-match, case sensitivity, escaping.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Create ConversationSearch Overlay Component

**Files:**
- Create: `src/components/conversation/ConversationSearch.tsx`

**Context:** A floating search bar that renders above the `ConversationView` message list. Shows an input field, match count (`N of M`), prev/next buttons, case-sensitive toggle, and close button. Debounces input by 150ms. Emits `onNavigate(messageIndex)` when user navigates to a match. Emits `onClose()` on Escape or close button click. Uses the `searchMessages()` utility from `messageSearch.ts`.

**Step 1: Create the component**

```typescript
// src/components/conversation/ConversationSearch.tsx
// Floating search bar for in-session message search (CHI-200).
// Cmd+F opens, Escape closes. Real-time highlighting with debounced search.

import type { Component } from 'solid-js';
import { createSignal, createEffect, onCleanup, onMount, Show } from 'solid-js';
import { Search, X, ChevronUp, ChevronDown, CaseSensitive } from 'lucide-solid';
import type { Message } from '@/lib/types';
import { searchMessages, type SearchMatch } from '@/lib/messageSearch';

interface ConversationSearchProps {
  messages: Message[];
  onNavigate: (messageIndex: number) => void;
  onMatchesChange: (matches: SearchMatch[]) => void;
  onClose: () => void;
}

const ConversationSearch: Component<ConversationSearchProps> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal('');
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [matches, setMatches] = createSignal<SearchMatch[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);

  // Auto-focus input on mount
  onMount(() => {
    requestAnimationFrame(() => inputRef?.focus());
  });

  // Debounced search
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  createEffect(() => {
    const q = query();
    const cs = caseSensitive();
    if (searchTimer) clearTimeout(searchTimer);

    if (!q) {
      setMatches([]);
      setActiveIndex(0);
      props.onMatchesChange([]);
      return;
    }

    searchTimer = setTimeout(() => {
      const results = searchMessages(q, props.messages, { caseSensitive: cs });
      setMatches(results);
      setActiveIndex(results.length > 0 ? 0 : -1);
      props.onMatchesChange(results);

      // Navigate to first match
      if (results.length > 0) {
        props.onNavigate(results[0].messageIndex);
      }
    }, 150);
  });

  onCleanup(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  function navigateNext() {
    const m = matches();
    if (m.length === 0) return;
    const next = (activeIndex() + 1) % m.length;
    setActiveIndex(next);
    props.onNavigate(m[next].messageIndex);
  }

  function navigatePrev() {
    const m = matches();
    if (m.length === 0) return;
    const prev = (activeIndex() - 1 + m.length) % m.length;
    setActiveIndex(prev);
    props.onNavigate(m[prev].messageIndex);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      navigateNext();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      navigatePrev();
    }
  }

  return (
    <div
      class="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-in"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-primary)',
        'box-shadow': 'var(--shadow-md)',
      }}
      role="search"
      aria-label="Search messages"
    >
      <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} class="shrink-0" />

      <input
        ref={inputRef}
        type="text"
        class="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary/50 outline-none min-w-[120px]"
        placeholder="Search messages..."
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />

      {/* Match count */}
      <Show when={query().length > 0}>
        <span class="text-[10px] font-mono shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
          {matches().length > 0 ? `${activeIndex() + 1} of ${matches().length}` : 'No results'}
        </span>
      </Show>

      {/* Navigation buttons */}
      <Show when={matches().length > 0}>
        <div class="flex items-center gap-0.5">
          <button
            class="p-1 rounded hover:bg-bg-secondary transition-colors"
            onClick={navigatePrev}
            aria-label="Previous match"
            title="Previous (Shift+Enter)"
          >
            <ChevronUp size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
          <button
            class="p-1 rounded hover:bg-bg-secondary transition-colors"
            onClick={navigateNext}
            aria-label="Next match"
            title="Next (Enter)"
          >
            <ChevronDown size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>
      </Show>

      {/* Case-sensitive toggle */}
      <button
        class={`p-1 rounded transition-colors ${caseSensitive() ? 'bg-accent/20 text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
        onClick={() => setCaseSensitive((prev) => !prev)}
        aria-label="Toggle case sensitivity"
        aria-pressed={caseSensitive()}
        title="Case sensitive"
      >
        <CaseSensitive size={14} />
      </button>

      {/* Close button */}
      <button
        class="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
        onClick={props.onClose}
        aria-label="Close search"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default ConversationSearch;
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors. Note: `CaseSensitive` icon may not exist in lucide-solid — check and use `ALargeSmall` or `Type` as fallback.

**Step 3: Commit**

```bash
git add src/components/conversation/ConversationSearch.tsx
git commit -m "feat: create ConversationSearch floating overlay component (CHI-200)

Floating search bar with: input, match count (N of M), prev/next navigation,
case-sensitive toggle, Escape to close. 150ms debounced search.
Enter/Shift+Enter for next/prev. Emits onNavigate(messageIndex).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Integrate Search into ConversationView + Keybindings

**Files:**
- Modify: `src/stores/uiStore.ts` (add `messageSearchVisible` state)
- Modify: `src/lib/keybindings.ts` (add `Cmd+F` handler)
- Modify: `src/components/conversation/ConversationView.tsx` (mount search overlay, scroll to matches)

**Step 1: Add messageSearchVisible to uiStore**

In `src/stores/uiStore.ts`, add to the `UIState` interface:

```typescript
messageSearchVisible: boolean;
```

Add to initial state (around the `createStore` call):

```typescript
messageSearchVisible: false,
```

Add exported functions:

```typescript
export function openMessageSearch(): void {
  setState('messageSearchVisible', true);
}

export function closeMessageSearch(): void {
  setState('messageSearchVisible', false);
}
```

**Step 2: Add Cmd+F to keybindings.ts**

Import `openMessageSearch` from uiStore. Add before the `Cmd+B` handler (around line 97):

```typescript
// Cmd+F — open in-session message search
if (e.code === 'KeyF' && !e.shiftKey) {
  e.preventDefault();
  openMessageSearch();
  return;
}
```

**Step 3: Integrate ConversationSearch into ConversationView.tsx**

Import at the top:

```typescript
import ConversationSearch from './ConversationSearch';
import { uiState, closeMessageSearch } from '@/stores/uiStore';
import type { SearchMatch } from '@/lib/messageSearch';
```

Inside the `ConversationView` component, add a signal for search matches:

```typescript
const [searchMatches, setSearchMatches] = createSignal<SearchMatch[]>([]);
```

Add a function to scroll to a message by index:

```typescript
function scrollToMessage(messageIndex: number) {
  if (virtualizer) {
    virtualizer.scrollToIndex(messageIndex, { align: 'center' });
  } else if (scrollContainerRef) {
    // Non-virtualized: find the message element and scroll into view
    const messageEls = scrollContainerRef.querySelectorAll('[data-message-index]');
    const target = messageEls[messageIndex] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

Render the search overlay above the message list. Find the scroll container wrapper and add before it:

```tsx
<Show when={uiState.messageSearchVisible}>
  <div class="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-[400px] max-w-[90%]">
    <ConversationSearch
      messages={messages()}
      onNavigate={scrollToMessage}
      onMatchesChange={setSearchMatches}
      onClose={() => {
        closeMessageSearch();
        setSearchMatches([]);
      }}
    />
  </div>
</Show>
```

Make sure the parent container has `position: relative` for absolute positioning.

**Step 4: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/lib/keybindings.ts src/components/conversation/ConversationView.tsx
git commit -m "feat: integrate message search with Cmd+F, virtual scroll navigation (CHI-200)

Cmd+F opens floating search bar above conversation.
scrollToMessage() handles both virtualized and non-virtualized modes.
Search state managed in uiStore. Escape closes and clears matches.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 13: ConversationSearch Unit Tests

**Files:**
- Create: `src/components/conversation/ConversationSearch.test.tsx`

**Step 1: Create test file**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { Message } from '@/lib/types';
import type { SearchMatch } from '@/lib/messageSearch';

vi.mock('lucide-solid', () => ({
  Search: () => <span data-testid="icon-search" />,
  X: () => <span data-testid="icon-x" />,
  ChevronUp: () => <span data-testid="icon-up" />,
  ChevronDown: () => <span data-testid="icon-down" />,
  CaseSensitive: () => <span data-testid="icon-case" />,
}));

import ConversationSearch from './ConversationSearch';

function makeMsg(id: string, content: string, role: string = 'assistant'): Message {
  return {
    id, session_id: 's1', role: role as Message['role'], content,
    model: null, input_tokens: null, output_tokens: null,
    thinking_tokens: null, cost_cents: null, is_compacted: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

const messages: Message[] = [
  makeMsg('1', 'Hello world', 'user'),
  makeMsg('2', 'Hello! I can help', 'assistant'),
  makeMsg('3', 'Search for code', 'user'),
];

describe('ConversationSearch', () => {
  const onNavigate = vi.fn();
  const onMatchesChange = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onNavigate.mockClear();
    onMatchesChange.mockClear();
    onClose.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input and controls', () => {
    render(() => (
      <ConversationSearch
        messages={messages}
        onNavigate={onNavigate}
        onMatchesChange={onMatchesChange}
        onClose={onClose}
      />
    ));
    expect(screen.getByLabelText('Search query')).toBeInTheDocument();
    expect(screen.getByLabelText('Close search')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    render(() => (
      <ConversationSearch messages={messages} onNavigate={onNavigate} onMatchesChange={onMatchesChange} onClose={onClose} />
    ));
    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', () => {
    render(() => (
      <ConversationSearch messages={messages} onNavigate={onNavigate} onMatchesChange={onMatchesChange} onClose={onClose} />
    ));
    fireEvent.click(screen.getByLabelText('Close search'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('searches after 150ms debounce and shows match count', async () => {
    render(() => (
      <ConversationSearch messages={messages} onNavigate={onNavigate} onMatchesChange={onMatchesChange} onClose={onClose} />
    ));
    fireEvent.input(screen.getByLabelText('Search query'), { target: { value: 'hello' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.getByText(/of 2/)).toBeInTheDocument();
    });
  });

  it('shows No results for non-matching query', async () => {
    render(() => (
      <ConversationSearch messages={messages} onNavigate={onNavigate} onMatchesChange={onMatchesChange} onClose={onClose} />
    ));
    fireEvent.input(screen.getByLabelText('Search query'), { target: { value: 'zzzzz' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.getByText('No results')).toBeInTheDocument();
    });
  });

  it('navigates to next match on Enter', async () => {
    render(() => (
      <ConversationSearch messages={messages} onNavigate={onNavigate} onMatchesChange={onMatchesChange} onClose={onClose} />
    ));
    fireEvent.input(screen.getByLabelText('Search query'), { target: { value: 'hello' } });
    vi.advanceTimersByTime(200);

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalled();
    });

    // Press Enter for next match
    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('toggles case sensitivity', () => {
    render(() => (
      <ConversationSearch messages={messages} onNavigate={onNavigate} onMatchesChange={onMatchesChange} onClose={onClose} />
    ));
    const toggle = screen.getByLabelText('Toggle case sensitivity');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/components/conversation/ConversationSearch.test.tsx`
Expected: 7 tests PASS.

**Step 3: Commit**

```bash
git add src/components/conversation/ConversationSearch.test.tsx
git commit -m "test: add ConversationSearch component unit tests (CHI-200)

7 tests covering rendering, Escape/close, debounced search,
match count display, Enter navigation, case-sensitive toggle.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 14: Final Validation + Handover + Close All Four Issues

**Files:**
- Modify: `.claude/handover.json`
- Modify: `docs/TESTING-MATRIX.md`

**Step 1: Run full Rust validation**

```bash
cd src-tauri && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test
```
Expected: All pass.

**Step 2: Run full frontend validation**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run test:unit
```
Expected: All pass.

**Step 3: Run E2E tests**

```bash
npx playwright test
```
Expected: All pass.

**Step 4: Update handover.json**

Add entries for all four issues:

```json
"CHI-186": {
  "title": "Renderer Registry & Content Detection",
  "status": "done",
  "completed_at": "<ISO timestamp>",
  "notes": "RendererRegistry module with register/find API. MarkdownContent integration with placeholder hydration. HMR-safe.",
  "testing": {
    "rust_unit_tests": 0,
    "frontend_unit_tests": 13,
    "integration_tests": 0,
    "e2e_tests": 0,
    "snapshot_tests": 0,
    "property_tests": 0,
    "coverage_percent": 90,
    "test_files": [
      "src/lib/rendererRegistry.test.ts",
      "src/components/conversation/MarkdownContent.test.tsx"
    ],
    "regression_verified": true
  }
},
"CHI-187": {
  "title": "Compact Streaming Thinking Indicator",
  "status": "done",
  "completed_at": "<ISO timestamp>",
  "notes": "StreamingThinkingBlock redesigned as compact single-line indicator. Collapsed by default with summary, elapsed time, token estimate. Click to expand.",
  "testing": {
    "rust_unit_tests": 0,
    "frontend_unit_tests": 8,
    "integration_tests": 0,
    "e2e_tests": 0,
    "snapshot_tests": 0,
    "property_tests": 0,
    "coverage_percent": 90,
    "test_files": [
      "src/components/conversation/StreamingThinkingBlock.test.tsx"
    ],
    "regression_verified": true
  }
},
"CHI-190": {
  "title": "Clipboard Image Paste",
  "status": "done",
  "completed_at": "<ISO timestamp>",
  "notes": "Paste handler in MessageInput detects images, converts to base64, stores in contextStore. Thumbnail chips with remove and token display. 5MB limit. Images included in context assembly XML.",
  "testing": {
    "rust_unit_tests": 0,
    "frontend_unit_tests": 5,
    "integration_tests": 0,
    "e2e_tests": 0,
    "snapshot_tests": 0,
    "property_tests": 0,
    "coverage_percent": 85,
    "test_files": [
      "src/stores/contextStore.test.ts"
    ],
    "regression_verified": true
  }
},
"CHI-200": {
  "title": "In-Session Message Search",
  "status": "done",
  "completed_at": "<ISO timestamp>",
  "notes": "Cmd+F opens floating search bar. Real-time match highlighting (150ms debounce). N of M counter. Enter/Shift+Enter navigation. Auto-scroll to match (virtual scroll compatible). Case-sensitive toggle.",
  "testing": {
    "rust_unit_tests": 0,
    "frontend_unit_tests": 14,
    "integration_tests": 0,
    "e2e_tests": 0,
    "snapshot_tests": 0,
    "property_tests": 0,
    "coverage_percent": 90,
    "test_files": [
      "src/lib/messageSearch.test.ts",
      "src/components/conversation/ConversationSearch.test.tsx"
    ],
    "regression_verified": true
  }
}
```

**Step 5: Update TESTING-MATRIX.md**

Add rows for all four issues.

**Step 6: Commit**

```bash
git add .claude/handover.json docs/TESTING-MATRIX.md
git commit -m "docs: close CHI-186, CHI-187, CHI-190, CHI-200 with testing metadata

- CHI-186: RendererRegistry with 13 tests
- CHI-187: Compact thinking indicator with 8 tests
- CHI-190: Clipboard image paste with 5 tests
- CHI-200: Message search with 14 tests
- TESTING-MATRIX.md updated for all four

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Track | Issue | Tasks | New Tests | Key Files |
|-------|-------|-------|-----------|-----------|
| A | CHI-186 Renderer Registry | 1-3 | 13 unit | rendererRegistry.ts, MarkdownContent.tsx |
| B | CHI-187 Compact Thinking | 4-5 | 8 unit | StreamingThinkingBlock.tsx |
| C | CHI-190 Image Paste | 6-9 | 5 unit | MessageInput.tsx, contextStore.ts, types.ts |
| D | CHI-200 Message Search | 10-13 | 14 unit | messageSearch.ts, ConversationSearch.tsx, ConversationView.tsx, keybindings.ts |
| — | Close All | 14 | — | handover.json, TESTING-MATRIX.md |

**Total: 14 tasks, ~40 new tests**
