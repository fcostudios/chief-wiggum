# CHI-253: YOLO → Auto-approve Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all user-visible "YOLO" text with "Auto-approve" / "AUTO" across the frontend, rename the component file, and add permission-tier tooltips to the StatusBar badge.

**Architecture:** Pure frontend text/label change. No backend changes needed — the internal `yoloMode` store field, `cw:permissionTier: 'yolo'` localStorage key, and `toggle_yolo_mode` IPC command all stay unchanged (backward compat). Only user-visible strings and the component filename change.

**Tech Stack:** SolidJS 1.9, TypeScript, Vitest + @solidjs/testing-library, i18n via `src/locales/*.json`.

---

## Scope: All Files That Reference "YOLO"

| File | Change |
|------|--------|
| `src/locales/en.json` | `statusBar.yolo` value: `"YOLO"` → `"AUTO"` |
| `src/locales/es.json` | Same |
| `src/components/permissions/YoloWarningDialog.tsx` | Rename → `AutoApproveWarningDialog.tsx`, update all YOLO text within |
| `src/components/permissions/YoloWarningDialog.test.tsx` | Rename → `AutoApproveWarningDialog.test.tsx`, update import + assertions |
| `src/components/layout/MainLayout.tsx` | Update import + JSX tag + comment |
| `src/components/layout/MainLayout.test.tsx` | Update `vi.mock` path + `data-testid` + assertion |
| `src/components/layout/StatusBar.tsx` | Add `title` tooltip to mode badge span |
| `src/components/layout/StatusBar.test.tsx` | Update i18n mock return + test description + assertion |
| `src/components/conversation/PermissionRecordBlock.tsx` | `'Auto-approved (YOLO)'` → `'Auto-approved'` |
| `src/components/common/KeyboardHelp.tsx` | `'Toggle YOLO mode'` → `'Toggle Auto-approve mode'` |

**Not changing:** `src/stores/uiStore.ts` field names (`yoloMode`, `enableYoloMode`, etc.), localStorage key `cw:permissionTier = 'yolo'`, Rust IPC command `toggle_yolo_mode`, `src/lib/types.ts` `PermissionTier = 'yolo'`, `src-tauri/` source (internal identifiers).

---

## Part A — i18n Labels

### Task 1: Update locale files

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/es.json`

**Background:** `StatusBar.tsx` renders `t('statusBar.yolo')` as the mode prefix badge text. "YOLO" → "AUTO" (uppercase short form for the constrained status bar space).

**Step 1: Update `en.json`**

Find (line ~24):
```json
"yolo": "YOLO",
```
Change to:
```json
"yolo": "AUTO",
```

**Step 2: Update `es.json`**

Same change in `es.json` (same line, same structure):
```json
"yolo": "AUTO",
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/locales/en.json src/locales/es.json
git commit -m "CHI-253: rename YOLO→AUTO in i18n locale files"
```

---

## Part B — Component File Rename

### Task 2: Create `AutoApproveWarningDialog.tsx` (renamed from `YoloWarningDialog.tsx`)

**Files:**
- Create: `src/components/permissions/AutoApproveWarningDialog.tsx`
- Delete: `src/components/permissions/YoloWarningDialog.tsx`

**Background:** The dialog warns before enabling Auto-approve mode. All "YOLO" references become "Auto-approve". The component logic (keyboard shortcuts, focus trap, backdrop click) is unchanged.

**Step 1: Write the new file**

Create `src/components/permissions/AutoApproveWarningDialog.tsx` with content:

```tsx
// src/components/permissions/AutoApproveWarningDialog.tsx
// Auto-approve mode warning dialog per SPEC-001 §7 (renamed from YoloWarningDialog, CHI-253).
// Modal: warns user about auto-approving all permissions.
// Keyboard: Enter=confirm, Escape=cancel.
// Focus trap: Tab cycles within dialog.

import type { Component } from 'solid-js';
import { onMount, onCleanup } from 'solid-js';
import { AlertTriangle } from 'lucide-solid';
import { enableYoloMode, dismissYoloDialog } from '@/stores/uiStore';

