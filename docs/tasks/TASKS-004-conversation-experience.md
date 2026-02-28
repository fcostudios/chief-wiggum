# TASKS-004: Conversation Experience Overhaul

**Created:** 2026-02-26
**Project:** Conversation Experience
**Team:** Chief Wiggum (CHI)

---

## Problem Statement

Chief Wiggum's conversation view is functional but falls short of modern AI chat UI standards. The current `MarkdownContent` component uses `marked` + `highlight.js` with no support for tables, diagrams, or LaTeX. Tool execution output is shown as raw JSON/text with no live progress. File attachments only work via drag-drop from the internal file explorer — no clipboard paste, no external drag-drop, no image support. The streaming experience, while smooth thanks to the typewriter buffer, suffers from thinking blocks that consume excessive visual space and push actual response content out of view.

Competitors like Cursor, Windsurf, and tools built on Vercel's Streamdown have raised the bar with GFM table rendering, Mermaid diagram support, live terminal output streaming, and rich clipboard integration. This project closes every gap.

---

## Current State (Audit Summary)

| Capability | Current | Target |
|-----------|---------|--------|
| Markdown tables | ✗ Renders as plain text | ✓ Styled, sortable, copy-as-markdown |
| Mermaid diagrams | ✗ Not supported | ✓ Inline rendered SVG with fullscreen |
| LaTeX/math | ✗ Not supported | ✓ KaTeX inline + block rendering |
| Code blocks | ✓ highlight.js + copy | ✓ + line numbers, language badge, wrap toggle |
| Streaming thinking | ✓ Works but too prominent | ✓ Compact, collapsible, doesn't push content |
| Tool execution | ✓ Static JSON display | ✓ Live terminal-style streaming output |
| Clipboard paste (images) | ✗ Not supported | ✓ Paste screenshots, images |
| Clipboard paste (files) | ✗ Not supported | ✓ Paste files from OS |
| External drag-drop | ✗ Only internal MIME type | ✓ Accept files from Finder/Explorer |
| Image attachments | ✗ Not supported | ✓ Preview thumbnails, base64 encoding |
| Inline image rendering | ✗ Not supported | ✓ Images in assistant responses |
| HTML content rendering | ✗ Not wired | ✓ Safe HTML subset in responses |

---

## Architecture Approach

### Rich Content Rendering (Epic A)

Replace the current `marked` + `highlight.js` pipeline with a custom marked renderer chain that detects and dispatches content to specialized render components:

```
Raw markdown → marked tokenizer → Content Dispatcher
  ├─ table tokens    → TableRenderer (sortable, copy-as-MD)
  ├─ code(mermaid)   → MermaidRenderer (mermaid.js → SVG)
  ├─ code(math)      → KaTeXRenderer (katex → HTML)
  ├─ code(*)         → EnhancedCodeBlock (shiki or highlight.js + line numbers)
  ├─ image tokens    → ImageRenderer (lazy load, lightbox)
  └─ default         → existing MarkdownContent flow
```

This is additive — no existing rendering breaks. Each renderer is a SolidJS component mounted via `marked.use({ renderer: { ... } })` custom hooks that return placeholder `<div>` tags, which a post-render pass hydrates into SolidJS components.

### Streaming & Thinking UX (Epic B)

Two sub-problems:

1. **Thinking display** — Switch from always-expanded to a compact progress indicator during streaming. Show a single-line summary ("Analyzing code structure...") with token count, expandable on click. After completion, collapse to ~80 char preview (current behavior is fine for persisted).

2. **Tool execution streaming** — When the CLI bridge emits `tool:use` for Bash/terminal commands, open a mini terminal-style panel inline that streams stdout/stderr in real-time. This requires the bridge to forward incremental tool output (currently it waits for `tool:result`). Falls back to current static display if incremental output isn't available.

### File Attachments & Input (Epic C)

Three input vectors to add:

1. **Clipboard paste** — Listen for `paste` event on MessageInput. If `clipboardData.files` contains images, convert to base64, show thumbnail preview, attach to context. If it contains text with file paths, offer to attach the file.

2. **External drag-drop** — Extend the current drag handler to accept standard `Files` MIME type from OS file managers (not just the custom CW MIME type). Show drop zone overlay, validate file types, add to context.

