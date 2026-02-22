# ToolUseBlock & ThinkingBlock Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace generic markdown rendering of tool_use/tool_result/thinking messages with dedicated collapsible, color-coded ToolUseBlock and ThinkingBlock components (CHI-89, CHI-90).

**Architecture:** Tool and thinking events already flow through the pipeline (parser → event_loop → Tauri events → conversationStore). Currently they're stored as flat markdown strings and rendered via MessageBubble. This plan upgrades the store to persist structured JSON content, adds dedicated UI components with collapsible behavior and color-coded tool classification, and integrates them into ConversationView as inline blocks. ThinkingBlock also adds persistence (currently ephemeral).

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, SPEC-002 design tokens (`--color-tool-file`, `--color-tool-bash`, `--color-tool-neutral`), Rust stream parser, Tauri v2 IPC events.

**Linear Issues:** CHI-89 (ToolUseBlock), CHI-90 (ThinkingBlock)

**Spec References:**
- SPEC-002 Section 10.11 (ToolUseBlock structure/states)
- SPEC-002 Section 10.12 (ThinkingBlock structure/states)
- SPEC-002 Section 3.5 (tool color tokens)
- SPEC-003 Section 10.6 (tool use visualization)
- SPEC-003 Section 3.1 (message bubble anatomy: thinking block, tool use blocks)

---

## Architecture Overview

### Data Flow (Current → Target)

**Current:**
```
tool:use event → conversationStore creates Message {role: 'tool_use', content: "**Bash**\n```\nls -la\n```"}
                → MessageBubble renders as generic markdown
tool:result    → conversationStore creates Message {role: 'tool_result', content: "output text"}
                → MessageBubble renders as generic markdown
thinking event → conversationStore accumulates in state.thinkingContent (NEVER rendered, NEVER persisted)
```

**Target:**
```
tool:use event → conversationStore creates Message {role: 'tool_use', content: JSON.stringify({tool_name, tool_input, tool_use_id})}
                → ConversationView renders <ToolUseBlock>
tool:result    → conversationStore creates Message {role: 'tool_result', content: JSON.stringify({tool_use_id, content, is_error})}
                → ConversationView renders <ToolResultBlock>
thinking event → conversationStore accumulates in state.thinkingContent → persists as Message {role: 'thinking'} on complete
                → ConversationView renders <ThinkingBlock> (streaming or restored)
```

### Tool Type Classification

