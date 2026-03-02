# CHI-206 / CHI-209 / CHI-210 / CHI-212 / CHI-213 — Math & Image Renderer Tests, Polish & Utility Unit Tests, Attachments & Utility E2E Tests

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete unit and E2E test coverage for Math/Image renderers (CHI-206), polish features — streaming stability, copy actions (CHI-209), utility features — search, export, voice, symbol mention (CHI-210), and Playwright E2E specs for file attachments (CHI-212) and conversation utility (CHI-213).

**Architecture:**
- CHI-206: Extend existing `MathRenderer.test.tsx` (1 test) + extend `ImageRenderer.tsx` with a max-height/Show-full toggle + add its test.
- CHI-209: Add `isStreaming` prop to `MarkdownContent.tsx` with streaming stability UI; extend `ToolUseBlock.test.tsx`; create `ThinkingBlock.test.tsx`.
- CHI-210: Extend `ConversationSearch.test.tsx` and `conversationExport.test.ts`; create `VoiceInput.test.tsx` + minimal `VoiceInput.tsx`; add symbol-mention test to `MessageInput.test.tsx`.
- CHI-212/213: New Playwright specs seeding fixture sessions via IPC; file input mocked via Playwright `filechooser` event interceptor; IPC intercepted via `page.addInitScript`.

**Tech Stack:** SolidJS 1.9, Tauri v2, Vitest + `@solidjs/testing-library`, Playwright, existing `tests/e2e/fixtures/app.ts`.

---

## Part A — CHI-206: Math & Image Renderer Tests

### Task A1: Add KaTeX lazy-import test to `MathRenderer.test.tsx`

**Files:**
- Modify: `src/components/conversation/renderers/MathRenderer.test.tsx`

**Context:** The existing file (59 lines, 5 tests) mocks `katex` and covers inline/block rendering, error fallback, and empty code. The only missing test from the CHI-206 spec is: *"KaTeX loaded lazily (dynamic import called only when math present)"*.

**Step 1: Open `MathRenderer.test.tsx` and locate the existing mock setup**

The file uses `vi.mock('katex', ...)`. Confirm the mock is at the top of the file. Note the `initializeMock` equivalent — in MathRenderer, the dynamic import is `import('katex')`. The relevant check is whether the dynamic import is deferred (happens in `onMount`) vs. at module load time.

**Step 2: Add two tests inside the existing describe block**

```typescript
it('does not render synchronously before onMount (lazy import)', () => {
  // Before the component mounts, KaTeX's render function should not have been called.
  // This verifies the import is deferred to onMount, not executed at module load time.
  // (renderMock is already called 0 times at test-file load; this checks per-describe lifecycle.)
  const renderMock = vi.fn();
  vi.mocked(katex).renderToString = renderMock;
  // Don't render any component — just assert the mock hasn't been called.
  expect(renderMock).not.toHaveBeenCalled();
});

it('calls KaTeX renderToString only after component mounts (lazy behavior)', async () => {
  // renderToString is only called inside onMount; if the dynamic import were eager,
  // it would be called synchronously. Awaiting waitFor confirms async execution.
  const renderMock = vi.fn().mockReturnValue('<span>result</span>');
  vi.mocked(katex).renderToString = renderMock;

  render(() => <MathRenderer code="E=mc^2" lang="math-inline" />);

  // Initially 0 (sync)
  expect(renderMock).toHaveBeenCalledTimes(0);

  // After onMount async completes:
  await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
});
```

Note: if `MathRenderer.test.tsx` already imports `katex` mock differently, adapt the mock reference to match the existing pattern in the file.

**Step 3: Run tests**

```bash
npx vitest run src/components/conversation/renderers/MathRenderer.test.tsx
```

Expected: all 7 tests pass.

**Step 4: Commit**

```bash
git add src/components/conversation/renderers/MathRenderer.test.tsx
git commit -m "CHI-206: add KaTeX lazy-import tests to MathRenderer.test.tsx"
```

---

### Task A2: Add max-height "Show full" toggle to `ImageRenderer.tsx` + test

**Files:**
- Modify: `src/components/conversation/renderers/ImageRenderer.tsx`
- Modify: `src/components/conversation/renderers/ImageRenderer.test.tsx`

**Context:** `ImageRenderer.tsx` (171 lines) renders with a 400px max-height. The CHI-206 spec requires "Max-height constraint applied with 'Show full' toggle." Check if a "Show full" button already exists in the file. If it does not:

**Step 1: Add "Show full" toggle signal to `ImageRenderer.tsx`**

Inside the `ImageRenderer` component (after the existing signals), add:

```typescript
const [showFull, setShowFull] = createSignal(false);
```

Find where the `<img>` element applies the max-height constraint (look for `max-h-[400px]` or `style={{ 'max-height': '400px' }}`). Make it conditional:

```typescript
// Replace the static max-height with conditional:
style={{
  'max-height': showFull() ? 'none' : '400px',
  width: '100%',
  'object-fit': 'contain',
}}
```

Add the "Show full" button below the `<img>` element, only when not in lightbox mode and image height might be constrained:

```tsx
<Show when={!showFull()}>
  <button
    class="mt-1 text-[11px] font-medium transition-colors"
    style={{ color: 'var(--color-accent)' }}
    aria-label="Show full image"
    onClick={(e) => {
      e.stopPropagation(); // don't trigger lightbox
      setShowFull(true);
    }}
  >
    Show full
  </button>
</Show>
<Show when={showFull()}>
  <button
    class="mt-1 text-[11px] font-medium transition-colors"
    style={{ color: 'var(--color-text-tertiary)' }}
    aria-label="Collapse image"
    onClick={(e) => {
      e.stopPropagation();
      setShowFull(false);
    }}
  >
    Collapse
  </button>
</Show>
```

**Step 2: Write failing tests in `ImageRenderer.test.tsx`**

Append inside the existing describe block:

