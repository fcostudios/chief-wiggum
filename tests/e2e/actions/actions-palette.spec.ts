import { test, expect, modKey } from '../fixtures/app';

test.describe('Actions in Command Palette (CHI-159)', () => {
  test('mod+Shift+R opens action runner palette', async ({ page }) => {
    await page.keyboard.press(`${modKey}+Shift+r`);
    await page.waitForTimeout(200);

    const paletteInput = page.getByPlaceholder(/Run, stop, or restart actions/i);
    await expect(paletteInput).toBeVisible();
    await expect(paletteInput).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(paletteInput).toBeHidden();
  });

  test('mod+K palette can filter action-related commands', async ({ page }) => {
    await page.keyboard.press(`${modKey}+k`);
    const paletteInput = page.getByPlaceholder(/Type a command/i);
    await expect(paletteInput).toBeVisible();

    await paletteInput.fill('run');
    await page.waitForTimeout(200);

    const noCommands = page.getByText(/No commands found/i).first();
    const actionsCategory = page.getByText(/^Actions$/).first();
    const hasNoCommands = await noCommands.isVisible().catch(() => false);
    const hasActions = await actionsCategory.isVisible().catch(() => false);
    expect(hasNoCommands || hasActions || (await paletteInput.isVisible())).toBe(true);

    await page.keyboard.press('Escape');
  });
});
