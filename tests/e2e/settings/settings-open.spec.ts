import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

async function dismissOnboardingIfVisible(page: Page): Promise<void> {
  const skipAll = page.getByRole('button', { name: /Skip all/i });
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click();
    await page.waitForTimeout(150);
  }
}

test.describe('Settings Open/Close (CHI-160)', () => {
  test('mod+, opens settings overlay', async ({ page }) => {
    await page.keyboard.press(`${modKey}+,`);
    await page.waitForTimeout(300);
    await dismissOnboardingIfVisible(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Settings').first()).toBeVisible();
  });

  test('clicking gear icon opens settings', async ({ page }) => {
    const gearButton = page.getByLabel('Open settings');
    await expect(gearButton).toBeVisible();

    await gearButton.click();
    await page.waitForTimeout(300);
    await dismissOnboardingIfVisible(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('settings modal shows category sidebar and search', async ({ page }) => {
    await page.keyboard.press(`${modKey}+,`);
    await page.waitForTimeout(300);
    await dismissOnboardingIfVisible(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder(/Search settings/i)).toBeVisible();
    await expect(dialog.getByLabel('Settings categories list')).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('Escape closes settings overlay', async ({ page }) => {
    await page.keyboard.press(`${modKey}+,`);
    await dismissOnboardingIfVisible(page);
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