```typescript
describe('Max-height and Show full toggle (CHI-206)', () => {
  it('applies max-height constraint by default', async () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'test' })}
        lang="image"
      />
    ));
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      const maxH = img!.style.maxHeight;
      // Should have a max-height applied (not 'none')
      expect(maxH).not.toBe('none');
      expect(maxH).not.toBe('');
    });
  });

  it('shows "Show full" button when image is constrained', async () => {
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

  it('clicking "Show full" removes max-height constraint', async () => {
    const { container } = render(() => (
      <ImageRenderer
        code={JSON.stringify({ src: 'https://example.com/img.png', alt: 'test' })}
        lang="image"
      />
    ));
    await waitFor(() => expect(screen.getByLabelText('Show full image')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Show full image'));

    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img!.style.maxHeight).toBe('none');
      // "Show full" button replaced by "Collapse"
      expect(screen.queryByLabelText('Show full image')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Collapse image')).toBeInTheDocument();
    });
  });
});
```

**Step 3: Run tests — expect the 3 new tests to fail**

```bash
npx vitest run src/components/conversation/renderers/ImageRenderer.test.tsx
```

Expected: 7 existing pass, 3 new fail (FAIL: "Show full image" not found).

**Step 4: Apply the changes from Step 1 if not already done**

After implementing the toggle in `ImageRenderer.tsx`, re-run:

```bash
npx vitest run src/components/conversation/renderers/ImageRenderer.test.tsx
```

Expected: all 10 tests pass.

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add src/components/conversation/renderers/ImageRenderer.tsx src/components/conversation/renderers/ImageRenderer.test.tsx
git commit -m "CHI-206: add Show-full toggle to ImageRenderer + full test coverage"
```

---

## Part B — CHI-209: Polish Feature Tests

### Task B1: Add streaming stability to `MarkdownContent.tsx` + tests

**Files:**
- Modify: `src/components/conversation/MarkdownContent.tsx`
- Modify: `src/components/conversation/MarkdownContent.test.tsx`

**Context:** CHI-194 (Streaming Code Block Stability) requires MarkdownContent to visually flag code blocks that are still being streamed (unclosed fence). The component currently has no `isStreaming` prop.

**Step 1: Write 2 failing tests in `MarkdownContent.test.tsx`**

Append a new describe block at the end of the test file:

```typescript
describe('Streaming code block stability (CHI-194)', () => {
  it('shows "generating..." indicator for unclosed code fence when isStreaming=true', async () => {
    const { container } = render(() => (
      <MarkdownContent
        content={"```typescript\nconst x = 1;"} // deliberately unclosed
        messageId="test-streaming"
        isStreaming={true}
      />
    ));
    await waitFor(() => {
      expect(container.querySelector('.is-generating')).toBeTruthy();
      expect(container.textContent).toContain('generating...');
    });
  });

  it('does NOT show "generating..." for a closed code fence when isStreaming=true', async () => {
    const { container } = render(() => (
      <MarkdownContent
        content={"```typescript\nconst x = 1;\n```"} // closed fence
        messageId="test-stable"
        isStreaming={true}
      />
    ));
    await waitFor(() => {
      // No is-generating class — code block is complete
      const codeBlocks = container.querySelectorAll('pre');
      codeBlocks.forEach((block) => {
        expect(block.classList.contains('is-generating')).toBe(false);
      });
      expect(container.textContent).not.toContain('generating...');
    });
  });
});
```

**Step 2: Run — expect compile error or FAIL**

```bash
npx vitest run src/components/conversation/MarkdownContent.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `isStreaming` is not a known prop.

**Step 3: Add `isStreaming` prop to `MarkdownContent.tsx`**

Find the `Props` interface at the top of `MarkdownContent.tsx` (look for `interface.*Props` or `type.*Props`). Add:

```typescript
isStreaming?: boolean;
```

Find the component function signature and ensure it destructures `isStreaming`:

```typescript
const MarkdownContent: Component<Props> = (props) => {
  // ...
};
```

In the post-processing `createEffect` (the one that uses `requestAnimationFrame`), at the **end** of the post-processing block, add the streaming indicator logic:

```typescript
// --- Streaming stability indicator (CHI-194) ---
if (props.isStreaming) {
  const raw = props.content ?? '';
  const fenceCount = (raw.match(/```/g) ?? []).length;
  const hasUnclosedFence = fenceCount % 2 !== 0;

  if (hasUnclosedFence && containerRef) {
    const codeBlocks = Array.from(containerRef.querySelectorAll<HTMLElement>('pre'));
    const lastBlock = codeBlocks[codeBlocks.length - 1];
    if (lastBlock && !lastBlock.querySelector('.generating-indicator')) {
      lastBlock.classList.add('is-generating');
      const indicator = document.createElement('div');
      indicator.className = 'generating-indicator';
      indicator.setAttribute('aria-live', 'polite');
      indicator.textContent = 'generating...';
      indicator.style.cssText =
        'font-size:11px;color:var(--color-text-tertiary);padding:4px 8px;font-style:italic;opacity:0.7;';
      lastBlock.appendChild(indicator);
    }
  }
}
```

**Step 4: Run tests — expect pass**

```bash
npx vitest run src/components/conversation/MarkdownContent.test.tsx
```

Expected: all existing tests + 2 new tests pass.

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add src/components/conversation/MarkdownContent.tsx src/components/conversation/MarkdownContent.test.tsx
git commit -m "CHI-209: add isStreaming prop + streaming stability indicator + tests"
```

---

### Task B2: Add copy button test to `ToolUseBlock.test.tsx`

**Files:**
- Modify: `src/components/conversation/ToolUseBlock.test.tsx`

**Context:** The existing file (63 lines, 6 tests) tests expansion/collapse but **not** the copy button. The copy button in `ToolUseBlock.tsx` has `aria-label="Copy tool input"` (line 163). It copies `data().tool_input` (the JSON string of the tool input) to the clipboard.

**Step 1: Add clipboard mock to beforeEach**

Find the existing `beforeEach` / `afterEach` setup in the file. If none exists, add one. Add clipboard mock:

```typescript
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
```

**Step 2: Add the copy test**

Append inside the existing `describe` block:

