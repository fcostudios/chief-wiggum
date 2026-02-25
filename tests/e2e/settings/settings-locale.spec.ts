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

test.describe('Locale / i18n Settings (CHI-160)', () => {
  test('switching locale to Spanish changes UI strings', async ({ page }) => {
    await openSettings(page);
    await dismissOnboardingIfVisible(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await openLanguageCategory(page);

    const langSelect = dialog.locator('select[aria-label="Language"]');
    if (!(await langSelect.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      return;
    }

    const originalValue = await langSelect.inputValue();
    await langSelect.selectOption('es');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    const hasSpanish = await page
      .getByText(/Sesiones|Proyectos|Nueva sesión|Archivos/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasSpanish).toBe(true);

    await openSettings(page);
    await dismissOnboardingIfVisible(page);
    const dialogAgain = page.getByRole('dialog', { name: 'Settings' });
    if (await dialogAgain.isVisible().catch(() => false)) {
      await openLanguageCategory(page);
      const langSelectAgain = dialogAgain.locator('select[aria-label="Language"]');
      if (await langSelectAgain.isVisible().catch(() => false)) {
        await langSelectAgain.selectOption(originalValue || 'en');
        await page.waitForTimeout(500);
      }
      await page.keyboard.press('Escape');
    }
  });
});
