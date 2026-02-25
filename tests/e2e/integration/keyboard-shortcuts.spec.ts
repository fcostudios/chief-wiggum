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
    await expect(page.getByText('Agent Teams')).toBeVisible();

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
    const toggle = page.getByRole('button', { name: /details panel/i });
    await expect(toggle).toHaveAttribute('aria-label', /Hide details panel|Show details panel/);
    const before = await toggle.getAttribute('aria-label');
    await page.keyboard.press(`${modKey}+Shift+b`);
    await page.waitForTimeout(250);
    const after = await toggle.getAttribute('aria-label');
    expect(after).not.toBe(before);
    await page.keyboard.press(`${modKey}+Shift+b`);
    await page.waitForTimeout(250);
  });
});