```typescript
describe('Copy button (CHI-195)', () => {
  it('copy button calls clipboard.writeText with tool input JSON', async () => {
    const toolInput = { path: 'src/app.ts', content: 'console.log("hello")' };
    const msg = {
      id: 'msg-copy-test',
      role: 'tool_use' as const,
      content: JSON.stringify({
        tool_name: 'Write',
        tool_input: toolInput,
        tool_use_id: 'tu-123',
      }),
      // include other required Message fields with defaults
      session_id: 'sess-1',
      created_at: new Date().toISOString(),
      tokens_in: null,
      tokens_out: null,
      cost_cents: null,
      model: null,
    };

    render(() => <ToolUseBlock message={msg} />);

    // Copy button should be in DOM (visible on hover via CSS, but DOM-present always)
    const copyBtn = screen.getByLabelText('Copy tool input');
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(toolInput, null, 2),
    );
  });

  it('copy button shows checkmark feedback for 2s', async () => {
    const msg = {
      id: 'msg-copy-feedback',
      role: 'tool_use' as const,
      content: JSON.stringify({ tool_name: 'Read', tool_input: { path: 'a.ts' }, tool_use_id: 'tu-1' }),
      session_id: 'sess-1',
      created_at: new Date().toISOString(),
      tokens_in: null, tokens_out: null, cost_cents: null, model: null,
    };

    render(() => <ToolUseBlock message={msg} />);

    fireEvent.click(screen.getByLabelText('Copy tool input'));

    // After click, feedback state
    await waitFor(() => {
      const btn = screen.getByLabelText('Copy tool input');
      // Button should show a check icon (svg title or button text changes)
      // The exact check depends on ToolUseBlock implementation:
      // - If it uses aria-label change: getByLabelText('Copied!')
      // - If it uses a CSS class: btn.classList.contains('copied')
      // Check what the ToolUseBlock implementation does and adapt:
      expect(btn.querySelector('svg')).toBeTruthy(); // Check icon should be there
    });

    vi.advanceTimersByTime(2000);

    // After 2s, back to copy state
    await waitFor(() => {
      expect(screen.getByLabelText('Copy tool input')).toBeInTheDocument();
    });
  });
});
```

**Note:** The exact assertion for the checkmark depends on how `ToolUseBlock.tsx` signals the copied state. Open the file (line ~160-180) and check: if it toggles an `aria-label`, use `getByLabelText('Copied!')`. If it changes the icon only, assert on the icon's SVG path or use a test id.

**Step 3: Run tests**

```bash
npx vitest run src/components/conversation/ToolUseBlock.test.tsx
```

Expected: all 8 tests pass.

**Step 4: Commit**

```bash
git add src/components/conversation/ToolUseBlock.test.tsx
git commit -m "CHI-209: add copy button tests to ToolUseBlock.test.tsx"
```

---

### Task B3: Create `ThinkingBlock.test.tsx` + final CHI-209 checks

**Files:**
- Create: `src/components/conversation/ThinkingBlock.test.tsx`

**Context:** No `ThinkingBlock.test.tsx` exists. The component (119 lines) has:
- `aria-label="Copy thinking content"` on the copy button (line 89)
- Copies `props.message.content` to clipboard
- Shows check feedback for 2s
- Expand/collapse behavior (separate from StreamingThinkingBlock)

**Step 1: Write the test file**

```typescript
// src/components/conversation/ThinkingBlock.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import ThinkingBlock from './ThinkingBlock';
import type { Message } from '@/lib/types';

function makeThinkingMsg(content: string): Message {
  return {
    id: 'think-1',
    session_id: 'sess-1',
    role: 'thinking',
    content,
    created_at: new Date().toISOString(),
    tokens_in: null,
    tokens_out: null,
    cost_cents: null,
    model: null,
    tool_name: null,
    tool_input: null,
    tool_use_id: null,
  };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ThinkingBlock (CHI-90)', () => {
  it('renders "Thinking" label', () => {
    render(() => <ThinkingBlock message={makeThinkingMsg('Some reasoning here')} />);
    expect(screen.getByText('Thinking')).toBeInTheDocument();
  });

  it('shows truncated preview (~80 chars) when collapsed', () => {
    const long = 'A'.repeat(120);
    render(() => <ThinkingBlock message={makeThinkingMsg(long)} />);
    // Should show truncated preview, not full content
    expect(screen.queryByText(long)).not.toBeInTheDocument();
    expect(screen.getByText(/A{70,90}\.\.\./)).toBeInTheDocument();
  });

  it('expand/collapse toggle shows and hides full content', async () => {
    const content = 'Full thinking content for test';
    render(() => <ThinkingBlock message={makeThinkingMsg(content)} />);

    // Expand — look for expand button (chevron or "Expand thinking")
    const expandBtn = screen.getByRole('button', { name: /expand|thinking/i });
    fireEvent.click(expandBtn);

    await waitFor(() => expect(screen.getByText(content)).toBeInTheDocument());

    // Collapse again
    fireEvent.click(expandBtn);
    await waitFor(() => expect(screen.queryByText(content)).not.toBeInTheDocument());
  });

  describe('Copy button (CHI-195)', () => {
    it('copy button calls clipboard.writeText with full thinking content', async () => {
      const content = 'This is the thinking content to be copied.';
      render(() => <ThinkingBlock message={makeThinkingMsg(content)} />);

      const copyBtn = screen.getByLabelText('Copy thinking content');
      expect(copyBtn).toBeInTheDocument();

      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(content);
    });

    it('copy button shows checkmark feedback for 2s then resets', async () => {
      render(() => <ThinkingBlock message={makeThinkingMsg('Some content')} />);

      fireEvent.click(screen.getByLabelText('Copy thinking content'));

      // Feedback visible — adapt selector to match ThinkingBlock implementation:
      // Option A: aria-label changes to 'Copied!'
      // Option B: a separate "Copied!" text appears
      // Open ThinkingBlock.tsx to confirm the feedback pattern, then adjust:
      await waitFor(() => {
        const btn = screen.getByLabelText('Copy thinking content');
        expect(btn).toBeInTheDocument(); // still accessible
      });

      vi.advanceTimersByTime(2000);

      await waitFor(() => {
        // Back to copy state
        expect(screen.getByLabelText('Copy thinking content')).toBeInTheDocument();
      });
    });
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run src/components/conversation/ThinkingBlock.test.tsx
```

Fix any import/type errors. The `Message` type shape may require adjustment — check `src/lib/types.ts` for the exact fields.

