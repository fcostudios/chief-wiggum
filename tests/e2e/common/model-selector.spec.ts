import { test, expect } from '../fixtures/app';

test.describe('ModelSelector', () => {
  test('model selector is visible in title bar', async ({ page }) => {
    const modelButton = page.getByRole('button', { name: 'Select model' });
    await expect(modelButton).toBeVisible();
    await expect(modelButton).toContainText(/Sonnet|Opus|Haiku/);
  });
});
