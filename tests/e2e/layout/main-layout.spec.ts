import { test, expect, modKey } from '../fixtures/app';

test.describe('MainLayout', () => {
  test('renders 5-zone layout structure', async ({ page }) => {
    await expect(page.locator('[data-tauri-drag-region]:visible').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conversation' })).toBeVisible();
    await expect(page.locator('footer[role="status"]')).toBeVisible();
  });

  test('view tabs switch content', async ({ page }) => {
    await page.getByRole('button', { name: 'Agents' }).click();
    await expect(page.getByRole('button', { name: 'Agents' })).toHaveClass(/text-text-primary/);

    await page.getByRole('button', { name: 'Terminal' }).click();
    await expect(page.locator('.xterm')).toBeVisible();

    await page.getByRole('button', { name: 'Conversation' }).click();
    await expect(page.getByRole('button', { name: 'Conversation' })).toHaveClass(
      /text-text-primary/,
    );
  });

  test('mod+1/2 switches views', async ({ page }) => {
    await page.keyboard.press(`${modKey}+2`);
    await expect(page.getByRole('button', { name: 'Agents' })).toHaveClass(/text-text-primary/);

    await page.keyboard.press(`${modKey}+1`);
    await expect(page.getByRole('button', { name: 'Conversation' })).toHaveClass(
      /text-text-primary/,
    );
  });
});
