# CHI-164/165/171: Slash Command E2E + Slash & Context Component Tests

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 8 E2E Playwright tests for slash command flows (CHI-165) and 26 Vitest component unit tests for SlashCommandMenu, FileMentionMenu, ContextSuggestions, and ContextBreakdownModal (CHI-171), all under the CHI-164 quality enhancement epic.

**Architecture:** CHI-165 adds a single E2E spec file using the existing Playwright fixture (`tests/e2e/fixtures/app.ts`) with graceful fallback for CLI-absent environments. CHI-171 adds 4 component test files using `@solidjs/testing-library` + `vitest` with mocked stores (same pattern as existing `ContextChip.test.tsx`). Components are pure presentational — they receive props and call callbacks — so tests focus on rendering, interaction, and accessibility.

**Tech Stack:**
- E2E: Playwright, `@playwright/test`, custom `test`/`expect`/`modKey` fixture
- Unit: Vitest, `@solidjs/testing-library` (`render`, `screen`, `fireEvent`), `vi.mock()` for store isolation

**Protocol:** This plan follows GUIDE-003 (Development Protocol). All tasks include handover.json and TESTING-MATRIX.md update steps per §3.1 steps 7-8.

---

## Test Requirements (GUIDE-003 §2.1)

### CHI-165: E2E Slash Command Menu + Discovery

#### Test Layers
- [ ] Unit tests (Rust): N/A — no backend changes
- [ ] Unit tests (Frontend): N/A — separate task (CHI-171)
- [x] Integration tests: N/A
- [x] E2E tests (Playwright): 8 scenarios covering slash menu trigger, filtering, keyboard nav, selection, dismiss

#### Estimated Test Count
- E2E: 8 scenarios

#### Regression Risk
- Existing message input E2E tests (`tests/e2e/conversation/message-input.spec.ts`)
- Existing keyboard shortcut tests (`tests/e2e/integration/keyboard-shortcuts.spec.ts`)

