# CHI-232/233/234/235/236 UI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply five interrelated SPEC-006 UI polish tickets: WCAG contrast fixes, zone background separation, active-tab pill, message-type visual differentiation, and border reduction.

**Architecture:** All changes are pure frontend CSS/SolidJS — no backend changes, no new dependencies. Tasks are ordered so that destructive changes (grain removal) come first, followed by their test fixture fix, then the visual upgrades.

**Tech Stack:** SolidJS 1.9, TailwindCSS v4, `src/styles/tokens.css` for all design tokens, Vitest + @solidjs/testing-library for unit tests, Playwright for E2E.

---

## Key File Map

| File | Purpose |
|------|---------|
| `src/styles/tokens.css` | All design tokens; `@theme` block = dark, `:root[data-theme='light']` = light |
| `src/components/layout/MainLayout.tsx` | Root layout, Z2 sidebar wrapper (line 141), Z4 details wrapper (line 256), ViewTab component (line 349), tabs row (line 189), VIEW_ICONS (line 54) |
| `src/components/layout/MainLayout.test.tsx` | Unit tests; line 251 asserts tab label "Center" (must change to "Actions") |
| `src/components/layout/DetailsPanel.tsx` | CollapsibleSection has `border-bottom` at line 33; cost display at lines 343-348 |
| `src/components/layout/StatusBar.tsx` | Cost pill at lines 480-495; `color: 'var(--color-text-secondary)'` needs → primary |
| `src/components/common/HintTooltip.tsx` | Uses accent background — WCAG fail; needs elevated bg + primary text |
| `src/components/conversation/MessageBubble.tsx` | Role-based styling for CHI-235; all roles currently use uniform card+border |
| `src/components/conversation/MessageInput.tsx` | Top border at lines 893-899; needs removal + bg replacement |
| `tests/e2e/fixtures/app.ts` | Waits for `.grain-overlay` at line 20; must update after CHI-233 removes it |

---

## Part A — CHI-233: Zone Separation + Grain Removal

### Task 1: Add zone tokens and delete grain overlay from `tokens.css`

**Files:**
- Modify: `src/styles/tokens.css`

**Step 1: Add zone background tokens to `@theme` block**

In `src/styles/tokens.css`, after line 19 (`--color-bg-inset: #010409;`), add:

```css
  /* --- Zone backgrounds (CHI-233 §3.2) --- */
  --color-bg-sidebar: #0f1519;
  --color-bg-content: #0d1117;
  --color-bg-details: #111820;
```

**Step 2: Add light-theme overrides**

In the `:root[data-theme='light']` block (after the existing `--color-bg-inset: #f0f2f5;` line), add:

```css
  --color-bg-sidebar: #f0f2f5;
  --color-bg-content: #ffffff;
  --color-bg-details: #f6f8fa;
```

**Step 3: Delete the grain overlay CSS block**

Delete lines 439–452 (the entire block):

```css
/* ============================================================
 * Subtle grain texture overlay
 * ============================================================ */

.grain-overlay::before {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.03;
  pointer-events: none;
  z-index: 9999;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}
```

**Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add src/styles/tokens.css
git commit -m "CHI-233: add zone bg tokens and remove grain overlay CSS"
```

---

### Task 2: Apply zone backgrounds + remove grain class in `MainLayout.tsx`

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Remove `grain-overlay` from root div class**

Line 131. Change:
```tsx
<div class="grain-overlay h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
```
to:
```tsx
<div class="h-screen flex flex-col bg-bg-primary text-text-primary font-ui overflow-hidden">
```

**Step 2: Update sidebar wrapper background**

Lines 141–156. The sidebar wrapper `style` object currently has:
```tsx
background: 'var(--color-chrome-bg)',
'backdrop-filter': 'blur(var(--glass-blur)) saturate(1.05)',
```

Change to:
```tsx
background: 'var(--color-bg-sidebar)',
```
(Remove the `backdrop-filter` line entirely — grain + vibrancy blur is replaced by a solid zone color.)

**Step 3: Update details panel wrapper background**

Lines 256–267. The details panel wrapper `style` object currently has:
```tsx
background: 'var(--color-chrome-bg)',
'backdrop-filter': 'blur(var(--glass-blur)) saturate(1.05)',
```

Change to:
```tsx
background: 'var(--color-bg-details)',
```
(Remove the `backdrop-filter` line.)

**Step 4: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/layout/MainLayout.tsx
```
Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "CHI-233: apply zone bg tokens to sidebar/details wrappers, drop grain class"
```

---

## Part B — Fix E2E Fixture After Grain Removal

### Task 3: Update `app.ts` fixture selector

**Files:**
- Modify: `tests/e2e/fixtures/app.ts`

**Background:** Line 20 waits for `.grain-overlay` to confirm the app has loaded. CHI-233 removed that class, so all E2E tests will timeout. The replacement selector is `#main-content` — the `<main id="main-content">` element defined in `MainLayout.tsx` line 187.

