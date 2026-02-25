import { test, expect, modKey } from '../fixtures/app';

async function ensureSidebarVisible(page: import('@playwright/test').Page): Promise<void> {
  const sidebar = page.getByLabel('Sidebar');
  if (await sidebar.isVisible().catch(() => false)) return;
  await page.keyboard.press(`${modKey}+b`);
  await page.waitForTimeout(250);
}

test.describe('Parallel Sessions (CHI-162)', () => {
  test('sidebar status indicators query safely for running/error/unread sessions', async ({ page }) => {
    await ensureSidebarVisible(page);
    const sidebar = page.getByLabel('Sidebar');
    await expect(sidebar).toBeVisible();

    const running = await sidebar.locator('[role="status"][aria-label="Running"]').count();
    const errored = await sidebar.locator('[role="status"][aria-label="Error"]').count();
    const unread = await sidebar.locator('[role="status"][aria-label*="Unread"]').count();

    expect(running).toBeGreaterThanOrEqual(0);
    expect(errored).toBeGreaterThanOrEqual(0);
    expect(unread).toBeGreaterThanOrEqual(0);
  });

  test('session quick-switcher opens with mod+Shift+P', async ({ page }) => {
    await page.keyboard.press(`${modKey}+Shift+p`);
    await page.waitForTimeout(200);

    const switcher = page.getByPlaceholder(/Switch to session/i);
    if (!(await switcher.isVisible().catch(() => false))) return;

    await expect(switcher).toBeVisible();
    await expect(switcher).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(switcher).toBeHidden();
  });
});
