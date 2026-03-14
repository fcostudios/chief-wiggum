import { test, expect } from '../fixtures/app';

test.describe('TerminalPane', () => {
  test('terminal view is accessible via tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Terminal' }).click();
    const xterm = page.locator('.xterm');
    if (await xterm.isVisible().catch(() => false)) {
      await expect(xterm).toBeVisible();
      return;
    }

    await expect(page.getByText(/No terminal sessions open/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Terminal/i })).toBeVisible();
  });
});