| Tool Name | Category | Color Token | Left Stripe |
|-----------|----------|-------------|-------------|
| Edit, Write, NotebookEdit | `file` | `--color-tool-file` (#58A6FF) | Blue |
| Bash | `bash` | `--color-tool-bash` (#3FB950) | Green |
| Read, Glob, Grep, WebFetch, WebSearch, Task, etc. | `neutral` | `--color-tool-neutral` (#6E7681) | Gray |

### Collapse Behavior

- **During streaming** (`conversationState.isStreaming === true`): blocks are expanded
- **After response completes**: blocks collapse to header-only (tool_use) or preview (thinking)
- **On session restore**: all blocks are collapsed by default
- **User can toggle**: click header to expand/collapse

---

## Task 1: Extract tool_use_id in Rust Parser

**Files:**
- Modify: `src-tauri/src/bridge/parser.rs` (BridgeEvent::ToolUse variant + parse logic)
- Modify: `src-tauri/src/bridge/event_loop.rs` (ToolUsePayload + emission)
- Test: `src-tauri/src/bridge/parser.rs` (existing parser tests)

**Why:** The Claude Code CLI stream-json includes `id` on tool_use events (Anthropic API format: `toolu_01XFD...`). We need this to pair tool_use with tool_result events in the frontend. Currently the parser discards it.

**Step 1: Add tool_use_id to BridgeEvent::ToolUse**

In `src-tauri/src/bridge/parser.rs`, update the `BridgeEvent` enum:

```rust
// Before:
ToolUse {
    session_id: String,
    tool_name: String,
    tool_input: serde_json::Value,
},

// After:
ToolUse {
    session_id: String,
    tool_use_id: String,
    tool_name: String,
    tool_input: serde_json::Value,
},
```

**Step 2: Extract tool_use_id in parse logic**

In the `feed()` method's tool_use parsing branch, extract the `id` field:

```rust
"tool_use" | "tool_call" => {
    let tool_use_id = obj.get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let tool_name = obj.get("name")
        .or_else(|| obj.get("tool_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let tool_input = obj.get("input")
        .or_else(|| obj.get("parameters"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    Some(BridgeEvent::ToolUse {
        session_id: session_id.to_string(),
        tool_use_id,
        tool_name,
        tool_input,
    })
}
```

**Step 3: Add tool_use_id to ToolUsePayload**

In `src-tauri/src/bridge/event_loop.rs`:

```rust
// Before:
#[derive(Debug, Clone, Serialize)]
pub struct ToolUsePayload {
    pub session_id: String,
    pub tool_name: String,
    pub tool_input: String,
}

// After:
#[derive(Debug, Clone, Serialize)]
pub struct ToolUsePayload {
    pub session_id: String,
    pub tool_use_id: String,
    pub tool_name: String,
    pub tool_input: String,
}
```

**Step 4: Update event_loop emission to pass tool_use_id**

In the `BridgeOutput::Event` match arm for `BridgeEvent::ToolUse`:

```rust
BridgeEvent::ToolUse { session_id, tool_use_id, tool_name, tool_input } => {
    let input_str = serde_json::to_string_pretty(&tool_input)
        .unwrap_or_else(|_| tool_input.to_string());
    app.emit("tool:use", ToolUsePayload {
        session_id,
        tool_use_id,
        tool_name,
        tool_input: input_str,
    }).ok();
}
```

**Step 5: Fix any compilation errors from the new field**

Run: `cd src-tauri && cargo check`
Expected: Passes (may need to update test fixtures that construct BridgeEvent::ToolUse)

**Step 6: Update parser tests if any construct ToolUse events**

Search for `BridgeEvent::ToolUse` in tests and add the `tool_use_id` field.

Run: `cd src-tauri && cargo test`
Expected: All 74+ tests pass

**Step 7: Commit**

```bash
git add src-tauri/src/bridge/parser.rs src-tauri/src/bridge/event_loop.rs
git commit -m "CHI-89: extract tool_use_id from stream parser and event loop"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add 'thinking' to MessageRole and add structured tool interfaces**

```typescript
// Update MessageRole to include 'thinking':
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'thinking';

// Add structured data interfaces for tool events:
export interface ToolUseData {
  tool_name: string;
  tool_input: string;     // Pretty-printed JSON string
  tool_use_id?: string;   // For pairing with tool_result
}

export interface ToolResultData {
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

// Helper type for tool classification
export type ToolCategory = 'file' | 'bash' | 'neutral';
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "CHI-89: add thinking role, ToolUseData, ToolResultData types"
```

---

## Task 3: Update conversationStore — Structured Tool Data + Thinking Persistence

**Files:**
- Modify: `src/stores/conversationStore.ts`

**Step 1: Update tool:use event handler to store structured JSON**

Replace the current handler (which creates markdown content) with JSON storage.

Current (approximately lines 200-233):
```typescript
// CURRENT: const content = `**${tool_name}**\n\`\`\`\n${tool_input}\n\`\`\``;
```

New:
```typescript
unlistenToolUse = await listen<{
  session_id: string;
  tool_use_id: string;
  tool_name: string;
  tool_input: string;
}>('tool:use', (event) => {
  if (event.payload.session_id !== sessionId) return;
  const { tool_use_id, tool_name, tool_input } = event.payload;
  const msgId = crypto.randomUUID();
  // Store structured JSON so ToolUseBlock can parse it
  const content = JSON.stringify({ tool_name, tool_input, tool_use_id });
  const msg: Message = {
    id: msgId,
    session_id: sessionId,
    role: 'tool_use',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
  setState('messages', (prev) => [...prev, msg]);
  invoke('save_message', {
    session_id: sessionId,
    id: msgId,
    role: 'tool_use',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) => console.error('[conversationStore] Failed to persist tool_use:', err));
});
```

**Step 2: Update tool:result event handler to store structured JSON**

Replace the current handler:

```typescript
unlistenToolResult = await listen<{
  session_id: string;
  tool_use_id: string;
  content: string;
  is_error: boolean;
}>('tool:result', (event) => {
  if (event.payload.session_id !== sessionId) return;
  const { tool_use_id, content: resultContent, is_error } = event.payload;
  const msgId = crypto.randomUUID();
  // Store structured JSON so ToolResultBlock can parse it
  const content = JSON.stringify({ tool_use_id, content: resultContent, is_error });
  const msg: Message = {
    id: msgId,
    session_id: sessionId,
    role: 'tool_result',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
  setState('messages', (prev) => [...prev, msg]);
  invoke('save_message', {
    session_id: sessionId,
    id: msgId,
    role: 'tool_result',
    content,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) => console.error('[conversationStore] Failed to persist tool_result:', err));
});
```

**Step 3: Add thinking persistence on message:complete**

In the `message:complete` handler, BEFORE clearing `thinkingContent`, persist it as a message:

```typescript
// Inside the message:complete handler, before creating the assistant message:
const thinkingText = state.thinkingContent;
if (thinkingText) {
  const thinkingId = crypto.randomUUID();
  const thinkingMsg: Message = {
    id: thinkingId,
    session_id: sessionId,
    role: 'thinking',
    content: thinkingText,
    model: null,
    input_tokens: null,
    output_tokens: null,
    thinking_tokens: null,
    cost_cents: null,
    is_compacted: false,
    created_at: new Date().toISOString(),
  };
  setState('messages', (prev) => [...prev, thinkingMsg]);
  invoke('save_message', {
    session_id: sessionId,
    id: thinkingId,
    role: 'thinking',
    content: thinkingText,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
  }).catch((err) => console.error('[conversationStore] Failed to persist thinking:', err));
}
// Then create the assistant message as before...
// Then clear thinking: setState('thinkingContent', '');
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 5: Commit**

```bash
git add src/stores/conversationStore.ts
git commit -m "CHI-89: store structured JSON for tool events, persist thinking on complete"
```

---

## Task 4: Create ToolUseBlock Component

**Files:**
- Create: `src/components/conversation/ToolUseBlock.tsx`

**Step 1: Create the ToolUseBlock component file**

```typescript
import { Component, Show, createSignal, createEffect } from 'solid-js';
import { ChevronDown, ChevronRight, Wrench, Terminal, FileEdit } from 'lucide-solid';
import type { Message, ToolUseData, ToolCategory } from '../../lib/types';
import { conversationState } from '../../stores/conversationStore';

interface ToolUseBlockProps {
  message: Message;
}

/** Classify a tool name into a category for color-coding. */
function classifyTool(toolName: string): ToolCategory {
  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'file';
    case 'Bash':
      return 'bash';
    default:
      return 'neutral';
  }
}

/** Get the color token CSS variable for a tool category. */
function toolColor(category: ToolCategory): string {
  switch (category) {
    case 'file':
      return 'var(--color-tool-file)';
    case 'bash':
      return 'var(--color-tool-bash)';
    case 'neutral':
      return 'var(--color-tool-neutral)';
  }
}

/** Get the icon component for a tool category. */
function ToolIcon(props: { category: ToolCategory; color: string }) {
  const iconProps = { size: 14, color: props.color };
  switch (props.category) {
    case 'file':
      return <FileEdit {...iconProps} />;
    case 'bash':
      return <Terminal {...iconProps} />;
    default:
      return <Wrench {...iconProps} />;
  }
}

/** Parse tool_use message content. Handles both JSON (new) and markdown (legacy). */
function parseToolUseContent(content: string): ToolUseData {
  try {
    const parsed = JSON.parse(content);
    if (parsed.tool_name) return parsed as ToolUseData;
  } catch {
    // Fallback: parse legacy markdown format "**ToolName**\n```\ninput\n```"
  }
  const nameMatch = content.match(/\*\*(\w+)\*\*/);
  const inputMatch = content.match(/```\n?([\s\S]*?)```/);
  return {
    tool_name: nameMatch?.[1] ?? 'Unknown',
    tool_input: inputMatch?.[1]?.trim() ?? content,
  };
}

/** Generate a short summary of the tool input. */
function toolSummary(toolName: string, toolInput: string): string {
  try {
    const parsed = JSON.parse(toolInput);
    switch (toolName) {
      case 'Bash':
        return parsed.command ? String(parsed.command).slice(0, 60) : '';
      case 'Edit':
      case 'Write':
      case 'Read':
        return parsed.file_path ? String(parsed.file_path).split('/').pop() ?? '' : '';
      case 'Glob':
        return parsed.pattern ? String(parsed.pattern) : '';
      case 'Grep':
        return parsed.pattern ? String(parsed.pattern) : '';
      default:
        return '';
    }
  } catch {
    return toolInput.slice(0, 60);
  }
}

export const ToolUseBlock: Component<ToolUseBlockProps> = (props) => {
  const data = () => parseToolUseContent(props.message.content);
  const category = () => classifyTool(data().tool_name);
  const color = () => toolColor(category());
  const summary = () => toolSummary(data().tool_name, data().tool_input);

  // Expanded during streaming, collapsed after
  const [expanded, setExpanded] = createSignal(false);

  // Auto-expand during streaming, auto-collapse when done
  createEffect(() => {
    if (conversationState.isStreaming) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  });

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-primary)',
        }}
      >
        {/* Left color stripe + content */}
        <div class="flex">
          {/* Color stripe */}
          <div
            class="w-[3px] shrink-0"
            style={{ background: color() }}
          />

          <div class="flex-1 min-w-0">
            {/* Header row — always visible */}
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
              style={{ 'transition-duration': 'var(--duration-fast)' }}
              onClick={toggleExpanded}
              aria-expanded={expanded()}
              aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${data().tool_name} tool use`}
            >
              <ToolIcon category={category()} color={color()} />
              <span
                class="text-xs font-mono font-semibold"
                style={{ color: color() }}
              >
                {data().tool_name}
              </span>
              <Show when={summary()}>
                <span
                  class="text-xs truncate flex-1"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {summary()}
                </span>
              </Show>
              <Show
                when={expanded()}
                fallback={
                  <ChevronRight
                    size={14}
                    color="var(--color-text-tertiary)"
                    class="shrink-0"
                  />
                }
              >
                <ChevronDown
                  size={14}
                  color="var(--color-text-tertiary)"
                  class="shrink-0"
                />
              </Show>
            </button>

            {/* Expanded content — tool input */}
            <Show when={expanded()}>
              <div
                class="px-3 pb-2 border-t"
                style={{ 'border-color': 'var(--color-border-secondary)' }}
              >
                <pre
                  class="mt-2 rounded overflow-x-auto text-xs leading-5"
                  style={{
                    'font-family': 'var(--font-mono)',
                    background: 'var(--color-bg-inset)',
                    padding: '8px 12px',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-secondary)',
                  }}
                >
                  <code>{data().tool_input}</code>
                </pre>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 3: Commit**

```bash
git add src/components/conversation/ToolUseBlock.tsx
git commit -m "CHI-89: create ToolUseBlock component with color-coded collapse"
```

---

## Task 5: Create ToolResultBlock Component

**Files:**
- Create: `src/components/conversation/ToolResultBlock.tsx`

**Step 1: Create the ToolResultBlock component file**

```typescript
import { Component, Show, createSignal, createEffect } from 'solid-js';
import { ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-solid';
import type { Message, ToolResultData } from '../../lib/types';
import { conversationState } from '../../stores/conversationStore';

interface ToolResultBlockProps {
  message: Message;
}

/** Parse tool_result message content. Handles both JSON (new) and plain text (legacy). */
function parseToolResultContent(content: string): ToolResultData {
  try {
    const parsed = JSON.parse(content);
    if ('tool_use_id' in parsed) return parsed as ToolResultData;
  } catch {
    // Fallback: legacy plain text format
  }
  const isError = content.startsWith('[Error]');
  return {
    tool_use_id: '',
    content: isError ? content.replace(/^\[Error\]\s*/, '') : content,
    is_error: isError,
  };
}

/** Truncate long output for the collapsed preview. */
function resultPreview(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}

export const ToolResultBlock: Component<ToolResultBlockProps> = (props) => {
  const data = () => parseToolResultContent(props.message.content);
  const isError = () => data().is_error;
  const preview = () => resultPreview(data().content);

  // Collapsed by default, expanded during streaming
  const [expanded, setExpanded] = createSignal(false);

  createEffect(() => {
    if (conversationState.isStreaming) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  });

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start -mt-1">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'var(--color-bg-secondary)',
          border: `1px solid ${isError() ? 'var(--color-tool-permission-deny)' : 'var(--color-border-secondary)'}`,
          'border-top': 'none',
          'border-top-left-radius': '0',
          'border-top-right-radius': '0',
        }}
      >
        {/* Header row */}
        <button
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleExpanded}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} tool result`}
        >
          <Show
            when={!isError()}
            fallback={<XCircle size={12} color="var(--color-tool-permission-deny)" />}
          >
            <CheckCircle size={12} color="var(--color-tool-bash)" />
          </Show>
          <span
            class="text-[11px] font-mono truncate flex-1"
            style={{
              color: isError() ? 'var(--color-tool-permission-deny)' : 'var(--color-text-tertiary)',
            }}
          >
            {expanded() ? (isError() ? 'Error' : 'Result') : preview()}
          </span>
          <Show
            when={expanded()}
            fallback={<ChevronRight size={12} color="var(--color-text-tertiary)" class="shrink-0" />}
          >
            <ChevronDown size={12} color="var(--color-text-tertiary)" class="shrink-0" />
          </Show>
        </button>

        {/* Expanded content — result output */}
        <Show when={expanded()}>
          <div
            class="px-3 pb-2 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <pre
              class="mt-1.5 rounded overflow-x-auto text-xs leading-5 max-h-[300px]"
              style={{
                'font-family': 'var(--font-mono)',
                background: 'var(--color-bg-inset)',
                padding: '8px 12px',
                color: isError() ? 'var(--color-tool-permission-deny)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-secondary)',
              }}
            >
              <code>{data().content}</code>
            </pre>
          </div>
        </Show>
      </div>
    </div>
  );
};
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 3: Commit**

```bash
git add src/components/conversation/ToolResultBlock.tsx
git commit -m "CHI-89: create ToolResultBlock component with error state"
```

---

## Task 6: Create ThinkingBlock Component

**Files:**
- Create: `src/components/conversation/ThinkingBlock.tsx`

**Step 1: Create the ThinkingBlock component file**

```typescript
import { Component, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';
import type { Message } from '../../lib/types';

interface ThinkingBlockProps {
  message: Message;
  isStreaming?: boolean;
}

/** Generate a preview of thinking content (~80 chars). */
function thinkingPreview(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77) + '...';
}

export const ThinkingBlock: Component<ThinkingBlockProps> = (props) => {
  // Expanded during streaming, collapsed after (on restore or after complete)
  const [expanded, setExpanded] = createSignal(props.isStreaming ?? false);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  const preview = () => thinkingPreview(props.message.content);

  return (
    <div class="flex justify-start">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'rgba(22, 27, 34, 0.5)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Header row */}
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleExpanded}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
        >
          <span class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Thinking
          </span>

          {/* Preview text when collapsed */}
          <Show when={!expanded()}>
            <span
              class="text-xs italic truncate flex-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.7' }}
            >
              {preview()}
            </span>
          </Show>

          {/* Streaming shimmer indicator */}
          <Show when={props.isStreaming}>
            <span class="animate-thinking-shimmer text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              ...
            </span>
          </Show>

          <Show
            when={expanded()}
            fallback={<ChevronRight size={14} color="var(--color-text-tertiary)" class="shrink-0" />}
          >
            <ChevronDown size={14} color="var(--color-text-tertiary)" class="shrink-0" />
          </Show>
        </button>

        {/* Expanded content */}
        <Show when={expanded()}>
          <div
            class="px-3 pb-3 border-t"
            style={{ 'border-color': 'var(--color-border-secondary)' }}
          >
            <p
              class="mt-2 text-xs italic leading-5 whitespace-pre-wrap"
              style={{
                color: 'var(--color-text-secondary)',
                'font-family': 'var(--font-ui)',
              }}
            >
              {props.message.content}
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
};
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 3: Commit**

```bash
git add src/components/conversation/ThinkingBlock.tsx
git commit -m "CHI-90: create ThinkingBlock component with collapsible preview"
```

---

## Task 7: Create StreamingThinkingBlock for Live Thinking Display

**Files:**
- Create: `src/components/conversation/StreamingThinkingBlock.tsx`

**Why:** During streaming, thinking content lives in `conversationState.thinkingContent` (not yet persisted as a message). This component renders the live thinking state.

**Step 1: Create StreamingThinkingBlock**

```typescript
import { Component, Show, createSignal } from 'solid-js';
import { ChevronDown, ChevronRight } from 'lucide-solid';

interface StreamingThinkingBlockProps {
  content: string;
}

function thinkingPreview(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77) + '...';
}

