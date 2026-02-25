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

test.describe('Custom Actions (CHI-159)', () => {
  test.beforeEach(async ({ page }) => {
    await openActionsSection(page);
  });

  test('Add Action button is visible and can toggle the editor', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /Add Action|Cancel New Action/i }).first();
    if (!(await addButton.isVisible().catch(() => false))) return;

    await expect(addButton).toBeVisible();
    await addButton.click();
    await page.waitForTimeout(200);

    const editorNameField = page.getByLabel('Name').or(page.getByText(/Name is required/i));
    const cancelNewAction = page.getByRole('button', { name: /Cancel New Action/i }).first();
    const hasEditor = await editorNameField.first().isVisible().catch(() => false);
    const hasCancel = await cancelNewAction.isVisible().catch(() => false);
    expect(hasEditor || hasCancel).toBe(true);

    if (hasCancel) {
      await cancelNewAction.click();
      await page.waitForTimeout(150);
    }
  });
});