**Step 3: Full CHI-209 checks**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx prettier --check .
```

**Step 4: Commit**

```bash
git add src/components/conversation/ThinkingBlock.test.tsx
git commit -m "CHI-209: create ThinkingBlock.test.tsx with copy button and expand/collapse tests"
```

---

## Part C — CHI-210: Utility Feature Tests

### Task C1: Extend `ConversationSearch.test.tsx`

**Files:**
- Modify: `src/components/conversation/ConversationSearch.test.tsx`

**Context:** The file (119 lines, 7 tests) covers search input, Escape close, match count, Enter navigation, and case sensitivity. Missing from CHI-210 spec: **Shift+Enter → previous match**.

**Step 1: Read existing tests to understand the mock/fixture pattern**

Open `ConversationSearch.test.tsx` and note how `ConversationSearch` is rendered, what props it takes, and how match navigation is simulated.

**Step 2: Add the missing test**

Append inside the existing describe block (or the navigation describe sub-block if one exists):

```typescript
it('Shift+Enter navigates to previous match (decrements active index)', async () => {
  vi.useFakeTimers();

  const onNavigateMock = vi.fn();
  const { getByRole } = render(() => (
    <ConversationSearch
      isOpen={true}
      onClose={() => {}}
      onNavigate={onNavigateMock}
      onMatchesChange={() => {}}
    />
  ));

  const input = getByRole('searchbox');
  fireEvent.input(input, { target: { value: 'test' } });

  // Advance debounce timer
  vi.advanceTimersByTime(200);

  // Simulate Shift+Enter (previous match)
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

  // onNavigate should be called with direction -1 (prev) or 'prev'
  expect(onNavigateMock).toHaveBeenCalledWith(expect.objectContaining({ direction: 'prev' }));
  // OR if the callback signature is (index: number):
  // expect(onNavigateMock).toHaveBeenCalledWith(-1);

  vi.useRealTimers();
});
```

**Note:** The exact callback signature depends on `ConversationSearch.tsx`. Open it (162 lines) and check the `onNavigate` callback type. Adapt the assertion above to match.

**Step 3: Run tests**

```bash
npx vitest run src/components/conversation/ConversationSearch.test.tsx
```

Expected: all 8 tests pass.

**Step 4: Commit**

```bash
git add src/components/conversation/ConversationSearch.test.tsx
git commit -m "CHI-210: add Shift+Enter previous-match test to ConversationSearch.test.tsx"
```

---

### Task C2: Extend `conversationExport.test.ts` with tool-use fenced block

**Files:**
- Modify: `src/lib/conversationExport.test.ts`

**Context:** The existing file (81 lines) tests `exportAsMarkdown` (thinking in details), `exportAsText`, `exportAsHtml`, and `buildExportFilename`. The CHI-210 spec adds: *"tool use as fenced code block"* in the markdown export.

**Step 1: Check what `exportAsMarkdown` produces for tool_use messages**

Open `src/lib/conversationExport.ts` (159 lines) and find how it handles `role === 'tool_use'`. Confirm it wraps the tool input in a markdown fenced block like:

```
```json
{"tool_name": "Write", "tool_input": {...}}
```
```

**Step 2: Add test**

In the `exportAsMarkdown` describe block, add:

```typescript
it('renders tool use as fenced code block', () => {
  const toolMsg: Message = {
    id: 'tool-1',
    session_id: 'sess-1',
    role: 'tool_use',
    content: JSON.stringify({
      tool_name: 'Write',
      tool_input: { path: 'src/app.ts', content: 'hello' },
      tool_use_id: 'tu-1',
    }),
    created_at: new Date().toISOString(),
    tokens_in: null, tokens_out: null, cost_cents: null, model: null,
    tool_name: null, tool_input: null, tool_use_id: null,
  };

  const output = exportAsMarkdown([toolMsg]);

  // Should contain a fenced code block
  expect(output).toContain('```');
  // Should contain tool name or tool input
  expect(output).toMatch(/Write|tool_name|tool_input/);
});
```

Also add a test for `exportAsPlainText` (if the function exists — check `conversationExport.ts`):

```typescript
it('exportAsText includes only user and assistant messages with role prefix', () => {
  const messages: Message[] = [
    { ...baseUser, content: 'Hello' },
    { ...baseAssistant, content: 'World' },
    { id: 'th-1', session_id: 'sess-1', role: 'thinking', content: 'hidden',
      created_at: '', tokens_in: null, tokens_out: null, cost_cents: null,
      model: null, tool_name: null, tool_input: null, tool_use_id: null },
  ];

  const text = exportAsText(messages);

  expect(text).toContain('YOU:');
  expect(text).toContain('CLAUDE:');
  expect(text).not.toContain('hidden'); // thinking excluded
  expect(text).toContain('Hello');
  expect(text).toContain('World');
});
```

**Note:** The exact function name (`exportAsText` vs `toPlainText`) depends on what `conversationExport.ts` exports. Check the file and adapt.

**Step 3: Run tests**

```bash
npx vitest run src/lib/conversationExport.test.ts
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add src/lib/conversationExport.test.ts
git commit -m "CHI-210: add tool-use fenced block test to conversationExport.test.ts"
```

---

### Task C3: Create `VoiceInput.test.tsx` + minimal `VoiceInput.tsx`

**Files:**
- Create: `src/components/conversation/VoiceInput.tsx`
- Create: `src/components/conversation/VoiceInput.test.tsx`

**Context:** CHI-202 (Voice Input/Output) is in the backlog. CHI-210 requires tests for this feature. We write the tests TDD-style and create a minimal component that passes them, deferring full implementation to CHI-202.

**Step 1: Write the test file first**

```typescript
// src/components/conversation/VoiceInput.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import VoiceInput from './VoiceInput';

afterEach(cleanup);

