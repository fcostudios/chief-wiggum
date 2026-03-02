import { test, expect, modKey } from '../fixtures/app';

test.describe('Keyboard Shortcuts', () => {
  test('mod+K opens command palette', async ({ page }) => {
    await page.keyboard.press(`${modKey}+k`);
    const paletteInput = page.getByPlaceholder('Type a command...');
    await expect(paletteInput).toBeVisible();
    await expect(paletteInput).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(paletteInput).toBeHidden();
  });

  test('mod+1 through mod+4 switch views', async ({ page }) => {
    await page.keyboard.press(`${modKey}+2`);
    await expect(page.getByRole('button', { name: 'Agents' })).toHaveClass(/text-text-primary/);

    await page.keyboard.press(`${modKey}+4`);
    await expect(page.locator('.xterm')).toBeVisible();

    await page.keyboard.press(`${modKey}+1`);
    await expect(page.getByRole('button', { name: 'Conversation' })).toHaveClass(
      /text-text-primary/,
    );
  });

  test('mod+B cycles sidebar states', async ({ page }) => {
    await expect(page.getByText('Projects')).toBeVisible();
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(250);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(250);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(250);
    await expect(page.getByText('Projects')).toBeVisible();
  });

  test('mod+Shift+B toggles details panel', async ({ page }) => {
    const separator = page.getByRole('separator', { name: 'Resize details panel' });
    const before = await separator.isVisible().catch(() => false);

    await page.keyboard.press(`${modKey}+Shift+b`);
    await page.waitForTimeout(250);
    const after = await separator.isVisible().catch(() => false);
    expect(after).toBe(!before);

    await page.keyboard.press(`${modKey}+Shift+b`);
    await page.waitForTimeout(250);
    const restored = await separator.isVisible().catch(() => false);
    expect(restored).toBe(before);
  });
});