const AutoApproveWarningDialog: Component = () => {
  let dialogRef: HTMLDivElement | undefined;

  // --- Keyboard shortcuts ---
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      enableYoloMode();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dismissYoloDialog();
    }

    // Focus trap
    if (e.key === 'Tab' && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Focus the cancel button (safer default)
    const cancelBtn = dialogRef?.querySelector<HTMLElement>('[data-cancel]');
    cancelBtn?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    // Overlay — click outside cancels
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Auto-approve mode warning"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          dismissYoloDialog();
        }
      }}
    >
      <div
        ref={dialogRef}
        class="w-full max-w-[480px] bg-bg-elevated rounded-lg shadow-md border-l-4 border-l-warning"
      >
        {/* Header */}
        <div class="flex items-center gap-2 px-6 pt-5 pb-3">
          <AlertTriangle size={20} class="text-warning" />
          <h2 class="text-xl font-semibold text-text-primary">Enable Auto-approve Mode?</h2>
        </div>

        {/* Content */}
        <div class="px-6 pb-4">
          <p class="text-sm text-text-secondary mb-3">
            Auto-approve mode will{' '}
            <span class="font-semibold text-warning">
              auto-approve all permission requests
            </span>{' '}
            without showing the permission dialog.
          </p>
          <div class="rounded-md bg-error-muted border border-error/30 p-3 mb-3">
            <p class="text-sm text-error font-medium">
              This includes file writes, shell commands, and MCP tool calls. Only enable this if you
              trust the current session completely.
            </p>
          </div>
          <p class="text-xs text-text-tertiary">
            You can disable Auto-approve mode at any time with Cmd+Shift+Y.
          </p>
        </div>

        {/* Footer: action buttons */}
        <div class="flex items-center justify-end gap-2 px-6 pb-5">
          <button
            data-cancel
            class="px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-primary hover:bg-bg-secondary transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={dismissYoloDialog}
          >
            Cancel
            <kbd class="ml-1.5 text-xs text-text-tertiary">Esc</kbd>
          </button>
          <button
            class="px-3 py-1.5 rounded-md text-sm text-white bg-warning hover:brightness-110 transition-colors"
            style={{ 'transition-duration': 'var(--duration-fast)' }}
            onClick={enableYoloMode}
          >
            Enable Auto-approve Mode
            <kbd class="ml-1.5 text-xs text-white/60">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoApproveWarningDialog;
```

**Step 2: Delete the old file**

```bash
rm src/components/permissions/YoloWarningDialog.tsx
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: errors for broken import in `MainLayout.tsx` (will fix in Task 4). The component itself should have no errors.

**Step 4: Commit (WIP — tests + MainLayout still broken)**

```bash
git add src/components/permissions/AutoApproveWarningDialog.tsx
git rm src/components/permissions/YoloWarningDialog.tsx
git commit -m "CHI-253: rename YoloWarningDialog→AutoApproveWarningDialog, update dialog text"
```

---

### Task 3: Rename and update the test file

**Files:**
- Create: `src/components/permissions/AutoApproveWarningDialog.test.tsx`
- Delete: `src/components/permissions/YoloWarningDialog.test.tsx`

**Step 1: Write the failing tests first**

Create `src/components/permissions/AutoApproveWarningDialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

const mockEnableYoloMode = vi.fn();
const mockDismissYoloDialog = vi.fn();

vi.mock('@/stores/uiStore', () => ({
  enableYoloMode: () => mockEnableYoloMode(),
  dismissYoloDialog: () => mockDismissYoloDialog(),
}));

import AutoApproveWarningDialog from './AutoApproveWarningDialog';

describe('AutoApproveWarningDialog', () => {
  beforeEach(() => {
    mockEnableYoloMode.mockClear();
    mockDismissYoloDialog.mockClear();
  });

  it('renders warning dialog with action buttons', () => {
    render(() => <AutoApproveWarningDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable Auto-approve Mode/i })).toBeInTheDocument();
  });

  it('Escape dismisses the dialog', () => {
    render(() => <AutoApproveWarningDialog />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockDismissYoloDialog).toHaveBeenCalled();
  });

  it('Enter enables auto-approve mode', () => {
    render(() => <AutoApproveWarningDialog />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(mockEnableYoloMode).toHaveBeenCalled();
  });

  it('clicking the backdrop dismisses the dialog', () => {
    render(() => <AutoApproveWarningDialog />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(mockDismissYoloDialog).toHaveBeenCalled();
  });

  it('dialog title says Auto-approve, not YOLO', () => {
    render(() => <AutoApproveWarningDialog />);
    expect(screen.getByText(/Enable Auto-approve Mode\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/YOLO/i)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run the tests to verify they pass**

```bash
npx vitest run src/components/permissions/AutoApproveWarningDialog.test.tsx
```
Expected: all 5 tests pass.

**Step 3: Delete old test file**

```bash
rm src/components/permissions/YoloWarningDialog.test.tsx
```

**Step 4: Commit**

```bash
git add src/components/permissions/AutoApproveWarningDialog.test.tsx
git rm src/components/permissions/YoloWarningDialog.test.tsx
git commit -m "CHI-253: rename YoloWarningDialog.test.tsx, update assertions for Auto-approve"
```

---

## Part C — MainLayout Update

### Task 4: Update `MainLayout.tsx` import and JSX

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/components/layout/MainLayout.test.tsx`

