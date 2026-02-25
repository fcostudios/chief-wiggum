import { test, expect } from '../fixtures/app';

test.describe('TerminalPane', () => {
  test('terminal view is accessible via tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Terminal' }).click();
    await expect(page.locator('.xterm')).toBeVisible();
  });
});
