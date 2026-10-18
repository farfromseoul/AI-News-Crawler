import { test, expect } from '@playwright/test';
test('anonymous consent, rejection, approval, withdrawal and persistence', async ({ page }) => {
  let visits = 0;
  let recognized = false;
  const google: string[] = [];
  page.on('request', r => { if (/google-analytics|googletagmanager/.test(r.url())) google.push(r.url()); });
  await page.route('**/api/engagement/**', r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/identity')) { const previous = recognized; recognized = true; return r.fulfill({ json: { recognized: previous } }); }
    if (path.endsWith('/visit')) { visits++; return r.fulfill({ json: { day: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) } }); }
    if (path.endsWith('/stats')) return r.fulfill({ json: { today: 7, visitors30d: 10, day: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), asOf: new Date().toISOString(), trackingStartedAt: new Date().toISOString() } });
    return r.fulfill({ json: { items: [] } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '방문 분석을 허용할까요?' })).toBeVisible();
  expect(visits).toBe(0); expect(google).toEqual([]);
  await page.getByRole('button', { name: '거절', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '방문 분석을 허용할까요?' })).toHaveCount(0);
  expect(visits).toBe(0);
  await page.getByRole('button', { name: '개인정보 설정' }).click();
  await page.getByRole('button', { name: '분석 허용', exact: true }).click();
  await expect.poll(() => visits).toBe(1);
  await expect(page.getByLabel('오늘 방문 통계')).toContainText('7');
  await page.getByRole('button', { name: '개인정보 설정' }).click();
  await page.getByRole('button', { name: '거절', exact: true }).click();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('ai-signal-consent-v1')) as string).choice).toBe('denied');
  expect(google).toEqual([]); // localhost is intentionally excluded, even when granted.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: '개인정보 설정' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/engagement-mobile.png', fullPage: true });
});
test('likes work after analytics rejection, persist, cancel and recover from failure', async ({ page }) => {
  const item = { id: 'like-test', source: 'geeknews', externalId: 'test', title: 'AI 좋아요 검증 기사', url: 'https://example.com/article', canonicalUrl: 'https://example.com/article', excerpt: '검증용 기사', author: 'test', publishedAt: new Date().toISOString(), collectedAt: new Date().toISOString(), sortAt: new Date().toISOString(), thumbnailUrl: null, tags: ['dev'], score: 90 };
  let liked = false, mutations = 0, fail = false, visits = 0;
  await page.route('**/api/items**', r => r.fulfill({ json: { items: [item], total: 1, nextCursor: null } }));
  await page.route('**/api/engagement/**', r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/identity')) return r.fulfill({ json: { recognized: true } });
    if (path.endsWith('/visit')) { visits++; return r.fulfill({ json: { day: '2026-10-17' } }); }
    if (path.endsWith('/stats')) return r.fulfill({ status: 503, json: { error: 'disabled' } });
    if (path.endsWith('/like')) {
      mutations++;
      if (fail) return r.fulfill({ status: 503, json: { error: 'unavailable' } });
      liked = r.request().method() === 'PUT';
      return r.fulfill({ json: { id: item.id, count: liked ? 1 : 0, liked, changed: true } });
    }
    return r.fulfill({ json: { items: [{ id: item.id, count: liked ? 1 : 0, liked }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '거절', exact: true }).click();
  const button = page.locator('.news-card .like-button');
  await expect(button).toBeEnabled(); await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'false');
  fail = true; await button.click();
  await expect(page.locator('.reaction-error')).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(visits).toBe(0); expect(mutations).toBe(3);
});
