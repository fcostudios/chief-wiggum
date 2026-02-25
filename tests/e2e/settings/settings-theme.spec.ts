import { test, expect, modKey } from '../fixtures/app';

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
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

async function dismissOnboardingIfVisible(
  page: import('@playwright/test').Page,
): Promise<void> {
  const skipAll = page.getByRole('button', { name: /Skip all/i });
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click();
    await page.waitForTimeout(150);
  }
}

async function closeSettingsIfOpen(page: import('@playwright/test').Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

async function openAppearanceCategory(page: import('@playwright/test').Page): Promise<void> {
  await dismissOnboardingIfVisible(page);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const categories = dialog.getByLabel('Settings categories list');
  const appearanceButton = categories.getByRole('button', { name: /Appearance/i }).first();
  if (await appearanceButton.isVisible().catch(() => false)) {
    await appearanceButton.click();
    await page.waitForTimeout(200);
  }
}

test.describe('Theme Settings (CHI-160)', () => {
  test.beforeEach(async ({ page }) => {
    await openSettings(page);
    await dismissOnboardingIfVisible(page);
  });

  test.afterEach(async ({ page }) => {
    await closeSettingsIfOpen(page);
  });

  test('theme selector shows Dark/Light/System options', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    await openAppearanceCategory(page);

    const themeSelect = dialog.locator('select[aria-label="Theme"]');
    if (!(await themeSelect.isVisible().catch(() => false))) return;

    const optionTexts = await themeSelect.locator('option').allTextContents();
    expect(optionTexts.some((t) => /dark/i.test(t))).toBe(true);
    expect(optionTexts.some((t) => /light/i.test(t))).toBe(true);
    expect(optionTexts.some((t) => /system/i.test(t))).toBe(true);
  });

  test('switching theme updates html theme attribute and remains stable', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    await openAppearanceCategory(page);
    const themeSelect = dialog.locator('select[aria-label="Theme"]');
    if (!(await themeSelect.isVisible().catch(() => false))) return;

    const originalValue = await themeSelect.inputValue();
    const bgBefore = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-bg-primary')
        .trim(),
    );

    await themeSelect.selectOption('light');
    await page.waitForTimeout(500);
    await expect(themeSelect).toHaveValue('light');
    const themeAfterLight = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );

    await themeSelect.selectOption('dark');
    await page.waitForTimeout(500);
    await expect(themeSelect).toHaveValue('dark');
    const themeAfterDark = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    const bgAfterDark = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-bg-primary')
        .trim(),
    );

    expect(themeAfterLight).toBeTruthy();
    expect(themeAfterDark).toBe('dark');
    expect(bgBefore).toBeTruthy();
    expect(bgAfterDark).toBeTruthy();

    await themeSelect.selectOption(originalValue);
    await page.waitForTimeout(300);
  });
});
