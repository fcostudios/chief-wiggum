import { test, expect, modKey } from '../fixtures/app';

test.describe('Sidebar', () => {
  test('sidebar is visible by default', async ({ page }) => {
    await expect(page.getByText('Projects')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Session' }).first()).toBeVisible();
  });

  test('mod+B cycles sidebar visibility and returns to expanded', async ({ page }) => {
    await expect(page.getByText('Projects')).toBeVisible();

    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);
    await page.keyboard.press(`${modKey}+b`);
    await expect(page.getByText('Projects')).toBeVisible();
  });

  test('new session button is present and click does not crash UI', async ({ page }) => {
    const newSessionButtons = page.getByRole('button', { name: 'New Session' });
    await expect(newSessionButtons.first()).toBeVisible();
    await newSessionButtons.first().click();
    await expect(page.locator('.grain-overlay')).toBeVisible();
  });
});
