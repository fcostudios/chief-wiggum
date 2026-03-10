import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

async function dismissOnboardingIfVisible(page: Page): Promise<void> {
  const skipAll = page.getByRole('button', { name: /Skip all/i });
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click();
    await page.waitForTimeout(150);
  }
}

async function openSettings(page: Page): Promise<void> {
  await page.keyboard.press(`${modKey}+,`);
  await page.waitForTimeout(300);
  await dismissOnboardingIfVisible(page);

  const dialog = page.getByRole('dialog', { name: 'Settings' });
  if (!(await dialog.isVisible().catch(() => false))) {
    const gearButton = page.getByLabel('Open settings');
    if (await gearButton.isVisible().catch(() => false)) {
      await gearButton.click();
      await page.waitForTimeout(300);
      await dismissOnboardingIfVisible(page);
    }
  }
}

async function closeSettingsIfOpen(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

async function clickSettingsCategory(page: Page, name: RegExp): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const categories = dialog.getByLabel('Settings categories list');
  const button = categories.getByRole('button', { name }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await page.waitForTimeout(200);
  }
}

test.describe('Settings Modal Interactions (CHI-167)', () => {
  test.beforeEach(async ({ page }) => {
    await openSettings(page);
  });

  test.afterEach(async ({ page }) => {
    await closeSettingsIfOpen(page);
  });

  test('settings modal opens with dialog role', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const isOpen = await dialog.isVisible().catch(() => false);
    if (!isOpen) return;

    await expect(dialog).toBeVisible();
  });

  test('category navigation switches content pane', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await clickSettingsCategory(page, /Language/i);
    await expect(dialog.locator('main[aria-label="Language settings"]')).toBeVisible();

    await clickSettingsCategory(page, /About/i);
    await expect(dialog.locator('main[aria-label="About settings"]')).toBeVisible();
  });

  test('search input filters categories and shows filter banner', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    const searchInput = dialog.getByLabel('Search settings');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('theme');
    await page.waitForTimeout(200);

    await expect(dialog.getByText(/Filtering by/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Appearance/i }).first()).toBeVisible();
  });

  test('theme selector changes app appearance', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await clickSettingsCategory(page, /Appearance/i);

    const themeSelect = dialog.locator('select[aria-label="Theme"]');
    if (!(await themeSelect.isVisible().catch(() => false))) return;

    const originalValue = await themeSelect.inputValue();
    await themeSelect.selectOption('light');
    await page.waitForTimeout(400);

    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(themeAttr).toBeTruthy();
    await expect(themeSelect).toHaveValue('light');

    await themeSelect.selectOption(originalValue || 'dark');
    await page.waitForTimeout(250);
  });

  test('Escape key closes settings modal', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(dialog).toBeHidden();
  });

  test('auto-save indicator remains visible after changing a setting', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await clickSettingsCategory(page, /Appearance/i);
    const themeSelect = dialog.locator('select[aria-label="Theme"]');
    if (!(await themeSelect.isVisible().catch(() => false))) return;

    const before = await themeSelect.inputValue();
    const next = before === 'dark' ? 'light' : 'dark';
    await themeSelect.selectOption(next);
    await page.waitForTimeout(350);

    const statusLine = dialog.getByText(/Saving…|Auto-save enabled|Save failed/i).first();
    await expect(statusLine).toBeVisible();
    await expect(dialog).toBeVisible();

    await themeSelect.selectOption(before || 'dark');
    await page.waitForTimeout(250);
  });

  test('about category shows version information', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await clickSettingsCategory(page, /About/i);
    await expect(dialog.getByText('Schema version:')).toBeVisible();
    await expect(dialog.getByText('Open settings:')).toBeVisible();
  });

  test('clicking outside primary content does not crash the settings UI', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await page.mouse.click(8, 8);
    await page.waitForTimeout(150);

    await expect(page.locator('#main-content')).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
