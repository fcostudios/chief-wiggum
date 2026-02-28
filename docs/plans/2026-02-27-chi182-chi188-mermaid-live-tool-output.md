# CHI-182 + CHI-188: Mermaid Renderer & Live Tool Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two independent features shipped in sequence:
- **CHI-182** — Render ````mermaid` fenced code blocks as inline SVG diagrams, with fullscreen expansion, dark theme, and graceful fallback to a code block on parse failure.
- **CHI-188** — Show a mini inline terminal widget when a tool executes, displaying its stdout/stderr output with exit code badge, instead of the current "nothing visible until tool:result arrives" experience.

**Architecture (CHI-182):** The existing `rendererRegistry.ts` + `MarkdownContent.tsx` post-render hydration pipeline already handles custom renderers. `MermaidRenderer.tsx` self-registers as a module-level side effect, imported once from `App.tsx`. Mermaid.js is loaded lazily inside `onMount` (no initial bundle cost). Dark theme reads from `settingsState.appearance.theme`.

**Architecture (CHI-188):** The CLI bridge buffers all tool output and emits `tool:result` only after execution completes — it does not stream incrementally. The solution emits a new `tool:output` Tauri event with the same content just before `tool:result`. The frontend stores it in `conversationState.toolOutputs` (keyed by `tool_use_id`). `ToolResultBlock.tsx` reads this and renders `LiveToolOutput.tsx` above itself when output is available.

**Tech Stack:** SolidJS 1.9, mermaid npm package, Rust (Tauri event_loop.rs + manager.rs), SPEC-002 CSS tokens, Vitest + @solidjs/testing-library

---

## Part A: CHI-182 — Mermaid Diagram Rendering

### Task 1: Install mermaid and create MermaidRenderer

**Files:**
- Modify: `package.json` (npm install)
- Create: `src/components/conversation/renderers/MermaidRenderer.tsx`

**Step 1: Install the package**

```bash
npm install mermaid
```

Expected: mermaid appears in `package.json` dependencies (v11.x). It ships its own types — no `@types/mermaid` needed.

**Step 2: Verify typecheck still passes**

```bash
npx tsc --noEmit 2>&1 | head -10
```

**Step 3: Create MermaidRenderer.tsx**

```tsx
// src/components/conversation/renderers/MermaidRenderer.tsx
import { Component, createSignal, onMount, Show } from 'solid-js';
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
      const isDark =
        settingsState.appearance.theme === 'dark' ||
        (settingsState.appearance.theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
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
                <div
                  class="text-[10px] px-2 pb-1"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
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
```

**Step 4: Commit**

```bash
git add package.json package-lock.json src/components/conversation/renderers/MermaidRenderer.tsx
git commit -m "CHI-182: add MermaidRenderer with lazy import, dark theme, fullscreen, and self-registration"
```

---

### Task 2: Write MermaidRenderer tests

**Files:**
- Create: `src/components/conversation/renderers/MermaidRenderer.test.tsx`

**Step 1: Create the test file**

```tsx
// src/components/conversation/renderers/MermaidRenderer.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@solidjs/testing-library';
import MermaidRenderer from './MermaidRenderer';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">diagram</svg>' }),
  },
}));

vi.mock('@/stores/settingsStore', () => ({
  settingsState: { appearance: { theme: 'dark' } },
}));

