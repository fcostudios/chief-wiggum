import { test, expect, modKey } from '../fixtures/app';

async function expectTerminalView(page: import('@playwright/test').Page): Promise<void> {
  const xterm = page.locator('.xterm');
  if (await xterm.isVisible().catch(() => false)) {
    await expect(xterm).toBeVisible();
    return;
  }

  const fallback = page.getByText(/No terminal sessions open/i);
  await expect(fallback).toBeVisible();
  await expect(page.getByRole('button', { name: /Open Terminal/i })).toBeVisible();
}

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
    await expect(page.getByRole('button', { name: 'Agents' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await page.keyboard.press(`${modKey}+4`);
    await expectTerminalView(page);

    await page.keyboard.press(`${modKey}+1`);
    await expect(page.getByRole('button', { name: 'Conversation' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  test('mod+B cycles sidebar states', async ({ page }) => {
    await expect(page.getByText('Projects', { exact: true })).toBeVisible();
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(250);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(250);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(250);
    await expect(page.getByText('Projects', { exact: true })).toBeVisible();
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