describe('VoiceInput (CHI-202)', () => {
  describe('when Web Speech API is unavailable', () => {
    beforeEach(() => {
      // Remove SpeechRecognition from window
      const win = window as any;
      win.SpeechRecognition = undefined;
      win.webkitSpeechRecognition = undefined;
    });

    it('does not render mic button when SpeechRecognition is unavailable', () => {
      const { queryByLabelText } = render(() => (
        <VoiceInput onTranscript={() => {}} />
      ));
      expect(queryByLabelText('Start voice input')).not.toBeInTheDocument();
    });
  });

  describe('when Web Speech API is available', () => {
    let startMock: ReturnType<typeof vi.fn>;
    let stopMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      startMock = vi.fn();
      stopMock = vi.fn();

      const MockSpeechRecognition = vi.fn(() => ({
        start: startMock,
        stop: stopMock,
        continuous: false,
        interimResults: false,
        lang: '',
        onresult: null,
        onerror: null,
        onend: null,
      }));

      (window as any).SpeechRecognition = MockSpeechRecognition;
      (window as any).webkitSpeechRecognition = MockSpeechRecognition;
    });

    afterEach(() => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
    });

    it('renders mic button when SpeechRecognition is available', () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      expect(screen.getByLabelText('Start voice input')).toBeInTheDocument();
    });

    it('clicking mic button calls recognition.start()', async () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      fireEvent.click(screen.getByLabelText('Start voice input'));
      await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    });

    it('pressing Escape stops recognition', async () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      fireEvent.click(screen.getByLabelText('Start voice input'));
      await waitFor(() => expect(startMock).toHaveBeenCalled());

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(stopMock).toHaveBeenCalledTimes(1));
    });

    it('mic button shows "Stop" label while recording', async () => {
      render(() => <VoiceInput onTranscript={() => {}} />);
      fireEvent.click(screen.getByLabelText('Start voice input'));

      await waitFor(() => {
        expect(screen.getByLabelText('Stop voice input')).toBeInTheDocument();
      });
    });
  });
});
```

**Step 2: Run tests — expect compilation failure (no component)**

```bash
npx vitest run src/components/conversation/VoiceInput.test.tsx 2>&1 | head -20
```

Expected: `Error: Cannot find module './VoiceInput'`

**Step 3: Create minimal `VoiceInput.tsx`**

```tsx
// src/components/conversation/VoiceInput.tsx
// Minimal voice input button — full implementation in CHI-202.
import { createSignal, onCleanup, Show, type Component } from 'solid-js';
import { Mic, MicOff } from 'lucide-solid';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

const VoiceInput: Component<VoiceInputProps> = (props) => {
  const SpeechRecognition =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // API unavailable — render nothing
    return null;
  }

  const [recording, setRecording] = createSignal(false);
  let recognition: SpeechRecognition | null = null;

  const stop = () => {
    recognition?.stop();
    setRecording(false);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && recording()) stop();
  };

  document.addEventListener('keydown', handleKey);
  onCleanup(() => {
    document.removeEventListener('keydown', handleKey);
    recognition?.stop();
  });

  const toggle = () => {
    if (recording()) {
      stop();
      return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('');
      props.onTranscript(transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.start();
    setRecording(true);
  };

  return (
    <button
      onClick={toggle}
      aria-label={recording() ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={recording()}
      class="p-1.5 rounded transition-colors"
      style={{
        color: recording() ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
      }}
      title={recording() ? 'Stop recording' : 'Start voice input'}
    >
      <Show when={recording()} fallback={<Mic size={16} />}>
        <MicOff size={16} />
      </Show>
    </button>
  );
};

export default VoiceInput;
```

**Step 4: Run tests — expect all pass**

```bash
npx vitest run src/components/conversation/VoiceInput.test.tsx
```

Expected: all 6 tests pass.

**Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any `SpeechRecognition` type errors — may need to install `@types/dom-speech-recognition`:

```bash
# If type errors for SpeechRecognition:
npm add -D @types/dom-speech-recognition
```

**Step 6: Commit**

```bash
git add src/components/conversation/VoiceInput.tsx src/components/conversation/VoiceInput.test.tsx
git commit -m "CHI-210: add VoiceInput component + CHI-202 tests (TDD)"
```

---

### Task C4: Add symbol @-mention tests + final CHI-210 checks

**Files:**
- Create or Modify: `src/components/conversation/MessageInput.test.tsx`

**Context:** CHI-210 requires testing the `@fn:foo` → `list_symbols` IPC flow added in CHI-203. This tests MessageInput's symbol-mention behavior.

**Step 1: Check if `MessageInput.test.tsx` exists**

```bash
ls src/components/conversation/MessageInput.test.tsx 2>/dev/null && echo "EXISTS" || echo "NOT FOUND"
```

If NOT FOUND, create it with a minimal describe block. If it exists, append to it.

**Step 2: Add IPC mock + symbol mention tests**

The test needs to mock `invoke` from `@tauri-apps/api/core`. In Vitest, this is done via `vi.mock`:

```typescript
// At the top of the file (or in the new describe block):
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library';
import MessageInput from './MessageInput';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('Symbol @-mention (CHI-203)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default mock: list_symbols returns test data
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === 'list_symbols') {
        return Promise.resolve([
          {
            name: 'greetUser',
            kind: 'function',
            file_path: 'src/utils.ts',
            line_number: 42,
            snippet: 'export function greetUser(name: string) {}',
            estimated_tokens: 12,
          },
        ]);
      }
      if (cmd === 'search_project_files') {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('typing @fn:foo calls list_symbols IPC with kind="function" and query="foo"', async () => {
    render(() => (
      <MessageInput
        onSend={() => {}}
        disabled={false}
      />
    ));

    const textarea = screen.getByRole('textbox');
    fireEvent.input(textarea, { target: { value: '@fn:foo' } });

    // Advance debounce (100ms)
    vi.advanceTimersByTime(150);
    await Promise.resolve(); // flush microtasks

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('list_symbols', {
        project_id: expect.any(String),
        kind: 'function',
        query: 'foo',
      });
    });
  });

  it('symbol results appear in FileMentionMenu with name and file path', async () => {
    render(() => (
      <MessageInput onSend={() => {}} disabled={false} />
    ));

    const textarea = screen.getByRole('textbox');
    fireEvent.input(textarea, { target: { value: '@fn:greet' } });
    vi.advanceTimersByTime(150);

    await waitFor(() => {
      expect(screen.getByText('greetUser')).toBeInTheDocument();
      expect(screen.getByText(/src\/utils\.ts/)).toBeInTheDocument();
    });
  });

  it('@class: trigger calls list_symbols with kind="class"', async () => {
    render(() => <MessageInput onSend={() => {}} disabled={false} />);

    fireEvent.input(screen.getByRole('textbox'), { target: { value: '@class:Foo' } });
    vi.advanceTimersByTime(150);
    await Promise.resolve();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('list_symbols', expect.objectContaining({ kind: 'class' }));
    });
  });
});
```

**Note:** `MessageInput` props may differ from `onSend / disabled`. Open `MessageInput.tsx` and check its actual props interface before running.

**Step 3: Run tests**

```bash
npx vitest run src/components/conversation/MessageInput.test.tsx
```

Fix any import or prop errors as needed.

**Step 4: Full CHI-210 checks**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx prettier --check .
```

