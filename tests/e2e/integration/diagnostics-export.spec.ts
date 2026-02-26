import { test, expect } from '../fixtures/app';

async function openExportDialog(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /export diagnostics/i }).click();
  const dialog = page.getByRole('dialog', { name: /export diagnostic bundle/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Diagnostics Export Dialog (CHI-169)', () => {
  test('status bar export button opens diagnostics dialog', async ({ page }) => {
    const dialog = await openExportDialog(page);
    await expect(dialog.getByText('Export Diagnostic Bundle')).toBeVisible();
  });

  test('dialog shows privacy assurance content', async ({ page }) => {
    const dialog = await openExportDialog(page);
    await expect(dialog.getByText(/Privacy:/i)).toBeVisible();
    await expect(dialog.getByText(/redacted/i)).toBeVisible();
  });

  test('dialog lists bundle contents', async ({ page }) => {
    const dialog = await openExportDialog(page);
    await expect(dialog.getByText(/Application logs/i)).toBeVisible();
    await expect(dialog.getByText(/System info/i)).toBeVisible();
    await expect(dialog.getByText(/Redaction summary/i)).toBeVisible();
  });

  test('dialog shows Cancel and Export actions', async ({ page }) => {
    const dialog = await openExportDialog(page);
    await expect(dialog.getByRole('button', { name: /^Cancel$/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Export & Open Folder/i })).toBeVisible();
  });

  test('Cancel button closes the dialog', async ({ page }) => {
    const dialog = await openExportDialog(page);
    await dialog.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(dialog).toBeHidden();
  });

  test('Escape and backdrop close the dialog', async ({ page }) => {
    const dialog = await openExportDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await openExportDialog(page);
    const backdrop = page.locator('.fixed.inset-0.z-50').last();
    await backdrop.click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog', { name: /export diagnostic bundle/i })).toBeHidden();
  });
});
