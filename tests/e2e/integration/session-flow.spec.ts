import { test, expect } from '../fixtures/app';

test.describe('Session Flow', () => {
  test('app starts with message input visible', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await expect(textarea).toBeVisible();
  });

  test('can type in message input when CLI is available (or remains disabled safely)', async ({
    page,
  }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await expect(textarea).toBeVisible();

    if (await textarea.isDisabled()) {
      await expect(textarea).toBeDisabled();
      return;
    }

    await textarea.click();
    await textarea.fill('Test message');
    await expect(textarea).toHaveValue('Test message');
  });
});
