import { test, expect, modKey } from '../fixtures/app';

test.describe('YOLO Mode', () => {
  test('mod+Shift+Y shows auto-approve warning dialog', async ({ page }) => {
    await page.keyboard.press(`${modKey}+Shift+y`);
    const dialog = page.getByRole('dialog', { name: 'Auto-approve mode warning' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Enable Auto-approve Mode?')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Enable Auto-approve Mode/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
