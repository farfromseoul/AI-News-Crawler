import { test, expect } from '@playwright/test';
const article = {
  id: 'geeknews:test',
  source: 'geeknews',
  externalId: 'test',
  title: 'AI 에이전트 개발 도구가 바꾸는 소프트웨어의 미래',
  url: 'https://news.hada.io/topic?id=1',
  canonicalUrl: 'https://news.hada.io/topic?id=1',
  excerpt: '개발자를 위한 새로운 AI 도구와 오픈소스 생태계를 살펴봅니다.',
  author: 'neo',
  publishedAt: '2026-10-10T09:00:00.000Z',
  collectedAt: '2026-10-10T09:00:00.000Z',
  sortAt: '2026-10-10T09:00:00.000Z',
  thumbnailUrl: null,
  tags: ['dev'],
  score: 90,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/sources/status', (r) =>
    r.fulfill({
      json: {
        sources: [
          {
            source: 'geeknews',
            status: 'ok',
            lastSuccessAt: article.collectedAt,
            lastAttemptAt: article.collectedAt,
            count: 1,
            stale: false,
          },
          { source: 'x', status: 'not_configured', lastSuccessAt: null, count: 0, stale: false },
          {
            source: 'youtube',
            status: 'not_configured',
            lastSuccessAt: null,
            count: 0,
            stale: false,
          },
        ],
      },
    }),
  );
  await page.route('**/api/items**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/api/items/')) return r.fulfill({ json: article });
    const show =
      (!u.searchParams.has('source') || u.searchParams.get('source') === 'geeknews') &&
      (!u.searchParams.get('q') || article.title.includes(u.searchParams.get('q')!));
    return r.fulfill({
      json: { items: show ? [article] : [], total: show ? 1 : 0, nextCursor: null },
    });
  });
});
test('tabs, search, bookmark persistence and source links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.news-card h3')).toContainText(article.title);
  const link = page.locator('.news-card h3 a');
  await expect(link).toHaveAttribute('href', article.url);
  await page.getByRole('button', { name: `${article.title} 북마크 저장` }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: `${article.title} 북마크 해제` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: 'X', exact: true }).click();
  await expect(page.locator('.status-banner')).toContainText('채널을 준비');
  await page.getByRole('tab', { name: /오늘의 AI/ }).click();
  await page.getByRole('searchbox').fill('없는 검색어');
  await expect(page.getByRole('heading', { name: '조건에 맞는 소식이 없어요' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.locator('.news-card h3')).toContainText(article.title);
});
for (const width of [360, 768, 1440])
  test(`responsive layout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.news-card h3')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/ai-signal-${width}.png`, fullPage: true });
  });
test('API failure gives a retry action', async ({ page }) => {
  await page.route('**/api/items?**', (r) =>
    r.fulfill({ status: 503, json: { error: 'service_unavailable' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '잠시 신호가 끊겼어요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
});
test('platform discovery controls send filters and display metrics on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.route('**/api/items?**', (r) => {
    const source = new URL(r.request().url()).searchParams.get('source') ?? 'youtube';
    return r.fulfill({
      json: {
        items: [
          {
            ...article,
            id: `${source}:test`,
            source,
            contentKind: source === 'youtube' ? 'tutorial' : 'news',
            classificationReason: '제목 표현',
            officialSource: source === 'x',
            metrics: { viewCount: 1200, likeCount: 42 },
            durationSeconds: 125,
          },
        ],
        total: 1,
        nextCursor: null,
      },
    });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await page.getByRole('button', { name: '최근 인기', exact: true }).click();
  const youtube = page.waitForRequest(
    (r) => r.url().includes('sort=popular') && r.url().includes('kind=tutorial'),
  );
  await page.getByLabel('콘텐츠 분류').selectOption('tutorial');
  await youtube;
  await expect(page.locator('.classification-badge')).toContainText('튜토리얼');
  await expect(page.locator('.item-metrics')).toContainText('2:05');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/discovery-youtube-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: 'X', exact: true }).click();
  await expect(page.getByLabel('콘텐츠 분류')).toHaveValue('all');
  await page.getByRole('button', { name: '화제의 글', exact: true }).click();
  const x = page.waitForRequest(
    (r) => r.url().includes('source=x') && r.url().includes('kind=official'),
  );
  await page.getByLabel('콘텐츠 분류').selectOption('official');
  await x;
  await expect(page.locator('.classification-badge')).toContainText('등록된 공식 계정');
  await expect(page.locator('.item-metrics')).toContainText('좋아요 42');
});
test('Hacker News tab requests its own feed and shows points', async ({ page }) => {
  await page.route('**/api/items?**', (r) =>
    r.fulfill({
      json: {
        items: [
          {
            ...article,
            id: 'hackernews:test',
            source: 'hackernews',
            metrics: { points: 35, commentCount: 9 },
          },
        ],
        total: 1,
        nextCursor: null,
      },
    }),
  );
  await page.goto('/');
  const request = page.waitForRequest((r) => r.url().includes('source=hackernews'));
  await page.getByRole('tab', { name: 'Hacker News', exact: true }).click();
  await request;
  await expect(page.locator('.item-metrics')).toContainText('추천 점수 35');
  await page.setViewportSize({ width: 360, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
