import { test, expect, modKey } from '../fixtures/app';

function statusBarYoloBadge(page: import('@playwright/test').Page) {
  return page.locator('footer[role="status"]').getByText(/AUTO\s*·/);
}

async function stopResponseIfRunning(page: import('@playwright/test').Page): Promise<void> {
  const stopButton = page.getByRole('button', { name: /Cancel response/i });
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
    await page.waitForTimeout(300);
  }
}

async function disableYoloIfEnabled(page: import('@playwright/test').Page): Promise<void> {
  const yoloBadge = statusBarYoloBadge(page);
  if (await yoloBadge.isVisible().catch(() => false)) {
    await stopResponseIfRunning(page);
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(250);
  }

  const dialog = page.getByRole('dialog', { name: /Auto-approve mode warning/i });
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

test.describe('YOLO Mode Full Flow (CHI-161)', () => {
  test.afterEach(async ({ page }) => {
    await disableYoloIfEnabled(page);
  });

  test('enable flow: shortcut opens warning, confirm enables badge', async ({ page }) => {
    await stopResponseIfRunning(page);
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(200);

    const dialog = page.getByRole('dialog', { name: /Auto-approve mode warning/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Enable Auto-approve Mode\?/i)).toBeVisible();
    await expect(dialog.getByText(/auto-approve all permission requests/i)).toBeVisible();

    const enableButton = dialog.getByRole('button', { name: /Enable Auto-approve Mode/i });
    const cancelButton = dialog.getByRole('button', { name: /Cancel/i });
    await expect(enableButton).toBeVisible();
    await expect(cancelButton).toBeVisible();

    await enableButton.click();
    await page.waitForTimeout(300);

    await expect(dialog).toBeHidden();
    await expect(statusBarYoloBadge(page)).toBeVisible();
  });

  test('cancel flow leaves YOLO badge hidden', async ({ page }) => {
    await stopResponseIfRunning(page);
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(200);

    const dialog = page.getByRole('dialog', { name: /Auto-approve mode warning/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await page.waitForTimeout(200);

    await expect(dialog).toBeHidden();
    await expect(statusBarYoloBadge(page)).toBeHidden();
  });

  test('Escape dismisses auto-approve warning dialog', async ({ page }) => {
    await stopResponseIfRunning(page);
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(200);

    const dialog = page.getByRole('dialog', { name: /Auto-approve mode warning/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(statusBarYoloBadge(page)).toBeHidden();
  });
});
