import { test, expect } from '@playwright/test';
test('Swagger loads five operations and executes the same-origin health API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/api/docs');
  await expect(page.locator('.opblock')).toHaveCount(5, { timeout: 30000 });
  const health = page.locator('#operations-운영-getHealth');
  await health.locator('.opblock-summary').click();
  await health.getByRole('button', { name: 'Try it out' }).click();
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/health');
  await health.getByRole('button', { name: 'Execute', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(health.locator('.responses-inner')).toContainText('ok');
  expect(errors).toEqual([]);
});
