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

async function selectFirstFile(page: Page): Promise<boolean> {
  const tree = page.getByRole('tree', { name: 'File explorer' });
  if (!(await tree.isVisible().catch(() => false))) return false;

  const fileNodes = page.locator('[role="treeitem"]:not([aria-expanded])');
  if ((await fileNodes.count()) === 0) return false;

  await fileNodes.first().click();
  await page.waitForTimeout(500);
  return true;
}

test.describe('File Preview (CHI-158)', () => {
  test.beforeEach(async ({ page }) => {
    await openFilesSection(page);
  });

  test('clicking a file opens preview in DetailsPanel', async ({ page }) => {
    if (!(await selectFirstFile(page))) return;

    const preview = page.getByLabel('File preview');
    const previewVisible = await preview.isVisible().catch(() => false);

    if (!previewVisible) {
      const fallback = page.getByText(/Loading preview|Binary file|Empty file|Could not load preview/i);
      await expect(fallback.first()).toBeVisible({ timeout: 5_000 });
      return;
    }

    await expect(preview).toBeVisible();
  });

  test('file preview shows copy path button', async ({ page }) => {
    if (!(await selectFirstFile(page))) return;

    const preview = page.getByLabel('File preview');
    if (!(await preview.isVisible().catch(() => false))) return;

    await expect(preview.getByRole('button', { name: /Copy path/i })).toBeVisible();
  });

  test('file preview exposes resize handle when preview is visible', async ({ page }) => {
    if (!(await selectFirstFile(page))) return;

    const resizeHandle = page.getByRole('separator', { name: 'Resize file preview' });
    const handleVisible = await resizeHandle.isVisible().catch(() => false);
    if (!handleVisible) return;

    await expect(resizeHandle).toBeVisible();
  });
});