describe('MermaidRenderer (CHI-182)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SVG after mermaid resolves', async () => {
    const { container } = render(() => (
      <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />
    ));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="mermaid-svg"]')).toBeTruthy();
    });
  });

  it('shows loading state before mermaid resolves', () => {
    const { getByText } = render(() => (
      <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />
    ));
    expect(getByText('Rendering diagram…')).toBeInTheDocument();
  });

  it('shows error fallback + raw code on parse failure', async () => {
    const { default: mermaid } = await import('mermaid');
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Parse error: unexpected token'));
    const { getByText } = render(() => (
      <MermaidRenderer code="invalid mermaid" lang="mermaid" />
    ));
    await waitFor(() => {
      expect(getByText('Mermaid parse error — showing source')).toBeInTheDocument();
      expect(getByText('invalid mermaid')).toBeInTheDocument();
      expect(getByText(/Parse error: unexpected token/)).toBeInTheDocument();
    });
  });

  it('shows fullscreen button after SVG renders', async () => {
    const { getByLabelText } = render(() => (
      <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />
    ));
    await waitFor(() => {
      expect(getByLabelText('Open diagram fullscreen')).toBeInTheDocument();
    });
  });

  it('opens fullscreen dialog on fullscreen button click', async () => {
    const { getByLabelText, getByRole } = render(() => (
      <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />
    ));
    await waitFor(() => getByLabelText('Open diagram fullscreen'));
    getByLabelText('Open diagram fullscreen').click();
    expect(getByRole('dialog')).toBeInTheDocument();
  });

  it('closes fullscreen on close button click', async () => {
    const { getByLabelText, queryByRole } = render(() => (
      <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />
    ));
    await waitFor(() => getByLabelText('Open diagram fullscreen'));
    getByLabelText('Open diagram fullscreen').click();
    getByLabelText('Close fullscreen').click();
    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes fullscreen on backdrop click', async () => {
    const { getByLabelText, getByRole, queryByRole } = render(() => (
      <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />
    ));
    await waitFor(() => getByLabelText('Open diagram fullscreen'));
    getByLabelText('Open diagram fullscreen').click();
    getByRole('dialog').click();
    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('initializes mermaid with dark theme when settings say dark', async () => {
    const { default: mermaid } = await import('mermaid');
    render(() => <MermaidRenderer code="graph TD\n  A-->B" lang="mermaid" />);
    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' }),
      );
    });
  });

  it('renderer is registered in the registry after module loads', () => {
    const { hasRenderer } = require('@/lib/rendererRegistry');
    expect(hasRenderer('mermaid')).toBe(true);
  });
});
```

**Step 2: Run the tests**

```bash
npx vitest run src/components/conversation/renderers/MermaidRenderer.test.tsx
```

Expected: 9 tests pass.

**Step 3: Commit**

```bash
git add src/components/conversation/renderers/MermaidRenderer.test.tsx
git commit -m "CHI-182: add MermaidRenderer unit tests (9 tests)"
```

---

### Task 3: Wire registration into App.tsx + verify build

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add the side-effect import**

At the bottom of the imports block in `src/App.tsx`, add a clearly labelled group:

```ts
// Renderer registrations (side effects — register into rendererRegistry)
import './components/conversation/renderers/MermaidRenderer';
```

**Step 2: Lint + format + typecheck + build**

```bash
npx eslint src/components/conversation/renderers/MermaidRenderer.tsx src/App.tsx
npx prettier --write src/components/conversation/renderers/MermaidRenderer.tsx src/components/conversation/renderers/MermaidRenderer.test.tsx src/App.tsx
npx tsc --noEmit
npx vite build 2>&1 | tail -8
```

Expected: build succeeds; mermaid appears as a separate lazy chunk in `dist/` (the dynamic import ensures this).

**Step 3: Run all frontend tests**

```bash
npx vitest run
```

Expected: all pass.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "CHI-182: wire MermaidRenderer side-effect import in App.tsx, lint+build verified"
```

---

## Part B: CHI-188 — Live Tool Execution Output

### Task 4: Add ToolOutputPayload to Rust + emit tool:output

**Files:**
- Modify: `src-tauri/src/bridge/event_loop.rs`
- Modify: `src-tauri/src/bridge/manager.rs`

**Step 1: Write the failing Rust tests**

In `src-tauri/src/bridge/event_loop.rs`, add at the bottom:

```rust
#[cfg(test)]
mod tests_tool_output {
    use super::*;

    #[test]
    fn tool_output_payload_serializes() {
        let payload = ToolOutputPayload {
            session_id: "sess-1".to_string(),
            tool_use_id: "tool-abc".to_string(),
            content: "stdout line\n".to_string(),
            is_error: false,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"session_id\":\"sess-1\""));
        assert!(json.contains("\"tool_use_id\":\"tool-abc\""));
        assert!(json.contains("\"is_error\":false"));
    }
}
```

In `src-tauri/src/bridge/manager.rs` tests, add:

```rust
#[test]
fn buffered_event_tool_output_roundtrips() {
    use crate::bridge::event_loop::ToolOutputPayload;
    let ev = BufferedEvent::ToolOutput(ToolOutputPayload {
        session_id: "s".to_string(),
        tool_use_id: "t".to_string(),
        content: "output".to_string(),
        is_error: false,
    });
    let json = serde_json::to_string(&ev).unwrap();
    assert!(json.contains("\"type\":\"ToolOutput\""));
}
```

**Step 2: Run to confirm they fail**

```bash
cargo test tool_output_payload_serializes buffered_event_tool_output_roundtrips 2>&1 | tail -5
```

Expected: compile errors.

**Step 3: Add ToolOutputPayload struct to event_loop.rs**

