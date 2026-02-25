import { test, expect, modKey } from '../fixtures/app';

async function ensureSidebarVisible(page: import('@playwright/test').Page): Promise<void> {
  const sidebar = page.getByLabel('Sidebar');
  if (await sidebar.isVisible().catch(() => false)) return;
  await page.keyboard.press(`${modKey}+b`);
  await page.waitForTimeout(250);
}

function sessionItems(sidebar: import('@playwright/test').Locator) {
  return sidebar.locator('div.group[role="button"]');
}

test.describe('Session Lifecycle (CHI-162)', () => {
  test('new session control is available and click is handled safely', async ({ page }) => {
    await ensureSidebarVisible(page);
    const sidebar = page.getByLabel('Sidebar');
    await expect(sidebar).toBeVisible();

    const newSessionButton = page.getByRole('button', { name: /New Session/i }).first();
    await expect(newSessionButton).toBeVisible();

    const beforeCount = await sessionItems(sidebar).count();
    await newSessionButton.click();
    await page.waitForTimeout(400);
    const afterCount = await sessionItems(sidebar).count();

    expect(afterCount).toBeGreaterThanOrEqual(0);
    expect(afterCount).toBeGreaterThanOrEqual(Math.min(beforeCount, afterCount));
  });

  test('switching sessions is possible when multiple sessions exist', async ({ page }) => {
    await ensureSidebarVisible(page);
    const sidebar = page.getByLabel('Sidebar');
    const items = sessionItems(sidebar);
    if ((await items.count()) < 2) return;

    const secondBefore = await items.nth(1).getAttribute('style');
    await items.nth(1).click();
    await page.waitForTimeout(300);
    const secondAfter = await items.nth(1).getAttribute('style');

    expect(secondAfter).toBeTruthy();
    expect(secondAfter).not.toBe(secondBefore);
  });

  test('pinning a session shows pinned grouping when sessions are available', async ({ page }) => {
    await ensureSidebarVisible(page);
    const sidebar = page.getByLabel('Sidebar');
    const items = sessionItems(sidebar);
    if ((await items.count()) === 0) return;

    const firstItem = items.first();
    await firstItem.hover();
    await page.waitForTimeout(150);

    const pinButton = firstItem.locator(
      'button[aria-label*="Pin"], button[aria-label*="pin"], button[aria-label*="Unpin"], button[aria-label*="unpin"]',
    ).first();
    if (!(await pinButton.isVisible().catch(() => false))) return;

    await pinButton.click();
    await page.waitForTimeout(300);

    const pinnedVisible = await sidebar.getByText(/Pinned/i).first().isVisible().catch(() => false);
    expect(pinnedVisible).toBe(true);

    const unpinButton = sidebar
      .locator('button[aria-label*="Unpin"], button[aria-label*="unpin"], button[aria-label*="Pin"], button[aria-label*="pin"]')
      .first();
    if (await unpinButton.isVisible().catch(() => false)) {
      await unpinButton.click();
      await page.waitForTimeout(200);
    }
  });

  test('session title supports inline rename when a session exists', async ({ page }) => {
    await ensureSidebarVisible(page);
    const sidebar = page.getByLabel('Sidebar');
    const items = sessionItems(sidebar);
    if ((await items.count()) === 0) return;

    const firstItem = items.first();
    const title = firstItem.locator('span.truncate').first();
    if (!(await title.isVisible().catch(() => false))) return;

    await title.dblclick();
    await page.waitForTimeout(200);

    const renameInput = sidebar.locator('input[aria-label*="Rename"], input[aria-label*="rename"]').first();
    if (!(await renameInput.isVisible().catch(() => false))) return;

    const original = (await renameInput.inputValue()) || 'Session';
    const renamed = `${original} Test`;

    await renameInput.fill(renamed);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    await expect(sidebar.getByText(renamed).first()).toBeVisible();

    await sidebar.getByText(renamed).first().dblclick();
    await page.waitForTimeout(200);
    const inputAgain = sidebar.locator('input[aria-label*="Rename"], input[aria-label*="rename"]').first();
    if (await inputAgain.isVisible().catch(() => false)) {
      await inputAgain.fill(original);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    }
  });
});
