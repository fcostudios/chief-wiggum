import { test, expect } from '../fixtures/app';

test.describe('StatusBar', () => {
  test('shows status indicator', async ({ page }) => {
    const statusBar = page.locator('footer[role="status"]');
    await expect(statusBar).toBeVisible();
    await expect(statusBar.getByText(/CLI not found|Ready|Running|Starting|Error|Done/i)).toBeVisible();
  });

  test('shows cost display', async ({ page }) => {
    await expect(page.locator('footer[role="status"]').getByText('$0.00')).toBeVisible();
  });
});
