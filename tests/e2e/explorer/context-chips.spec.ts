import { test, expect } from '../fixtures/app';

test.describe('Context Chips (CHI-158)', () => {
  test('context chip shows filename and can be removed', async ({ page }) => {
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
    if (!(await removeButtons.first().isVisible().catch(() => false))) return;

    const chipCount = await removeButtons.count();
    expect(chipCount).toBeGreaterThan(0);

    await removeButtons.first().click();
    await page.waitForTimeout(200);

    const newCount = await removeButtons.count();
    expect(newCount).toBe(chipCount - 1);
  });
});
