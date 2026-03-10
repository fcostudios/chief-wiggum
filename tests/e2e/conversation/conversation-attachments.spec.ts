import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

async function hasTauriInvoke(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } })
      .__TAURI_INTERNALS__;
    return typeof internals?.invoke === 'function';
  });
}

async function seedSession(page: Page): Promise<void> {
  const canSeed = await hasTauriInvoke(page);
  test.skip(!canSeed, 'Requires Tauri runtime IPC for DB seeding');

  await page.evaluate(async () => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__.invoke;

    const now = Date.now();
    const project = (await invoke('create_project', {
      folder_path: `/tmp/chief-wiggum-e2e-attachments-${now}`,
      name: `__e2e_attachments_${now}`,
    })) as { id: string };

    await invoke('create_session', {
      model: 'claude-sonnet-4-6',
      project_id: project.id,
    });
  });

  await page.reload();
  await page.waitForSelector('#main-content', { timeout: 15_000 });

  const skipAll = page.getByRole('button', { name: 'Skip all' });
  if (await skipAll.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipAll.click();
  }

  const sessionItem = page.getByTestId('session-item').first();
  await expect(sessionItem).toBeVisible({ timeout: 5_000 });
  await sessionItem.click();
}

async function requireEnabledInputOrSkip(page: Page): Promise<void> {
  const textarea = page.locator('textarea[aria-label="Message input"]');
  await expect(textarea).toBeVisible();
  const disabled = await textarea.isDisabled();
  test.skip(disabled, 'Message input is disabled in this environment');
}

test.describe('Conversation Attachments (CHI-212)', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
    await requireEnabledInputOrSkip(page);
  });

  test('pasting image data adds an image attachment thumbnail', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await textarea.click();

    await page.evaluate(() => {
      const target = document.querySelector('textarea[aria-label="Message input"]');
      if (!target) return;

      const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
      const blob = new Blob([bytes], { type: 'image/png' });
      const file = new File([blob], 'paste.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);

      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: dt });
      target.dispatchEvent(event);
    });

    await expect(page.getByLabel('Remove paste-1.png')).toBeVisible({ timeout: 5_000 });
  });

  test('pasting image larger than 5MB shows size error and no image chip', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await textarea.click();

    await page.evaluate(() => {
      const target = document.querySelector('textarea[aria-label="Message input"]');
      if (!target) return;

      const bytes = new Uint8Array(6 * 1024 * 1024);
      const blob = new Blob([bytes], { type: 'image/png' });
      const file = new File([blob], 'too-big.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);

      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: dt });
      target.dispatchEvent(event);
    });

    await expect(page.getByText(/Image too large/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel('Remove paste-1.png')).toHaveCount(0);
  });

  test('dropping a supported .ts file adds a context chip', async ({ page }) => {
    await page.locator('textarea[aria-label="Message input"]').evaluate((el) => {
      const file = new File(['const x = 1;'], 'helper.ts', { type: 'text/typescript' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });

    await expect(page.getByText('helper.ts')).toBeVisible({ timeout: 5_000 });
  });

  test('dropping unsupported file type shows warning toast', async ({ page }) => {
    await page.locator('textarea[aria-label="Message input"]').evaluate((el) => {
      const file = new File([new Uint8Array(10)], 'malware.exe', {
        type: 'application/octet-stream',
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });

    await expect(page.getByText(/Unsupported file type/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('malware.exe')).toHaveCount(0);
  });

  test('paperclip button and Cmd+Shift+U open file chooser and attach file', async ({ page }) => {
    const [chooserViaButton] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByLabel('Attach file (Cmd+Shift+U)').click(),
    ]);
    await chooserViaButton.setFiles({
      name: 'from-button.ts',
      mimeType: 'text/typescript',
      buffer: Buffer.from('export const fromButton = true;'),
    });
    await expect(page.getByText('from-button.ts')).toBeVisible({ timeout: 5_000 });

    const [chooserViaShortcut] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press(`${modKey}+Shift+U`),
    ]);
    await chooserViaShortcut.setFiles({
      name: 'from-shortcut.ts',
      mimeType: 'text/typescript',
      buffer: Buffer.from('export const fromShortcut = true;'),
    });
    await expect(page.getByText('from-shortcut.ts')).toBeVisible({ timeout: 5_000 });
  });
});