After the existing `ToolResultPayload` struct (around line 77):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutputPayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}
```

**Step 4: Add ToolOutput variant to BufferedEvent in manager.rs**

Update the `use` import:

```rust
use super::event_loop::{
    ChunkPayload, CliExitedPayload, CliInitPayload, MessageCompletePayload,
    PermissionRequestPayload, ThinkingPayload, ToolOutputPayload, ToolResultPayload, ToolUsePayload,
};
```

Add the variant to the enum:

```rust
pub enum BufferedEvent {
    Chunk(ChunkPayload),
    MessageComplete(MessageCompletePayload),
    CliInit(CliInitPayload),
    CliExited(CliExitedPayload),
    ToolUse(ToolUsePayload),
    ToolOutput(ToolOutputPayload),   // ← new
    ToolResult(ToolResultPayload),
    Thinking(ThinkingPayload),
    PermissionRequest(PermissionRequestPayload),
}
```

**Step 5: Emit tool:output before tool:result in event_loop.rs**

Find the `BridgeEvent::ToolResult` match arm. Replace the existing block with:

```rust
BridgeEvent::ToolResult {
    session_id: _,
    tool_use_id,
    content,
    is_error,
} => {
    tracing::info!(
        "Event loop [{}]: emitting tool:result (is_error: {})",
        session_id,
        is_error
    );
    // Emit tool:output first so the frontend terminal widget has content
    // before the tool:result block arrives.
    let output_payload = ToolOutputPayload {
        session_id: session_id.to_string(),
        tool_use_id: tool_use_id.clone(),
        content: content.clone(),
        is_error,
    };
    if let Err(e) = app.emit("tool:output", &output_payload) {
        tracing::warn!("Failed to emit tool:output: {}", e);
    }
    {
        let mut rts = runtimes.write().await;
        if let Some(rt) = rts.get_mut(session_id) {
            rt.buffer_event(BufferedEvent::ToolOutput(output_payload.clone()));
        }
    }
    let payload = ToolResultPayload {
        session_id: session_id.to_string(),
        tool_use_id,
        content,
        is_error,
    };
    if let Err(e) = app.emit("tool:result", &payload) {
        tracing::warn!("Failed to emit tool:result: {}", e);
    }
    {
        let mut rts = runtimes.write().await;
        if let Some(rt) = rts.get_mut(session_id) {
            rt.buffer_event(BufferedEvent::ToolResult(payload.clone()));
        }
    }
}
```

**Step 6: Run all Rust tests**

```bash
cargo test 2>&1 | tail -10
```

Expected: all tests pass including the 2 new ones.

**Step 7: Commit**

```bash
git add src-tauri/src/bridge/event_loop.rs src-tauri/src/bridge/manager.rs
git commit -m "CHI-188: add ToolOutputPayload, BufferedEvent::ToolOutput, emit tool:output before tool:result"
```

---

### Task 5: Add ToolOutputEvent type + toolOutputs store state

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/conversationStore.ts`

**Step 1: Add ToolOutputEvent to types.ts**

After the `BufferedEvent` interface, add:

```typescript
/** Payload from `tool:output` Tauri event — emitted just before tool:result. */
export interface ToolOutputEvent {
  session_id: string;
  tool_use_id: string;
  content: string;
  is_error: boolean;
}
```

Also add `'ToolOutput'` to the `BufferedEvent.type` discriminated union.

**Step 2: Add toolOutputs to ConversationState in conversationStore.ts**

```typescript
interface ConversationState {
  // ... existing fields ...
  toolOutputs: Record<string, string>;  // keyed by tool_use_id
}

const [state, setState] = createStore<ConversationState>({
  // ... existing values ...
  toolOutputs: {},
});
```

**Step 3: Add tool:output listener in setupEventListeners**

Alongside the existing `tool:result` listener, add:

```typescript
import type { ToolOutputEvent } from '@/lib/types';

// In setupEventListeners:
const unlistenToolOutput = await listen<ToolOutputEvent>('tool:output', (event) => {
  if (event.payload.session_id !== activeSessionId) return;
  setState('toolOutputs', (prev) => ({
    ...prev,
    [event.payload.tool_use_id]: event.payload.content,
  }));
});
sessionListeners.get(activeSessionId)?.push(unlistenToolOutput);
```

**Step 4: Clear toolOutputs on session switch**

In `switchSession()` or `clearMessages()`, add:

```typescript
setState('toolOutputs', {});
```

