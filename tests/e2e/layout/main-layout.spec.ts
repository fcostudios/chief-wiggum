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

test.describe('MainLayout', () => {
  test('renders 5-zone layout structure', async ({ page }) => {
    await expect(page.locator('[data-tauri-drag-region]:visible').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conversation' })).toBeVisible();
    await expect(page.locator('footer[role="status"]')).toBeVisible();
  });

  test('view tabs switch content', async ({ page }) => {
    await page.getByRole('button', { name: 'Agents' }).click();
    await expect(page.getByRole('button', { name: 'Agents' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await page.getByRole('button', { name: 'Terminal' }).click();
    await expectTerminalView(page);

    await page.getByRole('button', { name: 'Conversation' }).click();
    await expect(page.getByRole('button', { name: 'Conversation' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  test('mod+1/2 switches views', async ({ page }) => {
    await page.keyboard.press(`${modKey}+2`);
    await expect(page.getByRole('button', { name: 'Agents' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await page.keyboard.press(`${modKey}+1`);
    await expect(page.getByRole('button', { name: 'Conversation' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });
});
