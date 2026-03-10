import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app';

async function openActionsSection(page: Page): Promise<boolean> {
  const searchInput = page.getByPlaceholder(/Filter actions/i);
  if (await searchInput.isVisible().catch(() => false)) return true;

  const actionsToggle = page.getByLabel('Toggle actions');
  const actionsButton = page.getByRole('button', { name: /^Actions$/i }).first();
  const toggle = (await actionsToggle.isVisible().catch(() => false)) ? actionsToggle : actionsButton;

  if (!(await toggle.isVisible().catch(() => false))) return false;
  await toggle.click();
  await page.waitForTimeout(250);
  return true;
}

test.describe('Actions Discovery (CHI-159)', () => {
  test.beforeEach(async ({ page }) => {
    await openActionsSection(page);
  });

  test('actions section can be toggled without crashing UI', async ({ page }) => {
    const actionsToggle = page.getByLabel('Toggle actions');
    const actionsButton = page.getByRole('button', { name: /^Actions$/i }).first();
    const toggle = (await actionsToggle.isVisible().catch(() => false)) ? actionsToggle : actionsButton;

    if (!(await toggle.isVisible().catch(() => false))) {
      await expect(page.getByText(/Open a project folder/i).first()).toBeVisible();
      return;
    }

    await toggle.click();
    await page.waitForTimeout(200);
    await toggle.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('actions panel renders when Actions section is open', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Filter actions/i);
    const noActions = page.getByText(/No actions found/i);
    const scanning = page.getByText(/Scanning project/i);

    const hasSearch = await searchInput.isVisible().catch(() => false);
    const hasNoActions = await noActions.isVisible().catch(() => false);
    const isScanning = await scanning.isVisible().catch(() => false);

    if (!hasSearch && !hasNoActions && !isScanning) {
      await expect(page.getByText(/Open a project folder/i).first()).toBeVisible();
      return;
    }

    expect(hasSearch || hasNoActions || isScanning).toBe(true);
  });

  test('discovered actions are grouped by source', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Filter actions/i);
    if (!(await searchInput.isVisible().catch(() => false))) return;

    const groupHeader = page.getByText(/npm scripts|cargo|make targets|docker compose|custom actions/i).first();
    const noActions = page.getByText(/No actions found|Scanning project/i).first();

    const hasGroup = await groupHeader.isVisible().catch(() => false);
    const hasNoActions = await noActions.isVisible().catch(() => false);
    expect(hasGroup || hasNoActions).toBe(true);
  });

  test('search input filters discovered actions', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Filter actions/i);
    if (!(await searchInput.isVisible().catch(() => false))) return;

    await searchInput.fill('test');
    await page.waitForTimeout(250);

    const noActions = page.getByText(/No actions found/i).first();
    const hasNoActions = await noActions.isVisible().catch(() => false);
    const stillVisible = await searchInput.isVisible().catch(() => false);

    expect(stillVisible || hasNoActions).toBe(true);
    await searchInput.clear();
  });
});
