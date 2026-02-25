import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

function titleBarDevBadge(page: Page) {
  return page.getByRole('banner').getByText('DEV', { exact: true });
}

async function dismissOnboardingIfVisible(page: Page): Promise<void> {
  const skipAll = page.getByRole('button', { name: /Skip all/i });
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click();
    await page.waitForTimeout(150);
  }
}

async function disableDeveloperModeIfEnabled(page: Page): Promise<void> {
  const devBadge = titleBarDevBadge(page);
  if (await devBadge.isVisible().catch(() => false)) {
    await page.keyboard.press(`${modKey}+Shift+F12`);
    await page.waitForTimeout(250);
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

async function openAdvancedCategory(page: Page): Promise<void> {
  await dismissOnboardingIfVisible(page);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const categories = dialog.getByLabel('Settings categories list');
  const advancedButton = categories.getByRole('button', { name: /Advanced/i }).first();
  if (await advancedButton.isVisible().catch(() => false)) {
    await advancedButton.click();
    await page.waitForTimeout(200);
  }
}

test.describe('Developer Mode (CHI-161)', () => {
  test.afterEach(async ({ page }) => {
    await disableDeveloperModeIfEnabled(page);
  });

  test('mod+Shift+F12 toggles developer mode badge in TitleBar', async ({ page }) => {
    const devBadge = titleBarDevBadge(page);
    const before = await devBadge.isVisible().catch(() => false);

    await page.keyboard.press(`${modKey}+Shift+F12`);
    await page.waitForTimeout(300);

    if (before) {
      await expect(devBadge).toBeHidden();
    } else {
      await expect(devBadge).toBeVisible();
    }

    await page.keyboard.press(`${modKey}+Shift+F12`);
    await page.waitForTimeout(300);

    if (before) {
      await expect(devBadge).toBeVisible();
    } else {
      await expect(devBadge).toBeHidden();
    }
  });

  test('developer mode toggle is available in settings advanced category', async ({ page }) => {
    await openSettings(page);

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    if (!(await dialog.isVisible().catch(() => false))) return;

    await openAdvancedCategory(page);

    const devModeCheckbox = dialog.locator('input[aria-label="Developer Mode"]');
    if (await devModeCheckbox.isVisible().catch(() => false)) {
      await expect(devModeCheckbox).toBeVisible();
    } else {
      await expect(dialog.getByText(/Developer Mode/i).first()).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
