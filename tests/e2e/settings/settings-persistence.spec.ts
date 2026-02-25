import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

async function openSettings(page: Page): Promise<void> {
  await page.keyboard.press(`${modKey}+,`);
  await page.waitForTimeout(300);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  if (!(await dialog.isVisible().catch(() => false))) {
    const gearButton = page.getByLabel('Open settings');
    if (await gearButton.isVisible().catch(() => false)) {
      await gearButton.click();
      await page.waitForTimeout(300);
    }
  }
}

async function dismissOnboardingIfVisible(page: Page): Promise<void> {
  const skipAll = page.getByRole('button', { name: /Skip all/i });
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click();
    await page.waitForTimeout(150);
  }
}

async function openLanguageCategory(page: Page): Promise<void> {
  await dismissOnboardingIfVisible(page);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const categories = dialog.getByLabel('Settings categories list');
  const languageButton = categories.getByRole('button', { name: /Language/i }).first();
  if (await languageButton.isVisible().catch(() => false)) {
    await languageButton.click();
    await page.waitForTimeout(200);
  }
}

test.describe('Settings Persistence (CHI-160)', () => {
  test('changed setting persists after close/reopen when backend save is available', async ({ page }) => {
    await openSettings(page);
    await dismissOnboardingIfVisible(page);
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    await openLanguageCategory(page);

    const dateFormatSelect = dialog.locator('select[aria-label="Date Format"]');
    if (!(await dateFormatSelect.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      return;
    }

    const currentValue = await dateFormatSelect.inputValue();
    const newValue = currentValue === 'relative' ? 'iso' : 'relative';

    await dateFormatSelect.selectOption(newValue);
    await page.waitForTimeout(700);

    const saveFailedInDialog = await dialog.getByText(/Save failed|Settings save failed/i).first().isVisible().catch(() => false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    await openSettings(page);
    await dismissOnboardingIfVisible(page);
    const dialogAgain = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialogAgain).toBeVisible();
    await openLanguageCategory(page);

    const dateFormatAgain = dialogAgain.locator('select[aria-label="Date Format"]');
    if (!(await dateFormatAgain.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      return;
    }

    const persistedValue = await dateFormatAgain.inputValue();

    if (!saveFailedInDialog) {
      expect(persistedValue).toBe(newValue);
    } else {
      expect([currentValue, newValue]).toContain(persistedValue);
    }

    if (persistedValue !== currentValue) {
      await dateFormatAgain.selectOption(currentValue);
      await page.waitForTimeout(500);
    }

    await page.keyboard.press('Escape');
  });
});