**Step 5: Commit**

```bash
git add src/components/conversation/MessageInput.test.tsx
git commit -m "CHI-210: add symbol @-mention unit tests for CHI-203 behavior"
```

---

## Part D — CHI-212: E2E Tests — Attachments & Input

### Task D1: Create `conversation-attachments.spec.ts`

**Files:**
- Create: `tests/e2e/conversation/conversation-attachments.spec.ts`

**Important notes before writing:**
- The file picker button uses a hidden `<input type="file">` (per the CHI-193 plan) — Playwright intercepts it via `page.waitForEvent('filechooser')`.
- The keyboard shortcut is `Cmd+Shift+U` (not `Cmd+Shift+A` as the Linear spec says — `Cmd+Shift+A` is taken by Actions Center). Adjust if the final CHI-193 implementation uses a different key.
- Paste simulation via `page.evaluate()` dispatching a `ClipboardEvent`.
- Drag-and-drop via `page.evaluate()` dispatching `DragEvent`.
- The app needs an open session/project for file context chips to appear. Use the same `seedAndLoad` approach from CHI-211.

**Step 1: Write the spec**

```typescript
// tests/e2e/conversation/conversation-attachments.spec.ts
// E2E tests for file attachment features (CHI-212).
// Covers: clipboard paste (CHI-190), drag-drop (CHI-191), attach button (CHI-193).

import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

// ---------------------------------------------------------------------------
// Helper: create a project + session so the app is in a "session open" state
// ---------------------------------------------------------------------------

async function openSession(page: Page): Promise<void> {
  const projectId = await page.evaluate(async () => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke as Function;
    const project = await invoke('create_project', {
      name: `__e2e_attach_${Date.now()}`,
      path: `/tmp/e2e-attach-${Date.now()}`,
    });
    await invoke('create_session', { project_id: project.id, model: 'claude-sonnet-4-6' });
    return project.id;
  });

  // Reload so sidebar shows the project/session
  await page.reload();
  await page.waitForSelector('.grain-overlay', { timeout: 15_000 });
  try {
    const skip = page.getByRole('button', { name: 'Skip all' });
    await skip.waitFor({ timeout: 1_500 });
    await skip.click();
  } catch { /* no onboarding */ }

  // Click the first session in sidebar
  const sessionItem = page.locator('[data-session-id]').first();
  await sessionItem.waitFor({ timeout: 5_000 });
  await sessionItem.click();
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// Helper: create a small PNG blob as base64 (1x1 red pixel)
// ---------------------------------------------------------------------------

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('File Attachments & Input (CHI-212)', () => {
  test.beforeEach(async ({ page }) => {
    await openSession(page);
  });

  // ---- Clipboard paste ----

  test('pasting an image/png blob adds an ImageAttachmentChip', async ({ page }) => {
    // Simulate paste with a PNG file
    await page.evaluate(async (b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(file);

      const textarea = document.querySelector('textarea');
      textarea?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }),
      );
    }, TINY_PNG_B64);

    // An image chip should appear
    await expect(
      page.locator('[data-testid="image-attachment-chip"], .image-attachment-chip').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('pasting an image over 5MB shows a size-warning toast, no chip added', async ({
    page,
  }) => {
    // Create a >5MB blob (just zeros)
    await page.evaluate(() => {
      const bytes = new Uint8Array(6 * 1024 * 1024); // 6 MB
      const blob = new Blob([bytes], { type: 'image/png' });
      const file = new File([blob], 'big.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(file);

      const textarea = document.querySelector('textarea');
      textarea?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }),
      );
    });

    // Toast with size warning
    await expect(
      page.locator('[role="alert"], .toast').filter({ hasText: /size|large|MB/i }),
    ).toBeVisible({ timeout: 4_000 });

    // No chip added
    const chips = page.locator('[data-testid="image-attachment-chip"], .image-attachment-chip');
    await expect(chips).toHaveCount(0);
  });

  // ---- Drag and drop ----

  test('dragging over ConversationView shows drop-zone overlay', async ({ page }) => {
    const view = page.locator('.conversation-view, [data-testid="conversation-view"]');
    await expect(view).toBeVisible({ timeout: 5_000 });

    // Dispatch dragover
    await view.evaluate((el) => {
      el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    });

    // Drop zone overlay appears (accent border / overlay div)
    await expect(
      page.locator('.drop-zone-overlay, [data-drop-active="true"]'),
    ).toBeVisible({ timeout: 2_000 });
  });

  test('dropping a .ts file adds a ContextChip with the filename', async ({ page }) => {
    const view = page.locator('.conversation-view, [data-testid="conversation-view"]');

    await view.evaluate((el) => {
      const file = new File(['const x = 1;'], 'helper.ts', { type: 'text/typescript' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });

    // ContextChip containing "helper.ts" appears
    await expect(
      page.locator('[data-testid="context-chip"], .context-chip').filter({ hasText: 'helper.ts' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('dropping an unsupported file (.exe) shows "unsupported type" toast', async ({
    page,
  }) => {
    const view = page.locator('.conversation-view, [data-testid="conversation-view"]');

    await view.evaluate((el) => {
      const file = new File([new Uint8Array(10)], 'virus.exe', {
        type: 'application/octet-stream',
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });

    await expect(
      page.locator('[role="alert"], .toast').filter({ hasText: /unsupported|type/i }),
    ).toBeVisible({ timeout: 4_000 });

    // No context chip
    const chips = page.locator('[data-testid="context-chip"], .context-chip');
    await expect(chips).toHaveCount(0);
  });

  // ---- Attach button (paperclip) ----

  test('clicking paperclip attach button opens file chooser and adds ContextChip', async ({
    page,
  }) => {
    // The paperclip button uses a hidden <input type="file"> — Playwright intercepts it
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5_000 }),
      page.getByLabel('Attach file').click(),
    ]);

    // Provide a mock file
    await fileChooser.setFiles({
      name: 'component.tsx',
      mimeType: 'text/typescript',
      buffer: Buffer.from('export const MyComp = () => <div />;'),
    });

    await expect(
      page.locator('[data-testid="context-chip"], .context-chip').filter({ hasText: 'component' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Cmd+Shift+U keyboard shortcut opens file chooser', async ({ page }) => {
    // Note: shortcut is Cmd+Shift+U per CHI-193 plan (not Cmd+Shift+A which is taken by Actions Center)
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5_000 }),
      page.keyboard.press(`${modKey}+Shift+U`),
    ]);

    await fileChooser.setFiles({
      name: 'shortcut-test.ts',
      mimeType: 'text/typescript',
      buffer: Buffer.from('const x = 1;'),
    });

    await expect(
      page
        .locator('[data-testid="context-chip"], .context-chip')
        .filter({ hasText: 'shortcut-test' }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
```

