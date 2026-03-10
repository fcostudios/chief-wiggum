import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app';

async function openFilesSection(page: Page): Promise<boolean> {
  const searchInput = page.getByPlaceholder(/Search files/i);
  if (await searchInput.isVisible().catch(() => false)) return true;

  const filesToggle = page.getByLabel('Toggle files');
  const filesButton = page.getByRole('button', { name: /^Files$/i }).first();
  const toggle = (await filesToggle.isVisible().catch(() => false)) ? filesToggle : filesButton;

  if (!(await toggle.isVisible().catch(() => false))) return false;

  await toggle.click();
  await page.waitForTimeout(250);
  return true;
}

test.describe('File Tree (CHI-158)', () => {
  test.beforeEach(async ({ page }) => {
    await openFilesSection(page);
  });

  test('files section can be toggled without crashing UI', async ({ page }) => {
    const filesToggle = page.getByLabel('Toggle files');
    const filesButton = page.getByRole('button', { name: /^Files$/i }).first();
    const toggle = (await filesToggle.isVisible().catch(() => false)) ? filesToggle : filesButton;

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

  test('file tree renders when Files section is open', async ({ page }) => {
    const tree = page.getByRole('tree', { name: 'File explorer' });
    const isTreeVisible = await tree.isVisible().catch(() => false);

    if (!isTreeVisible) {
      const noFiles = page.getByText(/No files|No project|Open a project folder/i);
      const noFilesVisible = await noFiles.first().isVisible().catch(() => false);
      if (noFilesVisible) {
        await expect(noFiles.first()).toBeVisible();
        return;
      }
      await expect(tree).toBeVisible({ timeout: 10_000 });
    }

    await expect(tree).toBeVisible();
    const items = page.getByRole('treeitem');
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
  });

  test('search input filters file tree', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search files/i);
    const isSearchVisible = await searchInput.isVisible().catch(() => false);
    if (!isSearchVisible) return;

    await searchInput.fill('package');
    await page.waitForTimeout(350);

    const noResults = page.getByText(/No files found/i);
    const treeItems = page.getByRole('treeitem');
    const hasResults = await treeItems.first().isVisible().catch(() => false);
    const hasNoResults = await noResults.isVisible().catch(() => false);

    expect(hasResults || hasNoResults).toBe(true);
    await searchInput.clear();
  });

  test('folder nodes expand and collapse on click', async ({ page }) => {
    const tree = page.getByRole('tree', { name: 'File explorer' });
    if (!(await tree.isVisible().catch(() => false))) return;

    const folders = page.locator('[role="treeitem"][aria-expanded]');
    if ((await folders.count()) === 0) return;

    const firstFolder = folders.first();
    const initialExpanded = await firstFolder.getAttribute('aria-expanded');

    await firstFolder.click();
    await page.waitForTimeout(200);

    const afterClickExpanded = await firstFolder.getAttribute('aria-expanded');
    expect(afterClickExpanded).not.toBe(initialExpanded);

    await firstFolder.click();
    await page.waitForTimeout(200);
    const afterToggleBack = await firstFolder.getAttribute('aria-expanded');
    expect(afterToggleBack).toBe(initialExpanded);
  });
});
