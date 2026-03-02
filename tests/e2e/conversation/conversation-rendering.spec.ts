import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app';

const TABLE_MD = `
| Name  | Role   | Status |
|-------|--------|--------|
| Alice | Admin  | Active |
| Bob   | Editor | Idle   |
`.trim();

const MERMAID_MD = [
  '```mermaid',
  'graph TD',
  '  A[Start] --> B[Process]',
  '  B --> C[End]',
  '```',
].join('\n');

const CODE_TS_MD = [
  '```typescript',
  'const greet = (name: string): string => {',
  '  return `Hello, ${name}!`;',
  '};',
  '```',
].join('\n');

const WIDE_TABLE_MD = `
| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 |
|----|----|----|----|----|----|----|----|----|-----|
| a  | b  | c  | d  | e  | f  | g  | h  | i  | j   |
`.trim();

async function hasTauriInvoke(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } })
      .__TAURI_INTERNALS__;
    return typeof internals?.invoke === 'function';
  });
}

async function seedAndLoad(page: Page, content: string): Promise<void> {
  const canSeed = await hasTauriInvoke(page);
  test.skip(!canSeed, 'Requires Tauri runtime IPC for DB seeding');

  await page.evaluate(
    async ([messageContent]: [string]) => {
      const invoke = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__.invoke;

      const now = Date.now();
      const project = (await invoke('create_project', {
        folder_path: `/tmp/chief-wiggum-e2e-render-${now}`,
        name: `__e2e_render_${now}`,
      })) as { id: string };

      const session = (await invoke('create_session', {
        model: 'claude-sonnet-4-6',
        project_id: project.id,
      })) as { id: string };

      await invoke('save_message', {
        session_id: session.id,
        id: `msg-${now}`,
        role: 'assistant',
        content: messageContent,
        model: 'claude-sonnet-4-6',
        input_tokens: null,
        output_tokens: null,
        cost_cents: null,
      });
    },
    [content] as [string],
  );

  await page.reload();
  await page.waitForSelector('.grain-overlay', { timeout: 15_000 });

  const skipAll = page.getByRole('button', { name: 'Skip all' });
  if (await skipAll.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipAll.click();
  }

  const sessionItem = page.getByTestId('session-item').first();
  await expect(sessionItem).toBeVisible({ timeout: 5_000 });
  await sessionItem.click();
  await page.waitForTimeout(400);
}

test.describe('Rich Content Rendering (CHI-211)', () => {
  test('GFM table renders as HTML table instead of raw pipes', async ({ page }) => {
    await seedAndLoad(page, TABLE_MD);
    const table = page.locator('.markdown-content table').first();
    await expect(table).toBeVisible({ timeout: 6_000 });
    await expect(table.locator('th').first()).toContainText('Name');
    await expect(table.locator('th').first()).not.toContainText('|');
  });

  test('mermaid fences render an SVG diagram', async ({ page }) => {
    await seedAndLoad(page, MERMAID_MD);
    await expect(page.locator('.markdown-content svg').first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.markdown-content code').filter({ hasText: 'graph TD' }),
    ).toHaveCount(0);
  });

  test('typescript block shows toolbar and line-number toggle behavior', async ({ page }) => {
    await seedAndLoad(page, CODE_TS_MD);
    const pre = page.locator('.markdown-content pre').first();
    await expect(pre).toBeVisible({ timeout: 6_000 });
    await expect(pre.locator('.code-lang-badge')).toContainText('typescript');

    const lineToggle = pre.locator('.lines-toggle-btn');
    await expect(lineToggle).toBeVisible();
    await lineToggle.click();
    await expect(pre.locator('.code-line-numbers')).toBeVisible();
  });

  test('copy button writes code content to clipboard', async ({ page, context }) => {
    await seedAndLoad(page, CODE_TS_MD);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const copyBtn = page.locator('.markdown-content pre .copy-btn').first();
    await expect(copyBtn).toBeVisible({ timeout: 6_000 });
    await copyBtn.click();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toContain('const greet');
  });

  test('mermaid fullscreen button opens dialog with svg', async ({ page }) => {
    await seedAndLoad(page, MERMAID_MD);
    await expect(page.locator('.markdown-content svg').first()).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Open diagram fullscreen').click();
    const dialog = page.getByRole('dialog', { name: 'Diagram fullscreen view' });
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(dialog.locator('svg')).toBeVisible();
  });

  test('renderer placeholder hydrates mermaid into rendered component', async ({ page }) => {
    await seedAndLoad(page, MERMAID_MD);
    const placeholder = page.locator('[data-cw-renderer="mermaid"]').first();
    await expect(placeholder).toBeVisible({ timeout: 10_000 });
    await expect(placeholder.locator('svg')).toBeVisible();
  });

  test('wide table is wrapped in horizontal scroll container', async ({ page }) => {
    await seedAndLoad(page, WIDE_TABLE_MD);
    const wrapper = page.locator('.table-scroll-wrapper').first();
    await expect(wrapper).toBeVisible({ timeout: 6_000 });
    const overflowX = await wrapper.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toMatch(/auto|scroll/);
  });
});