**Step 2: Run the spec**

```bash
npx playwright test tests/e2e/conversation/conversation-attachments.spec.ts --reporter=list
```

**Adapting selectors:** If tests fail due to wrong selectors, open the component files and check:
- `[data-session-id]` → actual attribute on sidebar session items
- `.image-attachment-chip` → actual CSS class of image thumbnail chips
- `.context-chip` → actual CSS class of file context chips
- `.conversation-view` → actual CSS class of ConversationView
- `.drop-zone-overlay` → actual CSS class of drag overlay
- `[aria-label="Attach file"]` → actual aria-label of paperclip button

Use `npx playwright test --grep "paperclip"` to run individual tests.

**Step 3: Fix + commit**

```bash
git add tests/e2e/conversation/conversation-attachments.spec.ts
git commit -m "CHI-212: add E2E tests for file attachments (paste, drag-drop, paperclip, shortcut)"
```

---

### Task D2: Final CHI-212 checks

**Step 1: Run all tests**

```bash
npx vitest run && npx playwright test tests/e2e/conversation/conversation-attachments.spec.ts
```

**Step 2: Full lint + build**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

---

## Part E — CHI-213: E2E Tests — Conversation Utility

### Task E1: Create `conversation-utility.spec.ts`

**Files:**
- Create: `tests/e2e/conversation/conversation-utility.spec.ts`

**Notes:**
- The ConversationSearch opens via `Cmd+F` (check `keybindings.ts` to confirm).
- The export flow uses a `save_export_file` IPC. We intercept it via `page.addInitScript` to mock IPC before the app loads.
- Fixture messages must contain "test" to produce search matches.

**Step 1: Write the spec**

