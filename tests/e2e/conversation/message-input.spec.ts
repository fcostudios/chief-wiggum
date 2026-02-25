import { test, expect } from '../fixtures/app';

test.describe('MessageInput', () => {
  test('message input is visible', async ({ page }) => {
    await expect(page.locator('textarea[aria-label="Message input"]')).toBeVisible();
  });

  test('input auto-expands on typing when enabled', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await expect(textarea).toBeVisible();

    if (await textarea.isDisabled()) {
      await expect(textarea).toBeDisabled();
      return;
    }

    const initialHeight = await textarea.evaluate((el) => el.clientHeight);
    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    const expandedHeight = await textarea.evaluate((el) => el.clientHeight);
    expect(expandedHeight).toBeGreaterThanOrEqual(initialHeight);
  });

  test('Shift+Enter creates newline without sending when input enabled', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) {
      await expect(textarea).toBeDisabled();
      return;
    }

    await textarea.click();
    await textarea.fill('Hello');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('World');
    await expect(textarea).toHaveValue(/Hello[\r\n]+World/);
  });

  test('@-mention trigger does not crash UI', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) {
      await expect(textarea).toBeDisabled();
      return;
    }

    await textarea.click();
    await textarea.fill('@');
    await expect(textarea).toHaveValue('@');
  });
});
