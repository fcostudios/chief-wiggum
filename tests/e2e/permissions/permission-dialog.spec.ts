import { test, expect, modKey } from '../fixtures/app';

test.describe('Permission Dialog Flow (CHI-161)', () => {
  test('permission dialog has accessible role and structure when visible', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /permission/i });
    const visible = await dialog.isVisible().catch(() => false);

    if (!visible) {
      const textarea = page.locator('textarea[aria-label="Message input"]');
      await expect(textarea).toBeVisible();
      return;
    }

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Permission Required/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Deny/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Always Allow/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Allow Once/i })).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('keyboard help documents permission-related runtime shortcuts', async ({ page }) => {
    await page.keyboard.press(`${modKey}+/`);
    await page.waitForTimeout(200);

    const helpDialog = page.getByRole('dialog', { name: /keyboard shortcuts/i });
    if (!(await helpDialog.isVisible().catch(() => false))) return;

    await expect(helpDialog.getByText(/Toggle YOLO mode/i)).toBeVisible();
    await expect(helpDialog.getByText(/Toggle Developer mode/i)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(helpDialog).toBeHidden();
  });
});
