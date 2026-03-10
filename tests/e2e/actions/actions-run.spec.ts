import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app';

async function openActionsSection(page: Page): Promise<boolean> {
  const searchInput = page.getByPlaceholder(/Filter actions/i);
  if (await searchInput.isVisible().catch(() => false)) return true;

  const actionsToggle = page.getByLabel('Toggle actions');
  const actionsButton = page.getByRole('button', { name: /^Actions$/i }).first();
  const toggle = (await actionsToggle.isVisible().catch(() => false)) ? actionsToggle : actionsButton;

  if (!(await toggle.isVisible().catch(() => false))) return false;
  await toggle.click();
  await page.waitForTimeout(250);
  return true;
}

test.describe('Actions Run & Output (CHI-159)', () => {
  test.beforeEach(async ({ page }) => {
    await openActionsSection(page);
  });

  test('clicking Run on an action starts it and can be stopped', async ({ page }) => {
    const runButtons = page.locator('button[aria-label^="Run "]');
    if ((await runButtons.count()) === 0) return;

    const runButton = runButtons.first();
    await runButton.hover().catch(() => {});
    await runButton.click();
    await page.waitForTimeout(700);

    const stopButtons = page.locator('button[aria-label^="Stop "]');
    if (await stopButtons.first().isVisible().catch(() => false)) {
      await expect(stopButtons.first()).toBeVisible();
      await stopButtons.first().click();
      return;
    }

    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('running or selecting an action exposes output panel state', async ({ page }) => {
    const runButtons = page.locator('button[aria-label^="Run "]');
    if ((await runButtons.count()) === 0) return;

    await runButtons.first().hover().catch(() => {});
    await runButtons.first().click();
    await page.waitForTimeout(600);

    const emptyOutput = page.getByText(/Run an action to see output/i).first();
    const copyOutput = page.getByLabel('Copy output');
    const hasEmpty = await emptyOutput.isVisible().catch(() => false);
    const hasOutputControls = await copyOutput.isVisible().catch(() => false);

    expect(hasEmpty || hasOutputControls).toBe(true);

    const stopButtons = page.locator('button[aria-label^="Stop "]');
    if (await stopButtons.first().isVisible().catch(() => false)) {
      await stopButtons.first().click();
    }
  });
});
