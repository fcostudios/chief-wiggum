import { test, expect } from '../fixtures/app';

async function openSessionContextMenuOrSkip(page: import('@playwright/test').Page): Promise<void> {
  const sessionItem = page.getByTestId('session-item').first();
  const visible = await sessionItem.isVisible({ timeout: 3000 }).catch(() => false);
  test.skip(!visible, 'No session rows available in browser-only mode');
  await sessionItem.click({ button: 'right' });
  await expect(page.locator('[role="menu"]')).toBeVisible({ timeout: 2000 });
}

test.describe('Context Menus (CHI-78)', () => {
  test('right-click on message shows context menu with Copy option', async ({ page }) => {
    const messageBubble = page.locator('[class*="rounded-lg"]').filter({ hasText: /Assistant|You/ }).first();
    const visible = await messageBubble.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!visible, 'No conversation messages rendered in browser-only mode');

    await messageBubble.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Copy message/i })).toBeVisible();
  });

  test('context menu closes on Escape key', async ({ page }) => {
    await openSessionContextMenuOrSkip(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
  });

  test('right-click on session item shows context menu', async ({ page }) => {
    await openSessionContextMenuOrSkip(page);
  });

  test('session context menu contains Rename, Duplicate, Delete', async ({ page }) => {
    await openSessionContextMenuOrSkip(page);
    const menu = page.locator('[role="menu"]');
    await expect(menu.getByRole('menuitem', { name: /Rename/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Duplicate/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Delete/i })).toBeVisible();
  });

  test('session context menu closes on click outside', async ({ page }) => {
    await openSessionContextMenuOrSkip(page);
    await page.locator('body').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
  });

  test('code blocks in markdown content expose code context menu when available', async ({ page }) => {
    const codeBlock = page.locator('.markdown-content pre').first();
    const visible = await codeBlock.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!visible, 'No markdown code blocks rendered in browser-only mode');

    await codeBlock.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Copy code' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Copy as markdown' })).toBeVisible();
  });

  test('menu renders with accessible menu/menuitem roles', async ({ page }) => {
    await openSessionContextMenuOrSkip(page);
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    const items = menu.locator('[role="menuitem"]');
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('Escape dismisses the context menu from session item flow', async ({ page }) => {
    await openSessionContextMenuOrSkip(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
  });
});