**Step 5: Typecheck**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add src/lib/types.ts src/stores/conversationStore.ts
git commit -m "CHI-188: add ToolOutputEvent type and toolOutputs store state with listener"
```

---

### Task 6: Create LiveToolOutput component + tests

**Files:**
- Create: `src/components/conversation/LiveToolOutput.tsx`
- Create: `src/components/conversation/LiveToolOutput.test.tsx`

**Step 1: Create the component**

```tsx
// src/components/conversation/LiveToolOutput.tsx
import { Component, Show, createSignal, onMount } from 'solid-js';
import { ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-solid';

interface LiveToolOutputProps {
  content: string;
  toolName: string;
  isError: boolean;
}

function extractExitCode(content: string): string | null {
  const match = content.match(/(?:^|\n)Exit code\s+(\d+)\b/i);
  return match?.[1] ?? null;
}

export const LiveToolOutput: Component<LiveToolOutputProps> = (props) => {
  let scrollRef: HTMLPreElement | undefined;
  const [expanded, setExpanded] = createSignal(true);
  const exitCode = () => (props.isError ? extractExitCode(props.content) : null);
  const exitCodeNum = () => {
    const code = exitCode();
    return code !== null ? parseInt(code, 10) : null;
  };

  onMount(() => {
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
  });

  return (
    <div
      class="rounded-md overflow-hidden mt-1"
      style={{
        background: 'var(--color-bg-inset)',
        border: `1px solid ${props.isError ? 'var(--color-tool-permission-deny)' : 'var(--color-border-secondary)'}`,
      }}
    >
      <button
        class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
        style={{ 'transition-duration': 'var(--duration-fast)' }}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded()}
        aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${props.toolName} output`}
      >
        <Show
          when={!props.isError}
          fallback={<XCircle size={12} color="var(--color-tool-permission-deny)" />}
        >
          <CheckCircle size={12} color="var(--color-tool-bash)" />
        </Show>
        <span
          class="text-[11px] font-mono"
          style={{
            color: props.isError
              ? 'var(--color-tool-permission-deny)'
              : 'var(--color-tool-bash)',
          }}
        >
          {props.toolName}
        </span>
        <span class="text-[11px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
          output
        </span>
        <Show when={exitCodeNum() !== null}>
          <span
            class="text-[10px] font-mono px-1.5 py-0.5 rounded ml-1"
            style={{
              background:
                exitCodeNum() === 0 ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.12)',
              color:
                exitCodeNum() === 0
                  ? 'var(--color-tool-bash)'
                  : 'var(--color-tool-permission-deny)',
            }}
          >
            exit {exitCode()}
          </span>
        </Show>
        <div class="flex-1" />
        <Show
          when={expanded()}
          fallback={
            <ChevronRight size={12} color="var(--color-text-tertiary)" class="shrink-0" />
          }
        >
          <ChevronDown size={12} color="var(--color-text-tertiary)" class="shrink-0" />
        </Show>
      </button>

      <Show when={expanded()}>
        <pre
          ref={scrollRef}
          class="text-[11px] leading-relaxed overflow-x-auto overflow-y-auto px-3 pb-2 pt-1"
          style={{
            'font-family': 'var(--font-mono)',
            color: props.isError
              ? 'var(--color-tool-permission-deny)'
              : 'var(--color-text-secondary)',
            'max-height': '250px',
            'border-top': '1px solid var(--color-border-secondary)',
          }}
          aria-label={`${props.toolName} execution output`}
        >
          <code>{props.content}</code>
        </pre>
      </Show>
    </div>
  );
};
```

**Step 2: Write the tests**

```tsx
// src/components/conversation/LiveToolOutput.test.tsx
import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { LiveToolOutput } from './LiveToolOutput';

describe('LiveToolOutput (CHI-188)', () => {
  it('renders output content', () => {
    const { getByText } = render(() => (
      <LiveToolOutput content="hello world" toolName="Bash" isError={false} />
    ));
    expect(getByText('hello world')).toBeInTheDocument();
  });

  it('shows tool name in header', () => {
    const { getAllByText } = render(() => (
      <LiveToolOutput content="output" toolName="Bash" isError={false} />
    ));
    expect(getAllByText('Bash').length).toBeGreaterThan(0);
  });

  it('collapses and expands on header click', () => {
    const { getByLabelText, queryByLabelText } = render(() => (
      <LiveToolOutput content="some output" toolName="Bash" isError={false} />
    ));
    expect(queryByLabelText('Bash execution output')).toBeInTheDocument();
    fireEvent.click(getByLabelText('Collapse Bash output'));
    expect(queryByLabelText('Bash execution output')).not.toBeInTheDocument();
    fireEvent.click(getByLabelText('Expand Bash output'));
    expect(queryByLabelText('Bash execution output')).toBeInTheDocument();
  });

  it('shows green exit badge for exit code 0', () => {
    const { getByText } = render(() => (
      <LiveToolOutput content="Exit code 0\noutput" toolName="Bash" isError={false} />
    ));
    expect(getByText('exit 0')).toBeInTheDocument();
  });

  it('shows red exit badge for non-zero exit code when isError', () => {
    const { getByText } = render(() => (
      <LiveToolOutput content="Exit code 1\nerror output" toolName="Bash" isError={true} />
    ));
    expect(getByText('exit 1')).toBeInTheDocument();
  });

  it('shows no exit badge when content has no exit code pattern', () => {
    const { queryByText } = render(() => (
      <LiveToolOutput content="just some output" toolName="Bash" isError={false} />
    ));
    expect(queryByText(/^exit/)).not.toBeInTheDocument();
  });

  it('applies error border color when isError is true', () => {
    const { container } = render(() => (
      <LiveToolOutput content="error" toolName="Bash" isError={true} />
    ));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer?.style.border).toContain('color-tool-permission-deny');
  });

  it('aria-label on output pre includes tool name', () => {
    const { getByLabelText } = render(() => (
      <LiveToolOutput content="content" toolName="Read" isError={false} />
    ));
    expect(getByLabelText('Read execution output')).toBeInTheDocument();
  });
});
```

**Step 3: Run the tests**

```bash
npx vitest run src/components/conversation/LiveToolOutput.test.tsx
```

Expected: 8 tests pass.

**Step 4: Commit**

```bash
git add src/components/conversation/LiveToolOutput.tsx src/components/conversation/LiveToolOutput.test.tsx
git commit -m "CHI-188: add LiveToolOutput component and 8 unit tests"
```

---

### Task 7: Integrate LiveToolOutput into ToolResultBlock + final verification

**Files:**
- Modify: `src/components/conversation/ToolResultBlock.tsx`

**Step 1: Add imports**

```typescript
import { LiveToolOutput } from './LiveToolOutput';
// conversationStore is already imported; just add LiveToolOutput
```

**Step 2: Add toolOutput accessor**

Inside `ToolResultBlock`, add:

```typescript
const toolOutput = () => conversationState.toolOutputs[data().tool_use_id] ?? null;
```

**Step 3: Render LiveToolOutput above the existing header**

In the JSX, just inside the outer `<div>`, before the header `<button>`:

```tsx
<Show when={toolOutput()}>
  {(output) => (
    <LiveToolOutput
      content={output()}
      toolName={relatedToolName()}
      isError={isError()}
    />
  )}
</Show>
```

**Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

**Step 5: Lint + format + Rust fmt + build**

```bash
npx eslint src/components/conversation/LiveToolOutput.tsx src/components/conversation/ToolResultBlock.tsx src/stores/conversationStore.ts
npx prettier --write src/components/conversation/LiveToolOutput.tsx src/components/conversation/LiveToolOutput.test.tsx src/components/conversation/ToolResultBlock.tsx src/stores/conversationStore.ts src/lib/types.ts
cargo fmt
cargo test
npx tsc --noEmit
npx vite build
```

**Step 6: Final commit**

```bash
git add -u
git commit -m "CHI-188: integrate LiveToolOutput in ToolResultBlock — all checks pass"
```

---

## Acceptance Checklist

**CHI-182:**
- [ ] ````mermaid` code blocks render as inline SVG (not raw code)
- [ ] Fullscreen button visible on hover; opens overlay
- [ ] Both close button and backdrop click dismiss fullscreen
- [ ] Parse failure shows red error hint + raw code fallback
- [ ] Dark theme applied from `settingsState.appearance.theme`
- [ ] Mermaid loads lazily (separate chunk in `dist/`)
- [ ] 9 MermaidRenderer tests pass

**CHI-188:**
- [ ] Bash/tool execution shows a terminal-style output widget in the conversation
- [ ] Widget renders above the ToolResultBlock header
- [ ] Widget expanded by default; collapsible via click
- [ ] Green exit badge for exit 0, red for non-zero (errors only)
- [ ] No widget shown when `toolOutputs` has no entry for that `tool_use_id`
- [ ] 8 LiveToolOutput tests pass
- [ ] Rust: `tool:output` emitted before `tool:result`; `BufferedEvent::ToolOutput` HMR-safe

**Both:**
- [ ] `cargo test`, `npx tsc --noEmit`, `npx eslint .`, `npx prettier --check .`, `npx vite build` all pass