**Step 1: Update the import in `MainLayout.tsx`**

Line 33. Change:
```tsx
import YoloWarningDialog from '@/components/permissions/YoloWarningDialog';
```
to:
```tsx
import AutoApproveWarningDialog from '@/components/permissions/AutoApproveWarningDialog';
```

**Step 2: Update the JSX usage in `MainLayout.tsx`**

Lines 308-311. Change:
```tsx
      {/* YOLO warning dialog */}
      <Show when={uiState.yoloDialogVisible}>
        <YoloWarningDialog />
      </Show>
```
to:
```tsx
      {/* Auto-approve warning dialog */}
      <Show when={uiState.yoloDialogVisible}>
        <AutoApproveWarningDialog />
      </Show>
```

**Step 3: Update `MainLayout.test.tsx`**

Line 162-163. Change:
```tsx
vi.mock('@/components/permissions/YoloWarningDialog', () => ({
  default: () => <div data-testid="yolo-warning">YoloWarningDialog</div>,
}));
```
to:
```tsx
vi.mock('@/components/permissions/AutoApproveWarningDialog', () => ({
  default: () => <div data-testid="auto-approve-warning">AutoApproveWarningDialog</div>,
}));
```

Line 282. Change:
```tsx
    expect(screen.getByTestId('yolo-warning')).toBeInTheDocument();
```
to:
```tsx
    expect(screen.getByTestId('auto-approve-warning')).toBeInTheDocument();
```

**Step 4: Run both test files**

```bash
npx vitest run src/components/layout/MainLayout.test.tsx
```
Expected: all tests pass.

**Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 6: Commit**

```bash
git add src/components/layout/MainLayout.tsx src/components/layout/MainLayout.test.tsx
git commit -m "CHI-253: update MainLayout import and test mock for AutoApproveWarningDialog"
```

---

## Part D — StatusBar Badge + Tooltip

### Task 5: Update StatusBar mode badge text and add tier description tooltip

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/StatusBar.test.tsx`

**Background:** The status bar shows a tiny `YOLO ·` or `DEV ·` prefix. The i18n value now returns "AUTO" (from Task 1). Additionally, the CHI-253 spec requires a `title` tooltip on the badge that describes the permission tier in plain language.

**Step 1: Write the failing test first**

In `StatusBar.test.tsx`, line 122, the i18n mock already returns `'YOLO'` for `statusBar.yolo`. Change it to match the new locale value:

```tsx
    if (key === 'statusBar.yolo') return 'AUTO';
```

Also update the test description and assertion at lines 186-190:
```tsx
  it('shows AUTO prefix in left status zone when auto-approve active', () => {
    mockYoloMode = true;
    render(() => <StatusBar />);
    expect(screen.getByText(/AUTO ·/)).toBeInTheDocument();
  });
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/layout/StatusBar.test.tsx -t "shows AUTO"
```
Expected: FAIL — test still finds `YOLO ·` (i18n mock now returns AUTO but the assertion didn't run yet, OR test matches but old label test fails).

**Step 3: Update `StatusBar.tsx` — add `title` tooltip and keep using i18n key**

In `StatusBar.tsx`, lines 230-239. The current code:
```tsx
        <Show when={uiState.yoloMode || uiState.developerMode}>
          <span
            class="font-semibold tracking-[0.08em] uppercase"
            style={{
              'font-size': '10px',
              color: uiState.yoloMode ? 'var(--color-warning)' : 'var(--color-accent)',
            }}
          >
            {uiState.yoloMode ? t('statusBar.yolo') : t('statusBar.dev')} ·
          </span>
        </Show>
```

Change to (add `title` + `cursor: 'help'`):
```tsx
        <Show when={uiState.yoloMode || uiState.developerMode}>
          <span
            class="font-semibold tracking-[0.08em] uppercase"
            title={
              uiState.yoloMode
                ? 'Auto-approve: All operations run without confirmation'
                : 'Developer: Auto-approve safe operations, confirm destructive ones'
            }
            style={{
              'font-size': '10px',
              cursor: 'help',
              color: uiState.yoloMode ? 'var(--color-warning)' : 'var(--color-accent)',
            }}
          >
            {uiState.yoloMode ? t('statusBar.yolo') : t('statusBar.dev')} ·
          </span>
        </Show>
```

**Step 4: Run the tests**

```bash
npx vitest run src/components/layout/StatusBar.test.tsx
```
Expected: all tests pass. The `'AUTO ·'` test now passes because the i18n mock returns "AUTO".

**Step 5: Run lint**

```bash
npx eslint src/components/layout/StatusBar.tsx src/components/layout/StatusBar.test.tsx
```
Expected: no errors.

**Step 6: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/components/layout/StatusBar.test.tsx
git commit -m "CHI-253: add tier description tooltip to StatusBar badge, update test mock to AUTO"
```