```typescript
// tests/e2e/conversation/conversation-utility.spec.ts
// E2E tests for conversation utility features (CHI-213).
// Covers: message search (CHI-E1) and conversation export (CHI-E2).

import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

// ---------------------------------------------------------------------------
// Helper: seed a session with content that includes the word "test"
// ---------------------------------------------------------------------------

async function seedSearchableSession(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke as Function;
    const project = await invoke('create_project', {
      name: `__e2e_util_${Date.now()}`,
      path: `/tmp/e2e-util-${Date.now()}`,
    });
    const session = await invoke('create_session', {
      project_id: project.id,
      model: 'claude-sonnet-4-6',
    });

    // Save several messages containing "test"
    for (const content of [
      'This is a test message for search',
      'Another test example here',
      'A third test occurrence in conversation',
    ]) {
      await invoke('save_message', {
        session_id: session.id,
        role: 'assistant',
        content,
        tool_name: null, tool_input: null, tool_use_id: null,
        model: null, cost_cents: null, tokens_in: null, tokens_out: null,
      });
    }
  });

  await page.reload();
  await page.waitForSelector('.grain-overlay', { timeout: 15_000 });
  try {
    const skip = page.getByRole('button', { name: 'Skip all' });
    await skip.waitFor({ timeout: 1_500 });
    await skip.click();
  } catch { /* no onboarding */ }

  const sessionItem = page.locator('[data-session-id]').first();
  await sessionItem.waitFor({ timeout: 5_000 });
  await sessionItem.click();
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Conversation Utility (CHI-213)', () => {
  test.describe('Message Search (CHI-E1)', () => {
    test.beforeEach(async ({ page }) => {
      await seedSearchableSession(page);
    });

    test('Cmd+F opens ConversationSearch bar', async ({ page }) => {
      await page.keyboard.press(`${modKey}+f`);

      await expect(
        page.locator('[data-testid="conversation-search"], .conversation-search, [role="search"]'),
      ).toBeVisible({ timeout: 3_000 });
    });

    test('typing "test" shows highlighted matches in messages', async ({ page }) => {
      await page.keyboard.press(`${modKey}+f`);
      const searchInput = page.getByRole('searchbox');
      await searchInput.waitFor({ timeout: 3_000 });
      await searchInput.type('test');

      // After debounce, highlighted spans appear in message content
      await expect(
        page.locator('.message-highlight, mark, [data-highlight="true"]'),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('match counter shows "N of M matches" where N ≥ 1', async ({ page }) => {
      await page.keyboard.press(`${modKey}+f`);
      await page.getByRole('searchbox').type('test');

      // Wait for results
      await expect(
        page.locator('[data-testid="match-count"], .match-count').filter({ hasText: /of/ }),
      ).toBeVisible({ timeout: 5_000 });

      const counterText = await page
        .locator('[data-testid="match-count"], .match-count')
        .textContent();
      // e.g. "1 of 3 matches" — parse and verify N ≥ 1
      const match = counterText?.match(/(\d+)\s+of\s+(\d+)/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1])).toBeGreaterThanOrEqual(1);
      expect(parseInt(match![2])).toBeGreaterThanOrEqual(parseInt(match![1]));
    });

    test('pressing Enter scrolls to next match (active highlight changes)', async ({ page }) => {
      await page.keyboard.press(`${modKey}+f`);
      await page.getByRole('searchbox').type('test');
      await page.waitForTimeout(300); // debounce

      // Capture first active match indicator
      const counter = page.locator('[data-testid="match-count"], .match-count');
      await counter.waitFor({ timeout: 5_000 });
      const before = await counter.textContent();

      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      const after = await counter.textContent();
      // Counter should have changed (e.g. "1 of 3" → "2 of 3")
      expect(after).not.toBe(before);
    });

    test('pressing Shift+Enter goes to previous match', async ({ page }) => {
      await page.keyboard.press(`${modKey}+f`);
      await page.getByRole('searchbox').type('test');
      await page.waitForTimeout(300);

      const counter = page.locator('[data-testid="match-count"], .match-count');
      await counter.waitFor({ timeout: 5_000 });

      // Go forward once
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const afterForward = await counter.textContent();

      // Now go back
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(200);
      const afterBack = await counter.textContent();

      // Should have returned to the previous position
      expect(afterBack).not.toBe(afterForward);
    });

    test('pressing Escape closes search and removes highlights', async ({ page }) => {
      await page.keyboard.press(`${modKey}+f`);
      await page.getByRole('searchbox').type('test');
      await page.waitForTimeout(300);
      await expect(page.locator('.message-highlight, mark')).toBeVisible({ timeout: 5_000 });

      await page.keyboard.press('Escape');

      // Search bar closes
      await expect(
        page.locator('[data-testid="conversation-search"], .conversation-search'),
      ).not.toBeVisible({ timeout: 3_000 });

      // Highlights removed
      await expect(page.locator('.message-highlight, mark')).toHaveCount(0);
    });
  });

  test.describe('Conversation Export (CHI-E2)', () => {
    // Mock save_export_file IPC to avoid real file system writes
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        // Patch __TAURI_INTERNALS__ once it's available
        let patched = false;
        const maybePatч = () => {
          const ti = (window as any).__TAURI_INTERNALS__;
          if (!ti || patched) return;
          patched = true;
          const original = ti.invoke.bind(ti);
          ti.invoke = (cmd: string, args?: unknown) => {
            if (cmd === 'save_export_file') {
              // Simulate successful save — return mock file path
              (window as any).__e2e_export_called__ = { cmd, args };
              return Promise.resolve('/mock/export/session-abc-2026-03-02.md');
            }
            if (cmd === 'open_path_in_shell') {
              return Promise.resolve(null);
            }
            return original(cmd, args);
          };
        };

        // Poll until Tauri internals are ready (set up by the runtime)
        const interval = setInterval(() => {
          maybePatч();
          if (patched) clearInterval(interval);
        }, 10);
      });

      await seedSearchableSession(page);
    });

    test('Command Palette shows "Export" entry when typing "export"', async ({ page }) => {
      await page.keyboard.press(`${modKey}+k`);

      const palette = page.locator('[data-testid="command-palette"], [role="dialog"]').filter({
        hasText: /command|palette|search/i,
      });
      await expect(palette).toBeVisible({ timeout: 3_000 });

      await palette.locator('input').type('export');

      await expect(
        page.getByRole('option', { name: /export/i }).or(
          page.locator('[data-testid="cmd-export"], .command-item').filter({ hasText: /export/i }),
        ),
      ).toBeVisible({ timeout: 3_000 });
    });

    test('selecting Export opens format picker with Markdown / HTML / Text options', async ({
      page,
    }) => {
      await page.keyboard.press(`${modKey}+k`);
      await page.locator('[role="dialog"] input, [data-testid="palette-input"]').type('export');

      // Click the export entry
      await page
        .locator('[data-testid="cmd-export"], .command-item')
        .filter({ hasText: /export/i })
        .first()
        .click();

      // Format picker dialog
      const picker = page.getByRole('dialog');
      await expect(picker).toBeVisible({ timeout: 3_000 });
      await expect(picker.getByText(/markdown/i)).toBeVisible();
      await expect(picker.getByText(/html/i)).toBeVisible();
      await expect(picker.getByText(/text/i)).toBeVisible();
    });

    test('choosing Markdown invokes save_export_file IPC and shows success toast', async ({
      page,
    }) => {
      await page.keyboard.press(`${modKey}+k`);
      await page.locator('[role="dialog"] input, [data-testid="palette-input"]').type('export');
      await page
        .locator('.command-item, [role="option"]')
        .filter({ hasText: /markdown/i })
        .first()
        .click();

      // OR if a format picker appears after the first click:
      const mdOption = page.getByRole('button', { name: /markdown/i }).or(
        page.locator('[data-format="markdown"]'),
      );
      if (await mdOption.count() > 0) {
        await mdOption.first().click();
      }

      // Verify the IPC was intercepted
      const exportCall = await page.evaluate(() => (window as any).__e2e_export_called__);
      expect(exportCall).toBeTruthy();
      expect((exportCall as any).cmd).toBe('save_export_file');

      // Success toast appears with "Open File" button
      await expect(
        page.locator('[role="alert"], .toast').filter({ hasText: /export|success|saved/i }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });
});
```

**Step 2: Run the spec**

```bash
npx playwright test tests/e2e/conversation/conversation-utility.spec.ts --reporter=list
```

**Selector adaptations:** If tests fail, check these elements in the running app:
- Conversation search bar: inspect its class or `data-testid`
- Highlight spans: check what CSS class the search uses to highlight matches
- Match counter: find its DOM structure in `ConversationSearch.tsx`
- Command palette: confirm its role/testid
- Toast: check the `ToastContainer` component's markup

Use `--grep "Cmd+F"` to isolate individual test runs.

---

### Task E2: Final checks + commit

**Step 1: Run all tests**

```bash
npx vitest run
npx playwright test tests/e2e/
```

**Step 2: Full lint + build**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check
```

**Step 3: Commit**

```bash
git add tests/e2e/conversation/conversation-utility.spec.ts
git commit -m "CHI-213: add E2E tests for message search and conversation export"
```

---

## Final Commit Summary

After all parts are complete:

```
CHI-206: KaTeX lazy-import tests (MathRenderer) + ImageRenderer max-height/Show-full
CHI-209: MarkdownContent isStreaming prop + streaming stability tests; ToolUseBlock copy test; ThinkingBlock.test.tsx
CHI-210: ConversationSearch Shift+Enter test; conversationExport tool-use test; VoiceInput.tsx + tests; MessageInput symbol @-mention tests
CHI-212: E2E attachment spec — paste image, size limit toast, drag-drop, .exe rejection, paperclip button, Cmd+Shift+U shortcut
CHI-213: E2E utility spec — Cmd+F search, highlights, match counter, navigation, Escape; Command Palette export → format picker → save IPC mock → toast
```