3. **Image support** — New `ImageAttachment` type in contextStore. Images get base64-encoded, shown as thumbnail chips below the textarea. On send, included in the prompt via Claude's vision API format.

---

## Epic A: Rich Content Rendering

### CHI-A1: GFM Table Rendering (Urgent)
**What:** Custom `marked` renderer for table tokens. Renders as styled HTML table with SPEC-002 tokens (alternating row shading, header styling, border). Horizontal scroll wrapper for wide tables. "Copy as Markdown" button on hover.

**Acceptance Criteria:**
- Markdown tables render as styled, readable HTML tables
- Tables scroll horizontally if wider than container
- Copy-as-markdown button in top-right corner on hover
- Responsive: stack to vertical layout on narrow panes (split view)
- Works during streaming (partial table renders progressively)

**Files:** `src/components/conversation/MarkdownContent.tsx`, new `src/components/conversation/renderers/TableRenderer.tsx`

### CHI-A2: Mermaid Diagram Rendering (High)
**What:** Detect `mermaid` language in fenced code blocks. Render as SVG using `mermaid.js`. Fullscreen button for complex diagrams. Fallback to code block if parsing fails.

**Acceptance Criteria:**
- ````mermaid` code blocks render as SVG diagrams
- Click to expand to fullscreen modal
- Graceful fallback: if mermaid parse fails, show as code block with error hint
- Dark theme support (auto-detect from SPEC-002 tokens)
- Lazy-load mermaid.js (don't bloat initial bundle)

**Files:** New `src/components/conversation/renderers/MermaidRenderer.tsx`, lazy import in MarkdownContent

### CHI-A3: Enhanced Code Blocks (High)
**What:** Upgrade code block rendering with: line numbers (toggleable), language badge, word-wrap toggle, improved copy button with "Copied!" feedback. Consider Shiki for richer highlighting.

**Acceptance Criteria:**
- Line numbers shown by default, toggleable via button
- Language name badge in top-right (e.g., "TypeScript", "Python")
- Word-wrap toggle button for long lines
- Copy button with animated checkmark feedback (reuse CHI-75 micro-interaction)
- Evaluate Shiki vs current highlight.js for quality/bundle trade-off

**Files:** `src/components/conversation/MarkdownContent.tsx`, new `src/components/conversation/renderers/CodeBlockRenderer.tsx`

### CHI-A4: LaTeX / Math Rendering (Medium)
**What:** Support inline math (`$...$`) and block math (`$$...$$`) via KaTeX. Register custom marked tokenizer extension for math delimiters.

**Acceptance Criteria:**
- `$E = mc^2$` renders inline math
- `$$\int_0^1 f(x) dx$$` renders block math (centered)
- KaTeX loaded lazily (only when math content detected)
- Graceful fallback: show raw LaTeX if parse fails
- Works in streaming mode (partial expressions render on completion)

**Files:** New `src/components/conversation/renderers/MathRenderer.tsx`, marked tokenizer extension

### CHI-A5: Inline Image Rendering (Medium)
**What:** Render image markdown (`![alt](url)`) as actual images in assistant responses. Support base64 data URIs. Lazy loading. Click-to-expand lightbox.

**Acceptance Criteria:**
- `![screenshot](data:image/png;base64,...)` renders inline image
- `![diagram](https://...)` renders external image (with security: same-origin or allowlist)
- Lazy loading with placeholder shimmer
- Click opens lightbox modal (zoom, download)
- Max height constraint with "Show full image" toggle

**Files:** New `src/components/conversation/renderers/ImageRenderer.tsx`, MarkdownContent renderer hook

### CHI-A6: Content Type Detection & Renderer Registry (High)
**What:** Create a `RendererRegistry` that plugs into marked's custom renderer system. Each content type registers itself. This is the architectural backbone for A1-A5.

**Acceptance Criteria:**
- `RendererRegistry` class with `register(type, component)` API
- Marked custom renderer delegates to registry
- Post-render hydration pass mounts SolidJS components into placeholder divs
- Hot-reloadable (HMR doesn't break renderers)
- Registry is tree-shakeable (unused renderers don't ship)

**Files:** New `src/lib/rendererRegistry.ts`, modified `src/components/conversation/MarkdownContent.tsx`

---

## Epic B: Streaming & Thinking UX

### CHI-B1: Compact Streaming Thinking Indicator (Urgent)
**What:** During streaming, replace the full expanded thinking block with a compact single-line indicator showing: thinking icon + brief summary (first ~60 chars or auto-summarized) + elapsed time + token estimate. Expandable on click. After message complete, persist as current ThinkingBlock (collapsed preview).

**Acceptance Criteria:**
- During streaming: single-line thinking bar, doesn't push response content
- Shows elapsed time counter (e.g., "Thinking... 3.2s")
- Click expands to full thinking content (scrollable)
- Smooth transition from compact → expanded
- After complete: collapses to ~80 char preview (current behavior preserved)
- Thinking indicator positioned above response content, not between chunks

**Files:** `src/components/conversation/StreamingThinkingBlock.tsx`, `src/components/conversation/ConversationView.tsx`

### CHI-B2: Live Tool Execution Output (High)
**What:** When a bash/terminal tool is executing, show a mini inline terminal with real-time stdout/stderr streaming. Requires bridge to forward incremental output chunks (new event type `tool:output`).

**Backend:**
- New `tool:output` Tauri event emitted during tool execution (before `tool:result`)
- Bridge event loop forwards PTY output chunks as they arrive
- Falls back to current static display if no incremental output available

**Frontend:**
- New `LiveToolOutput` component renders inline mini-terminal
- Monospace font, dark background, auto-scroll, max-height with scroll
- Shows running indicator (spinner + elapsed time)
- Collapses on completion, expandable to review full output
- Exit code badge (green ✓ for 0, red ✗ for non-zero)

**Acceptance Criteria:**
- Bash commands show live output as they execute
- Auto-scrolls to latest output line
- Collapsible after completion
- Works alongside existing ToolUseBlock/ToolResultBlock
- Graceful degradation: if no streaming output, falls back to current rendering

**Files:** New `src/components/conversation/LiveToolOutput.tsx`, `src-tauri/src/bridge/event_loop.rs` (new event), `src/stores/conversationStore.ts` (new listener)

### CHI-B3: Response Content Priority Layout (Medium)
**What:** Restructure the streaming message layout so the actual response text is always prominently visible, even when thinking and tool use blocks are present. Thinking goes to a collapsible header section. Tool blocks go to a collapsible "Activity" section. Response text gets the primary visual weight.

**Acceptance Criteria:**
- During streaming: response text is the visually dominant element
- Thinking is a compact bar above (not interleaved with content)
- Tool activity blocks are grouped in a collapsible "Activity" section
- User can expand any section without losing scroll position
- Layout doesn't shift/jump when sections expand/collapse

**Files:** `src/components/conversation/ConversationView.tsx`, `src/components/conversation/MessageBubble.tsx`

---

## Epic C: File Attachments & Input

### CHI-C1: Clipboard Image Paste (Urgent)
**What:** Listen for `paste` event on MessageInput textarea. Detect image data in clipboard (`clipboardData.files` or `clipboardData.items` with image MIME types). Convert to base64, generate thumbnail, add as attachment chip below textarea.

**Acceptance Criteria:**
- Cmd+V with screenshot on clipboard attaches image
- Thumbnail preview shown as chip below textarea (resizable)
- Multiple images supported (paste multiple times)
- File size limit enforced (toast warning if > 5MB)
- Remove button (×) on each image chip
- Token estimate shown on chip (image token cost)

**Files:** `src/components/conversation/MessageInput.tsx`, `src/stores/contextStore.ts` (new ImageAttachment type)

### CHI-C2: External File Drag-Drop (High)
**What:** Extend MessageInput and ConversationView to accept standard OS file drag-drop (not just the custom CW MIME type). Show full-window drop zone overlay. Validate file types (code, text, images, PDFs). Add to context as attachments.

**Acceptance Criteria:**
- Dragging files from Finder/Explorer shows drop zone overlay
- Supported types: code files, text, images, PDFs
- Unsupported types: show toast with explanation
- Multiple files in single drop supported
- Files added as ContextChips with remove button
- Drop zone uses SPEC-002 tokens (accent border, dimmed background)

**Files:** `src/components/conversation/MessageInput.tsx`, `src/components/conversation/ConversationView.tsx`, `src/stores/contextStore.ts`

### CHI-C3: Image Attachment Preview & Encoding (High)
**What:** Create the ImageAttachment data model and UI. Images are base64-encoded for Claude's vision API. Preview thumbnails render below the textarea alongside existing ContextChips. On send, images are formatted as vision-compatible content blocks.

**Acceptance Criteria:**
- Image attachments stored as base64 with metadata (size, dimensions, MIME type)
- Thumbnail preview (max 120px height) shown below textarea
- Click thumbnail to preview full-size in modal
- On send: formatted as `{ type: "image", source: { type: "base64", media_type, data } }`
- Total image size indicator with budget warning

**Files:** New `src/components/conversation/ImageAttachmentChip.tsx`, `src/stores/contextStore.ts`, `src/stores/conversationStore.ts` (context assembly)

### CHI-C4: Attachment Button & File Picker (Medium)
**What:** Add a paperclip/attach button to MessageInput that opens a native file picker dialog (via Tauri's `dialog` plugin). Selected files get added as context attachments.

**Acceptance Criteria:**
- Paperclip icon button in MessageInput toolbar
- Opens native file picker (multi-select enabled)
- File type filter: code, text, images, PDFs
- Selected files added as ContextChip attachments
- Keyboard shortcut: Cmd+Shift+A

**Files:** `src/components/conversation/MessageInput.tsx`, new IPC command in `src-tauri/src/commands/files.rs`

---

## Epic D: Polish & Differentiators

### CHI-D1: Streaming Code Block Stability (High)
**What:** During streaming, incomplete code blocks (no closing ```) cause rendering flicker. Detect unterminated code fences and apply temporary styling (dimmed border, "generating..." indicator) until the block is complete.

**Acceptance Criteria:**
- Partial code blocks render with stable layout (no flicker)
- "Generating..." indicator on incomplete blocks
- Syntax highlighting applies progressively as language is detected
- No layout shift when closing fence arrives

**Files:** `src/components/conversation/MarkdownContent.tsx`, `src/lib/typewriterBuffer.ts`

### CHI-D2: Copy Actions on All Blocks (Medium)
**What:** Add copy buttons to tool use input, tool result output, and thinking blocks. Currently only markdown code blocks have copy. Consistent "Copied!" feedback animation.

**Acceptance Criteria:**
- Copy button on ToolUseBlock (copies tool input JSON)
- Copy button on ToolResultBlock (copies output text)
- Copy button on ThinkingBlock (copies thinking content)
- All use same animation as markdown code block copy
- Keyboard shortcut: Cmd+C when block is focused (accessibility)

**Files:** `src/components/conversation/ToolUseBlock.tsx`, `src/components/conversation/ToolResultBlock.tsx`, `src/components/conversation/ThinkingBlock.tsx`

### CHI-D3: Message Formatting Toggle (Low)
**What:** Toggle between rendered markdown and raw source view per message. Useful for debugging prompt formatting or copying exact markdown.

**Acceptance Criteria:**
- Toggle button (eye icon) on assistant messages
- Switches between rendered markdown and raw source (monospace)
- Raw view is syntax-highlighted as markdown
- Toggle state is per-message (not global)

**Files:** `src/components/conversation/MessageBubble.tsx`

### CHI-D4: Response Anchor Links (Low)
**What:** Headings in assistant responses get anchor IDs. A mini outline/TOC appears on hover for long responses (>3 headings). Click to scroll to section.

**Acceptance Criteria:**
- Headings rendered with id attributes
- Long responses (≥3 headings) show floating mini-TOC on hover
- Click heading in TOC scrolls to that section
- Works with virtual scrolling

**Files:** `src/components/conversation/MarkdownContent.tsx`, new `src/components/conversation/ResponseOutline.tsx`

### CHI-D5: TodoWrite Rich Checklist Block (High) — CHI-214
**What:** Replace the raw JSON display for `TodoWrite` tool calls with a purpose-built checklist component. When Claude calls `TodoWrite`, instead of showing the raw `tool_input` JSON, render a collapsible checklist with status icons, progress count, and an in-progress count pill. Also add a live StatusBar badge showing task progress during active sessions.

**Background:** UX research (stored in `docs/plans/2026-02-27-chi-todo-write-block.md`) compared three display patterns (Toast, Floating, Inline). The Inline/collapsible approach (Option A) was selected as the best fit for Chief Wiggum's existing conversation architecture. It reuses existing design tokens, requires no new stores, and is consistent with how `ThinkingBlock` and `ToolUseBlock` handle complex tool output.

**Architecture:**
- `ToolUseBlock.tsx` detects `tool_name === 'TodoWrite'` and delegates rendering to `TodoWriteBlock`
- `TodoWriteBlock.tsx` is a new SolidJS component parsing `tool_input.todos[]`
- `StatusBar.tsx` gains a `createMemo` that scans messages for the latest TodoWrite and shows a `✓ X/Y` badge only when `processStatus === 'running'`
- No new Tauri IPC, no new stores, no new design tokens

**Acceptance Criteria:**
- `TodoWriteBlock` renders collapsed by default with: ✦ "Tasks" header, `X/Y done` progress label, `⟳ N` in-progress pill (only if N > 0)
- Click header toggles expanded list of todo items, each with status icon (✦ pending, ⟳ in-progress, ✓ done) and `content` text
- When `tool_input` is missing or `todos` is empty, renders graceful fallback (raw JSON or "No tasks" message)
- `ToolUseBlock` continues to render all non-`TodoWrite` tools identically to current behavior
- StatusBar badge `✓ X/Y` appears while session is running and has at least one `TodoWrite` message; disappears when session stops
- All i18n strings use `todoBlock.*` and `statusBar.taskProgress` keys in `en.json` / `es.json`
- SPEC-002 tokens used: `--color-success` (done), `--color-warning` (in-progress), `--color-text-tertiary` (pending)
- 15 unit tests pass (CHI-215 companion)

**Files:**
- New: `src/components/conversation/TodoWriteBlock.tsx`
- Modify: `src/lib/types.ts` (add `TodoItem`, `TodoWriteData` interfaces)
- Modify: `src/components/conversation/ToolUseBlock.tsx` (delegation `<Show>` wrapper)
- Modify: `src/components/layout/StatusBar.tsx` (add `latestTodos` + `todoBadge` memos)
- Modify: `src/locales/en.json`, `src/locales/es.json` (add `todoBlock.*` + `statusBar.taskProgress` keys)

**Full implementation plan:** `docs/plans/2026-02-27-chi-todo-write-block.md`

---

## Priority & Dependencies

```
CHI-A6 (Registry) ──┬── CHI-A1 (Tables)         ← Urgent
                     ├── CHI-A2 (Mermaid)        ← High
                     ├── CHI-A3 (Code Blocks)    ← High
                     ├── CHI-A4 (Math)           ← Medium
                     └── CHI-A5 (Images)         ← Medium

CHI-B1 (Compact Thinking)                         ← Urgent (independent)
CHI-B2 (Live Tool Output)                          ← High (needs bridge changes)
CHI-B3 (Priority Layout)                           ← Medium (after B1)

CHI-C1 (Clipboard Paste)                           ← Urgent (independent)
CHI-C2 (External Drag-Drop)                        ← High (independent)
CHI-C3 (Image Encoding)  ←── CHI-C1, CHI-C2       ← High (after C1 or C2)
CHI-C4 (Attach Button)                             ← Medium (independent)

CHI-D1 (Streaming Stability) ←── CHI-A6           ← High
CHI-D2 (Copy Actions)                              ← Medium (independent)
CHI-D3 (Format Toggle)                             ← Low (independent)
CHI-D4 (Anchor Links)                              ← Low (independent)
CHI-D5 (TodoWrite Checklist) ←── CHI-89 (Done)    ← High (independent, no blocking deps)
```

**Recommended execution order:**
1. CHI-A6 + CHI-B1 + CHI-C1 (parallel, no dependencies)
2. CHI-A1 + CHI-A3 + CHI-C2 (parallel, A1/A3 depend on A6)
3. CHI-A2 + CHI-B2 + CHI-C3 (parallel)
4. CHI-D1 + CHI-A4 + CHI-C4
5. CHI-B3 + CHI-D2 + CHI-A5
6. CHI-D3 + CHI-D4 (lowest priority)

---

## Epic E: Conversation Utility Features

> Added 2026-02-26 (session 2). These features address power-user productivity gaps identified during
> code audit: search within conversations, structured export, voice input, and symbol-level @-mentions.

### CHI-E1: In-Session Message Search (High)
**What:** Full-text search across messages in the active conversation session. Triggered via Cmd+F
(or Cmd+Shift+F to avoid webview capture). Shows a floating search bar above the conversation
that highlights matching text, jumps between matches, and shows match count.

**Acceptance Criteria:**
- Cmd+F (or Cmd+Shift+F) opens search bar floating above ConversationView
- Real-time match highlighting as user types (debounced 150ms)
- Match count indicator: "3 of 11 matches"
- Next/Prev navigation (Enter / Shift+Enter or arrow buttons)
- First match visible on open; auto-scrolls to each match
- Esc closes search bar, clears highlights
- Works with virtual scrolling (force-renders matching messages)
- Case-insensitive by default; optional case-sensitive toggle

**Files:**
- New `src/components/conversation/ConversationSearch.tsx` — floating search bar
- `src/components/conversation/ConversationView.tsx` — integrate search, highlight pass
- `src/stores/conversationStore.ts` — search index (in-memory, derived from messages)

### CHI-E2: Conversation Export (Medium)
**What:** Export the active session conversation to Markdown, HTML, or plain text. Accessible
from Command Palette and session context menu. Saves via native Tauri file save dialog.

**Acceptance Criteria:**
- Export formats: Markdown (.md), HTML (styled, self-contained), Plain text (.txt)
- Markdown export: thinking blocks as `<details>`, tool use as code fences
- HTML export: standalone file with embedded CSS matching SPEC-002 dark theme
- Native file save dialog with default filename `session-{id}-{date}.{ext}`
- Command Palette entry: "Export Conversation" (category: session)
- Session context menu entry (right-click session in Sidebar)
- Toast notification on success with "Open File" action button

**Files:**
- New `src/lib/conversationExport.ts` — export formatting logic (pure TS, no IPC)
- `src/components/common/CommandPalette.tsx` — register export action
- `src/components/layout/Sidebar.tsx` — session context menu entry
- New `src-tauri/src/commands/export.rs` — `save_export_file` IPC (file write + dialog)

### CHI-E3: Voice Input (Low)
**What:** Microphone button in MessageInput toolbar. Uses Web Speech API (`SpeechRecognition`)
for real-time speech-to-text. Text inserted at cursor position. macOS-first (mic capability required).

**Acceptance Criteria:**
- Microphone icon button in MessageInput toolbar (right of attachment button)
- Click starts recording; button shows red pulsing indicator
- Speech transcribed in real-time into textarea
- Click again or Esc stops recording
- If mic permission denied: toast with System Preferences guidance
- If SpeechRecognition unavailable: button hidden (not disabled)
- Keyboard shortcut: Cmd+Shift+V toggles recording
- Command Palette entry: "Start Voice Input"

**Files:**
- `src/components/conversation/MessageInput.tsx` — mic button + SpeechRecognition integration
- `src/lib/keybindings.ts` — new shortcut entry
- `src-tauri/tauri.conf.json` — confirm microphone capability

### CHI-E4: Symbol @-Mention (Medium)
**What:** Extend `@`-mention system beyond files to support code symbols. `@fn:` suggests
functions, `@class:` suggests classes, `@var:` suggests exported constants — scanned from
active project via new backend regex scanner. Selected symbol attaches as a snippet ContextChip.

**Acceptance Criteria:**
- `@fn:<query>` → FileMentionMenu shows matching function names
- `@class:<query>` → matching class names
- `@var:<query>` → matching exported const/variable names
- Results show: name, file path, line number
- Selected symbol → ContextChip: `@fn:functionName (file.ts:42)` with signature + up to 20 lines
- Backend: `list_symbols` IPC in `commands/files.rs` (regex-based, supports TS/Rust/Python)
- Fallback: unsupported file types fall back to file-level @-mention

**Files:**
- `src/components/conversation/FileMentionMenu.tsx` — extend for symbol prefix detection
- `src/components/conversation/MessageInput.tsx` — detect `@fn:`, `@class:`, `@var:` triggers
- `src-tauri/src/files/scanner.rs` — new `scan_symbols()` regex function
- `src-tauri/src/commands/files.rs` — new `list_symbols` IPC command

---

## Epic F: QA Test Coverage (Conversation Experience)

> These test tasks run parallel to implementation waves. Each must complete before its feature ships.

### CHI-F1: Unit Tests — Renderer Registry & GFM Tables (High)
**Covers:** CHI-186, CHI-181
- `rendererRegistry.ts`: register/dispatch/deregister, type collision, HMR reset
- `TableRenderer.tsx`: valid GFM table renders, horizontal scroll on overflow, copy-as-markdown
- Edge cases: empty table, single-column, partial streaming table rows
- Files: `src/lib/rendererRegistry.test.ts`, `renderers/TableRenderer.test.tsx`

### CHI-F2: Unit Tests — Code Block & Mermaid Renderers (High)
**Covers:** CHI-183, CHI-182
- `CodeBlockRenderer.tsx`: line numbers toggle, language badge, word-wrap, copy feedback animation
- `MermaidRenderer.tsx`: valid input → SVG wrapper rendered, parse fail → code block fallback, dark theme class applied
- Files: `renderers/CodeBlockRenderer.test.tsx`, `renderers/MermaidRenderer.test.tsx`

### CHI-F3: Unit Tests — Math & Image Renderers (Medium)
**Covers:** CHI-184, CHI-185
- `MathRenderer.tsx`: inline `$...$` renders, block `$$...$$` renders centered, parse fail → raw fallback
- `ImageRenderer.tsx`: img tag rendered, shimmer placeholder before load, lightbox on click, external URL security block
- Files: `renderers/MathRenderer.test.tsx`, `renderers/ImageRenderer.test.tsx`

### CHI-F4: Unit Tests — Streaming & Thinking UX (High)
**Covers:** CHI-187, CHI-188, CHI-189
- `StreamingThinkingBlock.tsx`: compact mode (single-line), click to expand, elapsed timer ticks, transitions to ThinkingBlock on complete
- `LiveToolOutput.tsx`: renders output lines, auto-scrolls, exit code badge (green=0 / red=nonzero), collapses on complete
- Files: extended `StreamingThinkingBlock.test.tsx`, new `LiveToolOutput.test.tsx`

### CHI-F5: Unit Tests — File Attachments (High)
**Covers:** CHI-190, CHI-191, CHI-192, CHI-193
- Clipboard paste: image paste event → thumbnail chip added, >5MB → toast error shown
- Drag-drop: dragover shows overlay, supported type → chip added, unsupported type → toast
- Image encoding: base64 generated, thumbnail URL set, token estimate displayed
- Attach button: file picker invoked (mocked), file selected → ContextChip created
- Files: `ImageAttachmentChip.test.tsx`, extended `MessageInput.test.ts`

### CHI-F6: Unit Tests — Polish Features (Medium)
**Covers:** CHI-194, CHI-195, CHI-196, CHI-197
- Streaming stability: unterminated code fence → dimmed border + "generating..." indicator applied
- Copy actions: ToolUseBlock copy → clipboard.writeText with JSON, ThinkingBlock copy → thinking text
- Format toggle: eye icon → toggles rendered/raw per message, not globally
- Anchor links: headings have id attrs, 3+ headings → outline visible, click → scroll triggered
- Files: extended test files per component

### CHI-F7: Unit Tests — Utility Features (Medium)
**Covers:** CHI-E1, CHI-E2, CHI-E3, CHI-E4
- `ConversationSearch.tsx`: highlights matches, Esc clears, match count accurate, next/prev navigation
- `conversationExport.ts`: markdown preserves roles, HTML is self-contained string with CSS
- Voice input: `SpeechRecognition` absent → button hidden; present → start/stop lifecycle managed
- Symbol @-mention: `@fn:` prefix triggers symbol search, selected → correct ContextChip content
- Files: `ConversationSearch.test.tsx`, `conversationExport.test.ts`

### CHI-F8: E2E Tests — Rich Content Rendering (High)
**Covers:** CHI-181, CHI-182, CHI-183, CHI-186
- Conversation with markdown table → table rendered (not raw pipes)
- Conversation with ```mermaid block → SVG present (not code block)
- Enhanced code block → line numbers visible, copy works end-to-end
- Renderer registry dispatch → correct renderer invoked per content type
- Files: `e2e/conversation-rendering.spec.ts`

### CHI-F9: E2E Tests — Attachments & Input (High)
**Covers:** CHI-190, CHI-191, CHI-193
- Simulate paste with image data → thumbnail chip appears in MessageInput
- Drag-drop external file into conversation → attachment chip added, dragover overlay shown
- Click attach button → file picker dialog triggered (Tauri mock), selected file → chip rendered
- Files: `e2e/conversation-attachments.spec.ts`

### CHI-F10: E2E Tests — Conversation Utility (Medium)
**Covers:** CHI-E1, CHI-E2
- Open Cmd+F search → type query → text highlighted in messages → Esc clears
- Export conversation via Command Palette → file saved → toast shown with "Open File"
- Files: `e2e/conversation-utility.spec.ts`

### CHI-F11: Unit Tests — TodoWrite Block & StatusBar Badge (High) — CHI-215
**Covers:** CHI-214 (D5: TodoWrite Rich Checklist Block)
**Must complete alongside or after CHI-214.**

Full test code pre-written in `docs/plans/2026-02-27-chi-todo-write-block.md`. 15 tests total:

**TodoWriteBlock (10 tests):**
- Renders collapsed by default with correct progress label
- Expands on header click
- Shows ⟳ N in-progress pill only when N > 0
- Renders ✓ icon for `completed` status items
- Renders ⟳ icon for `in_progress` status items
- Renders ✦ icon for `pending` status items
- Handles empty `todos` array gracefully
- Handles malformed/missing `tool_input` gracefully
- Uses correct i18n keys (`todoBlock.header`, `todoBlock.progress`, etc.)
- Applies SPEC-002 color tokens per status

**ToolUseBlock delegation (3 tests):**
- Non-TodoWrite tool names render existing ToolUseBlock content unchanged
- `TodoWrite` tool name renders `TodoWriteBlock` instead of raw JSON
- `ToolResultBlock` is unaffected by TodoWrite delegation

**StatusBar badge (2 tests):**
- Badge `✓ X/Y` visible when `processStatus === 'running'` and messages contain a TodoWrite
- Badge hidden when `processStatus !== 'running'` even if messages contain TodoWrite

**Files:** `src/components/conversation/TodoWriteBlock.test.tsx` (new), `src/components/conversation/ToolUseBlock.test.tsx` (extend), `src/components/layout/StatusBar.test.tsx` (extend)

---

## Expected Impact

- **Rich rendering** puts Chief Wiggum on par with Cursor/Windsurf/Claude.ai for content display
- **Live tool output** is a strong differentiator — most competitors show static results
- **Clipboard image paste** removes a major friction point for sharing screenshots/context
- **Compact thinking** dramatically improves readability of complex responses
- **Mermaid support** enables Claude to produce visual architecture diagrams inline

---

## Research Sources

- [Vercel Streamdown](https://streamdown.ai/) — streaming-aware markdown renderer with GFM tables, Mermaid, KaTeX
- [Visual Studio 2026 Markdown](https://visualstudiomagazine.com/articles/2026/02/24/in-agentic-ai-its-all-about-the-markdown.aspx) — Mermaid support in IDE
- [AI SDK Message Components](https://ai-sdk.dev/elements/components/message) — rich message UI patterns
- [Cursor vs Windsurf vs Claude Code](https://dev.to/pockit_tools/cursor-vs-windsurf-vs-claude-code-in-2026-the-honest-comparison-after-using-all-three-3gof) — competitive comparison
- [Conversational AI UI Comparison 2025](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025) — feature gap analysis
