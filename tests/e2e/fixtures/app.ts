import { expect, test as base, type Page } from '@playwright/test';

export const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

async function dismissOnboardingIfVisible(page: Page): Promise<void> {
  const skipAll = page.getByRole('button', { name: 'Skip all' });
  const visible = await skipAll
    .isVisible({ timeout: 1500 })
    .catch(() => false);

  if (!visible) return;

  await skipAll.click();
  await page.waitForTimeout(150);
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForSelector('.grain-overlay', { timeout: 15_000 });
    await dismissOnboardingIfVisible(page);
    await use(page);
  },
});

export { expect };