---

## Part E — Remaining YOLO Text Cleanup

### Task 6: Update `PermissionRecordBlock.tsx`

**Files:**
- Modify: `src/components/conversation/PermissionRecordBlock.tsx`

**Background:** When a permission was auto-approved, the inline record shows `'Auto-approved (YOLO)'`. Remove the parenthetical "(YOLO)".

**Step 1: Update the outcome label**

Line 40. Change:
```tsx
    case 'yolo':
      return 'Auto-approved (YOLO)';
```
to:
```tsx
    case 'yolo':
      return 'Auto-approved';
```

**Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/conversation/PermissionRecordBlock.tsx
git commit -m "CHI-253: remove (YOLO) from auto-approved permission record label"
```

---

### Task 7: Update `KeyboardHelp.tsx`

**Files:**
- Modify: `src/components/common/KeyboardHelp.tsx`

**Background:** The keyboard help panel (accessible via `?`) shows `'Toggle YOLO mode'` for `Cmd+Shift+Y`.

**Step 1: Update the description string**

Line ~52. Change:
```tsx
      { keys: 'Cmd+Shift+Y', description: 'Toggle YOLO mode' },
```
to:
```tsx
      { keys: 'Cmd+Shift+Y', description: 'Toggle Auto-approve mode' },
```

**Step 2: Run TypeScript + lint**

```bash
npx tsc --noEmit && npx eslint src/components/common/KeyboardHelp.tsx
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/common/KeyboardHelp.tsx
git commit -m "CHI-253: update keyboard help description for Cmd+Shift+Y"
```

---

## Part F — Final Verification

### Task 8: Verify zero remaining YOLO in UI + full test run

**Files:**
- Fix whatever fails

**Step 1: Grep for remaining user-visible YOLO references**

```bash
grep -r "YOLO" src/ --include="*.tsx" --include="*.ts" --include="*.json" -l
```

Expected remaining (acceptable — internal/non-UI):
- `src/stores/uiStore.ts` — store field names (internal only, not displayed)
- `src/lib/types.ts` — `PermissionTier = 'yolo'` type value (internal)
- `src/lib/keybindings.ts` — references to `toggleYoloMode` (function name, not displayed)

Expected zero (no UI-visible YOLO):
- No `.tsx` file should render "YOLO" text to the user
- No locale file should have "YOLO" as a display value

If any unexpected hits: fix them before proceeding.

**Step 2: Run the full unit test suite**

```bash
npx vitest run
```
Expected: all tests pass. Watch for:
- `AutoApproveWarningDialog.test.tsx` — 5 tests
- `MainLayout.test.tsx` — all tests including the `auto-approve-warning` testid assertion
- `StatusBar.test.tsx` — `AUTO ·` assertion passes

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Run ESLint**

```bash
npx eslint src/
```
Expected: no errors.

**Step 5: Run Prettier check and fix if needed**

```bash
npx prettier --check "src/**/*.{ts,tsx,json}"
```
If failures: `npx prettier --write "src/**/*.{ts,tsx,json}"` then re-check.

**Step 6: Commit formatting**

```bash
git add -p  # stage only formatting changes
git commit -m "style: format CHI-253 changed files"
```

---

## Summary

| Task | Files | What Changes |
|------|-------|--------------|
| 1 | `en.json`, `es.json` | `"yolo": "YOLO"` → `"AUTO"` |
| 2 | `AutoApproveWarningDialog.tsx` (new), `YoloWarningDialog.tsx` (deleted) | Dialog text: YOLO → Auto-approve |
| 3 | `AutoApproveWarningDialog.test.tsx` (new), `YoloWarningDialog.test.tsx` (deleted) | Test assertions use new button label |
| 4 | `MainLayout.tsx`, `MainLayout.test.tsx` | Import + mock path + testid |
| 5 | `StatusBar.tsx`, `StatusBar.test.tsx` | `title` tooltip on badge; mock returns "AUTO" |
| 6 | `PermissionRecordBlock.tsx` | Remove "(YOLO)" from auto-approved label |
| 7 | `KeyboardHelp.tsx` | Keyboard shortcut description |
| 8 | — | Grep verify + full test run |

**Internal identifiers left unchanged (not user-visible):**
- `uiState.yoloMode` — store field
- `enableYoloMode`, `disableYoloMode`, `toggleYoloMode` — store functions
- `cw:permissionTier = 'yolo'` — localStorage key (backward compat)
- `toggle_yolo_mode` — Rust IPC command
- `PermissionTier = 'yolo'` — TypeScript type literal
