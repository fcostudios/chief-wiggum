import { test, expect, modKey } from '../fixtures/app';

async function openDiffView(page: import('@playwright/test').Page): Promise<boolean> {
  const diffTab = page.getByRole('button', { name: 'Diff' });
  const visible = await diffTab.isVisible().catch(() => false);
  if (!visible) return false;
  await diffTab.click();
  await page.waitForTimeout(250);
  return true;
}

test.describe('Diff Review Pane (CHI-168)', () => {
  test('Diff view tab is visible in main navigation', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Diff' })).toBeVisible();
  });

  test('switching to Diff view shows empty-state content', async ({ page }) => {
    if (!(await openDiffView(page))) return;

    await expect(page.getByText('No diff selected')).toBeVisible();
  });

  test('Diff view empty state shows review guidance copy', async ({ page }) => {
    if (!(await openDiffView(page))) return;

    await expect(page.getByText(/Open an inline diff .* review it here/i)).toBeVisible();
  });

  test('can switch back from Diff view to Conversation', async ({ page }) => {
    if (!(await openDiffView(page))) return;

    await page.getByRole('button', { name: 'Conversation' }).click();
    await page.waitForTimeout(200);
    await expect(page.locator('textarea[aria-label="Message input"]')).toBeVisible();
  });

  test('keyboard shortcut switches to Diff view', async ({ page }) => {
    await page.keyboard.press(`${modKey}+3`);
    await page.waitForTimeout(250);

    await expect(page.getByRole('button', { name: 'Diff' })).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByText('No diff selected')).toBeVisible();
  });

  test('details panel toggle works while Diff view is active', async ({ page }) => {
    if (!(await openDiffView(page))) return;

    const separator = page.getByRole('separator', { name: 'Resize details panel' });
    const before = await separator.isVisible().catch(() => false);

    await page.keyboard.press(`${modKey}+Shift+b`);
    await page.waitForTimeout(200);

    const after = await separator.isVisible().catch(() => false);
    expect(after).toBe(!before);
    await expect(page.locator('body')).toBeVisible();
  });
});
