import { test, expect, modKey } from '../fixtures/app';

test.describe('YOLO Mode', () => {
  test('mod+Shift+Y shows YOLO warning dialog', async ({ page }) => {
    await page.keyboard.press(`${modKey}+Shift+y`);
    const dialog = page.getByRole('dialog', { name: 'YOLO mode warning' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Enable YOLO Mode?')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Enable YOLO Mode/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
