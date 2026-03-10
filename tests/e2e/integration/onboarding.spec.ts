import { test as rawTest } from '@playwright/test';
import { expect } from '../fixtures/app';

const test = rawTest.extend({
  page: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForSelector('#main-content', { timeout: 15_000 });
    await page.waitForTimeout(250);
    await use(page);
  },
});

test.describe('Onboarding Flow (CHI-162)', () => {
  test('onboarding appears with welcome content when present', async ({ page }) => {
    const skipAll = page.getByRole('button', { name: /Skip all/i });
    const visible = await skipAll.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) return;

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Welcome to Chief Wiggum/i)).toBeVisible();
  });

  test('onboarding progresses with Next and can be skipped', async ({ page }) => {
    const skipAll = page.getByRole('button', { name: /Skip all/i });
    const visible = await skipAll.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) return;

    await expect(page.getByText(/Welcome to Chief Wiggum/i)).toBeVisible();

    const nextButton = page.getByRole('button', { name: /Next|Get Started/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await page.waitForTimeout(250);

    const stillOnWelcome = await page
      .getByText(/Welcome to Chief Wiggum/i)
      .isVisible()
      .catch(() => false);
    expect(stillOnWelcome).toBe(false);

    await skipAll.click();
    await page.waitForTimeout(250);

    await expect(skipAll).toBeHidden();
    const onboardingDialogStillVisible = await page
      .getByRole('dialog')
      .filter({ has: page.getByText(/Open a Project|Choose Your Model|Key Shortcuts/i) })
      .isVisible()
      .catch(() => false);
    expect(onboardingDialogStillVisible).toBe(false);
  });
});
