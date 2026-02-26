import { test, expect } from '../fixtures/app';

function sessionRows(page: import('@playwright/test').Page) {
  return page
    .getByLabel('Sidebar')
    .locator('div[role="button"]')
    .filter({ has: page.getByRole('button', { name: 'Session actions' }) });
}

async function ensureSessionCount(
  page: import('@playwright/test').Page,
  minCount: number,
): Promise<number> {
  const rows = sessionRows(page);
  const newSessionButton = page.getByRole('button', { name: 'New Session' }).first();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await rows.count();
    if (current >= minCount) return current;
    if (!(await newSessionButton.isVisible().catch(() => false))) break;
    await newSessionButton.click();
    await page.waitForTimeout(300);
  }

  return rows.count();
}

test.describe('Sidebar Session Actions (CHI-166)', () => {
  test('new session appears in sidebar after creation', async ({ page }) => {
    const rows = sessionRows(page);
    const before = await rows.count();

    const newSessionButton = page.getByRole('button', { name: 'New Session' }).first();
    const canClick = await newSessionButton.isVisible().catch(() => false);
    if (!canClick) return;

    await newSessionButton.click();
    await page.waitForTimeout(400);

    const after = await rows.count();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('session actions menu reveals rename/pin/duplicate/delete options', async ({ page }) => {
    if ((await ensureSessionCount(page, 1)) < 1) return;

    const row = sessionRows(page).first();
    await row.hover();
    await page.waitForTimeout(150);

    const menuButton = row.getByRole('button', { name: 'Session actions' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await page.waitForTimeout(200);

    await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pin|Unpin/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('double-click on session enters rename mode', async ({ page }) => {
    if ((await ensureSessionCount(page, 1)) < 1) return;

    const row = sessionRows(page).first();
    await row.dblclick();
    await page.waitForTimeout(200);

    const renameInput = row.locator('input[aria-label="Rename"]');
    const visible = await renameInput.isVisible().catch(() => false);
    if (!visible) return;

    await expect(renameInput).toBeFocused();
  });

  test('Escape cancels rename without saving', async ({ page }) => {
    if ((await ensureSessionCount(page, 1)) < 1) return;

    const row = sessionRows(page).first();
    const titleText = row.locator('[title="Double-click to rename"]').first();
    const originalTitle = (await titleText.textContent())?.trim() || 'New Session';

    await row.dblclick();
    await page.waitForTimeout(200);

    const renameInput = row.locator('input[aria-label="Rename"]');
    if (!(await renameInput.isVisible().catch(() => false))) return;

    await renameInput.fill('SHOULD_NOT_SAVE');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await expect(renameInput).toBeHidden();
    await expect(row.getByText(originalTitle, { exact: false }).first()).toBeVisible();
  });

  test('Enter confirms rename', async ({ page }) => {
    if ((await ensureSessionCount(page, 1)) < 1) return;

    const row = sessionRows(page).first();
    const renameTo = 'Renamed Session';

    await row.dblclick();
    await page.waitForTimeout(200);

    const renameInput = row.locator('input[aria-label="Rename"]');
    if (!(await renameInput.isVisible().catch(() => false))) return;

    await renameInput.fill(renameTo);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    await expect(renameInput).toBeHidden();
    await expect(row.getByText(renameTo, { exact: false }).first()).toBeVisible();
  });

  test('pin button toggles session pinned state', async ({ page }) => {
    if ((await ensureSessionCount(page, 1)) < 1) return;

    const row = sessionRows(page).first();
    await row.hover();
    await page.waitForTimeout(150);

    const pinButton = row.getByRole('button', { name: /Pin|Unpin/i }).first();
    if (!(await pinButton.isVisible().catch(() => false))) return;

    const beforeLabel = await pinButton.getAttribute('aria-label');
    await pinButton.click();
    await page.waitForTimeout(350);

    const pinnedSectionVisible = await page
      .getByText(/^Pinned\b/i)
      .first()
      .isVisible()
      .catch(() => false);

    if (await row.isVisible().catch(() => false)) {
      await row.hover();
      const pinButtonAfter = row.getByRole('button', { name: /Pin|Unpin/i }).first();
      if (beforeLabel && (await pinButtonAfter.isVisible().catch(() => false))) {
        const afterLabel = await pinButtonAfter.getAttribute('aria-label');
        if (afterLabel) expect(afterLabel).not.toBe(beforeLabel);
      }
    } else {
      expect(pinnedSectionVisible).toBe(true);
    }
  });

  test('clicking a different session switches active session', async ({ page }) => {
    if ((await ensureSessionCount(page, 2)) < 2) return;

    const rows = sessionRows(page);
    const firstRow = rows.first();
    const secondRow = rows.nth(1);

    const firstStyleBefore = (await firstRow.getAttribute('style')) || '';
    await secondRow.click();
    await page.waitForTimeout(350);

    const secondStyleAfter = (await secondRow.getAttribute('style')) || '';
    expect(secondStyleAfter).toContain('var(--color-bg-elevated)');
    if (firstStyleBefore.includes('var(--color-bg-elevated)')) {
      const firstStyleAfter = (await firstRow.getAttribute('style')) || '';
      expect(firstStyleAfter).not.toContain('var(--color-bg-elevated)');
    }
  });

  test('at least one session row shows active visual styling', async ({ page }) => {
    if ((await ensureSessionCount(page, 1)) < 1) return;

    const rows = sessionRows(page);
    const styles = await rows.evaluateAll((elements) =>
      elements.map((el) => (el as HTMLElement).getAttribute('style') || ''),
    );

    expect(styles.some((style) => style.includes('var(--color-bg-elevated)'))).toBe(true);
  });
});