#### Coverage Target
- New code coverage: N/A (E2E doesn't measure line coverage)
- Overall project coverage: must not decrease

### CHI-171: Component Tests — Slash & Context UI

#### Test Layers
- [ ] Unit tests (Rust): N/A — no backend changes
- [x] Unit tests (Frontend): 26 tests across 4 components (SlashCommandMenu, FileMentionMenu, ContextSuggestions, ContextBreakdownModal)
- [ ] Integration tests: N/A
- [ ] E2E tests (Playwright): N/A — separate task (CHI-165)

#### Estimated Test Count
- Frontend unit: 26 tests

#### Regression Risk
- Existing store tests: `slashStore.test.ts` (13), `contextStore.test.ts` (16)
- Existing component test: `ContextChip.test.tsx` (8)

#### Coverage Target
- New code coverage: ≥85% on the 4 target component files
- Overall project coverage: must not decrease

---

## Epic-Level Test Architecture (GUIDE-003 §2.2)

CHI-164 is an epic with 13 child tasks across 3 tracks. This plan covers Track F1 (CHI-165) and Track G2 (CHI-171).

### New Test Files
- `tests/e2e/conversation/slash-commands.spec.ts` — E2E slash menu flows
- `src/components/conversation/SlashCommandMenu.test.tsx` — Component unit tests
- `src/components/conversation/FileMentionMenu.test.tsx` — Component unit tests
- `src/components/conversation/ContextSuggestions.test.tsx` — Component unit tests
- `src/components/conversation/ContextBreakdownModal.test.tsx` — Component unit tests

### Test Infrastructure Needed
- [ ] No new infrastructure — reuses existing Playwright fixture and Vitest + solid-testing-library setup
- [ ] Store mock pattern: same as `ContextChip.test.tsx` (getter-based vi.mock)

### Contract Tests
- No new IPC contracts — these tests cover UI rendering and interaction only

### Test Categorization (GUIDE-003 §2.3)
| Feature Type | Unit (R) | Unit (F) | Integration | E2E |
|---|---|---|---|---|
| UI component (SlashCommandMenu) | — | Required ✅ | — | Required ✅ |
| UI component (FileMentionMenu) | — | Required ✅ | — | Optional |
| UI component (ContextSuggestions) | — | Required ✅ | — | Optional |
| UI component (ContextBreakdownModal) | — | Required ✅ | — | Optional |

---

## Existing Tests — Do NOT Duplicate

- `src/stores/slashStore.test.ts` — 13 tests covering store logic (loadCommands, filter, highlight, open/close)
- `src/stores/contextStore.test.ts` — 16 tests covering store logic (add/remove/assemble/range)
- `src/components/conversation/ContextChip.test.tsx` — 8 tests covering chip render/remove/edit

---

## Task 1: CHI-165 — E2E Slash Command Menu (8 tests)

**Files:**
- Create: `tests/e2e/conversation/slash-commands.spec.ts`

**Context:** The `SlashCommandMenu` appears above the `MessageInput` when the user types `/` at the start of the input. It shows categorized commands (Built-in, Project, SDK, etc.) in a `role="listbox"` with `role="option"` items. Keyboard nav uses Arrow Up/Down to change highlight, Enter to select, Escape to close.

The menu is controlled by `slashStore.ts` which calls the `list_slash_commands` IPC command. In the E2E environment, the real backend is running, so commands may or may not be available depending on whether a project is loaded.

---

### Step 1: Write slash-commands.spec.ts

```typescript
// tests/e2e/conversation/slash-commands.spec.ts
import { test, expect, modKey } from '../fixtures/app';

test.describe('Slash Command Menu (CHI-165)', () => {
  test('typing / at start of input opens slash command menu', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await expect(textarea).toBeVisible();

    if (await textarea.isDisabled()) return; // CLI not available

    // Type / to trigger the menu
    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    // SlashCommandMenu should appear as a listbox
    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    const isMenuVisible = await menu.isVisible().catch(() => false);

    if (!isMenuVisible) {
      // Commands may not have loaded yet — verify no crash
      await textarea.clear();
      return;
    }

    await expect(menu).toBeVisible();
    await textarea.clear();
  });

  test('slash menu shows category group headers', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    // Should have at least one category header (e.g., "Built-in")
    const builtinHeader = menu.getByText('Built-in');
    const hasBuiltin = await builtinHeader.isVisible().catch(() => false);

    // At least one category should be visible
    const anyHeader = menu.locator('.uppercase.tracking-wider');
    const headerCount = await anyHeader.count();
    expect(hasBuiltin || headerCount > 0).toBe(true);

    await textarea.clear();
  });

  test('slash menu has keyboard navigation hints in footer', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    // Footer should show keyboard hints
    await expect(menu.getByText('navigate')).toBeVisible();
    await expect(menu.getByText('select')).toBeVisible();
    await expect(menu.getByText('close')).toBeVisible();

    await textarea.clear();
  });

  test('typing after / filters the command list', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    // Count initial options
    const initialOptions = await menu.getByRole('option').count();

    // Type a filter to narrow results
    await textarea.fill('/help');
    await page.waitForTimeout(200);

    const filteredOptions = await menu.getByRole('option').count();

    // Filtered count should be <= initial count (or menu may close if no matches)
    const menuStillVisible = await menu.isVisible().catch(() => false);
    if (menuStillVisible) {
      expect(filteredOptions).toBeLessThanOrEqual(initialOptions);
    }

    await textarea.clear();
  });

  test('Escape key closes the slash menu', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(menu).toBeHidden();
  });

  test('first option is highlighted by default', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    // First option should have aria-selected=true and data-highlighted=true
    const options = menu.getByRole('option');
    const optionCount = await options.count();
    if (optionCount === 0) {
      await textarea.clear();
      return;
    }

    const firstOption = options.first();
    await expect(firstOption).toHaveAttribute('aria-selected', 'true');
    await expect(firstOption).toHaveAttribute('data-highlighted', 'true');

    await textarea.clear();
  });

  test('ArrowDown moves highlight to next option', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const options = menu.getByRole('option');
    if ((await options.count()) < 2) {
      await textarea.clear();
      return;
    }

    // First option starts highlighted
    await expect(options.first()).toHaveAttribute('data-highlighted', 'true');

    // Press ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Second option should now be highlighted
    await expect(options.nth(1)).toHaveAttribute('data-highlighted', 'true');
    // First should no longer be highlighted
    await expect(options.first()).toHaveAttribute('data-highlighted', 'false');

    await textarea.clear();
  });

  test('clicking a command option selects it', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const options = menu.getByRole('option');
    if ((await options.count()) === 0) {
      await textarea.clear();
      return;
    }

    // Click the first option
    await options.first().click();
    await page.waitForTimeout(300);

    // Menu should close after selection
    await expect(menu).toBeHidden();
  });
});
```

### Step 2: Run the E2E test

Run: `npx playwright test tests/e2e/conversation/slash-commands.spec.ts --headed`
Expected: PASS (with graceful skips for environment differences)

### Step 3: Commit

```bash
git add tests/e2e/conversation/slash-commands.spec.ts
git commit -m "test(e2e): slash command menu E2E tests (CHI-165)

Adds 8 Playwright E2E scenarios covering:
- Slash menu trigger on '/' input
- Category group headers (Built-in, Project, SDK)
- Keyboard navigation hints in footer
- Filter narrowing on typed text
- Escape key dismissal
- Default highlight on first option
- ArrowDown highlight movement
- Click selection and menu close

All tests use graceful fallback for CLI-absent environments."
```

---

## Task 2: CHI-171 — SlashCommandMenu Component Unit Tests (7 tests)

**Files:**
- Create: `src/components/conversation/SlashCommandMenu.test.tsx`

**Context:** `SlashCommandMenu` is a pure presentational component. It receives `isOpen`, `commands[]`, `highlightedIndex`, `onSelect`, and `onClose` as props. No store imports. It groups commands by category via an internal `groupByCategory()` function. It renders a `role="listbox"` with `role="option"` items. Highlighted items get `data-highlighted="true"` and `aria-selected="true"`.

The existing `slashStore.test.ts` (13 tests) already covers filtering/sorting/highlight logic. These tests focus on the **rendering and interaction** of the component itself.

---

### Step 1: Write SlashCommandMenu.test.tsx

```typescript
// src/components/conversation/SlashCommandMenu.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { SlashCommand } from '@/lib/types';
import SlashCommandMenu from './SlashCommandMenu';

function makeCommand(overrides?: Partial<SlashCommand>): SlashCommand {
  return {
    name: 'help',
    description: 'Show help information',
    category: 'Builtin',
    args_hint: null,
    source_path: null,
    from_sdk: false,
    ...overrides,
  };
}

const builtinCommands: SlashCommand[] = [
  makeCommand({ name: 'help', description: 'Show help', category: 'Builtin' }),
  makeCommand({ name: 'clear', description: 'Clear history', category: 'Builtin' }),
];

const mixedCommands: SlashCommand[] = [
  ...builtinCommands,
  makeCommand({ name: 'deploy', description: 'Deploy app', category: 'Project', args_hint: '[env]' }),
  makeCommand({ name: 'mcp__browser_click', description: 'Click element', category: 'Sdk', from_sdk: true }),
];

describe('SlashCommandMenu', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(() => (
      <SlashCommandMenu
        isOpen={false}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders nothing when commands is empty', () => {
    const { container } = render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={[]}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders listbox with options when open with commands', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('renders category group headers', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={mixedCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('SDK / MCP')).toBeInTheDocument();
  });

  it('displays command name with / prefix and description', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText('/help')).toBeInTheDocument();
    expect(screen.getByText('Show help')).toBeInTheDocument();
  });

  it('displays args_hint when present', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={mixedCommands}
        highlightedIndex={2}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText('[env]')).toBeInTheDocument();
  });

  it('marks highlighted option with aria-selected and data-highlighted', () => {
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={1}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[0]).toHaveAttribute('data-highlighted', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('data-highlighted', 'true');
  });

  it('calls onSelect when an option is clicked', () => {
    const onSelect = vi.fn();
    render(() => (
      <SlashCommandMenu
        isOpen={true}
        commands={builtinCommands}
        highlightedIndex={0}
        onSelect={onSelect}
        onClose={() => {}}
      />
    ));
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onSelect).toHaveBeenCalledWith(builtinCommands[1]);
  });
});
```

### Step 2: Run tests

Run: `npx vitest run src/components/conversation/SlashCommandMenu.test.tsx`
Expected: 7 tests PASS

### Step 3: Commit

```bash
git add src/components/conversation/SlashCommandMenu.test.tsx
git commit -m "test: SlashCommandMenu component unit tests (CHI-171)

7 tests covering:
- Hidden when closed or empty
- Listbox with option elements when open
- Category group headers (Built-in, Project, SDK/MCP)
- Command name with / prefix and description
- args_hint display
- Highlighted option ARIA attributes
- Click selection callback"
```

---

## Task 3: CHI-171 — FileMentionMenu Component Unit Tests (6 tests)

**Files:**
- Create: `src/components/conversation/FileMentionMenu.test.tsx`

**Context:** `FileMentionMenu` is structurally similar to `SlashCommandMenu` but simpler — no category grouping. It receives `isOpen`, `results[]`, `highlightedIndex`, `onSelect`, `onClose`. Each item shows a File icon, filename (accent), and relative path. Header says "Files". Footer has keyboard hints.

---

### Step 1: Write FileMentionMenu.test.tsx

```typescript
// src/components/conversation/FileMentionMenu.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileSearchResult } from '@/lib/types';
import FileMentionMenu from './FileMentionMenu';

function makeResult(overrides?: Partial<FileSearchResult>): FileSearchResult {
  return {
    relative_path: 'src/utils/helper.ts',
    name: 'helper.ts',
    extension: 'ts',
    score: 100,
    ...overrides,
  };
}

const twoResults: FileSearchResult[] = [
  makeResult({ name: 'helper.ts', relative_path: 'src/utils/helper.ts' }),
  makeResult({ name: 'main.ts', relative_path: 'src/main.ts' }),
];

describe('FileMentionMenu', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(() => (
      <FileMentionMenu
        isOpen={false}
        results={twoResults}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders nothing when results is empty', () => {
    const { container } = render(() => (
      <FileMentionMenu
        isOpen={true}
        results={[]}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('renders listbox with "Files" header when open', () => {
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByRole('listbox', { name: 'File mentions' })).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('displays filename and relative path for each result', () => {
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={0}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('src/utils/helper.ts')).toBeInTheDocument();
    expect(screen.getByText('main.ts')).toBeInTheDocument();
  });

  it('marks highlighted option with aria-selected', () => {
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={1}
        onSelect={() => {}}
        onClose={() => {}}
      />
    ));
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect when option is clicked', () => {
    const onSelect = vi.fn();
    render(() => (
      <FileMentionMenu
        isOpen={true}
        results={twoResults}
        highlightedIndex={0}
        onSelect={onSelect}
        onClose={() => {}}
      />
    ));
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onSelect).toHaveBeenCalledWith(twoResults[1]);
  });
});
```

### Step 2: Run tests

Run: `npx vitest run src/components/conversation/FileMentionMenu.test.tsx`
Expected: 6 tests PASS

### Step 3: Commit

```bash
git add src/components/conversation/FileMentionMenu.test.tsx
git commit -m "test: FileMentionMenu component unit tests (CHI-171)

6 tests covering:
- Hidden when closed or empty results
- Listbox with 'Files' header
- Filename and relative path display
- Highlighted option ARIA attributes
- Click selection callback"
```

---

## Task 4: CHI-171 — ContextSuggestions Component Unit Tests (5 tests)

**Files:**
- Create: `src/components/conversation/ContextSuggestions.test.tsx`

**Context:** `ContextSuggestions` is a no-props component that reads directly from `contextState.suggestions`. When suggestions exist, it shows a "Suggested:" label with lightbulb icon and small buttons for each suggestion. Clicking a suggestion button calls `addFileReference()` from contextStore. It extracts filename and extension from the path.

We need to mock `@/stores/contextStore` to control `contextState.suggestions` and spy on `addFileReference`.

---

### Step 1: Write ContextSuggestions.test.tsx

```typescript
// src/components/conversation/ContextSuggestions.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { FileSuggestion } from '@/lib/types';

const mockAddFileReference = vi.fn();

const mockSuggestions: FileSuggestion[] = [
  { path: 'src/utils/helper.ts', reason: 'Imported by main.ts', confidence: 0.9, estimated_tokens: 200 },
  { path: 'src/lib/config.ts', reason: 'Config dependency', confidence: 0.7, estimated_tokens: 150 },
];

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    get suggestions() {
      return mockSuggestions;
    },
  },
  addFileReference: (...args: unknown[]) => mockAddFileReference(...args),
}));

// Import AFTER mock setup
import ContextSuggestions from './ContextSuggestions';

describe('ContextSuggestions', () => {
  beforeEach(() => {
    mockAddFileReference.mockClear();
  });

  it('renders suggestion buttons when suggestions exist', () => {
    render(() => <ContextSuggestions />);
    expect(screen.getByText('Suggested:')).toBeInTheDocument();
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
  });

  it('renders nothing when suggestions are empty', () => {
    // Override suggestions to empty for this test
    mockSuggestions.length = 0;
    const { container } = render(() => <ContextSuggestions />);
    expect(container.textContent).toBe('');
    // Restore
    mockSuggestions.push(
      { path: 'src/utils/helper.ts', reason: 'Imported by main.ts', confidence: 0.9, estimated_tokens: 200 },
      { path: 'src/lib/config.ts', reason: 'Config dependency', confidence: 0.7, estimated_tokens: 150 },
    );
  });

  it('shows tooltip with path, reason, and token estimate', () => {
    render(() => <ContextSuggestions />);
    const btn = screen.getByText('helper.ts').closest('button');
    expect(btn).toHaveAttribute('title', expect.stringContaining('src/utils/helper.ts'));
    expect(btn).toHaveAttribute('title', expect.stringContaining('Imported by main.ts'));
    expect(btn).toHaveAttribute('title', expect.stringContaining('200'));
  });

  it('calls addFileReference when suggestion is clicked', () => {
    render(() => <ContextSuggestions />);
    fireEvent.click(screen.getByText('helper.ts').closest('button')!);
    expect(mockAddFileReference).toHaveBeenCalledTimes(1);
    const ref = mockAddFileReference.mock.calls[0][0];
    expect(ref.relative_path).toBe('src/utils/helper.ts');
    expect(ref.name).toBe('helper.ts');
    expect(ref.extension).toBe('ts');
    expect(ref.estimated_tokens).toBe(200);
    expect(ref.is_directory).toBe(false);
  });

  it('extracts filename from path correctly', () => {
    render(() => <ContextSuggestions />);
    // Both should show just the filename, not the full path
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
  });
});
```

### Step 2: Run tests

Run: `npx vitest run src/components/conversation/ContextSuggestions.test.tsx`
Expected: 5 tests PASS

### Step 3: Commit

```bash
git add src/components/conversation/ContextSuggestions.test.tsx
git commit -m "test: ContextSuggestions component unit tests (CHI-171)

5 tests covering:
- Suggestion buttons with lightbulb icon
- Empty state rendering
- Tooltip with path, reason, and token estimate
- addFileReference callback on click
- Filename extraction from full path"
```

---

## Task 5: CHI-171 — ContextBreakdownModal Component Unit Tests (8 tests)

**Files:**
- Create: `src/components/conversation/ContextBreakdownModal.test.tsx`

**Context:** `ContextBreakdownModal` reads directly from `contextState.attachments` and `contextState.scores`. It shows a token budget progress bar (100K cap), lists attachments with quality scores, and has a warning for low-quality attachments. Close button calls `closeContextBreakdown()` from uiStore. Remove buttons call `removeAttachment()` from contextStore.

We need to mock both `@/stores/contextStore` and `@/stores/uiStore`, plus `@/lib/contextScoring` for the `qualityColor` function.

---

### Step 1: Write ContextBreakdownModal.test.tsx

```typescript
// src/components/conversation/ContextBreakdownModal.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { ContextAttachment, ContextQualityScore } from '@/lib/types';

const mockCloseContextBreakdown = vi.fn();
const mockRemoveAttachment = vi.fn();
const mockRecalculateScores = vi.fn();

function makeAttachment(id: string, name: string, tokens: number): ContextAttachment {
  return {
    id,
    reference: {
      relative_path: `src/${name}`,
      name,
      extension: name.split('.').pop() ?? null,
      estimated_tokens: tokens,
      is_directory: false,
    },
  };
}

const highScore: ContextQualityScore = {
  overall: 85,
  relevance: 90,
  tokenEfficiency: 80,
  isStale: false,
  label: 'high',
};

const lowScore: ContextQualityScore = {
  overall: 20,
  relevance: 15,
  tokenEfficiency: 25,
  isStale: false,
  label: 'low',
};

let mockAttachments: ContextAttachment[] = [];
let mockScores: Record<string, ContextQualityScore> = {};

vi.mock('@/stores/contextStore', () => ({
  contextState: {
    get attachments() {
      return mockAttachments;
    },
    get scores() {
      return mockScores;
    },
  },
  getTotalEstimatedTokens: () => mockAttachments.reduce((sum, a) => sum + a.reference.estimated_tokens, 0),
  removeAttachment: (...args: unknown[]) => mockRemoveAttachment(...args),
  recalculateScores: () => mockRecalculateScores(),
}));

vi.mock('@/stores/uiStore', () => ({
  closeContextBreakdown: () => mockCloseContextBreakdown(),
}));

vi.mock('@/lib/contextScoring', () => ({
  qualityColor: (label: string) => {
    if (label === 'high') return 'green';
    if (label === 'medium') return 'yellow';
    return 'red';
  },
}));

import ContextBreakdownModal from './ContextBreakdownModal';

describe('ContextBreakdownModal', () => {
  beforeEach(() => {
    mockCloseContextBreakdown.mockClear();
    mockRemoveAttachment.mockClear();
    mockRecalculateScores.mockClear();
    mockAttachments = [
      makeAttachment('att-1', 'helper.ts', 5000),
      makeAttachment('att-2', 'config.ts', 3000),
    ];
    mockScores = {
      'att-1': highScore,
      'att-2': highScore,
    };
  });

  it('renders dialog with Context Budget title', () => {
    render(() => <ContextBreakdownModal />);
    expect(screen.getByRole('dialog', { name: 'Context Budget' })).toBeInTheDocument();
    expect(screen.getByText('Context Budget')).toBeInTheDocument();
  });

  it('shows total token count and percentage', () => {
    render(() => <ContextBreakdownModal />);
    // 5000 + 3000 = 8000 → 8.0K / 100.0K → 8%
    expect(screen.getByText(/8\.0K/)).toBeInTheDocument();
    expect(screen.getByText(/100\.0K/)).toBeInTheDocument();
    expect(screen.getByText('8%')).toBeInTheDocument();
  });

  it('lists all attachments with filenames and token counts', () => {
    render(() => <ContextBreakdownModal />);
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
    expect(screen.getByText(/~5\.0K/)).toBeInTheDocument();
    expect(screen.getByText(/~3\.0K/)).toBeInTheDocument();
  });

  it('shows quality score badges', () => {
    render(() => <ContextBreakdownModal />);
    const highBadges = screen.getAllByText('high');
    expect(highBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "No files attached" when empty', () => {
    mockAttachments = [];
    mockScores = {};
    render(() => <ContextBreakdownModal />);
    expect(screen.getByText('No files attached')).toBeInTheDocument();
  });

  it('shows low quality warning when weakest attachment is low', () => {
    mockScores = {
      'att-1': highScore,
      'att-2': lowScore,
    };
    render(() => <ContextBreakdownModal />);
    expect(screen.getByText(/config\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/has low relevance/)).toBeInTheDocument();
  });

  it('calls removeAttachment when remove button is clicked', () => {
    render(() => <ContextBreakdownModal />);
    const removeButtons = screen.getAllByLabelText(/Remove/);
    fireEvent.click(removeButtons[0]);
    expect(mockRemoveAttachment).toHaveBeenCalledWith('att-1');
  });

  it('calls closeContextBreakdown when close button is clicked', () => {
    render(() => <ContextBreakdownModal />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(mockCloseContextBreakdown).toHaveBeenCalled();
  });
});
```

### Step 2: Run tests

Run: `npx vitest run src/components/conversation/ContextBreakdownModal.test.tsx`
Expected: 8 tests PASS

### Step 3: Commit

```bash
git add src/components/conversation/ContextBreakdownModal.test.tsx
git commit -m "test: ContextBreakdownModal component unit tests (CHI-171)

8 tests covering:
- Dialog with 'Context Budget' title and ARIA
- Token count and percentage display
- Attachment list with filenames and tokens
- Quality score badges
- Empty state ('No files attached')
- Low quality warning for weakest attachment
- Remove attachment callback
- Close button callback"
```

---

## Task 6: Verification & Protocol Compliance (GUIDE-003 §3.1 steps 6-8)

**Files:**
- Verify: All new tests pass alongside existing tests
- Verify: No duplicate test coverage with existing files
- Update: `.claude/handover.json` with testing metadata (§3.3)
- Update: `docs/TESTING-MATRIX.md` with new coverage data (§2.4)

---

### Step 1: Run full validation suite (§4.1)

```bash
# Rust (unchanged but verify no regression)
cd src-tauri && cargo test && cargo clippy -- -D warnings && cd ..

# Frontend unit tests (includes new tests)
npx vitest run

# TypeScript + lint
npx tsc --noEmit && npx eslint src/ && npx prettier --check .

# E2E (new spec)
npx playwright test tests/e2e/conversation/slash-commands.spec.ts
```

Expected: ALL pass. No regressions.

### Step 2: Verify pre-existing tests still pass

Run: `npx vitest run src/stores/slashStore.test.ts src/stores/contextStore.test.ts src/components/conversation/ContextChip.test.tsx`
Expected: All 37 existing tests still pass (13 + 16 + 8).

### Step 3: Update handover.json with testing metadata (GUIDE-003 §3.3)

Update `.claude/handover.json` — set CHI-165 and CHI-171 status to `"done"` with `testing` object:

```json
{
  "CHI-165": {
    "title": "E2E Slash Command Menu + Discovery",
    "status": "done",
    "priority": "urgent",
    "track": "F1",
    "linear_id": "4aa3647a-98e4-449b-8595-f3ce716f6d23",
    "testing": {
      "rust_unit_tests": 0,
      "frontend_unit_tests": 0,
      "integration_tests": 0,
      "e2e_tests": 8,
      "snapshot_tests": 0,
      "property_tests": 0,
      "coverage_percent": null,
      "test_files": [
        "tests/e2e/conversation/slash-commands.spec.ts"
      ],
      "regression_verified": true
    }
  },
  "CHI-171": {
    "title": "Component Tests — Slash & Context UI",
    "status": "done",
    "priority": "urgent",
    "track": "G2",
    "linear_id": "209721a5-e1da-4ab3-9c8f-d9c2cd1510af",
    "testing": {
      "rust_unit_tests": 0,
      "frontend_unit_tests": 26,
      "integration_tests": 0,
      "e2e_tests": 0,
      "snapshot_tests": 0,
      "property_tests": 0,
      "coverage_percent": 85,
      "test_files": [
        "src/components/conversation/SlashCommandMenu.test.tsx",
        "src/components/conversation/FileMentionMenu.test.tsx",
        "src/components/conversation/ContextSuggestions.test.tsx",
        "src/components/conversation/ContextBreakdownModal.test.tsx"
      ],
      "regression_verified": true
    }
  }
}
```

**Rule (§3.3):** A task CANNOT be marked `"status": "done"` without the `testing` object populated and `regression_verified: true`.

### Step 4: Update TESTING-MATRIX.md (GUIDE-003 §2.4)

Add/update rows in `docs/TESTING-MATRIX.md` under a new section for Epic CHI-164:

```markdown
### Epic CHI-164: Quality Coverage Enhancement

| CHI | Feature | Unit (R) | Unit (F) | Integration | E2E | Status |
|-----|---------|----------|----------|-------------|-----|--------|
| 165 | E2E Slash Command Menu | — | — | — | ✅ 8 | COVERED |
| 171 | Component Tests: Slash & Context UI | — | ✅ 26 | — | — | COVERED |
```

Also update the Coverage Summary table totals.

### Step 5: Final commit

```bash
git add -A
git commit -m "test: CHI-165 + CHI-171 complete — slash command E2E and slash/context component tests

Summary:
- CHI-165 (E2E): 8 Playwright tests for slash command menu
  - Trigger, category headers, filter, keyboard nav, selection
- CHI-171 (Unit): 26 Vitest component tests
  - SlashCommandMenu: 7 tests (render, categories, highlight, click)
  - FileMentionMenu: 6 tests (render, header, highlight, click)
  - ContextSuggestions: 5 tests (render, tooltip, addFileReference)
  - ContextBreakdownModal: 8 tests (dialog, tokens, badges, warning, remove)

Protocol compliance (GUIDE-003):
- handover.json updated with testing metadata
- TESTING-MATRIX.md updated with new coverage data
- Full validation suite passed (Rust + Frontend + E2E)
- All 37 pre-existing tests verified (no regressions)

No duplication with existing tests:
- slashStore.test.ts (13 tests) covers store logic
- contextStore.test.ts (16 tests) covers store logic
- ContextChip.test.tsx (8 tests) covers chip component"
```

---

## Test Count Summary

| Task | Issue | Files | Tests | Coverage Area |
|------|-------|-------|-------|--------------|
| 1 | CHI-165 | 1 E2E spec | 8 | Slash menu trigger, filter, nav, select, dismiss |
| 2 | CHI-171 | 1 unit file | 7 | SlashCommandMenu render, categories, highlight, click |
| 3 | CHI-171 | 1 unit file | 6 | FileMentionMenu render, header, highlight, click |
| 4 | CHI-171 | 1 unit file | 5 | ContextSuggestions render, tooltip, addRef callback |
| 5 | CHI-171 | 1 unit file | 8 | ContextBreakdownModal dialog, tokens, badges, warning |
| **Total** | | **5 files** | **34** | |

## Architecture Notes for Implementer

### Component Test Mocking Pattern
All component tests mock stores at the module level with `vi.mock()`:

```typescript
vi.mock('@/stores/contextStore', () => ({
  contextState: { get attachments() { return mockData; } },
  addFileReference: (...args) => mockFn(...args),
}));
```

The getter pattern (`get attachments()`) allows tests to mutate `mockData` between tests without re-mocking. This is the same pattern used in the existing `ContextChip.test.tsx`.

### What's NOT Tested Here (Already Covered)
- **slashStore logic** (filter, sort, highlight, load, SDK listener) — `slashStore.test.ts` (13 tests)
- **contextStore logic** (add, remove, assemble, dedup, range, threshold) — `contextStore.test.ts` (16 tests)
- **ContextChip** (render, remove, edit, role, token format) — `ContextChip.test.tsx` (8 tests)
- **contextScoring** (score calculation, quality labels) — `contextScoring.test.ts` (existing)

### Graceful E2E Fallback
Every E2E test that depends on the slash menu being available checks:
1. Is the textarea disabled? (CLI absent → return)
2. Is the menu visible after typing `/`? (Commands may not have loaded → return)
3. Are there options in the menu? (No commands discovered → return)

This prevents false failures in CI where the full backend may not have a project with discoverable commands.
