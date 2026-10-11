import { test, expect } from '@playwright/test';
test('engineering menus, tag search and full-result charts share filters', async ({ page }) => {
  const item = {
    id: 'cncf:demo',
    source: 'cncf',
    title: 'KubeCon production lessons',
    url: 'https://example.com/demo',
    tags: ['kubernetes', 'reliability'],
    primaryTopic: 'reliability',
    sections: ['engineering'],
    conferences: ['kubecon'],
    publishedAt: null,
    excerpt: '운영 사례',
    author: 'CNCF',
  };
  await page.route('**/api/sources/status', (r) => r.fulfill({ json: { sources: [] } }));
  await page.route('**/api/items**', (r) =>
    r.fulfill({ json: { items: [item], total: 25, nextCursor: null } }),
  );
  await page.route('**/api/stats**', (r) =>
    r.fulfill({
      json: {
        total: 25,
        topics: [{ tag: 'reliability', count: 25 }],
        tags: [{ tag: 'kubernetes', count: 25 }],
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '엔지니어링', exact: true }).click();
  await expect(page.getByRole('heading', { name: '엔지니어링 피드' })).toBeVisible();
  await expect(page.locator('.donut strong')).toHaveText('25');
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes('/api/items?') && new URL(r.url()).searchParams.get('tag') === 'kubernetes',
  );
  await page.locator('.insight-ranking button').click();
  await filtered;
  await expect(page.getByLabel('태그 선택')).toHaveValue('kubernetes');
  await page.getByRole('button', { name: '컨퍼런스', exact: true }).click();
  const conference = page.waitForRequest(
    (r) =>
      r.url().includes('/api/stats?') &&
      new URL(r.url()).searchParams.get('conference') === 'kubecon',
  );
  await page.getByLabel('컨퍼런스 선택').selectOption('kubecon');
  await conference;
  await expect(page.locator('.conference-directory a')).toHaveCount(7);
  const search = page.waitForRequest(
    (r) =>
      r.url().includes('/api/items?') && new URL(r.url()).searchParams.get('q') === '#Terraform',
  );
  await page.getByRole('searchbox').fill('#Terraform');
  await search;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
