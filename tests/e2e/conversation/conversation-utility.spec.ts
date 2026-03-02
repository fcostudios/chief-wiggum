import type { Page } from '@playwright/test';
import { test, expect, modKey } from '../fixtures/app';

async function hasTauriInvoke(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } })
      .__TAURI_INTERNALS__;
    return typeof internals?.invoke === 'function';
  });
}

async function seedSearchableSession(page: Page): Promise<void> {
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
      folder_path: `/tmp/chief-wiggum-e2e-utility-${now}`,
      name: `__e2e_utility_${now}`,
    })) as { id: string };

    const session = (await invoke('create_session', {
      model: 'claude-sonnet-4-6',
      project_id: project.id,
    })) as { id: string };

    const messages = [
      'This is a test message for search',
      'Another test appears here',
      'A final test line for navigation',
    ];
    for (let idx = 0; idx < messages.length; idx += 1) {
      await invoke('save_message', {
        session_id: session.id,
        id: `msg-util-${now}-${idx}`,
        role: idx % 2 === 0 ? 'assistant' : 'user',
        content: messages[idx],
        model: 'claude-sonnet-4-6',
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      });
    }
  });

  await page.reload();
  await page.waitForSelector('.grain-overlay', { timeout: 15_000 });

  const skipAll = page.getByRole('button', { name: 'Skip all' });
  if (await skipAll.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipAll.click();
  }

  const sessionItem = page.getByTestId('session-item').first();
  await expect(sessionItem).toBeVisible({ timeout: 5_000 });
  await sessionItem.click();
  await expect(page.locator('[data-message-index="0"]')).toBeVisible({ timeout: 5_000 });
}

test.describe('Conversation Utility (CHI-213)', () => {
  test.beforeEach(async ({ page }) => {
    await seedSearchableSession(page);
  });

  test('Cmd+F opens search, Enter and Shift+Enter navigate matches, Escape closes', async ({
    page,
  }) => {
    await page.keyboard.press(`${modKey}+f`);
    const searchInput = page.getByLabel('Search query');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    await searchInput.fill('test');
    await expect(page.getByText(/1 of 3/)).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Enter');
    await expect(page.getByText(/2 of 3/)).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Shift+Enter');
    await expect(page.getByText(/1 of 3/)).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Search query')).toHaveCount(0);
  });

  test('Cmd+K export markdown command invokes save_export_file and shows success toast', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
          };
          __e2e_export_call__?: { cmd: string; args?: Record<string, unknown> };
        }
      ).__TAURI_INTERNALS__;
      const original = internals.invoke.bind(internals);
      internals.invoke = (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'save_export_file') {
          (
            window as unknown as {
              __e2e_export_call__?: { cmd: string; args?: Record<string, unknown> };
            }
          ).__e2e_export_call__ = { cmd, args };
          return Promise.resolve('/tmp/chief-wiggum-export.md');
        }
        if (cmd === 'open_path_in_shell') {
          return Promise.resolve(null);
        }
        return original(cmd, args);
      };
    });

    await page.keyboard.press(`${modKey}+k`);
    const paletteInput = page.getByPlaceholder('Type a command...');
    await expect(paletteInput).toBeVisible({ timeout: 3_000 });
    await paletteInput.fill('export conversation as markdown');

    const exportCommand = page.getByRole('button', { name: /Export Conversation as Markdown/i });
    await expect(exportCommand).toBeVisible({ timeout: 3_000 });
    await exportCommand.click();

    const intercepted = await page.evaluate(
      () =>
        (
          window as unknown as {
            __e2e_export_call__?: { cmd: string; args?: Record<string, unknown> };
          }
        ).__e2e_export_call__,
    );
    expect(intercepted?.cmd).toBe('save_export_file');
    expect(intercepted?.args?.extension).toBe('md');

    await expect(page.getByText(/Conversation exported/i)).toBeVisible({ timeout: 5_000 });
  });
});
