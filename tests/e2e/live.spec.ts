import { test, expect } from '@playwright/test';

test('real local Worker serves D1 status and feed to the page', async ({ page, request }) => {
  await expect
    .poll(async () => {
      try {
        return (await request.get('http://127.0.0.1:8787/api/health')).status();
      } catch {
        return 0;
      }
    })
    .toBe(200);
  const response = await request.get('/api/items?limit=18');
  expect(response.status()).toBe(200);
  const feed = await response.json();
  expect(Array.isArray(feed.items)).toBe(true);
  const status = await request.get('/api/sources/status');
  expect((await status.json()).sources).toHaveLength(4);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  if (feed.items.length)
    await expect(page.locator('.news-card h3').first()).toContainText(feed.items[0].title);
  else await expect(page.getByRole('heading', { name: '아직 도착한 소식이 없어요' })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/ai-signal-live-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/ai-signal-live-mobile.png', fullPage: true });
  // Check the production asset path as well as the Vite development proxy.
  const production = await page.goto('http://127.0.0.1:8787/');
  expect(production?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'STAY AHEAD. STAY CURIOUS.' })).toBeVisible();
  if (feed.items.length)
    await expect(page.locator('.news-card h3').first()).toContainText(feed.items[0].title);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: 'test-results/ai-signal-preview.png' });
});