**Step 1: Update the selector**

Change line 20:
```ts
await page.waitForSelector('.grain-overlay', { timeout: 15_000 });
```
to:
```ts
await page.waitForSelector('#main-content', { timeout: 15_000 });
```

**Step 2: Run a smoke E2E test**

```bash
npx playwright test tests/e2e/ --headed --project=chromium -g "renders"
```
Expected: test passes (no timeout on selector).

**Step 3: Commit**

```bash
git add tests/e2e/fixtures/app.ts
git commit -m "CHI-233: fix E2E fixture selector after grain-overlay class removal"
```

---

## Part C — CHI-232: WCAG Contrast Fixes

### Task 4: Update secondary/tertiary text token values

**Files:**
- Modify: `src/styles/tokens.css`

**Background:** Current values fail WCAG 2.2 SC 1.4.3 (4.5:1) on dark bg. New values:
- `--color-text-secondary: #9da5ae` (contrast 5.0:1 on `#0d1117`)
- `--color-text-tertiary: #7d8590` (contrast 3.8:1 — passes AA for UI components/large text SC 1.4.11)

**Step 1: Update dark theme token values**

In the `@theme` block, lines 26–27, change:
```css
  --color-text-secondary: #8b949e;
  --color-text-tertiary: #6e7681;
```
to:
```css
  --color-text-secondary: #9da5ae;
  --color-text-tertiary: #7d8590;
```

**Step 2: Run frontend unit tests**

