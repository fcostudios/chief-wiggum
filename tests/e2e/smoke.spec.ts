import { test, expect } from './fixtures/app';

test.describe('Smoke Test', () => {
  test('app loads and renders main layout', async ({ page }) => {
    await expect(page.locator('[data-tauri-drag-region]:visible').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conversation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agents' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Diff' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminal' })).toBeVisible();
    await expect(page.locator('footer[role="status"]')).toBeVisible();
  });

  test('conversation view is the default active view', async ({ page }) => {
    const convTab = page.getByRole('button', { name: 'Conversation' });
    await expect(convTab).toHaveClass(/text-text-primary/);
  });
});
