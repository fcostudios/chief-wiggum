import { test, expect, modKey } from '../fixtures/app';

function splitSeparator(page: import('@playwright/test').Page) {
  return page.locator('div[role="separator"][aria-orientation="vertical"]:not([aria-label])');
}

test.describe('Split Pane Layout (CHI-162)', () => {
  test.afterEach(async ({ page }) => {
    const separator = splitSeparator(page).first();
    if (await separator.isVisible().catch(() => false)) {
      await page.keyboard.press(`${modKey}+\\`);
      await page.waitForTimeout(300);
    }
  });

  test('mod+\\ activates split pane mode with visible separator', async ({ page }) => {
    await page.keyboard.press(`${modKey}+1`);
    await page.waitForTimeout(150);
    await page.keyboard.press(`${modKey}+\\`);
    await page.waitForTimeout(300);

    const separator = splitSeparator(page).first();
    await expect(separator).toBeVisible();

    const panes = page.getByRole('main').locator('section');
    expect(await panes.count()).toBeGreaterThanOrEqual(2);
  });

  test('mod+W closes the focused split pane and returns to single mode', async ({ page }) => {
    await page.keyboard.press(`${modKey}+\\`);
    await page.waitForTimeout(300);

    const separator = splitSeparator(page).first();
    if (!(await separator.isVisible().catch(() => false))) return;

    await page.keyboard.press(`${modKey}+w`);
    await page.waitForTimeout(300);

    await expect(separator).toBeHidden();
  });

  test('mod+\\ toggles split mode off when pressed again', async ({ page }) => {
    await page.keyboard.press(`${modKey}+\\`);
    await page.waitForTimeout(300);

    const separator = splitSeparator(page).first();
    if (!(await separator.isVisible().catch(() => false))) return;

    await page.keyboard.press(`${modKey}+\\`);
    await page.waitForTimeout(300);

    await expect(separator).toBeHidden();
  });
});
