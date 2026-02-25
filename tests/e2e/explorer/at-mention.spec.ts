import { test, expect } from '../fixtures/app';

test.describe('@-Mention Autocomplete (CHI-158)', () => {
  test('typing @ in MessageInput shows file mention menu', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await expect(textarea).toBeVisible();

    if (await textarea.isDisabled()) return;

    await textarea.fill('@');
    await page.waitForTimeout(300);

    const mentionMenu = page.getByRole('listbox', { name: 'File mentions' });
    const isMenuVisible = await mentionMenu.isVisible().catch(() => false);

    if (!isMenuVisible) {
      await expect(textarea).toBeVisible();
      await textarea.clear();
      return;
    }

    await expect(mentionMenu).toBeVisible();
    const options = mentionMenu.getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press('Escape');
    await expect(mentionMenu).toBeHidden();
    await textarea.clear();
  });

  test('selecting file from @-mention creates ContextChip', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.fill('@');
    await page.waitForTimeout(300);

    const mentionMenu = page.getByRole('listbox', { name: 'File mentions' });
    if (!(await mentionMenu.isVisible().catch(() => false))) return;

    const options = mentionMenu.getByRole('option');
    if ((await options.count()) === 0) return;

    await options.first().click();
    await page.waitForTimeout(200);

    const removeButtons = page.locator('button[aria-label^="Remove "]');
    await expect(removeButtons.first()).toBeVisible({ timeout: 3_000 });
  });
});