```bash
npx vitest run
```
Expected: all tests pass (token values don't affect test logic).

**Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "CHI-232: update text-secondary/tertiary tokens for WCAG AA compliance"
```

---

### Task 5: Fix HintTooltip contrast

**Files:**
- Modify: `src/components/common/HintTooltip.tsx`

**Background:** Currently uses `var(--color-accent)` (#e8825a amber) as background with `var(--color-bg-primary)` (dark) as text. On dark theme this works, but on light theme the amber bg + dark text is only ~3.1:1. Switching to `--color-bg-elevated` bg + `--color-text-primary` text achieves 14.7:1 on dark and equivalent on light.

**Step 1: Write the failing test (check for non-accent background)**

Create `src/components/common/HintTooltip.test.tsx`:

```tsx
import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { HintTooltip } from './HintTooltip';

describe('HintTooltip', () => {
  it('renders hint text and shortcut', () => {
    const { getByRole, getByText } = render(() => (
      <HintTooltip id="test-hint" text="Press / to search" shortcut="Cmd+/" onDismiss={() => {}} />
    ));

    expect(getByRole('tooltip')).toBeInTheDocument();
    expect(getByText('Press / to search')).toBeInTheDocument();
    expect(getByText('Cmd+/')).toBeInTheDocument();
  });

  it('calls onDismiss when close button clicked', async () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(() => (
      <HintTooltip id="test-hint" text="Hint text" onDismiss={onDismiss} />
    ));

    await getByRole('button', { name: 'Dismiss hint' }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not render after dismiss', async () => {
    const { getByRole, queryByRole } = render(() => (
      <HintTooltip id="test-hint" text="Hint" onDismiss={() => {}} />
    ));
    expect(queryByRole('tooltip')).toBeInTheDocument();
    await getByRole('button', { name: 'Dismiss hint' }).click();
    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails (or passes for logic, focus on the render test)**

```bash
npx vitest run src/components/common/HintTooltip.test.tsx
```
Expected: tests pass for render/dismiss logic. No contrast tests here — these are visual only.

**Step 3: Update HintTooltip.tsx styling**

In `src/components/common/HintTooltip.tsx`, make these changes to the outer `<div>` style object:

Change:
```tsx
style={{
  background: 'var(--color-accent)',
  color: 'var(--color-bg-primary)',
  'font-size': '11px',
  'line-height': '1.5',
}}
```
to:
```tsx
style={{
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border-secondary)',
  color: 'var(--color-text-primary)',
  'font-size': '11px',
  'line-height': '1.5',
}}
```

Change the arrow caret div's style:
```tsx
style={{
  bottom: '-5px',
  width: '10px',
  height: '5px',
  background: 'var(--color-accent)',
  'clip-path': 'polygon(0 0, 100% 0, 50% 100%)',
}}
```
to:
```tsx
style={{
  bottom: '-5px',
  width: '10px',
  height: '5px',
  background: 'var(--color-bg-elevated)',
  'clip-path': 'polygon(0 0, 100% 0, 50% 100%)',
}}
```

Change the close button style:
```tsx
style={{ color: 'var(--color-bg-primary)' }}
```
to:
```tsx
style={{ color: 'var(--color-text-secondary)' }}
```

Change the `<kbd>` style:
```tsx
style={{
  background: 'rgba(0,0,0,0.2)',
  color: 'var(--color-bg-primary)',
}}
```
to:
```tsx
style={{
  background: 'var(--color-bg-inset)',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-secondary)',
}}
```

**Step 4: Run tests**

```bash
npx vitest run src/components/common/HintTooltip.test.tsx
```
Expected: all 3 tests pass.

**Step 5: Commit**

```bash
git add src/components/common/HintTooltip.tsx src/components/common/HintTooltip.test.tsx
git commit -m "CHI-232: fix HintTooltip contrast (elevated bg + primary text)"
```

---

### Task 6: Fix cost display contrast in StatusBar + DetailsPanel

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/DetailsPanel.tsx`

**Background:** Cost values are money information — must meet 4.5:1 (WCAG AA). Currently using `--color-text-secondary`.

**Step 1: Fix StatusBar cost pill**

In `src/components/layout/StatusBar.tsx`, the cost button style object (around lines 483-488) currently has:
```tsx
style={{
  'font-size': '10px',
  color: 'var(--color-text-secondary)',
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border-secondary)',
}}
```

Change `color` to primary:
```tsx
style={{
  'font-size': '10px',
  color: 'var(--color-text-primary)',
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border-secondary)',
}}
```

**Step 2: Fix DetailsPanel cost row**

In `src/components/layout/DetailsPanel.tsx`, around lines 343–348, the cost row:
```tsx
<div
  class="flex items-center justify-between font-mono"
  style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
>
  <span>Session total</span>
  <span>{costDisplay()}</span>
</div>
```

Give the value span its own color override:
```tsx
<div
  class="flex items-center justify-between font-mono"
  style={{ 'font-size': '10px', color: 'var(--color-text-tertiary)' }}
>
  <span>Session total</span>
  <span style={{ color: 'var(--color-text-primary)' }}>{costDisplay()}</span>
</div>
```

**Step 3: Run lint**

```bash
npx eslint src/components/layout/StatusBar.tsx src/components/layout/DetailsPanel.tsx
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/components/layout/DetailsPanel.tsx
git commit -m "CHI-232: fix cost display contrast to text-primary in StatusBar and DetailsPanel"
```

---

## Part D — CHI-234: Active Tab Pill Indicator + "Center" → "Actions" Rename

### Task 7: Add tab indicator tokens to `tokens.css`

**Files:**
- Modify: `src/styles/tokens.css`

**Step 1: Add dark-theme tab tokens**

In the `@theme` block, add after the zone bg tokens (after `--color-bg-details`):

```css
  /* --- Tab indicator tokens (CHI-234 §4.1) --- */
  --color-tab-active-bg: rgba(232, 130, 90, 0.12);
  --color-tab-active-text: #e8825a;
  --color-tab-inactive-text: #7d8590;
```

**Step 2: Add light-theme tab tokens**

In the `:root[data-theme='light']` block, add after the zone bg overrides:

```css
  --color-tab-active-bg: rgba(207, 110, 62, 0.12);
  --color-tab-active-text: #cf6e3e;
  --color-tab-inactive-text: #8b949e;
```

**Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "CHI-234: add tab indicator design tokens (active-bg, active-text, inactive-text)"
```

---

### Task 8: Refactor ViewTab component, rename "Center" → "Actions", swap icon

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Update lucide-solid import (line 14)**

Change:
```tsx
import { MessageSquare, Users, GitCompare, Terminal, Factory } from 'lucide-solid';
```
to:
```tsx
import { MessageSquare, Users, GitCompare, Terminal, Zap } from 'lucide-solid';
```

**Step 2: Update VIEW_ICONS (lines 54-60)**

Change:
```tsx
const VIEW_ICONS: Record<ActiveView, Component<{ size?: number; class?: string }>> = {
  conversation: MessageSquare,
  agents: Users,
  diff: GitCompare,
  terminal: Terminal,
  actions_center: Factory,
};
```
to:
```tsx
const VIEW_ICONS: Record<ActiveView, Component<{ size?: number; class?: string }>> = {
  conversation: MessageSquare,
  agents: Users,
  diff: GitCompare,
  terminal: Terminal,
  actions_center: Zap,
};
```

**Step 3: Rename "Center" tab (line 197)**

Change:
```tsx
<ViewTab label="Center" view="actions_center" />
```
to:
```tsx
<ViewTab label="Actions" view="actions_center" title="Background tasks & execution history" />
```

**Step 4: Add optional `title` prop + refactor ViewTab to pill style (lines 349-390)**

Replace the entire `ViewTab` component:

```tsx
/** View tab button — pill indicator per CHI-234 */
const ViewTab: Component<{ label: string; view: ActiveView; title?: string }> = (props) => {
  const isActive = () => uiState.activeView === props.view;
  const badge = () => uiState.viewBadges[props.view] ?? 0;

  return (
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors"
      style={{
        'transition-duration': 'var(--duration-normal)',
        background: isActive() ? 'var(--color-tab-active-bg)' : 'transparent',
        color: isActive() ? 'var(--color-tab-active-text)' : 'var(--color-tab-inactive-text)',
      }}
      onClick={() => setActiveView(props.view)}
      title={props.title ?? props.label}
    >
      <Dynamic component={VIEW_ICONS[props.view]} size={13} />
      <span>{props.label}</span>
      <Show when={badge() > 0}>
        <span
          class="ml-0.5 text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
            'min-width': '14px',
            'text-align': 'center',
          }}
        >
          {badge() > 99 ? '99+' : badge()}
        </span>
      </Show>
    </button>
  );
};
```

Note: The absolute-positioned underline div is removed entirely. The `relative` class is gone. `py-2` → `py-1.5` + `rounded-full` creates the pill shape.

**Step 5: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/layout/MainLayout.tsx
```
Expected: no errors.

**Step 6: Commit**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "CHI-234: tab pill indicator, Factory→Zap icon, rename Center→Actions"
```

---

### Task 9: Update MainLayout unit test for "Actions" rename

**Files:**
- Modify: `src/components/layout/MainLayout.test.tsx`

**Step 1: Update the tab label assertion**

Line 251. Change:
```tsx
expect(screen.getByRole('button', { name: 'Center' })).toBeInTheDocument();
```
to:
```tsx
expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
```

**Step 2: Run the unit tests**

```bash
npx vitest run src/components/layout/MainLayout.test.tsx
```
Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/components/layout/MainLayout.test.tsx
git commit -m "CHI-234: update MainLayout test for Center→Actions tab rename"
```

---

## Part E — CHI-235: Message Type Visual Differentiation

### Task 10: Refactor MessageBubble.tsx for role-based left-border styling

**Files:**
- Modify: `src/components/conversation/MessageBubble.tsx`

**Background:**
- User → transparent bg, no card border, 3px solid left accent (40% opacity)
- Assistant → `--color-bg-secondary` bg (unchanged), no card border, 3px solid model-color left border
- System → `--color-bg-elevated` at 50% opacity, centered text, no left border
- Remove the absolute-positioned 2px gradient stripe (replaced by `border-left`)

**Step 1: Write a failing test**

If `src/components/conversation/MessageBubble.test.tsx` doesn't exist, create it. If it does, add to it.

Check:
```bash
ls src/components/conversation/MessageBubble.test.tsx
```

Create (or add to) `src/components/conversation/MessageBubble.test.tsx`:

```tsx
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import MessageBubble from './MessageBubble';
import type { Message } from '@/lib/types';

function makeMsg(overrides: Partial<Message>): Message {
  return {
    id: 'msg-1',
    session_id: 'sess-1',
    role: 'user',
    content: 'Hello',
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('MessageBubble role differentiation', () => {
  it('user message aligns right', () => {
    const { container } = render(() => (
      <MessageBubble message={makeMsg({ role: 'user' })} />
    ));
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('justify-end');
  });

  it('assistant message aligns left', () => {
    const { container } = render(() => (
      <MessageBubble message={makeMsg({ role: 'assistant', content: 'Hi' })} />
    ));
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('justify-start');
  });
});
```

**Step 2: Run test to confirm it fails (or passes for alignment, which should already work)**

```bash
npx vitest run src/components/conversation/MessageBubble.test.tsx
```
Expected: tests describing role-based alignment pass. Note any failures.

**Step 3: Add `modelBorderColor` helper function**

In `MessageBubble.tsx`, after the `const isAssistant = () => props.message.role === 'assistant';` line (line 128), add:

```tsx
const modelBorderColor = () => {
  const model = props.message.model ?? '';
  if (model.includes('opus')) return 'var(--color-model-opus)';
  if (model.includes('sonnet')) return 'var(--color-model-sonnet)';
  if (model.includes('haiku')) return 'var(--color-model-haiku)';
  return 'var(--color-accent)';
};
```

**Step 4: Update the bubble container div (lines 224-251)**

Replace the outer bubble `<div>`:

Old:
```tsx
<div
  class="max-w-[85%] rounded-lg px-4 py-3 relative hover-lift"
  style={{
    background: isUser()
      ? 'rgba(232, 130, 90, 0.08)'
      : isSystem()
        ? 'var(--color-bg-inset)'
        : 'var(--color-bg-secondary)',
    border: isUser()
      ? '1px solid rgba(232, 130, 90, 0.15)'
      : isSystem()
        ? '1px solid var(--color-border-secondary)'
        : '1px solid var(--color-border-secondary)',
  }}
  onContextMenu={handleContextMenu}
  onKeyDown={handleKeyboardContextMenu}
  tabindex="0"
>
```

New:
```tsx
<div
  class={`max-w-[85%] rounded-lg px-4 py-3 relative${isAssistant() ? ' hover-lift' : ''}`}
  style={{
    background: isUser()
      ? 'transparent'
      : isSystem()
        ? 'rgba(28, 33, 40, 0.5)'
        : 'var(--color-bg-secondary)',
    'border-left': isUser()
      ? '3px solid rgba(232, 130, 90, 0.4)'
      : isAssistant()
        ? `3px solid ${modelBorderColor()}`
        : 'none',
  }}
  onContextMenu={handleContextMenu}
  onKeyDown={handleKeyboardContextMenu}
  tabindex="0"
>
```

**Step 5: Remove the absolute-positioned accent stripe**

Remove the entire `<Show when={!isUser() && !isSystem()}>` block (lines 243-251):

```tsx
{/* Left accent stripe for assistant messages */}
<Show when={!isUser() && !isSystem()}>
  <div
    class="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
    style={{
      background:
        'linear-gradient(180deg, var(--color-accent) 0%, rgba(232, 130, 90, 0.2) 100%)',
    }}
  />
</Show>
```

**Step 6: Add centered text for system messages**

Find the content area for non-user messages. The system message content renders via `MarkdownContent` or as a fallback. Wrap the system content div/section with a conditional `text-align: center`.

Find the outer content wrapper (around line 284 — the `<Show when={isUser()}>` fallback). Add center alignment to the system message branch. Specifically, in the `fallback` of the outermost `<Show when={isUser()}>`, wrap the content with:

In the `isSystem()` fallback branch (currently inside `<MarkdownContent>`), add a wrapping condition. The simplest way is to add `text-align: 'center'` style when isSystem() on the content container.

Locate the fallback content div (the `<Show when={!(isAssistant() && showRaw())}` nesting at line ~287). Add the following wrapper around the `<MarkdownContent>` / `<pre>` block for system messages — or more precisely, add a wrapping `<div>` that applies center alignment only when isSystem():

```tsx
<div style={{ 'text-align': isSystem() ? 'center' : undefined }}>
  <Show
    when={!(isAssistant() && showRaw())}
    fallback={...}
  >
    <MarkdownContent content={props.message.content} messageId={props.message.id} />
  </Show>
</div>
```

**Step 7: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/MessageBubble.tsx
```
Expected: no errors.

**Step 8: Run unit tests**

```bash
npx vitest run src/components/conversation/MessageBubble.test.tsx
```
Expected: all tests pass.

**Step 9: Commit**

```bash
git add src/components/conversation/MessageBubble.tsx src/components/conversation/MessageBubble.test.tsx
git commit -m "CHI-235: role-based left-border differentiation for user/assistant/system messages"
```

---

## Part F — CHI-236: Border Reduction

### Task 11: Remove tabs↔content border in `MainLayout.tsx`

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

**Step 1: Remove border-bottom from tabs row**

Lines 189–192. Change:
```tsx
<div
  class="flex items-center gap-0.5 px-3 bg-bg-primary"
  style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
>
```
to:
```tsx
<div class="flex items-center gap-0.5 px-3 bg-bg-primary">
```

**Step 2: Run lint**

```bash
npx eslint src/components/layout/MainLayout.tsx
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "CHI-236: remove tabs-to-content separator border in MainLayout"
```

---

### Task 12: Remove section borders in `DetailsPanel.tsx`

**Files:**
- Modify: `src/components/layout/DetailsPanel.tsx`

**Background:** `CollapsibleSection` at line 28 has `style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}` on the `<section>` element. This creates visible dividers between accordion sections. CHI-236 removes these in favour of spacing-only separation.

**Step 1: Remove `border-bottom` from CollapsibleSection**

Line 33. Change:
```tsx
<section
  class="flex flex-col shrink-0"
  classList={{ 'flex-1': props.open && props.focused, 'min-h-0': props.open && props.focused }}
  style={{ 'border-bottom': '1px solid var(--color-border-secondary)' }}
  data-section-id={props.id}
>
```
to:
```tsx
<section
  class="flex flex-col shrink-0"
  classList={{ 'flex-1': props.open && props.focused, 'min-h-0': props.open && props.focused }}
  data-section-id={props.id}
>
```

**Step 2: Remove border-top from ActionOutputPanel container**

Line 243. Change:
```tsx
<div
  class="min-h-0"
  classList={{...}}
  style={{ 'border-top': '1px solid var(--color-border-secondary)' }}
>
```
to:
```tsx
<div
  class="min-h-0"
  classList={{...}}
>
```

**Step 3: Run lint**

```bash
npx eslint src/components/layout/DetailsPanel.tsx
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/layout/DetailsPanel.tsx
git commit -m "CHI-236: remove DetailsPanel section divider borders"
```

---

### Task 13: Replace MessageInput top border with background change

**Files:**
- Modify: `src/components/conversation/MessageInput.tsx`

**Background:** The input area root div (line 891) has a static `border-top` plus a gradient background. CHI-236 removes the border and uses a flat `--color-bg-secondary` background instead. The drag-over visual feedback is preserved via a box-shadow inset.

**Step 1: Update the root div style**

Lines 893–900. Change:
```tsx
style={{
  background:
    'linear-gradient(180deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%)',
  'border-top': isDragOver()
    ? '2px solid var(--color-accent)'
    : '1px solid var(--color-border-secondary)',
  transition: 'border-color 150ms ease',
}}
```
to:
```tsx
style={{
  background: isDragOver() ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)',
  'box-shadow': isDragOver() ? 'inset 0 2px 0 var(--color-accent)' : 'none',
  transition: 'background 150ms ease, box-shadow 150ms ease',
}}
```

**Step 2: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/conversation/MessageInput.tsx
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/conversation/MessageInput.tsx
git commit -m "CHI-236: replace MessageInput top border with bg-secondary, preserve drag feedback"
```

---

## Part G — Final Verification

### Task 14: Run full test suite and fix any failures

**Files:**
- Modify: whichever file has failing tests

**Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: all tests pass. Common failure scenarios:
- `MainLayout.test.tsx` — if it still references "Center", update to "Actions" (Task 9 should have covered this)
- `HintTooltip.test.tsx` — should be new file added in Task 5
- `MessageBubble.test.tsx` — should be new/updated file from Task 10

**Step 2: Run TypeScript check across all files**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Run ESLint**

```bash
npx eslint src/
```
Expected: no errors.

**Step 4: Run Prettier check**

```bash
npx prettier --check "src/**/*.{ts,tsx,css}"
```
If failures: run `npx prettier --write "src/**/*.{ts,tsx,css}"` then re-check.

**Step 5: Commit formatting fixes (if any)**

```bash
git add -p   # stage only formatting changes
git commit -m "style: format CHI-232/233/234/235/236 changed files"
```

**Step 6: Final summary**

All 5 tickets delivered:
- ✅ CHI-233: Grain removed, zone tokens added, sidebar/details have distinct bg
- ✅ E2E fixture updated (`.grain-overlay` → `#main-content`)
- ✅ CHI-232: `--color-text-secondary` #9da5ae, `--color-text-tertiary` #7d8590, HintTooltip WCAG-safe, cost values text-primary
- ✅ CHI-234: ViewTab pill, `actions_center: Zap`, label "Actions", test updated
- ✅ CHI-235: User transparent+left-accent, assistant model-color left border, system elevated bg centered
- ✅ CHI-236: Tabs border removed, DetailsPanel section borders removed, MessageInput border→bg

---

## Quick Reference — All Changed Files

| File | Tickets | Lines |
|------|---------|-------|
| `src/styles/tokens.css` | CHI-232, CHI-233, CHI-234 | 14-30 (token values), 132-155 (light theme), 439-452 (deleted) |
| `src/components/layout/MainLayout.tsx` | CHI-233, CHI-234, CHI-236 | 14, 54-60, 131, 141-156, 189-192, 197, 256-267, 349-390 |
| `src/components/layout/MainLayout.test.tsx` | CHI-234 | 251 |
| `src/components/layout/StatusBar.tsx` | CHI-232 | ~485 |
| `src/components/layout/DetailsPanel.tsx` | CHI-232, CHI-236 | 33, 243, 343-348 |
| `src/components/common/HintTooltip.tsx` | CHI-232 | 31-37, 43-49, 56-58, 66-71 |
| `src/components/common/HintTooltip.test.tsx` | CHI-232 | (new file) |
| `src/components/conversation/MessageBubble.tsx` | CHI-235 | 129, 224-251, 284-310 |
| `src/components/conversation/MessageBubble.test.tsx` | CHI-235 | (new or updated) |
| `src/components/conversation/MessageInput.tsx` | CHI-236 | 891-900 |
| `tests/e2e/fixtures/app.ts` | CHI-233 | 20 |
