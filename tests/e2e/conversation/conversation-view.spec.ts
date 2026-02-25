import { test, expect } from '../fixtures/app';

test.describe('ConversationView', () => {
  test('shows empty-state shell or CLI warning fallback', async ({ page }) => {
    const emptyTitle = page.getByText('Chief Wiggum');
    const cliWarning = page.getByText('Claude Code CLI Not Found');

    const hasEmpty = await emptyTitle.isVisible().catch(() => false);
    const hasCliWarning = await cliWarning.isVisible().catch(() => false);

    expect(hasEmpty || hasCliWarning).toBeTruthy();
  });

  test('renders sample prompts when CLI is available, otherwise warning guidance', async ({ page }) => {
    const cliWarning = page.getByText('Claude Code CLI Not Found');
    if (await cliWarning.isVisible().catch(() => false)) {
      await expect(cliWarning).toBeVisible();
      await expect(page.getByText('npm install -g @anthropic-ai/claude-code')).toBeVisible();
      return;
    }

    const promptButtons = page.locator('button').filter({ hasText: /Explain|Bug|Feature/ });
    await expect(promptButtons.first()).toBeVisible();
  });
});
