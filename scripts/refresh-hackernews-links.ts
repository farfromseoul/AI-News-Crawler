import { getPlatformProxy } from 'wrangler';
import { safeUrl, canonicalUrl } from '../packages/domain';
import { request } from '../packages/sources/http';
const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'wrangler.collector.jsonc',
  persist: { path: '.wrangler/state/v3' },
});
try {
  const rows = await proxy.env.DB.prepare(
    "SELECT id,external_id FROM items WHERE source='hackernews'",
  ).all<{ id: string; external_id: string }>();
  let updated = 0,
    fallback = 0;
  for (const row of rows.results) {
    if (!/^\d+$/.test(row.external_id)) throw new Error('Invalid Hacker News ID');
    const story = (await (
      await request(`https://hacker-news.firebaseio.com/v0/item/${row.external_id}.json`)
    ).json()) as { url?: unknown } | null;
    const original = typeof story?.url === 'string' ? safeUrl(story.url) : null;
    const url = original || `https://news.ycombinator.com/item?id=${row.external_id}`;
    await proxy.env.DB.prepare(
      "UPDATE items SET url=?,canonical_url=? WHERE id=? AND source='hackernews'",
    )
      .bind(url, canonicalUrl(url), row.id)
      .run();
    updated++;
    if (!original) fallback++;
  }
  console.log(JSON.stringify({ updated, original: updated - fallback, fallback }));
} finally {
  await proxy.dispose();
}
