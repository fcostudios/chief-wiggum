import { test, expect, modKey } from '../fixtures/app';

function titleBarYoloBadge(page: import('@playwright/test').Page) {
  return page.getByRole('banner').getByText('YOLO', { exact: true });
}

async function disableYoloIfEnabled(page: import('@playwright/test').Page): Promise<void> {
  const yoloBadge = titleBarYoloBadge(page);
  if (await yoloBadge.isVisible().catch(() => false)) {
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(250);
  }

  const dialog = page.getByRole('dialog', { name: /YOLO mode warning/i });
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
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(200);

    const dialog = page.getByRole('dialog', { name: /YOLO mode warning/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Enable YOLO Mode\?/i)).toBeVisible();
    await expect(dialog.getByText(/auto-approve all permission requests/i)).toBeVisible();

    const enableButton = dialog.getByRole('button', { name: /Enable YOLO Mode/i });
    const cancelButton = dialog.getByRole('button', { name: /Cancel/i });
    await expect(enableButton).toBeVisible();
    await expect(cancelButton).toBeVisible();

    await enableButton.click();
    await page.waitForTimeout(300);

    await expect(dialog).toBeHidden();
    await expect(titleBarYoloBadge(page)).toBeVisible();
  });

  test('cancel flow leaves YOLO badge hidden', async ({ page }) => {
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(200);

    const dialog = page.getByRole('dialog', { name: /YOLO mode warning/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await page.waitForTimeout(200);

    await expect(dialog).toBeHidden();
    await expect(titleBarYoloBadge(page)).toBeHidden();
  });

  test('Escape dismisses YOLO warning dialog', async ({ page }) => {
    await page.keyboard.press(`${modKey}+Shift+y`);
    await page.waitForTimeout(200);

    const dialog = page.getByRole('dialog', { name: /YOLO mode warning/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(titleBarYoloBadge(page)).toBeHidden();
  });
});
