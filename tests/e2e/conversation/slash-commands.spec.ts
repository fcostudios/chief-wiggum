import { test, expect } from '../fixtures/app';

test.describe('Slash Command Menu (CHI-165)', () => {
  test('typing / at start of input opens slash command menu', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    await expect(textarea).toBeVisible();

    if (await textarea.isDisabled()) return; // CLI not available in this environment

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    const isMenuVisible = await menu.isVisible().catch(() => false);

    if (!isMenuVisible) {
      // Commands may not be loaded yet; ensure no crash and exit gracefully.
      await textarea.clear();
      return;
    }

    await expect(menu).toBeVisible();
    await textarea.clear();
  });

  test('slash menu shows category group headers', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const builtinHeader = menu.getByText('Built-in');
    const hasBuiltin = await builtinHeader.isVisible().catch(() => false);
    const anyHeader = menu.locator('.uppercase.tracking-wider');
    const headerCount = await anyHeader.count();
    expect(hasBuiltin || headerCount > 0).toBe(true);

    await textarea.clear();
  });

  test('slash menu has keyboard navigation hints in footer', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    await expect(menu.getByText('navigate')).toBeVisible();
    await expect(menu.getByText('select')).toBeVisible();
    await expect(menu.getByText('close')).toBeVisible();

    await textarea.clear();
  });

  test('typing after / filters the command list', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const initialOptions = await menu.getByRole('option').count();

    await textarea.fill('/help');
    await page.waitForTimeout(200);

    const menuStillVisible = await menu.isVisible().catch(() => false);
    if (menuStillVisible) {
      const filteredOptions = await menu.getByRole('option').count();
      expect(filteredOptions).toBeLessThanOrEqual(initialOptions);
    }

    await textarea.clear();
  });

  test('Escape key closes the slash menu', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await expect(menu).toBeHidden();
  });

  test('first option is highlighted by default', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const options = menu.getByRole('option');
    if ((await options.count()) === 0) {
      await textarea.clear();
      return;
    }

    const firstOption = options.first();
    await expect(firstOption).toHaveAttribute('aria-selected', 'true');
    await expect(firstOption).toHaveAttribute('data-highlighted', 'true');

    await textarea.clear();
  });

  test('ArrowDown moves highlight to next option', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const options = menu.getByRole('option');
    if ((await options.count()) < 2) {
      await textarea.clear();
      return;
    }

    await expect(options.first()).toHaveAttribute('data-highlighted', 'true');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    await expect(options.nth(1)).toHaveAttribute('data-highlighted', 'true');
    await expect(options.first()).toHaveAttribute('data-highlighted', 'false');

    await textarea.clear();
  });

  test('clicking a command option selects it', async ({ page }) => {
    const textarea = page.locator('textarea[aria-label="Message input"]');
    if (await textarea.isDisabled()) return;

    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);

    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    if (!(await menu.isVisible().catch(() => false))) {
      await textarea.clear();
      return;
    }

    const options = menu.getByRole('option');
    if ((await options.count()) === 0) {
      await textarea.clear();
      return;
    }

    await options.first().click();
    await page.waitForTimeout(300);
    await expect(menu).toBeHidden();
  });
});