export const StreamingThinkingBlock: Component<StreamingThinkingBlockProps> = (props) => {
  // Always expanded during streaming
  const [expanded, setExpanded] = createSignal(true);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div class="flex justify-start animate-fade-in">
      <div
        class="max-w-[85%] w-full rounded-md overflow-hidden"
        style={{
          background: 'rgba(22, 27, 34, 0.5)',
          border: '1px solid var(--color-border-secondary)',
        }}
      >
        {/* Header */}
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
          style={{ 'transition-duration': 'var(--duration-fast)' }}
          onClick={toggleExpanded}
          aria-expanded={expanded()}
          aria-label={`${expanded() ? 'Collapse' : 'Expand'} thinking`}
        >
          <span class="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Thinking
          </span>

          <Show when={!expanded()}>
            <span
              class="text-xs italic truncate flex-1"
              style={{ color: 'var(--color-text-tertiary)', opacity: '0.7' }}
            >
              {thinkingPreview(props.content)}
            </span>
          </Show>

          <span class="animate-thinking-shimmer text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            ...
          </span>

          <Show
            when={expanded()}
            fallback={<ChevronRight size={14} color="var(--color-text-tertiary)" class="shrink-0" />}
          >
            <ChevronDown size={14} color="var(--color-text-tertiary)" class="shrink-0" />
          </Show>
        </button>

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

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 3: Commit**

```bash
git add src/components/conversation/StreamingThinkingBlock.tsx
git commit -m "CHI-90: create StreamingThinkingBlock for live thinking display"
```

---

## Task 8: Update ConversationView to Use New Components

**Files:**
- Modify: `src/components/conversation/ConversationView.tsx`

**Step 1: Add imports for new components**

At the top of the file, add:

```typescript
import { ToolUseBlock } from './ToolUseBlock';
import { ToolResultBlock } from './ToolResultBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { StreamingThinkingBlock } from './StreamingThinkingBlock';
```

**Step 2: Update the message rendering `<For>` loop**

Replace the current:
```typescript
<For each={conversationState.messages}>
  {(msg, index) => (
    <div
      class="animate-fade-in-up"
      style={{ 'animation-delay': `${Math.min(index() * 30, 200)}ms` }}
    >
      <MessageBubble message={msg} />
    </div>
  )}
</For>
```

With role-based rendering:
```typescript
<For each={conversationState.messages}>
  {(msg, index) => (
    <div
      class="animate-fade-in-up"
      style={{ 'animation-delay': `${Math.min(index() * 30, 200)}ms` }}
    >
      {msg.role === 'tool_use' ? (
        <ToolUseBlock message={msg} />
      ) : msg.role === 'tool_result' ? (
        <ToolResultBlock message={msg} />
      ) : msg.role === 'thinking' ? (
        <ThinkingBlock message={msg} />
      ) : (
        <MessageBubble message={msg} />
      )}
    </div>
  )}
</For>
```

Note: The SolidJS way would be `<Switch>/<Match>`, but ternaries work fine here for 4 branches and avoid unnecessary component overhead.

**Step 3: Add StreamingThinkingBlock above streaming content**

Insert BEFORE the existing streaming content `<Show>` block:

```typescript
{/* Live thinking display during streaming */}
<Show when={conversationState.isStreaming && conversationState.thinkingContent}>
  <StreamingThinkingBlock content={conversationState.thinkingContent} />
</Show>

{/* Streaming content (existing) */}
<Show when={conversationState.isStreaming && conversationState.streamingContent}>
  {/* ... existing streaming bubble ... */}
</Show>
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 5: Run ESLint**

Run: `npx eslint src/components/conversation/ConversationView.tsx`
Expected: No errors (may need to adjust any lint rules)

**Step 6: Commit**

```bash
git add src/components/conversation/ConversationView.tsx
git commit -m "CHI-89,CHI-90: integrate ToolUseBlock, ToolResultBlock, ThinkingBlock in ConversationView"
```

---

## Task 9: Update MessageBubble to Remove Tool/Thinking Handling

**Files:**
- Modify: `src/components/conversation/MessageBubble.tsx`

**Step 1: Simplify isSystem check**

Since tool_use, tool_result, and thinking messages are now handled by dedicated components, MessageBubble's `isSystem` function should only check for `'system'` role:

```typescript
// Before:
const isSystem = () =>
  props.message.role === 'system' ||
  props.message.role === 'tool_use' ||
  props.message.role === 'tool_result';

// After:
const isSystem = () => props.message.role === 'system';
```

**Step 2: Update roleLabel to remove tool roles (safety — these shouldn't reach MessageBubble anymore)**

The roleLabel function can keep tool_use/tool_result labels as fallback safety, or remove them. Keep them for safety:

```typescript
function roleLabel(role: MessageRole): string {
  switch (role) {
    case 'user': return 'You';
    case 'assistant': return 'Assistant';
    case 'system': return 'System';
    case 'tool_use': return 'Tool Use';      // Fallback — shouldn't reach here
    case 'tool_result': return 'Tool Result'; // Fallback — shouldn't reach here
    case 'thinking': return 'Thinking';       // Fallback — shouldn't reach here
    default: return role;
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Passes

**Step 4: Commit**

```bash
git add src/components/conversation/MessageBubble.tsx
git commit -m "CHI-89: simplify MessageBubble isSystem check, tool/thinking now handled by dedicated components"
```

---

## Task 10: Full Verification

**Step 1: Run Rust checks**

```bash
cd src-tauri && cargo check && cargo test && cargo clippy -- -D warnings
```

Expected: All pass (74+ tests, no clippy warnings)

**Step 2: Run frontend checks**

```bash
npx tsc --noEmit && npx eslint . && npx prettier --check .
```

Expected: All pass

**Step 3: Manual testing**

1. Start the app: `cargo tauri dev`
2. Send a message that triggers tool use (e.g., "read the file src/App.tsx")
3. Verify:
   - ToolUseBlock appears with tool name, color stripe (blue for Read = neutral gray)
   - ToolResultBlock appears below with file content
   - Both are collapsible (click header)
   - During streaming: blocks are expanded
   - After response: blocks collapse
4. Send a message that triggers thinking (e.g., complex coding question)
5. Verify:
   - StreamingThinkingBlock appears during streaming with live text + blinking cursor
   - After response completes: ThinkingBlock appears collapsed with preview
   - Click to expand full thinking
6. Close and reopen the session
7. Verify:
   - Restored messages include tool_use, tool_result, and thinking blocks
   - All blocks are collapsed by default on restore

**Step 4: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "CHI-89,CHI-90: fixes from manual testing"
```

**Step 5: Final commit with both issues referenced**

If all clean:
```bash
git add -A
git commit -m "CHI-89,CHI-90: ToolUseBlock and ThinkingBlock components complete"
```

---

## Summary

| Task | CHI | Description | Files |
|------|-----|-------------|-------|
| 1 | 89 | Extract tool_use_id in Rust parser | `parser.rs`, `event_loop.rs` |
| 2 | 89,90 | Update TypeScript types | `types.ts` |
| 3 | 89,90 | Update conversationStore (structured JSON + thinking persistence) | `conversationStore.ts` |
| 4 | 89 | Create ToolUseBlock component | `ToolUseBlock.tsx` (new) |
| 5 | 89 | Create ToolResultBlock component | `ToolResultBlock.tsx` (new) |
| 6 | 90 | Create ThinkingBlock component | `ThinkingBlock.tsx` (new) |
| 7 | 90 | Create StreamingThinkingBlock component | `StreamingThinkingBlock.tsx` (new) |
| 8 | 89,90 | Integrate in ConversationView | `ConversationView.tsx` |
| 9 | 89 | Simplify MessageBubble | `MessageBubble.tsx` |
| 10 | 89,90 | Full verification (Rust + TS + manual) | — |

**New files:** 4 (`ToolUseBlock.tsx`, `ToolResultBlock.tsx`, `ThinkingBlock.tsx`, `StreamingThinkingBlock.tsx`)
**Modified files:** 5 (`parser.rs`, `event_loop.rs`, `types.ts`, `conversationStore.ts`, `ConversationView.tsx`, `MessageBubble.tsx`)
**Estimated commits:** 8-10
